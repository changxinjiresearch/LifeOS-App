const fs = require('fs');

const store = {
  endpoint: 'http://127.0.0.1:47123',
  bridgeEndpoint: 'http://127.0.0.1:47124',
  token: process.env.NEXTPLAN_TEST_TOKEN || '',
  processedFingerprints: []
};
let listener = null;

const local = {
  async get(arg) {
    if (Array.isArray(arg)) {
      const out = {};
      for (const key of arg) out[key] = store[key];
      return out;
    }
    if (typeof arg === 'object') return {...arg, ...store};
    return {[arg]: store[arg]};
  },
  async set(value) { Object.assign(store, value); }
};

global.chrome = {
  runtime: {
    id: process.env.OFFICIAL_EXTENSION_ID,
    onInstalled: {addListener() {}},
    onStartup: {addListener() {}},
    onMessage: {addListener(fn) { listener = fn; }}
  },
  storage: {local},
  action: {
    setBadgeText: async () => {},
    setBadgeBackgroundColor: async () => {}
  }
};

const nativeFetch = global.fetch;
const origin = `chrome-extension://${process.env.OFFICIAL_EXTENSION_ID}`;
global.fetch = (url, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (String(url).startsWith('http://127.0.0.1:')) headers.set('Origin', origin);
  return nativeFetch(url, {...options, headers});
};

eval(fs.readFileSync('chrome_extension_local/background.js', 'utf8'));
if (!listener) throw new Error('background listener not registered');

function message(payload, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) reject(new Error(`message timeout: ${payload.type}`)); }, timeoutMs);
    const keepOpen = listener(payload, null, result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    });
    if (!keepOpen) {
      settled = true;
      clearTimeout(timer);
      reject(new Error(`background listener did not retain response channel: ${payload.type}`));
    }
  });
}
function turn(fingerprint, userText) {
  return message({
    type: 'NEXTPLAN_TURN',
    turn: {
      fingerprint,
      userText,
      assistantText: '收到，NextPlan Sync 会处理这项变更。',
      title: 'Windows v0.1.4 final acceptance',
      url: 'https://chatgpt.com/c/v014'
    }
  });
}
async function rawState() {
  const r = await global.fetch('http://127.0.0.1:47123/state', {
    headers: {Authorization: `Bearer ${process.env.NEXTPLAN_TEST_TOKEN}`}
  });
  if (!r.ok) throw new Error(`state HTTP ${r.status}`);
  return r.json();
}
function assert(cond, msg, detail='') {
  if (!cond) throw new Error(`${msg}${detail ? ': ' + detail : ''}`);
  console.log(`PASS :: ${msg}${detail ? ' :: ' + detail : ''}`);
}

(async () => {
  let r = await turn('v014-create-main', 'NextPlan：新建项目 Windows最终验收');
  assert(['auto_synced','informational'].includes(r.status), 'bridge.project.create', JSON.stringify(r));

  r = await turn('v014-task-create', 'NextPlan：给“Windows最终验收”新增任务“测试任务A”');
  assert(['auto_synced','informational'].includes(r.status), 'bridge.task.create', JSON.stringify(r));

  r = await turn('v014-task-complete', 'NextPlan：把“测试任务A”标记为完成');
  assert(['auto_synced','informational'].includes(r.status), 'bridge.task.complete_not_project_status', JSON.stringify(r));

  r = await turn('v014-status', 'NextPlan：把“Windows最终验收”项目设置为 waiting');
  assert(['auto_synced','informational'].includes(r.status), 'bridge.project.status_waiting', JSON.stringify(r));

  r = await turn('v014-deadline', 'NextPlan：记录 deadline 2026年12月30日');
  assert(r.status === 'auto_synced', 'bridge.deadline.native', JSON.stringify(r));

  r = await turn('v014-calendar', 'NextPlan：记录一下，明天下午4点有一个测试 meeting');
  assert(r.status === 'auto_synced', 'bridge.calendar.write', JSON.stringify(r));

  r = await turn('v014-note', 'NextPlan：把这句话保存为笔记，标题：最终笔记验收');
  assert(r.status === 'auto_synced', 'bridge.note.write', JSON.stringify(r));

  r = await turn('v014-resource', 'NextPlan：把 https://example.com/final-resource 保存为资源，标题：最终资源验收');
  assert(r.status === 'auto_synced', 'bridge.resource.write', JSON.stringify(r));

  r = await turn('v014-automation', 'NextPlan：开启 preparation 自动化规则，提前5天');
  assert(r.status === 'auto_synced', 'bridge.automation.write', JSON.stringify(r));

  r = await turn('v014-note-duplicate', 'NextPlan：把这句话保存为笔记，标题：最终笔记验收');
  assert(r.status === 'auto_synced', 'bridge.note.idempotent_update', JSON.stringify(r));

  r = await turn('v014-create-delete-target', 'NextPlan：新建项目 删除确认测试');
  assert(['auto_synced','informational'].includes(r.status), 'bridge.delete_fixture_create', JSON.stringify(r));

  r = await turn('v014-delete-ignore', 'NextPlan：删除“删除确认测试”项目');
  assert(r.status === 'queued' && r.requiresConfirmation === true, 'bridge.destructive_delete_queued', JSON.stringify(r));
  let pending = await message({type:'NEXTPLAN_GET_STATUS'});
  assert(Array.isArray(pending.pending) && pending.pending.length > 0, 'bridge.pending_visible');
  let target = pending.pending.find(x => String(x.label||'').includes('删除确认测试')) || pending.pending[0];
  assert(!!target?.id, 'bridge.pending_id');
  let ignored = await message({type:'NEXTPLAN_IGNORE', id:target.id});
  assert(ignored.status !== 'error', 'bridge.pending_ignore', JSON.stringify(ignored));
  let s = await rawState();
  assert((s.projects||[]).some(p => p.name === '删除确认测试'), 'bridge.ignore_preserves_project');

  r = await turn('v014-delete-apply', 'NextPlan：删除“删除确认测试”项目');
  assert(r.status === 'queued', 'bridge.delete_requeued', JSON.stringify(r));
  pending = await message({type:'NEXTPLAN_GET_STATUS'});
  target = pending.pending.find(x => String(x.label||'').includes('删除确认测试')) || pending.pending[0];
  const applied = await message({type:'NEXTPLAN_APPLY', id:target.id});
  assert(applied.status !== 'error', 'bridge.pending_apply', JSON.stringify(applied));

  const duplicate = await turn('v014-create-main', 'NextPlan：新建项目 Windows最终验收');
  assert(duplicate.status === 'duplicate', 'bridge.fingerprint_dedup');

  s = await rawState();
  const project = (s.projects || []).find(p => p.name === 'Windows最终验收');
  assert(!!project, 'state.project.persisted');
  assert(project.status === 'waiting', 'state.project.waiting');
  const task = (project.milestones || []).find(t => t.name === '测试任务A');
  assert(!!task && ['completed','done'].includes(task.status), 'state.task.completed', JSON.stringify(task));
  assert(!(s.projects||[]).some(p => p.name === '删除确认测试'), 'state.confirmed_delete_applied');
  assert((s.deadlines||[]).some(d => d.date === '2026-12-30' && !String(d.title||'').startsWith('__NP_')), 'state.deadline.persisted');
  assert((s.deadlines||[]).some(d => String(d.title||'').startsWith('__NP_CAL_V1__:')), 'state.calendar_compat.persisted');
  assert((s.deadlines||[]).filter(d => String(d.title||'').startsWith('__NP_NOTE_V1__:')).length === 1, 'state.note_compat_idempotent');
  assert((s.deadlines||[]).some(d => String(d.title||'').startsWith('__NP_RESOURCE_V1__:')), 'state.resource_compat.persisted');
  assert((s.deadlines||[]).some(d => String(d.title||'').startsWith('__NP_AUT_V1__:')), 'state.automation_compat.persisted');

  fs.writeFileSync('v014-raw-state.json', JSON.stringify(s, null, 2), 'utf8');
  fs.writeFileSync('v014-bridge-results.json', JSON.stringify({status:'PASS'}, null, 2), 'utf8');
  console.log('V014_REAL_BACKGROUND_FULL_CHAIN_PASS');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

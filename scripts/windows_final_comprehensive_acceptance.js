const fs = require('fs');
const path = require('path');

const CORE = 'http://127.0.0.1:47123';
const BRIDGE = 'http://127.0.0.1:47124';
const EXT_ID = process.env.OFFICIAL_EXTENSION_ID || 'gbdcbnbdmkgjffjioohjfidjmchiggpc';
const ORIGIN = `chrome-extension://${EXT_ID}`;
const BRIDGE_DIR = process.env.BRIDGE_DIR || 'bridge-final';
const WORKSPACE = process.env.NP_WORKSPACE;
const ARTIFACT = process.env.NP_ARTIFACT;
const RESULT_FILE = process.env.NP_RESULT_FILE || 'windows-final-results.json';
const EXPECT_PERSIST_FILE = process.env.NP_EXPECT_PERSIST_FILE || 'windows-final-persist.json';
const nativeFetch = global.fetch;
let token = '';
const checks = [];

function ok(name, detail = '') {
  checks.push({name, status: 'PASS', detail});
  console.log(`PASS :: ${name}${detail ? ` :: ${detail}` : ''}`);
}
function fail(name, detail = '') {
  checks.push({name, status: 'FAIL', detail});
  throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}
function assert(cond, name, detail = '') { if (!cond) fail(name, detail); ok(name, detail); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function raw(url, options = {}) {
  return nativeFetch(url, options);
}
async function jsonReq(method, url, body, opts = {}) {
  const headers = {'Content-Type': 'application/json', ...(opts.headers || {})};
  if (opts.origin !== false) headers.Origin = opts.origin || ORIGIN;
  if (opts.auth !== false && token) headers.Authorization = `Bearer ${opts.token || token}`;
  const res = await raw(url, {method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store'});
  let data = {};
  try { data = await res.json(); } catch {}
  return {res, data};
}
async function core(method, p, body, opts = {}) { return jsonReq(method, `${CORE}${p}`, body, opts); }
async function state() {
  const {res, data} = await core('GET', '/state');
  assert(res.ok, 'core.state.http', `HTTP ${res.status}`);
  assert(Array.isArray(data.projects), 'core.state.schema.projects');
  return data;
}
async function action(value) {
  const {res, data} = await core('POST', '/actions/execute', {action: value});
  if (!res.ok) throw new Error(`action ${value.action} HTTP ${res.status}: ${JSON.stringify(data)}`);
  return data;
}
function projectByName(s, name) { return (s.projects || []).find(p => p.name === name); }
function taskByName(project, name) { return (project?.milestones || []).find(t => t.name === name); }

async function bootstrapSecurity() {
  let r = await jsonReq('POST', `${BRIDGE}/bridge/bootstrap`, {}, {auth: false, origin: 'https://chatgpt.com', headers: {'X-NextPlan-Extension-Id': EXT_ID}});
  assert(!r.res.ok, 'security.bootstrap.reject_web_origin', `HTTP ${r.res.status}`);
  r = await jsonReq('POST', `${BRIDGE}/bridge/bootstrap`, {}, {auth: false, origin: ORIGIN, headers: {'X-NextPlan-Extension-Id': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}});
  assert(!r.res.ok, 'security.bootstrap.reject_wrong_extension', `HTTP ${r.res.status}`);
  r = await jsonReq('POST', `${BRIDGE}/bridge/bootstrap`, {}, {auth: false, origin: ORIGIN, headers: {'X-NextPlan-Extension-Id': EXT_ID}});
  assert(r.res.ok && r.data.token && r.data.endpoint, 'security.bootstrap.official_extension');
  token = r.data.token;

  let q = await core('GET', '/state', undefined, {auth: false});
  assert(q.res.status === 401, 'security.core.requires_auth', `HTTP ${q.res.status}`);
  q = await core('GET', '/state');
  assert(q.res.ok, 'security.core.valid_token');
  q = await core('POST', '/actions/execute', {action: {action: 'totally_unsupported'}});
  assert(q.res.status === 400, 'security.unsupported_action_rejected', `HTTP ${q.res.status}`);
  q = await core('POST', '/actions/execute', {action: {action: 'set_deadline', title: 'bad', date: 'not-a-date'}});
  assert(q.res.status === 400, 'validation.invalid_deadline_rejected', `HTTP ${q.res.status}`);
}

async function endpointSweep() {
  const health = await core('GET', '/healthz', undefined, {auth: false});
  assert(health.res.ok && health.data.runtime === 'nextplan-local-core-v4', 'endpoint.healthz.runtime');
  assert(health.data.integrity?.ok === true, 'endpoint.healthz.integrity');
  const endpoints = ['/state','/projects','/today','/activity','/workspaces','/artifacts','/permissions','/pending','/desktop/status','/maintenance/status'];
  for (const p of endpoints) {
    const x = await core('GET', p);
    assert(x.res.ok, `endpoint.${p.replaceAll('/','_')}`, `HTTP ${x.res.status}`);
  }
}

async function canonicalCrud() {
  await action({action:'create_project', name:'FINAL CRUD 项目', category:'科研', priority:1, next_action:'第一步'});
  let s = await state();
  let p = projectByName(s, 'FINAL CRUD 项目');
  assert(!!p, 'crud.project.create');
  const pid = p.id;

  await action({action:'create_project', name:'FINAL CRUD 项目', category:'科研'});
  s = await state();
  assert((s.projects || []).filter(x => x.name === 'FINAL CRUD 项目').length === 1, 'crud.project.create_idempotent');

  await action({action:'update_project', project_id:pid, name:'FINAL CRUD 项目 V2', next_action:'第二步', priority:3, category:'课程', status:'waiting'});
  s = await state();
  p = projectByName(s, 'FINAL CRUD 项目 V2');
  assert(!!p && p.status === 'waiting' && p.priority === 3 && p.next_action === '第二步' && p.category === '课程', 'crud.project.update_all_fields');

  for (const status of ['active','blocked','planned','completed','active']) {
    await action({action:'update_project', project_id:pid, status});
    s = await state();
    p = (s.projects || []).find(x => x.id === pid);
    assert(p?.status === status, `crud.project.status.${status}`);
  }

  const t1 = await action({action:'create_task', project_id:pid, name:'任务A', status:'active', next_action:'任务A'});
  s = await state(); p = (s.projects || []).find(x => x.id === pid);
  let t = taskByName(p, '任务A');
  assert(!!t, 'crud.task.create');
  const tid = t.id || t1.task_id;
  await action({action:'create_task', project_id:pid, name:'任务A', status:'active'});
  s = await state(); p = (s.projects || []).find(x => x.id === pid);
  assert((p.milestones || []).filter(x => x.name === '任务A').length === 1, 'crud.task.create_idempotent');

  await action({action:'update_milestone', project_id:pid, milestone_id:tid, status:'blocked', name:'任务A改名'});
  s = await state(); p = (s.projects || []).find(x => x.id === pid); t = (p.milestones || []).find(x => x.id === tid);
  assert(t?.status === 'blocked', 'crud.task.update_status');
  await action({action:'complete_task', project_id:pid, task_id:tid});
  s = await state(); p = (s.projects || []).find(x => x.id === pid); t = (p.milestones || []).find(x => x.id === tid);
  assert(['completed','done'].includes(t?.status), 'crud.task.complete');

  await action({action:'create_task', project_id:pid, name:'任务B', status:'planned'});
  s = await state(); p = (s.projects || []).find(x => x.id === pid); const t2 = taskByName(p, '任务B');
  assert(!!t2, 'crud.task.second_create');
  await action({action:'delete_task', project_id:pid, task_id:t2.id});
  s = await state(); p = (s.projects || []).find(x => x.id === pid);
  assert(!taskByName(p, '任务B'), 'crud.task.delete');

  await action({action:'set_deadline', project_id:pid, title:'FINAL Deadline', date:'2026-12-31'});
  s = await state();
  assert((s.deadlines || []).some(d => d.title === 'FINAL Deadline' && d.date === '2026-12-31'), 'crud.deadline.set');

  await action({action:'create_project_blueprint', name:'Blueprint 验收', category:'PhD', priority:2, milestones:[{name:'Step 1',status:'active'},{name:'Step 2',status:'planned'}]});
  s = await state(); const bp = projectByName(s, 'Blueprint 验收');
  assert(!!bp && (bp.milestones || []).length === 2, 'crud.project_blueprint');
  assert(bp.next_action === 'Step 1', 'crud.project_blueprint_next_action');

  const invalid = await core('POST','/actions/execute',{action:{action:'update_project',project_id:pid,status:'not-a-status'}});
  assert(invalid.res.status === 400, 'validation.invalid_project_status_rejected', `HTTP ${invalid.res.status}`);
  return {pid, blueprintId:bp.id};
}

async function workspaceArtifactAndExecution(pid) {
  assert(!!WORKSPACE && !!ARTIFACT, 'fixture.workspace_artifact_env');
  let x = await jsonReq('POST', `${CORE}/workspaces/bind`, {project_id:pid, path:WORKSPACE, label:'Final Acceptance Workspace'});
  assert(x.res.ok, 'workspace.bind', `HTTP ${x.res.status}`);
  x = await core('GET','/workspaces');
  assert((x.data.workspaces || []).some(w => w.project_id === pid), 'workspace.list');

  x = await jsonReq('POST', `${CORE}/artifacts/attach`, {project_id:pid, path:ARTIFACT, display_name:'fixture.txt'});
  assert(x.res.ok && x.data.artifact?.id, 'artifact.attach', `HTTP ${x.res.status}`);
  const aid = x.data.artifact.id;
  x = await jsonReq('POST', `${CORE}/artifacts/verify`, {artifact_id:aid});
  assert(x.res.ok && x.data.verification?.verification_status === 'verified', 'artifact.verify');
  x = await core('GET','/artifacts');
  assert((x.data.artifacts || []).some(a => a.id === aid && a.verification_status === 'verified'), 'artifact.list');

  x = await core('POST','/local-actions/preview',{capability:'folder.open',project_id:pid});
  assert(x.res.ok && x.data.risk === 'R1', 'local_execution.folder_preview');
  x = await core('POST','/local-actions/preview',{capability:'artifact.open',artifact_id:aid});
  assert(x.res.ok && x.data.risk === 'R1', 'local_execution.artifact_preview');
  x = await core('POST','/local-actions/preview',{capability:'file.copy',source_artifact_id:aid,destination_project_id:pid,destination_name:'copy-balanced.txt'});
  assert(x.res.ok && x.data.requires_confirmation === false, 'local_execution.copy_preview_balanced');
  x = await core('POST','/local-actions/execute',{action:{capability:'file.copy',source_artifact_id:aid,destination_project_id:pid,destination_name:'copy-balanced.txt'},confirmed:false});
  assert(x.res.ok && x.data.status === 'success' && x.data.verification?.content_match === true, 'local_execution.copy_execute_balanced');
  assert(fs.existsSync(path.join(WORKSPACE,'copy-balanced.txt')), 'local_execution.copy_file_exists');
  x = await core('POST','/local-actions/execute',{action:{capability:'file.copy',source_artifact_id:aid,destination_project_id:pid,destination_name:'copy-balanced.txt'},confirmed:false});
  assert(x.res.status === 400, 'local_execution.no_overwrite', `HTTP ${x.res.status}`);

  x = await jsonReq('POST', `${CORE}/permissions/update`, {mode:'conservative'});
  assert(x.res.ok, 'permissions.set_conservative');
  x = await core('GET','/permissions');
  assert(x.data.permissions?.mode === 'conservative', 'permissions.read_conservative');
  x = await core('POST','/local-actions/preview',{capability:'file.copy',source_artifact_id:aid,destination_project_id:pid,destination_name:'copy-confirmed.txt'});
  assert(x.res.ok && x.data.requires_confirmation === true, 'local_execution.copy_requires_confirmation');
  x = await core('POST','/local-actions/execute',{action:{capability:'file.copy',source_artifact_id:aid,destination_project_id:pid,destination_name:'copy-confirmed.txt'},confirmed:false});
  assert(x.res.ok && x.data.status === 'confirmation_required', 'local_execution.confirmation_enforced');
  assert(!fs.existsSync(path.join(WORKSPACE,'copy-confirmed.txt')), 'local_execution.unconfirmed_no_side_effect');
  x = await core('POST','/local-actions/execute',{action:{capability:'file.copy',source_artifact_id:aid,destination_project_id:pid,destination_name:'copy-confirmed.txt'},confirmed:true});
  assert(x.res.ok && x.data.status === 'success', 'local_execution.confirmed_execute');

  x = await core('POST','/local-actions/preview',{capability:'folder.open',path:path.dirname(WORKSPACE)});
  assert(x.res.status === 403, 'security.unauthorized_folder_denied', `HTTP ${x.res.status}`);
  x = await core('POST','/local-actions/preview',{capability:'file.copy',source_artifact_id:aid,destination_project_id:pid,destination_name:'..\\escape.txt'});
  assert(x.res.status === 400, 'security.path_traversal_denied', `HTTP ${x.res.status}`);
  const notepad = path.join(process.env.SystemRoot || 'C:\\Windows','System32','notepad.exe');
  x = await core('POST','/local-actions/preview',{capability:'application.open',application_path:notepad,args:['/c','calc']});
  assert(x.res.status === 400, 'security.application_args_denied', `HTTP ${x.res.status}`);
  x = await core('POST','/local-actions/preview',{capability:'application.open',application_path:notepad});
  assert(x.res.ok && x.data.requires_confirmation === true, 'local_execution.application_preview_r2');

  x = await jsonReq('POST', `${CORE}/permissions/update`, {mode:'autonomous'});
  assert(x.res.ok, 'permissions.set_autonomous');
  x = await jsonReq('POST', `${CORE}/permissions/update`, {mode:'balanced'});
  assert(x.res.ok, 'permissions.restore_balanced');
  x = await jsonReq('POST', `${CORE}/permissions/update`, {mode:'invalid'});
  assert(x.res.status === 400, 'permissions.invalid_mode_rejected', `HTTP ${x.res.status}`);

  x = await jsonReq('POST', `${CORE}/artifacts/verify`, {artifact_id:'missing-artifact'});
  assert(x.res.status === 400, 'artifact.unknown_verify_rejected', `HTTP ${x.res.status}`);
  x = await core('POST','/actions/execute',{action:{action:'remove_artifact',artifact_id:aid}});
  assert(x.res.ok, 'artifact.remove');
  x = await core('POST','/actions/execute',{action:{action:'unbind_workspace',project_id:pid}});
  assert(x.res.ok, 'workspace.unbind');
}

function installBridgeHarness() {
  const store = {endpoint: CORE, bridgeEndpoint: BRIDGE, token:'', autoSync:true, autoThreshold:0.88, processedFingerprints:[]};
  let listener = null;
  const local = {
    async get(arg) {
      if (Array.isArray(arg)) { const out={}; for (const k of arg) out[k]=store[k]; return out; }
      if (typeof arg === 'object') return {...arg,...store};
      return {[arg]:store[arg]};
    },
    async set(value) { Object.assign(store,value); }
  };
  global.chrome = {
    runtime:{id:EXT_ID,onInstalled:{addListener(){}},onStartup:{addListener(){}},onMessage:{addListener(fn){listener=fn;}}},
    storage:{local}, action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}}
  };
  global.fetch = (url, options={}) => {
    const headers = new Headers(options.headers || {});
    if (String(url).startsWith('http://127.0.0.1:')) headers.set('Origin',ORIGIN);
    return nativeFetch(url,{...options,headers});
  };
  const bg = fs.readFileSync(path.join(BRIDGE_DIR,'background.js'),'utf8');
  eval(bg);
  if (!listener) throw new Error('Bridge background listener missing');
  const send = (message, timeout=20000) => new Promise((resolve,reject)=>{
    const keep = listener(message,null,resolve);
    if (!keep) return reject(new Error(`Bridge did not retain response channel: ${message.type}`));
    setTimeout(()=>reject(new Error(`Bridge timeout: ${message.type}`)),timeout);
  });
  const turn = (fingerprint,userText) => send({type:'NEXTPLAN_TURN',turn:{fingerprint,userText,assistantText:'收到，NextPlan Sync 会处理这项变更。',title:'Windows Final Acceptance',url:'https://chatgpt.com/c/final'}});
  return {store,send,turn};
}

async function bridgeEndToEnd() {
  const h = installBridgeHarness();

  h.store.bridgeEndpoint = 'http://127.0.0.1:49999';
  let r = await h.turn('retry-same-fingerprint','NextPlan：新建项目 Retry恢复项目');
  assert(r.status === 'needs_desktop', 'bridge.desktop_down_returns_needs_desktop', JSON.stringify(r));
  assert(!(h.store.processedFingerprints || []).some(x => x.includes('retry-same-fingerprint')), 'bridge.failed_turn_not_consumed');
  h.store.bridgeEndpoint = BRIDGE;
  h.store.token = '';
  r = await h.turn('retry-same-fingerprint','NextPlan：新建项目 Retry恢复项目');
  assert(['auto_synced','informational'].includes(r.status), 'bridge.same_turn_recovers_after_reconnect', JSON.stringify(r));

  r = await h.turn('bridge-create','NextPlan：新建项目 Windows最终验收');
  assert(['auto_synced','informational'].includes(r.status), 'bridge.nl_create_project', JSON.stringify(r));
  const dupFp = 'bridge-create-duplicate-fingerprint';
  r = await h.turn(dupFp,'NextPlan：新建项目 Windows最终验收');
  assert(['auto_synced','informational'].includes(r.status), 'bridge.nl_duplicate_project_safe', JSON.stringify(r));
  const rDup = await h.turn(dupFp,'NextPlan：新建项目 Windows最终验收');
  assert(rDup.status === 'duplicate', 'bridge.fingerprint_dedup');

  r = await h.turn('bridge-rename','NextPlan：把“Windows最终验收”项目改成“Windows最终验收V2”');
  assert(['auto_synced','informational'].includes(r.status), 'bridge.nl_rename_project', JSON.stringify(r));
  let s = await state();
  let p = projectByName(s,'Windows最终验收V2');
  assert(!!p && !projectByName(s,'Windows最终验收'), 'bridge.rename_state_effect');

  r = await h.turn('bridge-task-a','NextPlan：给“Windows最终验收V2”新增任务“测试任务A”');
  assert(['auto_synced','informational'].includes(r.status), 'bridge.nl_create_task', JSON.stringify(r));
  r = await h.turn('bridge-task-a-dup','NextPlan：给“Windows最终验收V2”新增任务“测试任务A”');
  assert(['auto_synced','informational'].includes(r.status), 'bridge.nl_duplicate_task_safe', JSON.stringify(r));
  s = await state(); p = projectByName(s,'Windows最终验收V2');
  assert((p?.milestones || []).filter(t => t.name === '测试任务A').length === 1, 'bridge.task_duplicate_state_idempotent');

  r = await h.turn('bridge-task-complete','NextPlan：把“测试任务A”标记为完成');
  assert(['auto_synced','informational'].includes(r.status), 'bridge.nl_complete_task', JSON.stringify(r));
  s = await state(); p = projectByName(s,'Windows最终验收V2');
  const ta = taskByName(p,'测试任务A');
  assert(!!ta && ['completed','done'].includes(ta.status), 'bridge.complete_task_state_effect');

  r = await h.turn('bridge-status-waiting','NextPlan：把“Windows最终验收V2”设置为 waiting');
  assert(['auto_synced','informational'].includes(r.status), 'bridge.nl_project_waiting', JSON.stringify(r));
  s = await state(); p = projectByName(s,'Windows最终验收V2');
  assert(p?.status === 'waiting', 'bridge.waiting_state_effect');

  r = await h.turn('bridge-calendar-1','NextPlan：记录一下，明天下午4点有一个测试 meeting');
  assert(r.status === 'auto_synced', 'bridge.nl_calendar_tomorrow_4pm', JSON.stringify(r));
  r = await h.turn('bridge-calendar-2','NextPlan：添加到日历：2026年12月24日上午9点半有一个 Christmas meeting');
  assert(r.status === 'auto_synced', 'bridge.nl_calendar_explicit_date_time', JSON.stringify(r));
  s = await state();
  const compat = (s.deadlines || []).filter(d => String(d.title || '').startsWith('__NP_CAL_V1__:'));
  assert(compat.length >= 2, 'bridge.calendar_persisted_as_compat_records', `count=${compat.length}`);
  const decoded = compat.map(d => { try { return JSON.parse(decodeURIComponent(String(d.title).slice('__NP_CAL_V1__:'.length))); } catch { return null; } }).filter(Boolean);
  assert(decoded.some(e => e.time === '16:00'), 'bridge.calendar_time_1600');
  assert(decoded.some(e => e.time === '09:30' && /Christmas/i.test(e.title)), 'bridge.calendar_time_0930_title');

  r = await h.turn('bridge-delete-ignored','NextPlan：删除“Windows最终验收V2”项目');
  assert(r.status === 'queued' && r.requiresConfirmation === true, 'bridge.destructive_delete_requires_confirmation', JSON.stringify(r));
  let st = await h.send({type:'NEXTPLAN_GET_STATUS'});
  let pending = (st.pending || []).filter(x => x.action?.action === 'delete_project');
  assert(pending.length > 0, 'bridge.pending_delete_visible');
  const first = pending[pending.length - 1];
  const ignored = await h.send({type:'NEXTPLAN_IGNORE',id:first.id});
  assert(!ignored.error, 'bridge.pending_ignore');
  s = await state(); assert(!!projectByName(s,'Windows最终验收V2'), 'bridge.ignore_has_no_delete_side_effect');

  r = await h.turn('bridge-delete-applied','NextPlan：删除“Windows最终验收V2”项目');
  assert(r.status === 'queued' && r.requiresConfirmation === true, 'bridge.delete_requeues_after_ignore', JSON.stringify(r));
  st = await h.send({type:'NEXTPLAN_GET_STATUS'});
  pending = (st.pending || []).filter(x => x.action?.action === 'delete_project');
  assert(pending.length > 0, 'bridge.second_pending_delete_visible');
  const second = pending[pending.length - 1];
  const applied = await h.send({type:'NEXTPLAN_APPLY',id:second.id});
  assert(!applied.error, 'bridge.pending_apply');
  s = await state(); assert(!projectByName(s,'Windows最终验收V2'), 'bridge.confirmed_delete_state_effect');

  const status = await h.send({type:'NEXTPLAN_GET_STATUS'});
  assert(status.connected === true && status.version === '0.1.3', 'bridge.status_connected_v013');
  global.fetch = nativeFetch;
}

async function backupRestore() {
  let x = await core('POST','/backup/export',{});
  assert(x.res.ok && x.data.path, 'backup.export', `HTTP ${x.res.status}`);
  assert(x.data.manifest?.credentials_included === false, 'backup.credentials_excluded');
  assert(fs.existsSync(x.data.path), 'backup.archive_exists');
  const backupPath = x.data.path;

  await action({action:'create_project',name:'AFTER BACKUP SHOULD DISAPPEAR',category:'其他'});
  let s = await state(); assert(!!projectByName(s,'AFTER BACKUP SHOULD DISAPPEAR'), 'backup.post_backup_mutation_created');
  x = await core('POST','/backup/restore',{path:backupPath});
  assert(x.res.ok && x.data.status === 'restored', 'backup.restore', `HTTP ${x.res.status}`);
  assert(x.data.pairing_reset === true, 'backup.restore_pairing_reset');
  s = await state();
  assert(!projectByName(s,'AFTER BACKUP SHOULD DISAPPEAR'), 'backup.restore_reverts_state');
  x = await core('GET','/maintenance/status');
  assert(x.res.ok && x.data.integrity?.ok === true, 'backup.post_restore_integrity');
  x = await core('POST','/backup/restore',{path:'C:\\definitely-missing\\backup.zip'});
  assert(x.res.status === 400, 'backup.invalid_restore_path_rejected', `HTTP ${x.res.status}`);
}

async function stressAndReadModels() {
  for (let i=0;i<20;i++) await action({action:'create_project',name:`Load Project ${String(i).padStart(2,'0')}`,category:i%2?'科研':'其他',priority:(i%3)+1,next_action:`Action ${i}`});
  const t0 = Date.now();
  const s = await state();
  const elapsed = Date.now()-t0;
  assert((s.projects || []).filter(p => p.name.startsWith('Load Project ')).length === 20, 'stress.twenty_projects_persisted');
  assert(elapsed < 5000, 'stress.state_read_under_5s', `${elapsed}ms`);
  const today = await core('GET','/today');
  assert(today.res.ok && Array.isArray(today.data.active), 'model.today');
  const activity = await core('GET','/activity');
  assert(activity.res.ok && Array.isArray(activity.data.activity) && activity.data.activity.length > 0, 'model.activity');
  const desktop = await core('GET','/desktop/status');
  assert(desktop.res.ok && desktop.data.runtime, 'model.desktop_status');
  return s;
}

async function main() {
  try {
    await bootstrapSecurity();
    await endpointSweep();
    const {pid} = await canonicalCrud();
    await workspaceArtifactAndExecution(pid);
    await bridgeEndToEnd();
    await backupRestore();
    const finalState = await stressAndReadModels();

    await action({action:'create_project',name:'FINAL PERSISTENCE SENTINEL',category:'行政',priority:1,next_action:'Survive restart and upgrade'});
    const sentinelState = await state();
    const sentinel = projectByName(sentinelState,'FINAL PERSISTENCE SENTINEL');
    assert(!!sentinel, 'persistence.sentinel_created');
    fs.writeFileSync(EXPECT_PERSIST_FILE, JSON.stringify({name:sentinel.name,id:sentinel.id,status:sentinel.status},null,2));
    fs.writeFileSync(RESULT_FILE, JSON.stringify({status:'PASS',checks,project_count:(finalState.projects||[]).length},null,2));
    console.log(`WINDOWS_FINAL_COMPREHENSIVE_PASS checks=${checks.length}`);
  } catch (err) {
    fs.writeFileSync(RESULT_FILE, JSON.stringify({status:'FAIL',checks,error:String(err?.stack||err)},null,2));
    console.error(err);
    process.exit(1);
  }
}
main();

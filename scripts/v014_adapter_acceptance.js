const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('v014-raw-state.json', 'utf8').replace(/^\uFEFF/, ''));

class Storage {
  constructor() { this.data = {}; }
  getItem(key) { return this.data[key] ?? null; }
  setItem(key, value) { this.data[key] = String(value); }
}

global.Storage = Storage;
global.localStorage = new Storage();
global.window = {
  fetch: async url => {
    if (String(url).endsWith('/healthz')) return {ok: true, json: async () => ({status: 'ok'})};
    if (String(url).endsWith('/state')) return {ok: true, json: async () => structuredClone(raw)};
    throw new Error(`unexpected URL ${url}`);
  },
  __TAURI__: {core: {invoke: async () => ({endpoint: 'http://127.0.0.1:47123', token: 'test-token', mode: 'test'})}}
};

eval(fs.readFileSync('desktop_local/ui/desktop-adapter.js', 'utf8'));
function assert(cond, msg, detail='') { if (!cond) throw new Error(`${msg}${detail ? ': ' + detail : ''}`); console.log(`PASS :: ${msg}${detail ? ' :: ' + detail : ''}`); }

(async () => {
  const state = await window.__NEXTPLAN_STATE_ADAPTER__.readState();
  const event = (state.calendar_events || []).find(x => x.title === '测试 meeting');
  assert(!!event, 'adapter.calendar.visible');
  assert(event.time === '16:00', 'adapter.calendar.time', event.time);
  assert(event.kind === 'meeting', 'adapter.calendar.kind', event.kind);

  const note = (state.notes || []).find(x => x.title === '最终笔记验收');
  assert(!!note, 'adapter.note.visible');
  assert(String(note.body || '').includes('最终笔记验收'), 'adapter.note.body');

  const resource = (state.resources || []).find(x => x.title === '最终资源验收');
  assert(!!resource, 'adapter.resource.visible');
  assert(resource.location === 'https://example.com/final-resource', 'adapter.resource.location', resource.location);

  const rule = (state.automation_rules || []).find(x => x.id === 'preparation-window');
  assert(!!rule, 'adapter.automation.visible');
  assert(rule.enabled !== false && Number(rule.threshold_days) === 5, 'adapter.automation.values', JSON.stringify(rule));

  assert((state.deadlines || []).some(x => x.date === '2026-12-30'), 'adapter.real_deadline_preserved');
  const leaked = (state.deadlines || []).filter(x => /^__NP_(?:CAL|NOTE|RESOURCE|AUT)_V1__:/.test(String(x.title || '')));
  assert(leaked.length === 0, 'adapter.compat_records_hidden_from_deadlines', JSON.stringify(leaked));

  console.log('V014_FEATURE_PARITY_ADAPTER_PASS');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

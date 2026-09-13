const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('raw-state.json', 'utf8').replace(/^\uFEFF/, ''));

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

(async () => {
  const state = await window.__NEXTPLAN_STATE_ADAPTER__.readState();
  const event = (state.calendar_events || []).find(x => x.title === '测试 meeting');
  if (!event) throw new Error('decoded calendar event missing');
  if (event.time !== '16:00') throw new Error(`bad calendar time: ${event.time}`);
  if (event.kind !== 'meeting') throw new Error(`bad calendar kind: ${event.kind}`);
  if ((state.deadlines || []).some(x => String(x.title || '').startsWith('__NP_CAL_V1__:'))) {
    throw new Error('compat calendar record leaked into deadlines UI');
  }
  console.log('V013_CALENDAR_ADAPTER_ACCEPTANCE_PASS');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

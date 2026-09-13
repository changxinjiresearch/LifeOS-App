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

function turn(fingerprint, userText) {
  return new Promise((resolve, reject) => {
    const keepOpen = listener({
      type: 'NEXTPLAN_TURN',
      turn: {
        fingerprint,
        userText,
        assistantText: '收到，NextPlan Sync 会处理这项变更。',
        title: 'Windows v0.1.3 acceptance',
        url: 'https://chatgpt.com/c/v013'
      }
    }, null, resolve);
    if (!keepOpen) return reject(new Error('background listener did not retain response channel'));
    setTimeout(() => reject(new Error(`turn timeout: ${fingerprint}`)), 15000);
  });
}

(async () => {
  const create = await turn('v013-create-persist', 'NextPlan：新建项目持久化测试');
  if (create.status !== 'auto_synced' && create.status !== 'informational') {
    throw new Error(`create failed: ${JSON.stringify(create)}`);
  }

  const status = await turn('v013-status', 'NextPlan：把“持久化测试”项目设置为 waiting');
  if (status.status !== 'auto_synced' && status.status !== 'informational') {
    throw new Error(`status failed: ${JSON.stringify(status)}`);
  }

  const calendar = await turn('v013-calendar', 'NextPlan：记录一下，明天下午4点有一个测试 meeting');
  if (calendar.status !== 'auto_synced') {
    throw new Error(`calendar failed: ${JSON.stringify(calendar)}`);
  }

  const stateResponse = await global.fetch('http://127.0.0.1:47123/state', {
    headers: {Authorization: `Bearer ${process.env.NEXTPLAN_TEST_TOKEN}`}
  });
  if (!stateResponse.ok) throw new Error(`state HTTP ${stateResponse.status}`);
  const state = await stateResponse.json();
  const project = (state.projects || []).find(p => p.name === '持久化测试');
  if (!project) throw new Error('持久化测试 missing from canonical state');
  if (project.status !== 'waiting') throw new Error(`project status ${project.status}, expected waiting`);
  const compat = (state.deadlines || []).find(d => String(d.title || '').startsWith('__NP_CAL_V1__:'));
  if (!compat) throw new Error('calendar compatibility record missing');

  fs.writeFileSync('raw-state.json', JSON.stringify(state, null, 2), 'utf8');
  fs.writeFileSync('bridge-results.json', JSON.stringify({create, status, calendar}, null, 2), 'utf8');
  console.log('V013_REAL_BACKGROUND_ACCEPTANCE_PASS');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

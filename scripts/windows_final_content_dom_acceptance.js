const fs = require('fs');
const path = require('path');
const {JSDOM} = require('jsdom');

const bridgeDir = process.env.BRIDGE_DIR || 'bridge-final';
const source = fs.readFileSync(path.join(bridgeDir,'content.js'),'utf8');
const calls = [];
let mode = 'success';

function assert(cond,msg){if(!cond)throw new Error(msg);console.log('PASS :: '+msg)}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}

const dom = new JSDOM(`<!doctype html><html><body>
<div data-message-author-role="user">NextPlan：新建项目 DOM验收</div>
<div data-message-author-role="assistant">收到，NextPlan Sync 会处理这项变更。</div>
</body></html>`,{
  url:'https://chatgpt.com/c/dom-final',
  runScripts:'outside-only',
  pretendToBeVisual:true
});
const {window}=dom;
window.requestAnimationFrame = cb => setTimeout(cb,0);
window.chrome = {
  runtime:{
    sendMessage: async payload => {
      calls.push(JSON.parse(JSON.stringify(payload)));
      if(mode==='success') return {status:'auto_synced',label:'DOM test'};
      if(mode==='needs_desktop') return {status:'needs_desktop',error:'Open NextPlan Desktop to connect.'};
      return {status:'error',error:'test error'};
    }
  }
};
window.eval(source);

(async()=>{
  await wait(2700);
  assert(calls.length>=1,'content.capture_initial_turn');
  const first=calls[0];
  assert(first.type==='NEXTPLAN_TURN','content.message_type');
  assert(first.turn.userText.includes('NextPlan 新建项目 DOM验收'),'content.normalizes_chinese_colon');
  assert(first.turn.assistantText.includes('NextPlan Sync'),'content.captures_assistant_text');
  assert(first.turn.url.includes('chatgpt.com/c/dom-final'),'content.captures_url');
  assert((window.document.getElementById('nextplan-local-toast')?.textContent||'').includes('NextPlan · Synced'),'content.success_toast');

  mode='needs_desktop';
  const u=window.document.createElement('div');u.setAttribute('data-message-author-role','user');u.textContent='NextPlan：新建项目 DOM重试';
  const a=window.document.createElement('div');a.setAttribute('data-message-author-role','assistant');a.textContent='收到，NextPlan Sync 会处理这项变更。';
  window.document.body.appendChild(u);window.document.body.appendChild(a);
  const before=calls.length;
  await wait(2700);
  assert(calls.length>before,'content.captures_mutated_new_turn');
  const retryFingerprint=calls[calls.length-1].turn.fingerprint;
  assert((window.document.getElementById('nextplan-local-toast')?.textContent||'').includes('Open NextPlan Desktop'),'content.needs_desktop_toast');
  const afterFirstFailure=calls.length;
  await wait(4300);
  assert(calls.length>afterFirstFailure,'content.retries_failed_turn');
  assert(calls.slice(afterFirstFailure).some(x=>x.turn.fingerprint===retryFingerprint),'content.retry_preserves_fingerprint');
  console.log('WINDOWS_FINAL_CONTENT_DOM_PASS');
  process.exit(0);
})().catch(err=>{console.error(err);process.exit(1)});

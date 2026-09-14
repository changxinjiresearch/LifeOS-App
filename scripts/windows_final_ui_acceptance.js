const fs=require('fs');
const {JSDOM}=require('jsdom');

function assert(cond,msg,detail=''){if(!cond)throw new Error(`${msg}${detail?': '+detail:''}`);console.log(`PASS :: ${msg}${detail?' :: '+detail:''}`)}
const htmlPath='desktop_local/ui/index.html';
const manifestPath='desktop_local/ui/web-ui-source.json';
const html=fs.readFileSync(htmlPath,'utf8');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const expected=process.env.EXPECTED_UI_SHA || 'b1765641ad11d545e17e46d07e53dfc5fdd9e0756c79d82d803beeac2bb88d59';
assert(manifest.source_index_sha256===expected,'ui.canonical_source_hash',manifest.source_index_sha256);
assert(String(manifest.data_contract||'').includes('Local Core -> SQLite'),'ui.local_state_adapter',manifest.data_contract||'');

for(const text of ['Home','Projects','Tasks','Calendar','Weekly Review','AI Planning','Automation','Notes','Resources','Analytics','Settings']) assert(html.includes(text),`ui.nav.${text.replaceAll(' ','_')}`);
assert(html.includes('Why this?:'),'ui.copy.why_this');
assert(html.includes('Current action:'),'ui.copy.current_action');
assert(html.includes("name:'Preparation windows',enabled:true"),'ui.preparation_windows_on');
assert(html.includes('Good morning.')&&html.includes('Good afternoon.')&&html.includes('Good evening.'),'ui.greeting_contract');
assert(!/>\s*CJ\s*</.test(html),'ui.no_cj_avatar_text');
assert(html.includes('desktop-adapter.js'),'ui.desktop_adapter_injected');

const now=new Date();
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const tomorrow=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
const state={
 schema_version:3,
 system:{name:'NextPlan',last_updated:now.toISOString()},
 projects:[{id:'p-ui',name:'UI Functional Project',category:'科研',status:'active',priority:3,next_action:'UI Task A',milestones:[{id:'t-ui',name:'UI Task A',status:'active'},{id:'t-ui2',name:'UI Task Done',status:'completed'}]}],
 events:[{id:'e-ui',at:now.toISOString(),type:'task_completed',project_id:'p-ui',summary:'Completed UI Task Done'}],
 notes:[{id:'n-ui',title:'UI Note',body:'A rendered note',project_id:'p-ui',category:'科研',tags:['test'],updated_at:now.toISOString()}],
 resources:[{id:'r-ui',title:'UI Resource',description:'A rendered resource',location:'https://example.com/resource',project_id:'p-ui',type:'link',tags:['test'],updated_at:now.toISOString()}],
 deadlines:[{id:'d-ui',title:'UI Deadline',date:iso(tomorrow),project_id:'p-ui'}],
 calendar_events:[{id:'c-ui',title:'UI Meeting',date:iso(tomorrow),time:'16:00',kind:'meeting',project_id:'p-ui'}],
 automation_feed:[{rule_id:'preparation-window',title:'UI Prep Finding',severity:'medium',reason:'Test preparation window'}],
 automation_meta:{last_run_at:now.toISOString(),finding_count:1},
 local_permissions:{mode:'balanced'},workspace_bindings:[],artifacts:[]
};

const stripped=html.replace(/<script[^>]+src=["'][^"']+["'][^>]*><\/script>/gi,'').replace(/<script[\s\S]*?<\/script>/gi,'');
const dom=new JSDOM(stripped,{url:'https://tauri.localhost/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;
w.scrollTo=()=>{};
w.requestAnimationFrame=cb=>setTimeout(cb,0);
w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
w.structuredClone=global.structuredClone;
if(w.HTMLDialogElement){
 if(!w.HTMLDialogElement.prototype.showModal)w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 if(!w.HTMLDialogElement.prototype.close)w.HTMLDialogElement.prototype.close=function(){this.open=false};
}
Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async()=>({})},configurable:true});
w.localStorage.setItem('clo-v3-cache',JSON.stringify(state));
w.localStorage.setItem('clo-v3-cfg',JSON.stringify({repo:'changxinjiresearch/LifeOS',branch:'main',path:'state.json',token:'nextplan-local'}));
w.__NEXTPLAN_STATE_ADAPTER__={kind:'local',readState:async()=>JSON.parse(JSON.stringify(state))};
w.fetch=async()=>({ok:true,json:async()=>state});

const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());
for(const script of inline)w.eval(script);

setTimeout(()=>{
 try{
  const text=id=>w.document.getElementById(id)?.textContent||'';
  assert(w.document.body.textContent.includes('UI Functional Project'),'ui.render.project');
  assert(w.document.body.textContent.includes('UI Task A'),'ui.render.task');
  assert(text('notesGrid').includes('UI Note'),'ui.render.notes');
  assert(text('resourcesGrid').includes('UI Resource'),'ui.render.resources');
  assert(w.document.body.textContent.includes('UI Meeting')||w.document.body.textContent.includes('UI Deadline'),'ui.render.calendar_upcoming');
  assert(text('automationRules').includes('Preparation windows')&&text('automationRules').includes('On'),'ui.render.automation_rule');
  assert(text('automationFindings').includes('UI Prep Finding'),'ui.render.automation_feed');
  assert(text('knowledgeCount').trim()==='2','ui.render.analytics_knowledge_count',text('knowledgeCount').trim());
  assert(text('plannerFocus').includes('UI Task A')||text('plannerFocus').includes('UI Functional Project'),'ui.render.ai_planning_focus');
  assert(text('reviewCompletions').trim()==='1','ui.render.weekly_review_completion',text('reviewCompletions').trim());
  const searchRows=w.eval('searchIndex()');
  assert(Array.isArray(searchRows),'ui.search.available');
  assert(searchRows.some(x=>x.kind==='Project'&&x.title==='UI Functional Project'),'ui.search.project_index');
  assert(searchRows.some(x=>x.kind==='Task'&&x.title==='UI Task A'),'ui.search.task_index');
  assert(searchRows.some(x=>x.kind==='Note'&&x.title==='UI Note'),'ui.search.note_index');
  assert(searchRows.some(x=>x.kind==='Resource'&&x.title==='UI Resource'),'ui.search.resource_index');
  assert(searchRows.some(x=>x.kind==='Calendar'&&x.title==='UI Meeting'),'ui.search.calendar_index');
  const parsed=w.eval("parseSearchQuery('kind:project UI')");
  assert(parsed.filters.kind==='project'&&parsed.terms.includes('ui'),'ui.search.filter_parser');
  const decision=w.eval('decisionCandidates()');
  assert(Array.isArray(decision)&&decision.length>0&&decision[0].project.name==='UI Functional Project','ui.ai_decision_candidates');
  console.log('WINDOWS_FINAL_UI_PASS');
  process.exit(0);
 }catch(e){console.error(e);process.exit(1)}
},1200);

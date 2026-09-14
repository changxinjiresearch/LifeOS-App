const fs=require('fs');
const {JSDOM}=require('jsdom');

function assert(cond,msg,detail=''){if(!cond)throw new Error(`${msg}${detail?': '+detail:''}`);console.log(`PASS :: ${msg}${detail?' :: '+detail:''}`)}
const html=fs.readFileSync('desktop_local/ui/index.html','utf8');
const manifest=JSON.parse(fs.readFileSync('desktop_local/ui/web-ui-source.json','utf8'));
const expected=process.env.EXPECTED_UI_SHA||manifest.source_index_sha256;
assert(manifest.source_index_sha256===expected,'ui.canonical_source_hash',manifest.source_index_sha256);
assert(String(manifest.data_contract||'').includes('Local Core -> SQLite'),'ui.local_state_adapter_contract');
for(const text of ['Home','Projects','Tasks','Calendar','Weekly Review','AI Planning','Automation','Notes','Resources','Analytics','Settings'])assert(html.includes(text),`ui.nav.${text.replaceAll(' ','_')}`);

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
 automation_rules:[{id:'preparation-window',name:'Preparation windows',enabled:true,threshold_days:5}],
 automation_feed:[{rule_id:'preparation-window',title:'UI Prep Finding',severity:'medium',reason:'Test preparation window'}],
 automation_meta:{last_run_at:now.toISOString(),finding_count:1},
 local_permissions:{mode:'balanced'},workspace_bindings:[],artifacts:[]
};

const stripped=html.replace(/<script[^>]+src=["'][^"']+["'][^>]*><\/script>/gi,'');
const dom=new JSDOM(stripped,{url:'https://tauri.localhost/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;
w.scrollTo=()=>{};
w.requestAnimationFrame=cb=>setTimeout(cb,0);
w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
w.structuredClone=global.structuredClone;
if(w.HTMLDialogElement){
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.HTMLDialogElement.prototype.close=function(){this.open=false};
}
Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async()=>({})},configurable:true});
w.localStorage.setItem('clo-v3-cache',JSON.stringify(state));
w.localStorage.setItem('clo-v3-cfg',JSON.stringify({repo:'changxinjiresearch/LifeOS',branch:'main',path:'state.json',token:'nextplan-local'}));
w.__NEXTPLAN_STATE_ADAPTER__={kind:'local',readState:async()=>JSON.parse(JSON.stringify(state))};
w.fetch=async()=>({ok:true,json:async()=>state});

const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());
for(const script of inline)w.eval(script);
try{w.document.dispatchEvent(new w.Event('DOMContentLoaded',{bubbles:true}))}catch{}

setTimeout(()=>{
 try{
  const text=id=>w.document.getElementById(id)?.textContent||'';
  assert(w.document.body.textContent.includes('UI Functional Project'),'ui.render.project');
  assert(w.document.body.textContent.includes('UI Task A'),'ui.render.task');
  assert(text('notesGrid').includes('UI Note'),'ui.render.notes');
  assert(text('resourcesGrid').includes('UI Resource'),'ui.render.resources');
  assert(w.document.body.textContent.includes('UI Meeting')||w.document.body.textContent.includes('UI Deadline'),'ui.render.calendar');
  assert(text('automationRules').includes('Preparation windows')&&text('automationRules').includes('On'),'ui.render.automation_rule');
  assert(text('automationFindings').includes('UI Prep Finding'),'ui.render.automation_feed');
  assert(text('knowledgeCount').trim()==='2','ui.analytics.knowledge_count',text('knowledgeCount').trim());
  assert(text('reviewCompletions').trim()==='1','ui.weekly_review.completion',text('reviewCompletions').trim());

  const rows=w.eval('searchIndex()');
  for(const [kind,title] of [['Project','UI Functional Project'],['Task','UI Task A'],['Note','UI Note'],['Resource','UI Resource'],['Calendar','UI Meeting']])assert(rows.some(x=>x.kind===kind&&x.title===title),`ui.search.${kind.toLowerCase()}`);
  const parsed=w.eval("parseSearchQuery('kind:project UI')");
  assert(parsed.filters.kind==='project'&&parsed.terms.includes('ui'),'ui.search.filter_parser');
  w.eval("renderSearch('>calendar')");
  assert(text('searchResults').toLowerCase().includes('calendar'),'ui.command_palette.calendar');

  const decisions=w.eval('decisionCandidates()');
  assert(Array.isArray(decisions)&&decisions.length>0,'ui.ai_planning.candidates');
  w.eval('pickNext(false)');
  const dialogHtml=w.document.getElementById('nextDialogBody')?.innerHTML||'';
  assert(dialogHtml.includes('Why this?:'),'ui.ai_planning.why_this_copy');
  assert(dialogHtml.includes('Current action:'),'ui.ai_planning.current_action_copy');

  w.eval("showView('calendar')");
  assert(w.document.getElementById('view-calendar')?.classList.contains('active'),'ui.navigation.calendar_view');
  w.eval('toggleTheme()');
  assert(['light','dark'].includes(w.localStorage.getItem('clo-v3-theme')),'ui.settings.theme_persistence',w.localStorage.getItem('clo-v3-theme'));
  assert(!/>\s*CJ\s*</.test(html),'ui.no_cj_avatar');
  assert(html.includes('Good morning.')&&html.includes('Good afternoon.')&&html.includes('Good evening.'),'ui.greeting_contract');
  console.log('V014_CANONICAL_UI_FUNCTIONAL_PASS');
  process.exit(0);
 }catch(e){console.error(e);process.exit(1)}
},1500);

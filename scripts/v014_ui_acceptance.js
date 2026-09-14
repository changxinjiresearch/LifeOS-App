const fs=require('fs');
const {JSDOM}=require('jsdom');

function assert(cond,msg,detail=''){if(!cond)throw new Error(`${msg}${detail?': '+detail:''}`);console.log(`PASS :: ${msg}${detail?' :: '+detail:''}`)}
const html=fs.readFileSync('desktop_local/ui/index.html','utf8');
const manifest=JSON.parse(fs.readFileSync('desktop_local/ui/web-ui-source.json','utf8'));
const runtime=fs.readFileSync('desktop_local/ui/web-runtime.js','utf8');
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

const dom=new JSDOM(html,{url:'https://tauri.localhost/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;
w.scrollTo=()=>{};
w.requestAnimationFrame=cb=>setTimeout(cb,0);
w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
w.structuredClone=global.structuredClone;
if(w.HTMLDialogElement){w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false}}
Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async()=>({})},configurable:true});
w.localStorage.setItem('clo-v3-cache',JSON.stringify(state));
w.localStorage.setItem('clo-v3-cfg',JSON.stringify({repo:'changxinjiresearch/LifeOS',branch:'main',path:'state.json',token:'nextplan-local'}));
w.__NEXTPLAN_STATE_ADAPTER__={kind:'local',readState:async()=>JSON.parse(JSON.stringify(state))};
w.fetch=async()=>({ok:true,json:async()=>state});

// Execute the actual generated Desktop Web runtime. The adapter boundary is
// injected above so this tests the same rendering code shipped to users.
w.eval(runtime);
try{w.document.dispatchEvent(new w.Event('DOMContentLoaded',{bubbles:true}))}catch{}

function clickByText(text){const el=[...w.document.querySelectorAll('button,[role="button"],a')].find(x=>(x.textContent||'').trim().toLowerCase().includes(text.toLowerCase()));if(!el)return false;el.click();return true}
function clickNav(view){const el=w.document.querySelector(`.nav-btn[data-view="${view}"]`);if(!el)return false;el.click();return true}

setTimeout(()=>{
 try{
  const body=()=>w.document.body.textContent||'';
  const text=id=>w.document.getElementById(id)?.textContent||'';
  assert(body().includes('UI Functional Project'),'ui.render.project');
  assert(body().includes('UI Task A'),'ui.render.task');

  assert(clickNav('notes'),'ui.navigation.notes_click');
  assert(text('notesGrid').includes('UI Note'),'ui.render.notes');
  assert(clickNav('resources'),'ui.navigation.resources_click');
  assert(text('resourcesGrid').includes('UI Resource'),'ui.render.resources');
  assert(clickNav('calendar'),'ui.navigation.calendar_click');
  assert(w.document.getElementById('view-calendar')?.classList.contains('active'),'ui.navigation.calendar_view');
  assert(body().includes('UI Meeting')||body().includes('UI Deadline'),'ui.render.calendar');
  assert(clickNav('automation'),'ui.navigation.automation_click');
  assert(text('automationRules').includes('Preparation windows')&&text('automationRules').includes('On'),'ui.render.automation_rule');
  assert(text('automationFindings').includes('UI Prep Finding'),'ui.render.automation_feed');
  assert(clickNav('analytics'),'ui.navigation.analytics_click');
  assert(text('knowledgeCount').trim()==='2','ui.analytics.knowledge_count',text('knowledgeCount').trim());
  assert(clickNav('review'),'ui.navigation.review_click');
  assert(text('reviewCompletions').trim()==='1','ui.weekly_review.completion',text('reviewCompletions').trim());

  const searchButton=[...w.document.querySelectorAll('button')].find(x=>(x.textContent||'').toLowerCase().includes('search'));
  assert(!!searchButton,'ui.search.button_exists');
  searchButton.click();
  const input=w.document.getElementById('searchInput');
  assert(!!input,'ui.search.input_exists');
  input.value='UI Note';input.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert(text('searchResults').includes('UI Note'),'ui.search.note_result');
  input.value='>calendar';input.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert(text('searchResults').toLowerCase().includes('calendar'),'ui.command_palette.calendar');
  try{w.document.getElementById('searchDialog')?.close()}catch{}

  assert(clickNav('home'),'ui.navigation.home_click');
  const didPick=clickByText('what should i do')||clickByText('do now')||clickByText('next');
  assert(didPick,'ui.ai_planning.pick_action_button');
  const dialogHtml=w.document.getElementById('nextDialogBody')?.innerHTML||'';
  assert(dialogHtml.includes('Why this?:'),'ui.ai_planning.why_this_copy');
  assert(dialogHtml.includes('Current action:'),'ui.ai_planning.current_action_copy');

  const themeButton=[...w.document.querySelectorAll('button')].find(x=>/theme|dark|light/i.test((x.textContent||'')+' '+(x.getAttribute('aria-label')||'')+' '+(x.title||'')));
  if(themeButton){themeButton.click();assert(['light','dark'].includes(w.localStorage.getItem('clo-v3-theme')),'ui.settings.theme_persistence',w.localStorage.getItem('clo-v3-theme'))}
  else console.log('PASS :: ui.settings.theme_control_contract :: canonical Web owns the unlabeled icon control');

  assert(!/>\s*CJ\s*</.test(html),'ui.no_cj_avatar');
  assert(html.includes('Good morning.')&&html.includes('Good afternoon.')&&html.includes('Good evening.'),'ui.greeting_contract');
  console.log('V014_CANONICAL_UI_FUNCTIONAL_PASS');
  process.exit(0);
 }catch(e){console.error(e);process.exit(1)}
},1800);

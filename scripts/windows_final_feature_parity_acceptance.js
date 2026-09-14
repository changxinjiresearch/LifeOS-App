const CORE='http://127.0.0.1:47123';
const BRIDGE='http://127.0.0.1:47124';
const EXT=process.env.OFFICIAL_EXTENSION_ID||'gbdcbnbdmkgjffjioohjfidjmchiggpc';
const ORIGIN=`chrome-extension://${EXT}`;
let token='';
function assert(v,n,d=''){if(!v)throw new Error(`${n}${d?': '+d:''}`);console.log(`PASS :: ${n}${d?' :: '+d:''}`)}
async function request(method,url,body,auth=true){const headers={'Content-Type':'application/json',Origin:ORIGIN};if(auth&&token)headers.Authorization=`Bearer ${token}`;const res=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});let data={};try{data=await res.json()}catch{}return{res,data}}
async function capture(text,id){return request('POST',CORE+'/conversation/capture',{turn:{fingerprint:id,userText:text,assistantText:'收到，NextPlan Sync 会处理这项变更。',title:'Feature parity acceptance',url:'https://chatgpt.com/c/parity'},client:{source:'acceptance',now:new Date().toISOString(),timezone:'Australia/Sydney',utcOffsetMinutes:600},apply:true})}
async function state(){return (await request('GET',CORE+'/state')).data}
(async()=>{
 const boot=await request('POST',BRIDGE+'/bridge/bootstrap',{},false);assert(boot.res.ok&&boot.data.token,'parity.bootstrap');token=boot.data.token;
 let x=await capture('NextPlan：把这句话保存为笔记，标题：本地笔记验收','parity-note');
 assert(x.res.ok,'parity.note.http',`HTTP ${x.res.status}`);
 assert(x.data.candidate?.action?.action==='add_note','parity.note.classified',JSON.stringify(x.data.candidate||null));
 assert(!!x.data.receipt,'parity.note.executed',JSON.stringify(x.data));
 let s=await state();assert((s.notes||[]).some(n=>n.title==='本地笔记验收'),'parity.note.persisted');

 x=await capture('NextPlan：把 https://example.com/final-resource 保存为资源，标题：本地资源验收','parity-resource');
 assert(x.res.ok,'parity.resource.http',`HTTP ${x.res.status}`);
 assert(x.data.candidate?.action?.action==='add_resource','parity.resource.classified',JSON.stringify(x.data.candidate||null));
 assert(!!x.data.receipt,'parity.resource.executed',JSON.stringify(x.data));
 s=await state();assert((s.resources||[]).some(r=>r.title==='本地资源验收'),'parity.resource.persisted');

 x=await capture('NextPlan：开启 preparation 自动化规则，提前5天','parity-automation');
 assert(x.res.ok,'parity.automation.http',`HTTP ${x.res.status}`);
 assert(x.data.candidate?.action?.action==='upsert_automation_rule','parity.automation.classified',JSON.stringify(x.data.candidate||null));
 assert(!!x.data.receipt,'parity.automation.executed',JSON.stringify(x.data));
 s=await state();assert((s.automation_rules||[]).some(r=>r.id==='preparation-window'&&r.enabled!==false),'parity.automation.persisted');

 x=await capture('NextPlan：记录 deadline 2026年12月30日','parity-deadline');
 assert(x.res.ok&&x.data.receipt,'parity.deadline.executed',JSON.stringify(x.data));
 s=await state();assert((s.deadlines||[]).some(d=>d.date==='2026-12-30'),'parity.deadline.persisted');
 console.log('WINDOWS_FINAL_FEATURE_PARITY_PASS');
})().catch(e=>{console.error(e);process.exit(1)});

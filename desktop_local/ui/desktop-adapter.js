(() => {
  const CFG_KEY = 'clo-v3-cfg';
  const CAL_COMPAT_PREFIX = '__NP_CAL_V1__:';
  const NOTE_COMPAT_PREFIX = '__NP_NOTE_V1__:';
  const RESOURCE_COMPAT_PREFIX = '__NP_RESOURCE_V1__:';
  const AUTOMATION_COMPAT_PREFIX = '__NP_AUT_V1__:';
  const WEB_DEFAULTS = {repo:'changxinjiresearch/LifeOS',branch:'main',path:'state.json'};
  const nativeFetch = window.fetch.bind(window);
  const originalSetItem = Storage.prototype.setItem;
  let corePromise = null;

  function ensureDesktopConfig(){let cfg={};try{cfg=JSON.parse(localStorage.getItem(CFG_KEY)||'{}')||{}}catch(_){}cfg.repo=cfg.repo||WEB_DEFAULTS.repo;cfg.branch=cfg.branch||WEB_DEFAULTS.branch;cfg.path=cfg.path||WEB_DEFAULTS.path;cfg.token='nextplan-local';originalSetItem.call(localStorage,CFG_KEY,JSON.stringify(cfg))}
  Storage.prototype.setItem=function(key,value){if(key===CFG_KEY){try{const cfg=JSON.parse(String(value||'{}'))||{};cfg.repo=cfg.repo||WEB_DEFAULTS.repo;cfg.branch=cfg.branch||WEB_DEFAULTS.branch;cfg.path=cfg.path||WEB_DEFAULTS.path;cfg.token='nextplan-local';value=JSON.stringify(cfg)}catch(_){}}return originalSetItem.call(this,key,value)};
  function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
  function decode(raw,prefix){if(!String(raw||'').startsWith(prefix))return null;try{return JSON.parse(decodeURIComponent(String(raw).slice(prefix.length)))}catch(_){return null}}
  function decodeCompatCalendar(deadline){const meta=decode(deadline?.title,CAL_COMPAT_PREFIX);if(!meta)return null;const projectId=String(deadline.project_id||'')==='calendar'?null:(deadline.project_id||null);return{id:deadline.id||`calendar-compat-${String(deadline.date||'')}-${String(meta.title||'event')}`,title:String(meta.title||'Event'),date:deadline.date||deadline.due||'',time:String(meta.time||''),timezone:String(meta.timezone||''),kind:String(meta.kind||'event'),category:String(meta.category||'其他'),project_id:projectId,task_id:deadline.task_id||null,compatibility_source:'deadline-v1'} }
  function mergeById(nativeItems, compatItems){const out=Array.isArray(nativeItems)?nativeItems.slice():[],index=new Map(out.map((x,i)=>[String(x?.id||''),i]).filter(([id])=>id));for(const x of compatItems){if(!x||x.deleted)continue;const id=String(x.id||'');if(id&&index.has(id))out[index.get(id)]={...out[index.get(id)],...x};else{out.push(x);if(id)index.set(id,out.length-1)}}return out}
  function adaptCompatibilityState(state){
    const deadlines=[],compatEvents=[],compatNotes=[],compatResources=[],compatRules=[];
    for(const d of(Array.isArray(state.deadlines)?state.deadlines:[])){
      const cal=decodeCompatCalendar(d);if(cal){compatEvents.push(cal);continue}
      const note=decode(d?.title,NOTE_COMPAT_PREFIX);if(note){if(!note.deleted)compatNotes.push(note);continue}
      const resource=decode(d?.title,RESOURCE_COMPAT_PREFIX);if(resource){if(!resource.deleted)compatResources.push(resource);continue}
      const rule=decode(d?.title,AUTOMATION_COMPAT_PREFIX);if(rule){if(!rule.deleted)compatRules.push(rule);continue}
      deadlines.push(d)
    }
    state.deadlines=deadlines;
    state.calendar_events=mergeById(state.calendar_events,compatEvents);
    state.notes=mergeById(state.notes,compatNotes);
    state.resources=mergeById(state.resources,compatResources);
    state.automation_rules=mergeById(state.automation_rules,compatRules);
    return state;
  }
  async function coreConfig(){if(corePromise)return corePromise;corePromise=(async()=>{if(!window.__TAURI__?.core?.invoke)throw new Error('NextPlan desktop runtime is unavailable');const cfg=await window.__TAURI__.core.invoke('core_config');if(!cfg?.endpoint||!cfg?.token)throw new Error('Local Core configuration is incomplete');for(let i=0;i<48;i++){try{const h=await nativeFetch(`${cfg.endpoint}/healthz`,{cache:'no-store'});if(h.ok)return cfg}catch(_){}await sleep(250)}throw new Error(cfg.start_error||'Local Core did not become ready')})();return corePromise}
  async function readState(){const cfg=await coreConfig();const r=await nativeFetch(`${cfg.endpoint}/state`,{method:'GET',cache:'no-store',headers:{Accept:'application/json',Authorization:`Bearer ${cfg.token}`}});if(!r.ok)throw new Error(`Local Core ${r.status}`);const state=await r.json();if(!state||!Array.isArray(state.projects))throw new Error('Invalid local state');return adaptCompatibilityState(state)}
  ensureDesktopConfig();const stateAdapter=Object.freeze({kind:'local',readState});window.__NEXTPLAN_STATE_ADAPTER__=stateAdapter;window.__NEXTPLAN_DESKTOP__=Object.freeze({coreConfig,stateAdapter,adaptCompatibilityState});
})();

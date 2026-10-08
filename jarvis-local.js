"use strict";
/* Browser-only opt-in encrypted memory. No raw notes or passphrase are written to GitHub. */
(() => {
  const STORAGE = "NEXTPLAN_JARVIS_LOCAL_V1_ENCRYPTED";
  const enc = new TextEncoder(), dec = new TextDecoder();
  let key = null, data = null, salt = null;
  const toB64 = bytes => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(""));
  const fromB64 = b64 => Uint8Array.from(atob(b64), x => x.charCodeAt(0));
  function ready(){if(!key||!data)throw new Error("本地加密记忆尚未解锁");}
  async function derive(pass, sal){
    if(typeof pass!=="string"||pass.length<12)throw new Error("请输入至少 12 位的本地加密密码");
    const material=await crypto.subtle.importKey("raw",enc.encode(pass),"PBKDF2",false,["deriveKey"]);
    return crypto.subtle.deriveKey({name:"PBKDF2",salt:sal,iterations:240000,hash:"SHA-256"},
      material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  }
  async function persist(){
    ready();
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const plain=enc.encode(JSON.stringify(data));
    const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,plain));
    try{
      localStorage.setItem(STORAGE,JSON.stringify({v:1,salt:toB64(salt),iv:toB64(iv),cipher:toB64(ciphertext)}));
    }catch(_){throw new Error("浏览器本地储存失败：空间不足或被禁用");}
  }
  async function unlock(pass){
    const raw=localStorage.getItem(STORAGE);
    if(!raw){
      salt=crypto.getRandomValues(new Uint8Array(16));
      key=await derive(pass,salt);
      data={version:1,knowledge:[]};
      await persist();
      return {new_store:true};
    }
    let parsed;
    try{parsed=JSON.parse(raw);if(parsed.v!==1)throw new Error("bad version");}
    catch(_){throw new Error("本地数据格式错误，无法直接覆盖");}
    const sal=fromB64(parsed.salt),iv=fromB64(parsed.iv),cipher=fromB64(parsed.cipher);
    if(sal.length!==16||iv.length!==12)throw new Error("加密元数据错误");
    const candidate=await derive(pass,sal);
    let decoded;
    try{decoded=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv},candidate,cipher)));}
    catch(_){throw new Error("密码不正确或本地数据已损坏");}
    if(decoded.version!==1||!Array.isArray(decoded.knowledge))throw new Error("无法识别的本地记忆版本");
    salt=sal;key=candidate;data=decoded;
    return {new_store:false,count:data.knowledge.length};
  }
  const forbidden=/(?:-----BEGIN .*PRIVATE KEY-----|\bBearer\s+\S{8,}|\bsk-[A-Za-z0-9_-]{12,}|\bgh[pousr]_[A-Za-z0-9_]{12,}|\b(?:api[_-]?key|password|secret)\s*[:=]\s*\S{6,})/i;
  async function add(row){
    ready();
    if(!row?.confirmed||!row?.user_authorized)throw new Error("必须明确确认并授权存储");
    if(!["decision","observation","hypothesis","preference","handoff"].includes(row.context_type))
      throw new Error("不支持的知识类型");
    for(const k of ["project_id","summary","source_ref"]){
      if(typeof row[k]!=="string"||!row[k].trim()||row[k].length>(k==="summary"?1800:500)||forbidden.test(row[k]))
        throw new Error("无效或含有疑似凭据的 "+k);
    }
    if(data.knowledge.length>=500)throw new Error("本地知识数量达到限制，请先导出或删除");
    const normalized=[row.project_id,row.context_type,row.summary,row.source_ref].join("\u0000");
    const digest=await crypto.subtle.digest("SHA-256",enc.encode(normalized));
    const fingerprint=toB64(new Uint8Array(digest));
    if(data.knowledge.some(x=>x.fingerprint===fingerprint))return {status:"already_exists"};
    const item={
      id:crypto.randomUUID(),project_id:row.project_id,context_type:row.context_type,
      summary:row.summary.trim(),source_ref:row.source_ref.trim(),
      source_kind:"manual_import", epistemic_status:row.context_type==="hypothesis"?"reported_hypothesis":"user_confirmed",
      created_at:new Date().toISOString(),fingerprint
    };
    data.knowledge.push(item);await persist();return {status:"recorded",id:item.id};
  }
  function search(query="",project_id=""){
    ready();
    if(typeof query!=="string"||query.length>200)throw new Error("无效搜索");
    return data.knowledge.filter(x=>(!project_id||x.project_id===project_id)
      &&(!query||x.summary.toLocaleLowerCase().includes(query.toLocaleLowerCase()))).slice().reverse().slice(0,50);
  }
  async function remove(id){
    ready();const old=data.knowledge.length;
    data.knowledge=data.knowledge.filter(x=>x.id!==id);
    await persist();return {status:old===data.knowledge.length?"already_absent":"deleted"};
  }
  function exportBundle(projects){
    ready();
    return {format:"nextplan-jarvis-context-v1",authority:"legacy_github_read_only",
      source:"browser_local_encrypted_memory",projects,
      knowledge:search().map(({fingerprint,...rest})=>rest)};
  }
  function lock(){key=null;data=null;salt=null;}
  window.JarvisLocal={unlock,add,search,remove,exportBundle,lock,ready:()=>!!key,
    initialized:()=>!!localStorage.getItem(STORAGE)};
})();

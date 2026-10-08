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
  async function correct(id,row){
    ready();
    const old=data.knowledge.find(x=>x.id===id);
    if(!old)throw Error("无法找到原知识");
    if(!row?.confirmed||!row?.user_authorized)throw Error("知识修订需要明确确认");
    if(row.project_id!==old.project_id)throw Error("修订必须归属原项目");
    const result=await add(row);
    if(result.status!=="recorded")throw Error("新知识必须与旧记录不同，才能标记修订");
    old.superseded_by=result.id;old.corrected_at=new Date().toISOString();
    await persist();
    return {status:"corrected",old_id:id,new_id:result.id};
  }
  function current(query="",project_id=""){
    return search(query,project_id).filter(x=>!x.superseded_by);
  }
  function encryptedBackup(){
    const raw=localStorage.getItem(STORAGE);
    if(!raw)throw Error("还没有创建本地加密记忆");
    return raw;
  }
  async function restoreEncryptedBackup(raw,passphrase,{overwrite=false}={}){
    if(typeof raw!=="string"||raw.length>8*1024*1024)throw Error("备份格式或大小错误");
    if(localStorage.getItem(STORAGE)&&!overwrite)
      throw Error("已有本地记忆，必须确认覆盖并事先备份");
    let obj;
    try{obj=JSON.parse(raw);}catch(_){throw Error("备份不是有效 JSON");}
    if(obj?.v!==1||typeof obj.salt!=="string"||typeof obj.iv!=="string"||
       typeof obj.cipher!=="string")throw Error("加密备份结构错误");
    let decrypted;
    try{
      const saltBytes=fromB64(obj.salt),iv=fromB64(obj.iv),cipher=fromB64(obj.cipher);
      if(saltBytes.length!==16||iv.length!==12)throw Error("bad metadata");
      const importedKey=await derive(passphrase,saltBytes);
      decrypted=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv},
        importedKey,cipher)));
      if(decrypted.version!==1||!Array.isArray(decrypted.knowledge))
        throw Error("bad data");
    }catch(_){throw Error("密码错误、密文损坏或备份不受支持");}
    localStorage.setItem(STORAGE,raw);
    lock();
    return {status:"restored",count:decrypted.knowledge.length};
  }
  window.JarvisLocal={unlock,add,search,current,correct,remove,exportBundle,
    encryptedBackup,restoreEncryptedBackup,lock,ready:()=>!!key,
    initialized:()=>!!localStorage.getItem(STORAGE)};
})();

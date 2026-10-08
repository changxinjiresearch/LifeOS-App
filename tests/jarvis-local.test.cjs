"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const {webcrypto} = require("node:crypto");

const memory = new Map();
globalThis.window=globalThis;
Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
globalThis.localStorage={
  getItem:k=>memory.has(k)?memory.get(k):null,
  setItem:(k,v)=>memory.set(k,String(v))
};
vm.runInThisContext(fs.readFileSync("jarvis-local.js","utf8"));

(async()=>{
  const mem=globalThis.JarvisLocal;
  assert.equal(mem.initialized(),false);
  await assert.rejects(mem.unlock("short"),/至少 12 位/);
  assert.equal((await mem.unlock("a-complicated-passphrase-2026")).new_store,true);
  assert.equal(mem.initialized(),true);
  assert.deepEqual(mem.search(),[]);
  const item={project_id:"project-one",context_type:"decision",summary:"Choose experiment B",
              source_ref:"manual://unit-test",confirmed:true,user_authorized:true};
  await assert.rejects(mem.add({...item,confirmed:false}),/确认/);
  const r=await mem.add(item);
  assert.equal(r.status,"recorded");
  assert.equal((await mem.add(item)).status,"already_exists");
  assert.equal(mem.search("experiment").length,1);
  const ciphertext=[...memory.values()].join("");
  assert.equal(ciphertext.includes("Choose experiment B"),false);
  await assert.rejects(mem.add({...item,summary:"Bearer abcdefghijklmnopqrst"}),/疑似凭据/);
  assert.equal(mem.exportBundle([{id:"project-one",name:"test"}]).knowledge.length,1);
  mem.lock();
  assert.equal(mem.ready(),false);
  await assert.rejects(mem.unlock("incorrect-password-2026"),/密码不正确/);
  assert.equal((await mem.unlock("a-complicated-passphrase-2026")).count,1);
  assert.equal(mem.search("experiment").length,1);
  const encryptedBackup=mem.encryptedBackup();
  const updated=await mem.correct(r.id,{...item,summary:"Choose updated experiment C"});
  assert.equal(updated.status,"corrected");
  assert.equal(mem.current("Choose experiment B").length,0);
  assert.equal(mem.current("experiment C").length,1);
  assert.equal(mem.exportBundle([{id:"project-one",name:"test"}]).knowledge.length,1);
  const correctedBackup=mem.encryptedBackup();
  mem.lock();
  await assert.rejects(mem.restoreEncryptedBackup(correctedBackup,"wrong-password-2026",{overwrite:true}),
    /密码错误/);
  await assert.rejects(mem.restoreEncryptedBackup(correctedBackup,"a-complicated-passphrase-2026"),
    /已有本地记忆/);
  const restored=await mem.restoreEncryptedBackup(correctedBackup,"a-complicated-passphrase-2026",{overwrite:true});
  assert.equal(restored.status,"restored");
  assert.equal((await mem.unlock("a-complicated-passphrase-2026")).count,2);
  assert.equal(mem.current().length,1);
  assert.equal((await mem.remove(r.id)).status,"deleted");
  assert.equal((await mem.remove(updated.new_id)).status,"deleted");
  assert.equal(mem.search().length,0);
  console.log("NextPlan Jarvis AES-GCM local memory: encryption/consent/search/lock/unlock/delete PASS");
})().catch(err=>{console.error(err);process.exitCode=1});

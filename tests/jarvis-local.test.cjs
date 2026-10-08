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
  assert.equal((await mem.remove(r.id)).status,"deleted");
  assert.equal(mem.search().length,0);
  console.log("NextPlan Jarvis AES-GCM local memory: encryption/consent/search/lock/unlock/delete PASS");
})().catch(err=>{console.error(err);process.exitCode=1});

"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const origin="https://nextplan-jarvis-free.personal.workers.dev";
const secret="test-worker-secret-123456789012345678901234567890";
let requests=[];
let localWrites=0;
globalThis.window=globalThis;
globalThis.localStorage={setItem(){localWrites++;throw Error("never store model secret")}};
globalThis.fetch=async(url,options={})=>{
  requests.push({url,options});
  if(String(url).endsWith("/health"))return {
    ok:true,json:async()=>({service:"nextplan-jarvis-free-ai",configured:true,
      model:"@cf/zai-org/glm-4.7-flash"})
  };
  if(String(url).endsWith("/v1/chat"))return {
    ok:true,status:200,json:async()=>({mode:"free_cloudflare_ai",model:"@cf/zai-org/glm-4.7-flash",
      answer:"GitHub 是正式实验存储位置。",executed_actions:0,
      sources:[{source_ref:"manual://unit-test"}]})
  };
  throw Error("unexpected request");
};
vm.runInThisContext(fs.readFileSync("jarvis-free-remote.js","utf8"));

test("only HTTPS workers.dev host and root path accepted",async()=>{
  const free=globalThis.JarvisFree;
  for(const u of ["https://evil.com","http://x.y.workers.dev",
    "https://legit.x.workers.dev.evil.com",
    "https://legit.x.workers.dev/private", "https://x.y.workers.dev/?token=oops"]) {
    await assert.rejects(free.configure(u,secret),/只允许/);
  }
});
test("free inference is opt-in, bounded and never stores secret",async()=>{
  const free=globalThis.JarvisFree;requests=[];
  await free.configure(origin,secret);
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,origin+"/health");
  assert.equal(requests[0].options.headers,undefined);
  await assert.rejects(free.ask("问题",[],[],false),/必须先授权/);
  assert.equal(requests.length,1);
  const r=await free.ask("科研代码存哪里？",[
    {summary:"应放到 GitHub",source_ref:"manual://unit-test",epistemic_status:"user_confirmed"}],
    [{name:"RP",status:"active"}],true);
  assert.equal(r.executed_actions,0);
  assert.equal(requests.length,2);
  const request=requests[1];
  assert.equal(request.options.headers.Authorization,"Bearer "+secret);
  const body=JSON.parse(request.options.body);
  assert.equal(body.knowledge.length,1);
  assert.equal(body.projects.length,1);
  assert.equal(body.allow_model,true);
  assert.equal(body.history.length,0);
  assert.equal(localWrites,0);
  // Second question can follow the prior explicitly-consented exchange.
  await free.ask("为什么？",[],[],true);
  assert.equal(JSON.parse(requests[2].options.body).history.length,2);
  free.disconnect();
  assert.equal(free.ready(),false);
  await assert.rejects(free.ask("再次访问",[],[],true),/请先连接/);
});
test("wrong worker response cannot masquerade as verified answer",async()=>{
  const free=globalThis.JarvisFree;
  const previous=globalThis.fetch;
  globalThis.fetch=async(url,opts)=>String(url).endsWith("/health")
    ? {ok:true,json:async()=>({service:"nextplan-jarvis-free-ai",configured:true,model:"x"})}
    : {ok:true,status:200,json:async()=>({answer:"done",executed_actions:1})};
  try{
    await free.configure(origin,secret);
    await assert.rejects(free.ask("问题",[],[],true),/只读模式验证/);
  }finally{globalThis.fetch=previous;free.disconnect()}
});
test("error responses never silently pay or auto-retry",async()=>{
  const free=globalThis.JarvisFree;
  const previous=globalThis.fetch;
  let attempts=0;
  globalThis.fetch=async(url)=>String(url).endsWith("/health")
    ? {ok:true,json:async()=>({service:"nextplan-jarvis-free-ai",configured:true,model:"x"})}
    : (attempts++,{ok:false,status:503,json:async()=>({error:"quota_exhausted"})});
  try{
    await free.configure(origin,secret);
    await assert.rejects(free.ask("问题",[],[],true),/没有自动付费重试/);
    assert.equal(attempts,1);
  }finally{globalThis.fetch=previous;free.disconnect()}
});

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
      model:"@cf/qwen/qwen3-30b-a3b-fp8"})
  };
  if(String(url).endsWith("/v1/chat"))return {
    ok:true,status:200,json:async()=>({mode:"free_cloudflare_ai",model:"@cf/qwen/qwen3-30b-a3b-fp8",
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

test("Brain v2 ranks related projects and knowledge before upload",()=>{
  const free=globalThis.JarvisFree;
  const projects=Array.from({length:12},(_,i)=>({id:"p"+i,name:i===11?"P4实验":"Other "+i,status:"planned"}));
  const notes=Array.from({length:12},(_,i)=>({
    project_id:"p"+i,summary:i===11?"P4 实验日志说明 checkpoint 可恢复":"unrelated note "+i,
    source_ref:"manual://"+i,epistemic_status:"user_confirmed"
  }));
  const picked=free.selectContext("检查 P4 实验 checkpoint",notes,projects);
  assert.equal(picked.knowledge.length,8);
  assert.equal(picked.projects.length,8);
  assert.equal(picked.projects[0].name,"P4实验");
  assert.equal(picked.knowledge[0].source_ref,"manual://11");
  assert.equal(free.requiresPlanning("请分析 P4 实验的失败原因"),true);
  assert.equal(free.requiresPlanning("P4 状态"),false);
});
test("Brain v2 performs at most two consented Qwen calls and only read-only retrieval",async()=>{
  const free=globalThis.JarvisFree;
  const previous=globalThis.fetch;const calls=[];
  globalThis.fetch=async(url,opts)=>{
    if(String(url).endsWith("/health"))return {ok:true,json:async()=>({
      service:"nextplan-jarvis-free-ai",configured:true,model:"qwen"})};
    const body=JSON.parse(opts.body);calls.push(body);
    if(body.phase==="plan")return {ok:true,status:200,json:async()=>({
      mode:"free_cloudflare_ai_plan",search_queries:["checkpoint"],executed_actions:0})};
    return {ok:true,status:200,json:async()=>({
      mode:"free_cloudflare_ai_v2",answer:"根据实验记录，先检查 checkpoint。",executed_actions:0,
      sources:[{source_ref:"manual://ckpt"},{source_ref:"manual://not-provided"}]})};
  };
  try {
    await free.configure(origin,secret);
    const notes=[{summary:"checkpoint 日志保存在 GitHub",source_ref:"manual://ckpt",
      epistemic_status:"user_confirmed"}];
    const result=await free.ask("为什么 P4 实验中断，如何恢复？",notes,
      [{name:"P4实验",status:"active"}],true);
    assert.equal(calls.length,2);
    assert.equal(calls[0].phase,"plan");
    assert.equal(calls[1].phase,"answer");
    assert.equal(calls[1].knowledge.length,1);
    assert.equal(calls[1].retrieval_queries[0],"checkpoint");
    assert.equal(result.executed_actions,0);
    assert.deepEqual(result.sources,[{source_ref:"manual://ckpt"}]);
    assert.equal(result.verification.semantic_truth_verified,false);
    assert.equal(localWrites,0);
  } finally {globalThis.fetch=previous;free.disconnect();}
});
test("Brain v2 rejects malicious or write-capable planning result",async()=>{
  const free=globalThis.JarvisFree;
  const previous=globalThis.fetch;let n=0;
  globalThis.fetch=async(url,opts)=>{
    if(String(url).endsWith("/health"))return {ok:true,json:async()=>({
      service:"nextplan-jarvis-free-ai",configured:true,model:"qwen"})};
    n++;
    return {ok:true,status:200,json:async()=>({
      mode:"free_cloudflare_ai_plan",search_queries:["DELETE ALL"],executed_actions:1})};
  };
  try{
    await free.configure(origin,secret);
    await assert.rejects(free.ask("请分析下一步如何进行",[],[{name:"P4",status:"active"}],true),/只读模式验证/);
    assert.equal(n,1);
  }finally{globalThis.fetch=previous;free.disconnect();}
});

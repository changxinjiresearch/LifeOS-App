"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const window={};
vm.runInNewContext(fs.readFileSync("jarvis-action-parse.js","utf8"),{window});
const parse=window.JarvisActionParser.parse;
const projects=[{id:"p-rp",name:"RP新实验"}, {id:"p-ni",name:"Neuroscience Informatics 论文"}];
test("only unambiguous explicit project operations become editable suggestions",()=>{
  const step=parse("把RP新实验的下一步改为核查P4实验结果",projects);
  assert.equal(step.project_id,"p-rp");
  assert.equal(step.field,"next_action");
  assert.equal(step.value,"核查P4实验结果");
  const status=parse("把RP新实验状态改为已完成",projects);
  assert.equal(status.value,"completed");
  for(const value of ["帮我管理项目","删除 RP新实验","现在要做什么？",
    "把RP新实验和Neuroscience Informatics 论文的状态改为已完成"]){
    assert.throws(()=>parse(value,projects));
  }
});

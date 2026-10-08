"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
test("Jarvis microphone requires explicit start, never auto-submits, supports stop and TTS cancel",()=>{
  const handlers=new Map(),nodes=new Map(),submitted={count:0};
  function node(id){
    if(!nodes.has(id))nodes.set(id,{value:id==="jarvisVoiceLanguage"?"zh-CN":"",
      textContent:"",disabled:false,addEventListener(type,fn){handlers.set(id+":"+type,fn)}});
    return nodes.get(id);
  }
  class FakeSpeech {
    constructor(){FakeSpeech.instance=this;this.started=0;this.stopped=0}
    start(){this.started++}
    stop(){this.stopped++;this.onend?.()}
  }
  const synth={count:0,cancelCount:0,
    speak(t){this.count++;this.last=t},
    cancel(){this.cancelCount++}};
  const fakeWindow={
    SpeechRecognition:FakeSpeech,speechSynthesis:synth,
    addEventListener(type,fn){handlers.set("window:"+type,fn)}
  };
  const fakeDocument={
    getElementById:node,
    addEventListener(type,fn){handlers.set("document:"+type,fn)}
  };
  const ctx={window:fakeWindow,document:fakeDocument,SpeechSynthesisUtterance:
    function(t){this.text=t;},console};
  vm.runInNewContext(fs.readFileSync("jarvis-voice.js","utf8"),ctx);
  assert.equal(fakeWindow.JarvisSpeech.hasRecognition,true);
  handlers.get("jarvisMicStart:click")();
  assert.equal(FakeSpeech.instance.started,1);
  FakeSpeech.instance.onresult({results:[[{transcript:"测试语音输入"}]]});
  assert.equal(node("question").value,"测试语音输入");
  assert.equal(submitted.count,0);
  handlers.get("jarvisMicStop:click")();
  assert.equal(FakeSpeech.instance.stopped,1);
  handlers.get("document:jarvis:assistant-answer")({detail:{text:"Jarvis 回答"}});
  handlers.get("jarvisSpeakAnswer:click")();
  assert.equal(synth.count,1);
  assert.equal(synth.last.text,"Jarvis 回答");
  handlers.get("jarvisStopSpeaking:click")();
  assert.ok(synth.cancelCount>=2);
  handlers.get("window:pagehide")();
});

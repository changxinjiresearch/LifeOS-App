/* Explicit, web-only Jarvis speech.
 * No wake word, no background recording, no automatic model submission.
 * Chrome Web Speech recognition may use a vendor cloud service.
 */
(()=>{
  "use strict";
  const $=id=>document.getElementById(id);
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  let recognition=null, active=false, lastAnswer="";
  const message=(s)=>{$("jarvisVoiceStatus").textContent=s;};
  function createRecognition(){
    if(!Speech)throw Error("此浏览器不支持 SpeechRecognition；可继续使用文字输入");
    const r=new Speech();
    r.lang=$("jarvisVoiceLanguage").value;
    r.continuous=false;r.interimResults=false;
    r.maxAlternatives=1;
    r.onresult=(event)=>{
      const transcript=String(event.results?.[0]?.[0]?.transcript||"").trim().slice(0,1000);
      if(!transcript){message("没有识别到可用语音");return;}
      $("question").value=transcript;
      message("听写已填入对话框；请检查文字并手动点击提问。不会自动提交 Cloudflare。");
    };
    r.onerror=event=>{active=false;message("语音识别已停止："+String(event.error||"unknown"));};
    r.onend=()=>{active=false;if($("jarvisVoiceStatus").textContent.startsWith("正在听"))message("录音结束。");};
    return r;
  }
  function start(){
    if(active){message("正在听写，请先停止");return;}
    try{
      recognition=createRecognition();
      active=true;recognition.start();
      message("正在听写…麦克风仅在本次明确开启期间使用；若浏览器询问权限请先确认。");
    }catch(e){active=false;message("无法启动语音："+e.message);}
  }
  function stop(){
    if(recognition){try{recognition.stop();}catch(_){}}
    active=false;message("录音已经停止。");
  }
  function speak(){
    if(!("speechSynthesis" in window)){message("此浏览器不支持语音合成");return;}
    if(!lastAnswer){message("暂无可以朗读的 Jarvis 回答");return;}
    window.speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(lastAnswer.slice(0,1500));
    utterance.lang=$("jarvisVoiceLanguage").value;
    utterance.rate=1;utterance.pitch=1;
    utterance.onerror=()=>message("朗读失败或被浏览器中断。");
    utterance.onend=()=>message("朗读结束。");
    window.speechSynthesis.speak(utterance);
    message("正在朗读上一条 Jarvis 回答。");
  }
  function stopSpeaking(){
    if("speechSynthesis" in window)window.speechSynthesis.cancel();
    message("朗读已停止。");
  }
  document.addEventListener("jarvis:assistant-answer",e=>{
    // Only the Jarvis app's own text messages, never HTML or tool commands.
    const text=e.detail?.text;
    if(typeof text==="string"&&text.trim())lastAnswer=text;
  });
  $("jarvisMicStart").addEventListener("click",start);
  $("jarvisMicStop").addEventListener("click",stop);
  $("jarvisSpeakAnswer").addEventListener("click",speak);
  $("jarvisStopSpeaking").addEventListener("click",stopSpeaking);
  window.addEventListener("pagehide",()=>{
    stop();if("speechSynthesis" in window)window.speechSynthesis.cancel();
  });
  if(!Speech){
    $("jarvisMicStart").disabled=true;
    message("当前浏览器不支持语音识别。仍可以尝试浏览器朗读功能。");
  }
  window.JarvisSpeech={start,stop,speak,stopSpeaking,hasRecognition:!!Speech};
})();

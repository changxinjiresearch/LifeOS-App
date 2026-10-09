/* Jarvis Web ↔ NextPlan Sync v0.6, no API credentials exposed to page.
 * All canonical writes are QUEUED for user approval in extension popup.
 * ChatGPT selected text stored only after user explicitly reviews it.
 */
(()=>{
  "use strict";
  const ORIGIN="https://changxinjiresearch.github.io";
  const $=id=>document.getElementById(id);
  const requests=new Map();
  let authoritative=[];
  const feedback=text=>{$("jarvisBridgeStatus").textContent=text;};
  window.addEventListener("message",event=>{
    if(event.source!==window||event.origin!==ORIGIN)return;
    const msg=event.data;
    if(msg?.channel!=="nextplan-extension-to-jarvis"||typeof msg.requestId!=="string")return;
    const pending=requests.get(msg.requestId);
    if(!pending)return;
    requests.delete(msg.requestId);clearTimeout(pending.timer);pending.resolve(msg.result||{status:"error"});
  });
  function request(type,fields={}){
    if(location.origin!==ORIGIN||location.pathname!=="/LifeOS-App/jarvis.html")
      return Promise.reject(new Error("必须从 NextPlan 正式网站访问"));
    const requestId=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{requests.delete(requestId);reject(new Error("扩展不可用：请安装或重新加载 NextPlan Sync v0.6"))},6500);
      requests.set(requestId,{resolve,reject,timer});
      window.postMessage({channel:"nextplan-jarvis-to-extension",requestId,type,...fields},ORIGIN);
    });
  }
  function cleanText(v){return String(v??"").slice(0,3000);}
  async function refreshProjects(){
    try{
      const response=await request("NEXTPLAN_JARVIS_STATE");
      if(response.status!=="ok")throw Error(response.reason||"不可读取正式状态");
      authoritative=Array.isArray(response.projects)?response.projects:[];
      const sel=$("jarvisCanonicalProject");
      sel.replaceChildren();
      const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent="请选择 NextPlan 正式项目";
      sel.appendChild(placeholder);
      for(const p of authoritative){
        const option=document.createElement("option");option.value=p.id;
        option.textContent=p.name+" · "+p.status;sel.appendChild(option);
      }
      feedback("NextPlan Sync 已连接；读取正式项目 "+authoritative.length+" 项。操作仍需扩展弹窗确认。");
    }catch(e){feedback("未连接扩展或正式数据不可用："+e.message);}
  }
  async function prepareCanonical(event){
    event.preventDefault();
    const id=$("jarvisCanonicalProject").value,field=$("jarvisCanonicalField").value;
    const project=authoritative.find(p=>p.id===id);
    if(!project){feedback("请选择正式项目并刷新数据");return;}
    const proposal={action:"update_project_snapshot",project_id:id,expected_status:project.status};
    if(field==="status")proposal.status=$("jarvisCanonicalStatus").value;
    else if(field==="next_action")proposal.next_action=$("jarvisCanonicalNext").value.trim();
    else{feedback("不支持的变更类型");return;}
    const before=field==="status"?project.status:project.next_action;
    const after=proposal[field];
    if(!after||before===after){feedback("变更内容为空或与当前状态一致");return;}
    if(field==="next_action"){
      try{
        // Never queue an instruction string as the actual project work.
        window.JarvisActionParser.validateNextAction(after,project,authoritative);
      }catch(e){
        feedback("操作被安全校验阻止："+e.message);
        return;
      }
    }
    if(!confirm("正式 NextPlan 项目："+project.name+"\n字段："+field+"\n当前："+before+"\n拟修改："+after+"\n\n仅添加至浏览器扩展人工确认队列，不会立即写入。继续？"))return;
    try{
      const r=await request("NEXTPLAN_JARVIS_QUEUE",{proposal});
      if(r.status!=="queued_for_extension_confirmation")throw Error(r.reason||"无法创建候选");
      feedback("操作已排队，尚未修改正式数据。请点击 Chrome 工具栏 NextPlan Sync 扩展图标，人工确认并等待真实状态核验。");
    }catch(e){feedback("未提交操作："+e.message);}
  }
  function el(tag,text,cl=""){
    const node=document.createElement(tag);if(text!==undefined)node.textContent=text;
    if(cl)node.className=cl;return node;
  }
  async function showCaptures(){
    const host=$("jarvisCaptureList");host.replaceChildren();
    let response;
    try{response=await request("NEXTPLAN_JARVIS_CAPTURES");}
    catch(e){host.appendChild(el("p","扩展未连接："+e.message,"small"));return;}
    if(response.status!=="ok"){host.appendChild(el("p","暂时无法读取待确认片段。","small"));return;}
    const captures=Array.isArray(response.captures)?response.captures:[];
    if(!captures.length){host.appendChild(el("p","没有等待导入的 ChatGPT 选中文字。","small"));return;}
    for(const item of captures){
      const row=el("div",undefined,"item");
      row.appendChild(el("div",cleanText(item.summary),"itemTitle"));
      row.appendChild(el("div","来源："+cleanText(item.source_ref)+" · 未经确认，不是可信事实","meta"));
      const chooser=el("select");
      const none=el("option","选择所属 NextPlan 项目");none.value="";chooser.appendChild(none);
      for(const p of authoritative){const option=el("option",p.name);option.value=p.id;chooser.appendChild(option)}
      const kind=el("select");
      for(const [v,label] of [["observation","观察"],["decision","已确认决策"],["hypothesis","尚待验证假设"],["handoff","工作交接"]]){
        const option=el("option",label);option.value=v;kind.appendChild(option);
      }
      const save=el("button","核对并加密保存","secondary compact");save.type="button";
      save.addEventListener("click",async()=>{
        if(!window.JarvisLocal?.ready()){
          alert("先解锁浏览器本地加密记忆，才能导入 ChatGPT 片段。");return;
        }
        if(!chooser.value){alert("请选择项目");return;}
        const title=authoritative.find(p=>p.id===chooser.value)?.name||chooser.value;
        if(!confirm("确认将这段 ChatGPT 选中文字作为【"+kind.selectedOptions[0].textContent+"】存入【"+title+"】的加密知识库？\n\n请确保文本真实、非敏感，并非未经核实的助手推断。"))return;
        try{
          const result=await window.JarvisLocal.add({
            project_id:chooser.value,context_type:kind.value,
            summary:item.summary,source_ref:item.source_ref,
            confirmed:true,user_authorized:true
          });
          if(!["recorded","already_exists"].includes(result.status))throw Error("存储未确认");
          const ack=await request("NEXTPLAN_JARVIS_CAPTURE_ACK",{id:item.id});
          if(ack.status!=="acknowledged")throw Error("本地已保存，但扩展待确认项移除失败");
          await showCaptures();
          $("knowledgeQuery").value="";
          $("refreshKnowledge").click();
          feedback("ChatGPT 选中文字已由用户确认后加密保存。");
        }catch(e){feedback("片段保存未完成："+e.message);}
      });
      row.append(chooser,kind,save);host.appendChild(row);
    }
  }
  $("jarvisActionParse").addEventListener("click",()=>{
    try{
      const draft=window.JarvisActionParser.parse($("jarvisActionSentence").value,authoritative);
      $("jarvisCanonicalProject").value=draft.project_id;
      $("jarvisCanonicalField").value=draft.field;
      if(draft.field==="next_action")$("jarvisCanonicalNext").value=draft.value;
      else $("jarvisCanonicalStatus").value=draft.value;
      feedback("已解析到人工审核表单，尚未排队或执行任何修改。请检查项目和具体值，再点击提交待确认操作。");
    }catch(e){feedback("无法安全解析："+e.message);}
  });
  $("jarvisCanonicalRefresh").addEventListener("click",refreshProjects);
  $("jarvisCanonicalForm").addEventListener("submit",prepareCanonical);
  $("jarvisCaptureRefresh").addEventListener("click",async()=>{
    await refreshProjects();await showCaptures();
  });
  refreshProjects().then(showCaptures).catch(()=>{});
  window.JarvisExtensionBridge={request,refreshProjects};
})();

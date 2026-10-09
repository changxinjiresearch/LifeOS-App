(() => {
  "use strict";
  const ENDPOINT = "https://lifeos-production-89ce.up.railway.app/jarvis/v1";
  const LEGACY_STATE = "https://raw.githubusercontent.com/changxinjiresearch/LifeOS/main/state.json";
  const $ = id => document.getElementById(id);
  const dom = {
    status:$("connectionStatus"), notice:$("environmentNotice"), token:$("jarvisToken"),
    connect:$("connectButton"), disconnect:$("disconnectButton"),
    projectList:$("projectList"), projectScope:$("projectScope"),
    knowledgeProject:$("knowledgeProject"), knowledgeList:$("knowledgeList"),
    bootstrap:$("bootstrapButton"), save:$("saveKnowledge"),
    refreshKnowledge:$("refreshKnowledge"), bundle:$("copyBundle"),
    chat:$("conversation"), brainMode:$("brainMode")
  };
  let connected = false, enabled = false, projects = [], legacyProjects = [], privateRevision = 0, privateProjects = [];
  let localUnlocked=false;
  function enableKnowledge(){
    const active=connected||localUnlocked;
    dom.save.disabled=!active;dom.refreshKnowledge.disabled=!active;dom.bundle.disabled=!active;
  }
  let token = sessionStorage.getItem("NEXTPLAN_JARVIS_SESSION_TOKEN") || "";
  dom.token.value = token;

  function el(tag, text, className) {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = String(text);
    if (className) item.className = className;
    return item;
  }
  function status(message) { dom.status.textContent = message; }
  function notice(message) { dom.notice.textContent = message; }
  function message(value, role="assistant", detail="") {
    const row=el("div", value, "message " + role);
    if (detail) row.appendChild(el("div", detail, "meta"));
    dom.chat.appendChild(row);
    dom.chat.scrollTop = dom.chat.scrollHeight;
    if(role==="assistant" && detail.includes("模型：") || (role==="assistant" && detail.includes("来源：")))
      document.dispatchEvent(new CustomEvent("jarvis:assistant-answer",{detail:{text:String(value)}}));
  }
  function localProjectList(raw) {
    return (Array.isArray(raw) ? raw : []).filter(p=>p && typeof p.id==="string" && typeof p.name==="string").map(p=>({
      id:p.id,name:p.name,status:p.status||"planned",next_action:p.next_action||"",priority:p.priority||3
    }));
  }
  async function api(path, options={}) {
    if (!token) throw new Error("需要先连接私人 Jarvis 工作区");
    const response=await fetch(ENDPOINT+path,{
      method:options.method||"GET",mode:"cors",cache:"no-store",
      headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
      body:options.body ? JSON.stringify(options.body) : undefined,
      signal:AbortSignal.timeout(18000)
    });
    let body={};
    try {body=await response.json();} catch (_) {throw new Error("服务器没有返回有效 JSON");}
    if (!response.ok) throw new Error(body.detail || body.error || "请求失败 ("+response.status+")");
    return body;
  }
  async function checkBackend() {
    try{
      const r=await fetch(ENDPOINT+"/status",{cache:"no-store",signal:AbortSignal.timeout(12000)});
      const json=await r.json();
      enabled=json.status==="available";
      if (!enabled) {
        status("私人服务未启用");
        notice("现阶段可查看公开的 NextPlan 项目快照；私人记忆与自动知识交接需先配置持久存储和授权密钥。");
      }else{
        status(connected?"私人空间已连接":"私人服务可连接");
        notice(connected?"已连接私人试验工作区；项目草稿不等于 NextPlan 生产状态。":"请输入管理员配置的 Jarvis 独立访问密钥。");
      }
    }catch(_){
      enabled=false;status("服务器不可达");
      notice("Jarvis 私人后端暂不可达。现有 NextPlan 网页项目仍可独立使用。");
    }
  }
  async function readLegacy(){
    try{
      const r=await fetch(LEGACY_STATE,{cache:"no-store",signal:AbortSignal.timeout(12000)});
      if (!r.ok) throw new Error("仓库状态请求失败");
      legacyProjects=localProjectList((await r.json()).projects);
    }catch(e){
      legacyProjects=[];
      notice("无法读取 NextPlan 状态："+e.message+"；不会把缓存当作已同步事实。");
    }
  }
  function renderProjects(){
    projects = connected && privateProjects.length ? privateProjects : legacyProjects;
    dom.projectList.replaceChildren();
    dom.projectScope.textContent = connected && privateProjects.length
      ? "私人试验工作区 · revision "+privateRevision+" · 尚未迁移至正式 NextPlan"
      : "当前 NextPlan 公开状态 · 只读";
    for(const p of projects){
      const box=el("div",undefined,"item");
      box.appendChild(el("div",p.name,"itemTitle"));
      box.appendChild(el("div","状态："+p.status+" · "+(p.next_action||"未指定下一步"),"meta"));
      if (connected && privateProjects.length){
        const line=el("div",undefined,"inline");
        const select=el("select");
        for(const st of ["planned","active","waiting","blocked","completed"]){
          const o=el("option",st);o.value=st;o.selected=st===p.status;select.appendChild(o);
        }
        const update=el("button","更新试验副本","secondary compact");
        update.type="button";update.addEventListener("click",()=>updateProject(p,select.value));
        line.append(select,update);box.appendChild(line);
      }else box.appendChild(el("span","read only","pill"));
      dom.projectList.appendChild(box);
    }
    if(!projects.length)dom.projectList.appendChild(el("div","未找到可读取的项目。","small"));
    dom.knowledgeProject.replaceChildren();
    const placeholder=el("option","请选择项目");placeholder.value="";
    dom.knowledgeProject.appendChild(placeholder);
    for(const p of projects){
      const o=el("option",p.name);o.value=p.id;dom.knowledgeProject.appendChild(o);
    }
    dom.bootstrap.disabled=!(connected && privateRevision===0 && legacyProjects.length);enableKnowledge();
  }
  async function updateProject(project, value){
    if(!connected)return;
    if (!confirm("仅修改私人 Jarvis 试验工作区的项目状态；NextPlan 正式项目不会因此改变。继续？"))return;
    const operationId=crypto.randomUUID();
    try{
      const r=await api("/sync/action",{method:"POST",body:{
        intent:{protocol_version:"jarvis-p0-v1",operation_id:operationId,device_id:"nextplan-web",
          target:{entity_type:"project",entity_id:project.id},action:"update_project",
          expected_revision:privateRevision,authority:"user_confirmed",status:"proposed"},
        values:{status:value}
      }});
      if(r.status==="conflict")throw new Error("版本冲突：请刷新最新状态后再修改。");
      message("试验副本状态操作："+r.status+"；revision "+r.revision,"assistant","operation "+r.operation_id);
      await loadPrivate();
    }catch(e){message("未完成操作："+e.message);}
  }
  async function loadPrivate(){
    const data=await api("/sync/state");
    privateProjects=localProjectList(data.projects);
    privateRevision=data.revision;
    renderProjects();
    enableKnowledge();
    dom.brainMode.textContent="私人只读助手 · 非自主执行";
  }
  async function connect(){
    token=dom.token.value.trim();
    if(!token){message("请输入 Jarvis 独立访问密钥。");return;}
    try{
      await loadPrivate();
      connected=true;
      sessionStorage.setItem("NEXTPLAN_JARVIS_SESSION_TOKEN",token);
      renderProjects();await refreshKnowledge();
      await checkBackend();message("已连接私人 Jarvis 试验空间。任何草稿修改不会更新正式 NextPlan。");
    }catch(e){
      token="";connected=false;sessionStorage.removeItem("NEXTPLAN_JARVIS_SESSION_TOKEN");
      message("连接未成功："+e.message);
      await checkBackend();
    }
  }
  function disconnect(){
    token="";connected=false;privateProjects=[];privateRevision=0;dom.token.value="";
    sessionStorage.removeItem("NEXTPLAN_JARVIS_SESSION_TOKEN");
    enableKnowledge();
    dom.knowledgeList.replaceChildren();
    renderProjects();checkBackend();
    message("已断开私人数据连接。");
  }
  async function bootstrap(){
    if(!connected || privateRevision!==0 || !legacyProjects.length)return;
    if(!confirm("把当前 NextPlan 公开项目的基本字段复制到私人试验工作区？这是一次性的副本导入，不会修改 NextPlan 正式状态。"))return;
    try{
      const data=await api("/sync/bootstrap",{method:"POST",body:{confirmed:true,projects:legacyProjects}});
      message("已建立私人试验副本："+data.project_count+" 项。正式 NextPlan 状态未更改。");
      await loadPrivate();
    }catch(e){message("导入未完成："+e.message);}
  }
  async function refreshKnowledge(){
    if(!connected&&!localUnlocked)return;
    try{
      const q=$("knowledgeQuery").value.trim();
      const data=connected ? await api("/knowledge/search?q="+encodeURIComponent(q))
        : {items:window.JarvisLocal.current(q)};
      dom.knowledgeList.replaceChildren();
      for(const item of data.items||[]){
        const box=el("div",undefined,"item");
        box.appendChild(el("div",item.summary,"itemTitle"));
        box.appendChild(el("div",item.context_type+" · "+item.epistemic_status+" · "+item.source_ref,"meta"));
        const del=el("button","删除记录","secondary compact");
        del.type="button";del.addEventListener("click",async()=>{
          if(!confirm("确定删除这条私人知识记录？"))return;
          try{if(connected)await api("/knowledge/delete",{method:"POST",body:{id:item.id,confirmed:true}});
            else await window.JarvisLocal.remove(item.id);
            await refreshKnowledge();}
          catch(e){message("删除失败："+e.message);}
        });
        box.appendChild(del);
        if(!connected&&localUnlocked){
          const correct=document.createElement("button");correct.textContent="更正记录";
          correct.className="secondary compact";correct.type="button";
          correct.addEventListener("click",async()=>{
            const replacement=prompt("请输入经核实的更正内容。原记录会保留历史但退出当前检索。",item.summary);
            if(!replacement||replacement===item.summary)return;
            if(!confirm("将新内容标记为此记录的更新版本？请确认事实依据没有改变。"))return;
            try{
              await window.JarvisLocal.correct(item.id,{
                project_id:item.project_id,context_type:item.context_type,
                summary:replacement,source_ref:item.source_ref,
                confirmed:true,user_authorized:true
              });
              await refreshKnowledge();message("知识更正已加密保存；旧记录已标记为被替代。");
            }catch(e){message("更正失败："+e.message);}
          });
          box.appendChild(correct);
        }
        dom.knowledgeList.appendChild(box);
      }
      if(!data.items?.length)dom.knowledgeList.appendChild(el("div","暂无相关已确认知识。","small"));
    }catch(e){message("知识检索失败："+e.message);}
  }
  async function saveKnowledge(event){
    event.preventDefault();if(!connected&&!localUnlocked)return;
    if(!$("knowledgeConfirm").checked){message("请先明确确认并授权保存。");return;}
    try{
      const body={
        context_type:$("knowledgeType").value,project_id:$("knowledgeProject").value,
        summary:$("knowledgeSummary").value.trim(),source_kind:"manual_import",
        source_ref:$("knowledgeSource").value.trim(),
        user_authorized:true,confirmed_by_user:true
      };
      const r=connected ? await api("/context/record",{method:"POST",body})
        : await window.JarvisLocal.add({...body,confirmed:true});
      message(r.status==="recorded"?"知识已保存到私人工作区。":"这条知识已经存在，不重复保存。");
      $("knowledgeSummary").value="";$("knowledgeConfirm").checked=false;await refreshKnowledge();
    }catch(e){message("知识未保存："+e.message);}
  }
  async function copyBundle(){
    if(!connected&&!localUnlocked)return;
    if(!confirm("交接包包含私人项目与知识摘要，将复制到剪贴板。你可以自行选择是否粘贴到 ChatGPT。继续？"))return;
    try{
      const b=connected ? await api("/context/bundle")
        : window.JarvisLocal.exportBundle(legacyProjects);
      await navigator.clipboard.writeText(JSON.stringify(b,null,2));
      message("已将经授权的项目背景和知识摘要复制到剪贴板；尚未自动发送到 ChatGPT。");
    }catch(e){message("复制失败："+e.message);}
  }
  function fallback(question){
    const lower=question.toLocaleLowerCase();
    const p=legacyProjects.filter(x=>x.name.toLocaleLowerCase().includes(lower) ||
      lower.includes(x.name.toLocaleLowerCase()));
    if(p.length)return p.map(x=>x.name+"："+x.status+"；下一步："+(x.next_action||"未指定")).join("\n");
    if(/项目|进度|下一步|project|status/i.test(question))
      return legacyProjects.slice(0,12).map(x=>x.name+"："+x.status+"；"+(x.next_action||"无明确下一步")).join("\n") || "暂无项目资料。";
    return "当前没有私人知识库或语言模型连接。我只能读取现有公开 NextPlan 项目状态，无法直接获取 ChatGPT 未授权的完整历史。";
  }
  async function ask(event){
    event.preventDefault();
    const q=$("question").value.trim();if(!q)return;
    message(q,"user");$("question").value="";
    if(window.JarvisFree && window.JarvisFree.ready() && $("modelConsent").checked){
      try{
        // Rank locally across up to 50 unlocked memories and all visible
        // projects. Only the top 8 of each are sent per consented inference.
        const knowledge = localUnlocked ? window.JarvisLocal.current("") : [];
        const projectFacts=(connected&&privateProjects.length?privateProjects:legacyProjects);
        const r=await window.JarvisFree.ask(q,knowledge,projectFacts,true);
        const refs=(r.sources||[]).map(x=>x.source_ref).slice(0,8).join(" · ");
        message(r.answer,"assistant","免费远程模型："+r.model+" · "+(r.read_steps===2?"两阶段检索推理":"单次推理")+" · 只读，执行操作 0"+(refs?" · 提供的知识来源（非独立核验）："+refs:""));
        return;
      }catch(e){
        message("免费远程推理失败："+e.message+"。未调用付费模型。","assistant");
        return;
      }
    }
    if(!connected){
      let answer=fallback(q);
      if(localUnlocked){
        const hits=window.JarvisLocal.current(q);
        const relevant=hits.length?hits:window.JarvisLocal.current("").slice(0,5);
        if(relevant.length&&!/项目|进度|下一步|project|status/i.test(q)){
          answer="本地加密知识中的相关记录（未必直接回答问题）：\n"+
            relevant.map(x=>"• "+x.summary+"（"+x.source_ref+"）").join("\n");
        }
      }
      message(answer,"assistant","来源：NextPlan 项目状态 / 本地加密记忆 · 只读规则响应");
      return;
    }
    try{
      const r=await api("/brain/ask",{method:"POST",body:{question:q,allow_model:$("modelConsent").checked}});
      const refs=(r.sources||[]).map(x=>x.source_ref).slice(0,5).join(" · ");
      message(r.answer,"assistant","模式："+r.mode+"；操作执行数："+r.executed_actions+(refs?"；来源："+refs:""));
    }catch(e){message("Jarvis 无法回答："+e.message);}
  }
  $("freeConnect").addEventListener("click",async()=>{
    try{
      const result=await window.JarvisFree.configure($("freeModelUrl").value,$("freeModelToken").value);
      $("freeModelToken").value="";
      $("freeModelStatus").textContent="Cloudflare 免费推理服务已配置；请勾选每次问题下方的授权选项后提问。健康检查不会验证访问密钥，首次问答时将正式验证。";
      dom.brainMode.textContent="免费远程 Brain · 手动授权";
      message("已配置免费 Workers AI 模型："+result.model+"。不提供任何付费自动回退。");
    }catch(e){
      $("freeModelToken").value="";
      window.JarvisFree.disconnect();
      $("freeModelStatus").textContent="连接未建立："+e.message;
      message("免费模型配置未完成："+e.message);
    }
  });
  $("freeDisconnect").addEventListener("click",()=>{
    window.JarvisFree.disconnect();
    $("freeModelToken").value="";
    $("freeModelStatus").textContent="已断开免费远程模型；不会发送后续问题。";
    dom.brainMode.textContent="只读模式";
    message("免费远程模型已断开。");
  });
  dom.connect.addEventListener("click",connect);dom.disconnect.addEventListener("click",disconnect);
  $("localUnlockButton").addEventListener("click",async()=>{
    const field=$("localPassphrase");
    try{
      const result=await window.JarvisLocal.unlock(field.value);
      field.value="";localUnlocked=true;enableKnowledge();
      $("localStorageNotice").textContent="本地加密记忆已解锁。仅存于当前浏览器，不会自动跨设备同步。";
      message(result.new_store?"已创建本地加密记忆库，请妥善保管密码。":"已解锁本地加密记忆："+result.count+" 条。");
      await refreshKnowledge();
    }catch(e){field.value="";message("本地记忆未解锁："+e.message);}
  });
  $("localLockButton").addEventListener("click",()=>{
    window.JarvisLocal.lock();localUnlocked=false;enableKnowledge();
    $("localStorageNotice").textContent="本地加密记忆已锁定，密码未被保存。";
    if(!connected)dom.knowledgeList.replaceChildren();
    message("本地加密记忆已锁定。");
  });
  $("refreshProjects").addEventListener("click",async()=>{await readLegacy();if(connected){try{await loadPrivate();}catch(e){message(e.message);}}renderProjects();});
  dom.bootstrap.addEventListener("click",bootstrap);
  $("knowledgeForm").addEventListener("submit",saveKnowledge);
  dom.refreshKnowledge.addEventListener("click",refreshKnowledge);
  $("knowledgeQuery").addEventListener("change",refreshKnowledge);
  dom.bundle.addEventListener("click",copyBundle);
  $("askForm").addEventListener("submit",ask);
  (async()=>{
    await Promise.all([checkBackend(),readLegacy()]);
    renderProjects();message("Jarvis 已加载。当前优先使用 Web-first 模式，并区分公开项目状态与私人试验知识。");
    if(token)await connect();
  })();
})();

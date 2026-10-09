"use strict";
/* Jarvis Brain v2 Lite: opt-in read-only retrieval + bounded model planning.
 * No extra paid model, background upload, or autonomous write actions.
 */
(() => {
  let base = "", token = "", history = [];
  const MAX = 8;
  function normalizedURL(value) {
    let u;
    try { u = new URL(String(value || "").trim()); }
    catch (_) { throw new Error("请输入有效的 Cloudflare Worker HTTPS 地址"); }
    if (u.protocol !== "https:" || !/^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/i.test(u.hostname)
      || (u.port && u.port !== "443") || u.username || u.password || u.search || u.hash
      || (u.pathname !== "/" && u.pathname !== ""))
      throw new Error("只允许 HTTPS 的 Cloudflare *.workers.dev 根地址，不能携带账户密码或查询参数");
    return u.origin;
  }
  async function configure(url, secret) {
    const origin = normalizedURL(url);
    if (typeof secret !== "string" || secret.trim().length < 32 || secret.length > 200)
      throw new Error("Worker 独立密钥应至少 32 个字符");
    const response = await fetch(origin + "/health", {
      method: "GET", cache: "no-store", signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error("免费模型 Worker 健康检查失败");
    const info = await response.json();
    if (info.service !== "nextplan-jarvis-free-ai" || info.configured !== true)
      throw new Error("Worker 尚未配置免费的 AI Binding 或独立密钥");
    base = origin; token = secret.trim(); history = [];
    return { status: "configured", model: info.model, verification: "health_only" };
  }
  function disconnect() { base = ""; token = ""; history = []; }
  function ready() { return Boolean(base && token); }
  function cleanKnowledge(raw) {
    return (Array.isArray(raw) ? raw : []).filter(x => x &&
      ["user_confirmed", "provider_verified", "reported_hypothesis"].includes(x.epistemic_status))
      .map(x => ({
        summary: String(x.summary || "").slice(0, 650),
        source_ref: String(x.source_ref || "").slice(0, 250),
        epistemic_status: x.epistemic_status,
        project_id: String(x.project_id || "").slice(0, 128)
      })).filter(x => x.summary && x.source_ref).slice(0, 500);
  }
  function cleanProjects(raw) {
    return (Array.isArray(raw) ? raw : []).filter(x => x && x.name).map(x => ({
      name: String(x.name).slice(0, 120),
      id: String(x.id || "").slice(0, 128),
      status: String(x.status || "unknown").slice(0, 40),
      next_action: String(x.next_action || "").slice(0, 180)
    })).slice(0, 500);
  }
  function terms(value) {
    const text = String(value || "").toLowerCase();
    const en = text.match(/[a-z0-9][a-z0-9_.-]{1,}/g) || [];
    const cjk = text.match(/[\u3400-\u9fff]+/g) || [];
    const zh = cjk.flatMap(x => x.length < 2 ? [x] : Array.from({length: x.length - 1}, (_,i) => x.slice(i,i+2)));
    return [...new Set([...en, ...zh])].slice(0, 50);
  }
  function score(value, query) {
    const v = String(value || "").toLowerCase();
    const q = String(query || "").toLowerCase().trim();
    if (!q) return 0;
    let n = v.includes(q) ? 20 : 0;
    for (const token of terms(q)) if (v.includes(token)) n += token.length > 2 ? 3 : 1;
    return n;
  }
  function selectContext(query, knowledge, projects) {
    const keys = String(query || "");
    const projectScored = projects.map((p,i)=>({
      p,i,rank:score(p.name,keys)*3+score(p.next_action,keys)+(p.status==="active"?0.1:0)
    })).sort((a,b)=>b.rank-a.rank||a.i-b.i);
    const selectedProjects = projectScored.slice(0,MAX).map(x=>x.p);
    const evidence = knowledge.map((k,i)=>{
      const project = projects.find(p=>p.id && p.id===k.project_id);
      return {k,i,rank:score(k.summary,keys)*2+score(project?.name||"",keys)*3+
        (k.epistemic_status==="provider_verified"?0.3:0)};
    }).sort((a,b)=>b.rank-a.rank||a.i-b.i);
    return { knowledge:evidence.slice(0,MAX).map(x=>({
      summary:x.k.summary,source_ref:x.k.source_ref,epistemic_status:x.k.epistemic_status
    })), projects:selectedProjects.map(p=>({
      name:p.name,status:p.status,next_action:p.next_action
    })) };
  }
  function requiresPlanning(q) {
    return /为什么|如何|怎么|分析|比较|评估|计划|优先|方案|决策|推理|风险|研究|原因|可行性|下一步应该|why\b|how\b|compare|analyse|analyze|plan|priorit|research/i.test(q)
      && q.trim().length >= 8;
  }
  async function remote(payload) {
    let response;
    try {
      response = await fetch(base + "/v1/chat", {
        method:"POST", mode:"cors", cache:"no-store",
        headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
        body:JSON.stringify({...payload,allow_model:true}),
        signal:AbortSignal.timeout(30000)
      });
    } catch (_) { throw new Error("免费推理服务网络不可达或请求超时"); }
    let result;
    try { result = await response.json(); }
    catch (_) { throw new Error("免费推理服务返回了无效数据"); }
    if (!response.ok) {
      if (response.status===401) throw new Error("Worker 独立密钥无效；请重新配置");
      if (response.status===503) throw new Error("免费模型当前不可用或免费额度已用完；没有自动付费重试");
      throw new Error("远程推理失败："+String(result.error||response.status).slice(0,100));
    }
    return result;
  }
  async function ask(question, knowledge, projects, explicitlyConsented=false) {
    if (!ready()) throw new Error("请先连接已部署的免费 Worker");
    if (explicitlyConsented !== true) throw new Error("必须先授权本次远程推理");
    if (typeof question !== "string" || !question.trim() || question.length > 1200)
      throw new Error("问题不能为空或超过长度限制");
    const q = question.trim();
    const allKnowledge = cleanKnowledge(knowledge);
    const allProjects = cleanProjects(projects);
    let context = selectContext(q,allKnowledge,allProjects);
    const recent = history.slice(-6);
    let queries=[];
    let planningFailure="";
    // The planner is advisory. A failed planning call does NOT trigger a paid
    // retry, and a quota failure aborts without a second call.
    if (requiresPlanning(q) && (allKnowledge.length || allProjects.length)) {
      const plan = await remote({phase:"plan",question:q,...context,history:recent});
      // Older already-deployed Workers ignore the new phase field and return
      // a normal read-only answer. Keep that answer rather than requiring
      // a Cloudflare redeploy before the existing app remains usable.
      if (plan.mode==="free_cloudflare_ai" && plan.executed_actions===0 &&
          typeof plan.answer==="string" && plan.answer.trim()) {
        const allowed=new Set(context.knowledge.map(x=>x.source_ref));
        plan.sources=(Array.isArray(plan.sources)?plan.sources:[]).filter(x=>x&&allowed.has(x.source_ref));
        plan.read_steps=1;
        plan.verification={source_allowlist_checked:true,semantic_truth_verified:false};
        history.push({role:"user",content:q.slice(0,400)});
        history.push({role:"assistant",content:plan.answer.slice(0,400)});
        history=history.slice(-6);
        return plan;
      }
      if (plan.executed_actions!==0 || plan.mode!=="free_cloudflare_ai_plan")
        throw new Error("规划结果未通过只读模式验证");
      queries = (Array.isArray(plan.search_queries)?plan.search_queries:[])
        .filter(x=>typeof x==="string" && x.length<=80).slice(0,2);
      if (queries.length) {
        // All retrieval happens on the user's currently unlocked, already
        // authorized local snapshot. The model cannot request network access.
        const expanded=selectContext([q,...queries].join(" "),allKnowledge,allProjects);
        const dedupe=(a,b,key)=>[...a,...b].filter((x,i,arr)=>
          arr.findIndex(y=>key(x)===key(y))===i).slice(0,MAX);
        context={
          knowledge:dedupe(expanded.knowledge,context.knowledge,x=>x.source_ref+"\0"+x.summary),
          projects:dedupe(expanded.projects,context.projects,x=>x.name)
        };
      }
    }
    const result = await remote({phase:"answer",question:q,...context,history:recent,
      ...(queries.length?{retrieval_queries:queries}:{})});
    if (typeof result.answer!=="string" || !result.answer.trim() ||
        result.executed_actions!==0 || !["free_cloudflare_ai","free_cloudflare_ai_v2"].includes(result.mode))
      throw new Error("服务返回的回答未通过只读模式验证");
    // Only report source references that were actually in this request.
    const allowed = new Set(context.knowledge.map(x=>x.source_ref));
    result.sources=(Array.isArray(result.sources)?result.sources:[])
      .filter(x=>x && allowed.has(x.source_ref));
    result.read_steps=queries.length?2:1;
    result.verification={source_allowlist_checked:true,semantic_truth_verified:false};
    history.push({role:"user",content:q.slice(0,400)});
    history.push({role:"assistant",content:result.answer.slice(0,400)});
    history=history.slice(-6);
    return result;
  }
  window.JarvisFree={configure,disconnect,ready,ask,selectContext,requiresPlanning};
})();

"use strict";
/* Optional zero-paid-cost remote Brain for NextPlan.
 * The Worker URL and secret stay in JS memory only. Nothing is auto-sent.
 * Free-plan limits are enforced by the user's Cloudflare Workers FREE account;
 * errors never trigger a paid or alternative model request.
 */
(() => {
  let base = "", token = "", history = [];
  function normalizedURL(value) {
    let u;
    try {u = new URL(String(value || "").trim());}
    catch (_) {throw new Error("请输入有效的 Cloudflare Worker HTTPS 地址");}
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
    // The check does not send a question, knowledge, or even the access secret.
    const response = await fetch(origin + "/health", {
      method:"GET", cache:"no-store", signal:AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error("免费模型 Worker 健康检查失败");
    const result = await response.json();
    if (result.service !== "nextplan-jarvis-free-ai" || result.configured !== true)
      throw new Error("Worker 尚未配置免费的 AI Binding 或独立密钥");
    base = origin; token = secret.trim(); history = [];
    return { status:"configured", model:result.model, verification:"health_only" };
  }
  function disconnect() {base = "";token = "";history = [];}
  function ready() {return Boolean(base && token);}
  function cleanKnowledge(raw) {
    return (Array.isArray(raw) ? raw : []).slice(0,8).filter(x=>x&&
      ["user_confirmed","provider_verified","reported_hypothesis"].includes(x.epistemic_status)).map(x=>({
        summary:String(x.summary||"").slice(0,650),
        source_ref:String(x.source_ref||"").slice(0,250),
        epistemic_status:x.epistemic_status
      })).filter(x=>x.summary&&x.source_ref);
  }
  function cleanProjects(raw) {
    return (Array.isArray(raw)?raw:[]).slice(0,8).filter(x=>x&&x.name).map(x=>({
      name:String(x.name).slice(0,120),
      status:String(x.status||"unknown").slice(0,40),
      next_action:String(x.next_action||"").slice(0,180)
    }));
  }
  async function ask(question, knowledge, projects, explicitlyConsented=false) {
    if (!ready()) throw new Error("请先连接已部署的免费 Worker");
    if (explicitlyConsented !== true) throw new Error("必须先授权本次远程推理");
    if (typeof question !== "string" || !question.trim() || question.length > 1200)
      throw new Error("问题不能为空或超过长度限制");
    const payload = {
      question:question.trim(), allow_model:true,
      knowledge:cleanKnowledge(knowledge), projects:cleanProjects(projects),
      history:history.slice(-6)
    };
    let response;
    try {
      response=await fetch(base+"/v1/chat",{
        method:"POST",mode:"cors",cache:"no-store",
        headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
        body:JSON.stringify(payload),
        signal:AbortSignal.timeout(30000)
      });
    }catch(_){throw new Error("免费推理服务网络不可达或请求超时");}
    let result;
    try{result=await response.json();}
    catch(_){throw new Error("免费推理服务返回了无效数据");}
    if (!response.ok) {
      if (response.status===401) throw new Error("Worker 独立密钥无效；请重新配置");
      if (response.status===503) throw new Error("免费模型当前不可用或免费额度已用完；没有自动付费重试");
      throw new Error("远程推理失败："+String(result.error||response.status).slice(0,100));
    }
    if (typeof result.answer!=="string" || !result.answer.trim() || result.executed_actions!==0)
      throw new Error("服务返回的回答未通过只读模式验证");
    history.push({role:"user",content:question.slice(0,400)});
    history.push({role:"assistant",content:result.answer.slice(0,400)});
    history=history.slice(-6);
    return result;
  }
  window.JarvisFree={configure,disconnect,ready,ask};
})();

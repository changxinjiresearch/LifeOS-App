/* Deterministic preflight only: converts an unambiguous Chinese request
 * into editable form fields; it NEVER invokes tools or writes state.
 */
(()=>{
  function parse(text,projects){
    if(typeof text!=="string"||text.length>500||!text.trim())throw Error("请输入简短的操作指令");
    const exact=(Array.isArray(projects)?projects:[]).filter(p=>
      typeof p.name==="string"&&text.includes(p.name));
    if(exact.length!==1)throw Error("无法唯一确定项目，请改用下方表单明确选择");
    const p=exact[0];
    const step=text.match(/(?:下一步(?:工作|任务)?)[\s：:，,]*(?:改为|改成|修改为|设置为|设为|是)[\s：:]*(.{2,350})$/);
    if(step){
      const value=step[1].trim().replace(/[。！!]+$/,"");
      if(!value)throw Error("下一步内容不能为空");
      return {project_id:p.id,field:"next_action",value};
    }
    const status=text.match(/(?:状态|进度)[\s：:，,]*(?:改为|改成|修改为|设置为|设为|是)[\s：:]*((?:已完成|已结束|进行中|等待中|已阻塞|未开始|completed|active|waiting|blocked|planned))/i);
    const val=status?.[1]?.toLowerCase();
    const states={"已完成":"completed","已结束":"completed","进行中":"active","等待中":"waiting","已阻塞":"blocked","未开始":"planned"};
    if(val)return {project_id:p.id,field:"status",value:states[val]||val};
    throw Error("无法可靠识别操作类型。请使用“项目名 + 下一步改为…”或“项目名 + 状态改为…”，或直接使用下方表单");
  }
  window.JarvisActionParser={parse};
})();

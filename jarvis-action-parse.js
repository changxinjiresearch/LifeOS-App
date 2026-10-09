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
  function validateNextAction(raw,project,projects){
    if(typeof raw!=="string"||!raw.trim()||raw.length>500)
      throw Error("下一步工作不能为空，且不能超过 500 字符");
    const value=raw.trim();
    // Reject an instruction accidentally pasted into the *result* field.
    // The field must contain the resulting work description, not a command
    // telling Jarvis to perform a change.
    if(/(?:把|将|请|Jarvis)[\\s\\S]{0,180}(?:下一步|next_action|项目状态)[\\s\\S]{0,40}(?:改为|改成|修改为|设置为|设为)/i.test(value)){
      throw Error("下一步工作包含完整的修改指令。请把整句放到上面的「自然语言操作意图」，点击「解析并填入待确认表单」，再确认下方只留下具体工作内容。");
    }
    // A second parser-based check catches semantically equivalent commands
    // even if future grammar variants are introduced.
    try{
      const candidate=parse(value,projects);
      if(candidate.field==="next_action"&&candidate.project_id===project?.id&&candidate.value!==value){
        throw Error("下一步工作不能是整句操作命令，应仅填写具体工作内容");
      }
    }catch(err){
      if(/下一步工作不能是整句操作命令/.test(err.message))throw err;
      // A normal task description need not parse as an instruction.
    }
    return value;
  }
  window.JarvisActionParser={parse,validateNextAction};
})();

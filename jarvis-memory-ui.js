(()=>{
  "use strict";
  const $=id=>document.getElementById(id);
  const msg=s=>{$("jarvisBackupStatus").textContent=s;};
  $("jarvisMemoryBackup").addEventListener("click",()=>{
    try{
      const ciphertext=window.JarvisLocal.encryptedBackup();
      const file=new Blob([ciphertext],{type:"application/json"});
      const url=URL.createObjectURL(file);
      const a=document.createElement("a");
      a.href=url;a.download="nextplan-jarvis-encrypted-backup.json";
      a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      msg("加密备份已触发下载。请与密码分别保管。");
    }catch(e){msg("未能生成备份："+e.message);}
  });
  $("jarvisMemoryRestore").addEventListener("click",async()=>{
    const file=$("jarvisMemoryRestoreFile").files?.[0];
    const pass=$("localPassphrase").value;
    if(!file){msg("请先选择加密备份 JSON 文件");return;}
    if(!pass||pass.length<12){msg("请在上方「本地记忆密码」框输入备份对应的至少 12 位密码");return;}
    if(file.size>8*1024*1024){msg("备份文件过大");return;}
    const existing=window.JarvisLocal.initialized();
    if(existing&&!confirm("即将覆盖当前浏览器中已有的加密记忆。请确保已经下载现有备份。确认继续？"))return;
    try{
      const result=await window.JarvisLocal.restoreEncryptedBackup(await file.text(),pass,{overwrite:existing});
      $("localPassphrase").value="";
      msg("恢复成功："+result.count+" 条。现在刷新页面，使用原密码解锁。");
      location.reload();
    }catch(e){$("localPassphrase").value="";msg("备份恢复失败："+e.message);}
  });
})();

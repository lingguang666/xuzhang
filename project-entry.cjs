'use strict';
const fs=require('node:fs'),path=require('node:path');
function entryPath(project){
 const name=String(project.name||'项目').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,40).replace(/[. ]+$/,'');
 return path.join(project.projectDirectory||project.root,`打开续章工作站-${name}-${project.id}.cmd`);
}
function entryBody(project,dataRoot,{node=process.execPath,launcher=path.join(__dirname,'launcher.cjs')}={}){
 if(!/^p-[a-f0-9]{16}$/.test(project.id))throw Error('无效项目编号');
 // Quote paths, escape batch expansion, and disable delayed expansion for ! in directory names.
 const quote=value=>{if(/["\r\n\x00]/.test(value))throw Error('启动路径包含不支持的字符');return value.replace(/%/g,'%%')};
 return ['@echo off','setlocal DisableDelayedExpansion','chcp 65001 >nul',
  `set "XUZHANG_DATA_ROOT=${quote(path.resolve(dataRoot))}"`,
  `set "XUZHANG_PROJECT_DIRECTORY=${quote(project.projectDirectory||project.root)}"`,
  `"${quote(node)}" "${quote(launcher)}" start --project ${project.id}`,
  'if errorlevel 1 (','  echo 工作站未能打开。请确认续章程序仍在原安装位置，并保留项目资料。','  pause',')','endlocal',''].join('\r\n');
}
function createEntry(project,dataRoot,options){
 const file=entryPath(project),body=entryBody(project,dataRoot,options);
 // Repeated initialization repairs a missing entry, but never replaces a user's edited file.
 try{fs.writeFileSync(file,body,{flag:'wx'})}catch(e){if(e.code!=='EEXIST')throw e;if(fs.readFileSync(file,'utf8')!==body)throw Error('工作站入口已存在且内容不同，已保留原文件：'+file)}
 return file;
}
module.exports={entryPath,entryBody,createEntry};

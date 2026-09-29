'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const fail=message=>{throw Object.assign(Error(message),{status:400})};
function directory(value){
 if(typeof value!=='string'||!path.isAbsolute(value)||/[\x00-\x1f]/.test(value))fail('请填写当前创作项目文件夹的完整路径');
 const resolved=path.resolve(value);
 if(process.platform==='win32'&&(!/^[a-z]:\\/i.test(resolved)||resolved.slice(2).includes(':')))fail('请选择本机磁盘上的项目文件夹');
 if(!fs.existsSync(resolved)||!fs.statSync(resolved).isDirectory())fail('项目文件夹不存在，请先选择已有文件夹');
 const real=fs.realpathSync(resolved),library=path.join(real,'续章资料');
 if(fs.existsSync(library)){if(!fs.statSync(library).isDirectory())fail('“续章资料”已被同名文件占用');within(real,library)}
 fs.accessSync(real,fs.constants.W_OK);return real;
}
function confirmed(value,consent){
 if(consent!==true)fail('创建前请向用户展示资料保存位置并确认，再提交 storageConfirmed=true');
 return directory(value);
}
function within(root,file){const base=fs.realpathSync(root),fp=fs.realpathSync(file),rel=path.relative(base,fp);if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))fail('文件位置超出本项目资料库');return fp}
function openTarget(store,projectId,assetId,mode='reveal'){
 const m=store.projects().find(p=>p.id===projectId);if(!m?.root)fail('找不到项目资料库');
 if(!assetId)return {target:fs.realpathSync(m.root),folder:true};
 const a=store.assets(projectId).find(a=>a.id===assetId);if(!a)fail('找不到本项目的文件');
 const target=within(m.root,a.path);if(!fs.statSync(target).isFile())fail('原文件不存在');
 if(!['open','reveal'].includes(mode))fail('无效的打开方式');
 if(mode==='open'&&!/\.(pdf|docx|xlsx|pptx|txt|md|csv|png|jpe?g|gif|webp|bmp|mp3|mp4|wav)$/i.test(target))fail('此类型请在文件夹中查看后自行打开');
 return {target,folder:false,mode};
}
async function launchTarget(target,spawnProcess=spawn){
 if(process.platform!=='win32')fail('本机打开功能目前支持 Windows；其他系统可下载原文件');
 const args=target.folder||target.mode==='open'?[target.target]:['/select,',target.target];
 await new Promise((resolve,reject)=>{const child=spawnProcess('explorer.exe',args,{shell:false,windowsHide:true,detached:true,stdio:'ignore'});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve()})});
}
module.exports={directory,confirmed,within,openTarget,launchTarget};

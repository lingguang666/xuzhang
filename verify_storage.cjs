'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events');
const {openStore}=require('./store'),storage=require('./project-storage.cjs');
async function main(){
 const area=fs.mkdtempSync(path.join(os.tmpdir(),'xuzhang-storage-')),db=path.join(area,'database'),workspace=path.join(area,'论文工作文件夹');fs.mkdirSync(workspace);
 const {entryPath,entryBody,createEntry}=require('./project-entry.cjs');
 const store=openStore(db),input={format:'xuzhang-project-v1',项目名称:'保存位置验证',目标:'验证',内容:[{名称:'引言',草稿:'保留草稿'}]};
 try{
  assert.throws(()=>storage.confirmed(workspace,false),/确认/);assert.throws(()=>storage.confirmed('relative',true),/完整路径/);
  const one=store.createProject(input,'storage-create-one',false,storage.confirmed(workspace,true)).project;
  assert.equal(one.root,path.join(fs.realpathSync(workspace),'续章资料',one.id));assert.ok(fs.existsSync(path.join(one.root,'01_草稿/导入草稿.md')));
  const entry=entryPath(one),original=fs.readFileSync(entry,'utf8');assert.match(original,new RegExp('start --project '+one.id));assert.equal(path.dirname(entry),workspace);
  assert.equal(store.createProject(input,'storage-create-one',false,workspace).project.id,one.id);assert.equal(fs.readFileSync(entry,'utf8'),original);
  fs.unlinkSync(entry);store.createProject(input,'storage-create-one',false,workspace);assert.equal(fs.readFileSync(entry,'utf8'),original);
  fs.writeFileSync(entry,'user content');assert.throws(()=>createEntry(one,db),/保留原文件/);assert.equal(fs.readFileSync(entry,'utf8'),'user content');
  assert.ok(entryBody(one,path.join(area,'a%PATH% & b!')).includes('a%%PATH%% & b!'));
  assert.throws(()=>store.createProject(input,'storage-create-one',false,area),/其他内容/);
  const legacy=store.createProject({...input,项目名称:'旧默认'},'legacy-location').project;assert.equal(legacy.root,path.join(db,legacy.id));
  const file=path.join(one.root,'中文 & 测试.txt');fs.writeFileSync(file,'test');store.addAsset({id:'a-test',project:one.id,path:file});
  assert.equal(storage.openTarget(store,one.id).target,one.root);assert.equal(storage.openTarget(store,one.id,'a-test','open').target,file);
  assert.throws(()=>storage.openTarget(store,legacy.id,'a-test'),/本项目/);
  const outside=path.join(area,'outside.txt');fs.writeFileSync(outside,'outside');store.addAsset({id:'a-outside',project:one.id,path:outside});assert.throws(()=>storage.openTarget(store,one.id,'a-outside'),/超出/);
  const exe=path.join(one.root,'bad.exe');fs.writeFileSync(exe,'not executable');store.addAsset({id:'a-exe',project:one.id,path:exe});assert.throws(()=>storage.openTarget(store,one.id,'a-exe','open'),/此类型/);assert.equal(storage.openTarget(store,one.id,'a-exe','reveal').mode,'reveal');
  if(process.platform==='win32'){let captured;await storage.launchTarget(storage.openTarget(store,one.id,'a-test','reveal'),(command,args,options)=>{captured={command,args,options};const child=new EventEmitter();child.unref=()=>{};process.nextTick(()=>child.emit('spawn'));return child});assert.deepEqual(captured.args,['/select,',file]);assert.equal(captured.options.shell,false)}
  fs.unlinkSync(file);assert.throws(()=>storage.openTarget(store,one.id,'a-test'));
  console.log('PASS storage: confirmation, custom workspace, legacy path, retry identity, project ownership, path containment, safe native opener');
 }finally{store.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});

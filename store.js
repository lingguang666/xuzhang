'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const relations=require('./relations');
const paperPresets=require('./paper-presets');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const error=(message,status=400)=>Object.assign(new Error(message),{status});
function initialState(m){return {...(paperPresets.initial(m.input)?{paper:paperPresets.initial(m.input)}:{}),project:m,comments:[],overrides:{},colors:[],knowledge:[...(m.input.写作要求||[]).map((s,i)=>({id:'R'+i,kind:'写作原则',title:s,body:s,source:'初始化模板',anchor:'',status:'待核对'})),...(m.input.未决问题||[]).map((s,i)=>({id:'Q'+i,kind:'待讨论',title:s,body:s,source:'初始化模板',anchor:'',status:'待核对'}))],events:[],blueprint:{goal:m.input.目标,nodes:m.input.内容.map((n,i)=>({id:'I-'+i,part:n.名称,title:n.标题||n.名称,question:n.问题||'',claim:n.核心表达||'',evidence:n.依据||'',logic:n.推理||'',expression:n.表达方式||'',anchor:'import-'+i+'-0',comments:[]})),changes:[],drafts:{}}};}
function validateState(id,s){
 if(!/^(demo|p-[a-f0-9]{16})$/.test(id))throw error('无效项目标识');
 if(!s||!Array.isArray(s.comments)||!Array.isArray(s.colors)||!Array.isArray(s.knowledge)||!Array.isArray(s.events)||!s.overrides||!s.blueprint||!Array.isArray(s.blueprint.nodes)||!s.blueprint.nodes.length||typeof s.blueprint.goal!=='string')throw error('项目状态不完整');
 if(s.paper)paperPresets.validate(s.paper);
 if((s.project?.id||'demo')!==id)throw error('项目身份不一致');
 if(s.blueprint.nodes.some(n=>!n||typeof n.id!=='string'||typeof n.part!=='string'||typeof n.title!=='string'||!Array.isArray(n.comments)))throw error('章节记录不完整');
 if(new Set(s.blueprint.nodes.map(n=>n.id)).size!==s.blueprint.nodes.length)throw error('章节编号重复');
 if(!Array.isArray(s.blueprint.changes)||!s.blueprint.drafts)throw error('蓝图记录不完整');
 if(Buffer.byteLength(JSON.stringify(s))>15*1024*1024)throw error('项目状态超过15MB',413);
}
function openStore(root,{sourceFile}={}){
 fs.mkdirSync(root,{recursive:true});
 const dbPath=path.join(root,'续章.sqlite'), db=new DatabaseSync(dbPath,{timeout:5000});
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,manifest TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS states(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL,origin TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS revisions(project_id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(project_id,revision));
 CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,digest TEXT NOT NULL,result TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,body TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS migrations(id TEXT PRIMARY KEY,body TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,body TEXT NOT NULL);
 PRAGMA user_version=1;`);
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}};
 const get=id=>{const r=db.prepare('SELECT * FROM states WHERE id=?').get(id);return r?{id:r.id,revision:r.revision,state:JSON.parse(r.body),updatedAt:r.updated_at}:null};
 const put=(id,s,revision,origin)=>{const body=JSON.stringify(s),time=new Date().toISOString();db.prepare('INSERT INTO states VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body,updated_at=excluded.updated_at,origin=excluded.origin').run(id,revision,body,time,origin);db.prepare('INSERT INTO revisions VALUES(?,?,?,?)').run(id,revision,body,time);return {id,revision,updatedAt:time}};
 function addProject(m){return tx(()=>{db.prepare('INSERT OR IGNORE INTO projects VALUES(?,?)').run(m.id,JSON.stringify(m));if(!get(m.id))put(m.id,initialState(m),1,'initial');return get(m.id).revision})}
 function addAsset(a){db.prepare('INSERT OR IGNORE INTO assets VALUES(?,?,?)').run(a.id,a.project,JSON.stringify(a))}
 // Import legacy files once; original files remain untouched.
 if(!db.prepare('SELECT id FROM migrations WHERE id=?').get('filesystem-v1')){
  const report={projects:0,assets:0,errors:[]};
  tx(()=>{for(const name of fs.readdirSync(root).filter(n=>/^p-[a-f0-9]{16}$/.test(n))){
   try{const dir=path.join(root,name),m=JSON.parse(fs.readFileSync(path.join(dir,'00_项目','项目.json'),'utf8'));if(m.id!==name)throw Error('项目身份不一致');m.root=dir;db.prepare('INSERT OR IGNORE INTO projects VALUES(?,?)').run(name,JSON.stringify(m));if(!get(name))put(name,initialState(m),1,'initial');report.projects++;
    for(const cat of ['02_参考资料','03_数据','04_图片','05_音视频','06_其他']){const folder=path.join(dir,cat);if(!fs.existsSync(folder))continue;for(const aid of fs.readdirSync(folder).filter(n=>/^a-[a-f0-9]{16}$/.test(n))){try{const a=JSON.parse(fs.readFileSync(path.join(folder,aid,'_资产记录.json'),'utf8'));if(a.project!==name||a.id!==aid)throw Error('素材身份不一致');addAsset(a);report.assets++}catch(e){report.errors.push(name+'/'+aid+': '+e.message)}}}
   }catch(e){report.errors.push(name+': '+e.message)}
  }db.prepare('INSERT INTO migrations VALUES(?,?,?)').run('filesystem-v1',JSON.stringify(report),new Date().toISOString());});
  fs.writeFileSync(path.join(root,'文件迁移核查.json'),JSON.stringify(report,null,2));
 }
 if(sourceFile&&fs.existsSync(sourceFile)){const body=fs.readFileSync(sourceFile,'utf8'),p=JSON.parse(body);db.prepare('INSERT OR IGNORE INTO sources VALUES(?,?)').run(p.sha256,body)}
 function migrate(b){
  if(!b||typeof b.client!=='string'||!/^browser-[a-zA-Z0-9-]{8,80}$/.test(b.client)||!b.catalog||typeof b.catalog!=='object'||Array.isArray(b.catalog))throw error('迁移内容无效');
  for(const [id,s]of Object.entries(b.catalog))validateState(id,s);
  const migrationId='browser:'+b.client+':'+hash(JSON.stringify(b.catalog));
  const prior=db.prepare('SELECT body FROM migrations WHERE id=?').get(migrationId);if(prior)return JSON.parse(prior.body);
  const folder=path.join(root,'迁移备份');fs.mkdirSync(folder,{recursive:true});const backup=path.join(folder,hash(migrationId)+'.json');if(!fs.existsSync(backup))fs.writeFileSync(backup,JSON.stringify(b,null,2),{flag:'wx'});
  return tx(()=>{const result={backup,imported:[],preserved:[],recovered:[]};for(const [id,raw]of Object.entries(b.catalog)){const s=structuredClone(raw);const old=db.prepare('SELECT origin FROM states WHERE id=?').get(id);if(!old||old.origin==='initial'){
   if(s.project&&!db.prepare('SELECT id FROM projects WHERE id=?').get(id)){
    const m=s.project;if(!m.input||!Array.isArray(m.input.内容)||!m.input.内容.length)throw error('浏览器项目缺少初始化来源，备份已保留');
    m.legacyRoot=m.root;m.root=path.join(root,id);m.recoveredFromBrowser=true;
    for(const d of ['00_项目','01_草稿','02_参考资料','03_数据','04_图片','05_音视频','06_其他'])fs.mkdirSync(path.join(m.root,d),{recursive:true});
    const file=path.join(m.root,'00_项目','项目.json');if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(m,null,2),{flag:'wx'});
    const draft=path.join(m.root,'01_草稿','导入草稿.md');if(!fs.existsSync(draft))fs.writeFileSync(draft,m.input.内容.map(n=>'# '+n.名称+'\n\n'+(n.草稿||'')).join('\n\n'),{flag:'wx'});
    db.prepare('INSERT INTO projects VALUES(?,?)').run(id,JSON.stringify(m));result.recovered.push(id);
   }
   put(id,s,(get(id)?.revision||0)+1,'browser');result.imported.push(id);
  }else if(JSON.stringify(get(id).state)!==JSON.stringify(s)){result.preserved.push(id)}}db.prepare('INSERT INTO migrations VALUES(?,?,?)').run(migrationId,JSON.stringify(result),new Date().toISOString());return result});
 }
 function save(b){
  if(!b||typeof b.requestId!=='string'||b.requestId.length>150||!Number.isSafeInteger(b.baseRevision)||b.baseRevision<0)throw error('保存请求无效');validateState(b.id,b.state);
  const digest=hash(JSON.stringify(b));return tx(()=>{const prior=db.prepare('SELECT * FROM requests WHERE id=?').get(b.requestId);if(prior){if(prior.digest!==digest)throw error('请求编号已用于其他内容',409);return JSON.parse(prior.result)}const old=get(b.id);if(!old)throw error('项目尚未迁移',404);if(old.revision!==b.baseRevision)throw error('数据库中已有更新版本。本次修改保留在此浏览器，请先核对。',409);
   if(JSON.stringify(old.state.project)!==JSON.stringify(b.state.project))throw error('不能通过状态保存修改初始化来源');
   const state=structuredClone(b.state);
   if(JSON.stringify(state.claimLinks||{})!==JSON.stringify(old.state.claimLinks||{})||JSON.stringify(state.discussionReviews||[])!==JSON.stringify(old.state.discussionReviews||[]))throw error('主张关联与验收请通过专用操作保存');
   if(JSON.stringify(state.discussions||[])!==JSON.stringify(old.state.discussions||[]))throw error('讨论成果通过统一提交保存，不能覆盖已有记录');
   for(const k of old.state.knowledge.filter(k=>k.lifecycle)){if(JSON.stringify(state.knowledge.find(n=>n.id===k.id))!==JSON.stringify(k))throw error('决定请通过决定管理操作，保留替代链');}
   if(JSON.stringify(state.evidence||[])!==JSON.stringify(old.state.evidence||[]))throw error('证据请通过证据定位操作更新');
   state.impacts=structuredClone(old.state.impacts||[]);
   relations.reconcile(old.state,state,old.revision+1,relations.sourceFor({db},state));
   const r={...put(b.id,state,old.revision+1,'edit'),impacts:state.impacts};db.prepare('INSERT INTO requests VALUES(?,?,?)').run(b.requestId,digest,JSON.stringify(r));return r;});
 }
 function mutate(id,baseRevision,requestId,input,change){
  const digest=hash(JSON.stringify({id,baseRevision,input})),key='mcp:'+requestId;
  return tx(()=>{const prior=db.prepare('SELECT * FROM requests WHERE id=?').get(key);if(prior){if(prior.digest!==digest)throw error('请求编号已用于其他操作',409);return JSON.parse(prior.result)}
   const old=get(id);if(!old)throw error('找不到项目',404);if(old.revision!==baseRevision)throw error('版本冲突，请重新读取当前项目并核对后再提交',409);
   const state=structuredClone(old.state);change(state);validateState(id,state);if(JSON.stringify(old.state.project)!==JSON.stringify(state.project))throw error('不能修改初始化来源');
   relations.reconcile(old.state,state,old.revision+1,relations.sourceFor({db},state));
   const result=put(id,state,old.revision+1,'mcp');db.prepare('INSERT INTO requests VALUES(?,?,?)').run(key,digest,JSON.stringify(result));return result;
  });
 }
 return {db,dbPath,get,migrate,save,mutate,addProject,addAsset,list:()=>db.prepare('SELECT id FROM states').all().map(r=>get(r.id)),projects:()=>db.prepare('SELECT manifest FROM projects').all().map(r=>JSON.parse(r.manifest)),assets:pid=>db.prepare('SELECT body FROM assets WHERE project_id=?').all(pid).map(r=>JSON.parse(r.body)),backup:()=>{const dir=path.join(root,'数据库备份');fs.mkdirSync(dir,{recursive:true});const target=path.join(dir,'续章-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex')+'.sqlite');db.exec("VACUUM INTO '"+target.replace(/'/g,"''")+"'");return {path:target}},close:()=>db.close()};
}
module.exports={openStore,validateState,initialState};

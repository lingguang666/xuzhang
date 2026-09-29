const http=require('node:http'),fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const PORT=Number(process.env.PORT||4318), ROOT=require('./runtime.cjs').dataRoot;
const store=require('./store').openStore(ROOT,{sourceFile:path.join(__dirname,'manuscript.json')});
const relations=require('./relations');
const assetSearch=require('./asset-search').createSearch(store);
const claims=require('./claims'),discussionReview=require('./discussion-review');
const paperPresets=require('./paper-presets');
const categories={'参考资料':'02_参考资料','数据':'03_数据','图片':'04_图片','音视频':'05_音视频','其他':'06_其他'};
const staticFiles={'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8']};
function fail(msg,status=400){throw Object.assign(new Error(msg),{status})}
function id(v){if(typeof v!=='string'||!/^p-[a-f0-9]{16}$/.test(v))fail('无效项目标识');return v}
function safeName(v){if(typeof v!=='string'||!v.trim()||v.length>160||/[<>:"/\\|?*\x00-\x1f]/.test(v)||/[. ]$/.test(v)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(v))fail('文件名包含不支持的字符');return v}
const {validateProject}=require('./project-input');
async function body(req){let chunks=[],length=0;for await(const c of req){length+=c.length;if(length>30*1024*1024)fail('单次请求过大，单文件上限20MB',413);chunks.push(c)}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{fail('无法读取JSON内容')}}
async function manifest(pid){const m=store.projects().find(p=>p.id===id(pid));if(!m?.root)fail('项目资料库不存在',404);return m}
const storage=require('./project-storage.cjs');
function reply(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))}
let stopping=false;
const server=http.createServer(async(req,res)=>{try{
 if(stopping){res.setHeader('Connection','close');fail('工作站正在停止，请稍后重新打开',503)}
 const host=req.headers.host;if(!['127.0.0.1:'+PORT,'localhost:'+PORT].includes(host))fail('不支持的访问地址',403);
 const u=new URL(req.url,'http://'+host),route=u.pathname;
 if(req.method==='GET'&&route==='/api/health')return reply(res,200,{app:'xuzhang',version:require('./package.json').version,instance:require('./runtime.cjs').instance});
 if(req.method==='POST'&&route==='/api/runtime/stop'){if(!process.env.XUZHANG_STOP_TOKEN||req.headers.authorization!=='Bearer '+process.env.XUZHANG_STOP_TOKEN)fail('无效停止请求',403);stopping=true;res.setHeader('Connection','close');reply(res,200,{stopped:true});server.close(()=>{store.db.close();process.exit(0)});server.closeIdleConnections();return}
 if(req.method==='POST'){if(req.headers.origin!=='http://'+host||!req.headers['content-type']?.startsWith('application/json')||req.headers['x-xuzhang-client']!=='local-ui')fail('请从本机工作台提交',403)}
 if(req.method==='GET'&&route==='/api/claims'){const project=u.searchParams.get('project'),r=store.get(project);if(!r)fail('项目不存在',404);return reply(res,200,{revision:r.revision,claims:claims.inspect(r.state,relations.sourceFor(store,r.state),store.assets(r.state.assetsProject||project))})}
 if(req.method==='POST'&&route==='/api/claims'){const a=await body(req);if(!Number.isInteger(a.baseRevision)||typeof a.requestId!=='string')fail('请求无效');const result=store.mutate(a.projectId,a.baseRevision,a.requestId,{tool:'web-claims',...a},s=>claims.update(s,a,relations.sourceFor(store,s),'用户'));return reply(res,200,{...result,project:store.get(a.projectId)})}
 if(req.method==='GET'&&route==='/api/discussion-review')return reply(res,200,discussionReview.info(store,u.searchParams.get('project'),u.searchParams.get('id')));
 if(req.method==='POST'&&route==='/api/discussion-review'){const a=await body(req);if(!Number.isInteger(a.baseRevision)||typeof a.requestId!=='string')fail('请求无效');const result=discussionReview.perform(store,a);return reply(res,200,{...result,project:store.get(a.projectId)})}
 if(req.method==='GET'&&route==='/api/asset-index')return reply(res,200,assetSearch.list(u.searchParams.get('project')));
 if(req.method==='POST'&&route==='/api/asset-index'){const b=await body(req);return reply(res,200,await assetSearch.index(b.project,b.assetId))}
 if(req.method==='GET'&&route==='/api/asset-search')return reply(res,200,assetSearch.search(u.searchParams.get('project'),u.searchParams.get('q')));
 if(req.method==='GET'&&route==='/api/asset-text')return reply(res,200,assetSearch.read(u.searchParams.get('project'),Number(u.searchParams.get('chunkId'))));
 if(req.method==='GET'&&route==='/api/asset-pdf'){const a=assetSearch.asset(u.searchParams.get('project'),u.searchParams.get('assetId'));if(path.extname(a.name).toLowerCase()!=='.pdf')fail('此文件不是PDF');const fp=assetSearch.check(a);res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'inline','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});fs.createReadStream(fp).pipe(res);return}
 if(req.method==='GET'&&route==='/api/version-history'){const h=require('./version-history'),project=u.searchParams.get('project'),revision=u.searchParams.get('revision');return reply(res,200,revision!==null?h.detail(store,project,revision==='latest'?undefined:revision,u.searchParams.has('from')?u.searchParams.get('from'):undefined):h.list(store,project,u.searchParams.has('before')?u.searchParams.get('before'):undefined))}
 if(req.method==='GET'&&route==='/api/versions')return reply(res,200,{projects:store.db.prepare('SELECT id,revision FROM states').all()});
 if(req.method==='GET'&&route==='/api/state')return reply(res,200,{projects:store.list(),database:store.dbPath});
 if(req.method==='GET'&&route==='/api/connection'){
  let configured=false;try{configured=JSON.parse(await fsp.readFile(path.join(__dirname,'codex-connection.json'),'utf8')).configured===true}catch{}
  const exists=store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mcp_connections'").get();
  const clients=exists?store.db.prepare('SELECT client,seen,last_tool FROM mcp_connections WHERE seen>?').all(new Date(Date.now()-90000).toISOString()):[];
  const hasSelection=store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mcp_project_selection'").get();
  const active=exists?store.db.prepare('SELECT id,client,seen FROM mcp_connections WHERE seen>?').all(new Date(Date.now()-90000).toISOString()):[];
  for(const c of active){const selection=hasSelection?store.db.prepare('SELECT project_id FROM mcp_project_selection WHERE connection_id=?').get(c.id):null;c.projectId=selection?.project_id||null;const p=c.projectId?store.get(c.projectId):null;c.projectName=p?(p.state.project?.name||'续章入门示例'):null;}
  return reply(res,200,{configured,clients:active});
 }
 if(req.method==='POST'&&route==='/api/migrate')return reply(res,200,store.migrate(await body(req)));
 if(req.method==='POST'&&route==='/api/state')return reply(res,200,store.save(await body(req)));
 if(req.method==='POST'&&route==='/api/relations'){
  const a=await body(req);if(!Number.isSafeInteger(a.baseRevision)||typeof a.requestId!=='string'||a.requestId.length<8)fail('请求无效');
  const result=store.mutate(a.projectId,a.baseRevision,a.requestId,{tool:'web-relations',...a},s=>relations.perform(s,a,{source:relations.sourceFor(store,s),assets:store.assets(s.assetsProject||a.projectId),actor:'用户',assetSearch,projectId:a.projectId}));
  return reply(res,200,{...result,project:store.get(a.projectId)});
 }
 if(req.method==='POST'&&route==='/api/backup')return reply(res,201,store.backup());
 if(req.method==='POST'&&route==='/api/projects'){
 const raw=await body(req),input=validateProject(raw);delete input.requestId;delete input.allowSameName;delete input.projectDirectory;delete input.storageConfirmed;const projectDirectory=storage.confirmed(raw.projectDirectory,raw.storageConfirmed);const result=store.createProject(input,raw.requestId||crypto.randomUUID(),raw.allowSameName===true,projectDirectory);return reply(res,result.replayed?200:201,{...result.project,workstationEntry:result.workstationEntry,revision:result.revision});
 }
 if(req.method==='GET'&&route==='/api/storage-defaults')return reply(res,200,{projectDirectory:process.env.XUZHANG_PROJECT_DIRECTORY||process.cwd(),database:store.dbPath,note:'浏览器无法识别 Codex 工作目录，请核对或粘贴当前创作项目文件夹。'});
 if(req.method==='POST'&&route==='/api/open-local'){const b=await body(req);const target=storage.openTarget(store,b.project,b.assetId,b.mode);await storage.launchTarget(target);return reply(res,200,{opened:true,path:target.target})}
 if(req.method==='GET'&&route==='/api/projects')return reply(res,200,store.projects());
 if(req.method==='POST'&&route==='/api/assets'){
 const b=await body(req),m=await manifest(b.project),category=categories[b.category];if(!category)fail('请选择文件类别');safeName(b.name);if(typeof b.data!=='string'||!b.data.length||b.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.data))fail('文件内容无效');const buffer=Buffer.from(b.data,'base64');if(buffer.length>20*1024*1024)fail('单文件上限20MB',413);const aid='a-'+crypto.randomBytes(8).toString('hex'),folder=path.join(m.root,category,aid);await fsp.mkdir(folder,{recursive:true});await fsp.mkdir(path.join(folder,'原文件'));const file=path.join(folder,'原文件',b.name);await fsp.writeFile(file,buffer,{flag:'wx'});const a={id:aid,project:m.id,name:b.name,category:b.category,size:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),path:file,part:typeof b.part==='string'?b.part.slice(0,180):'',note:typeof b.note==='string'?b.note.slice(0,2000):'',createdAt:new Date().toISOString()};await fsp.writeFile(path.join(folder,'_资产记录.json'),JSON.stringify(a,null,2),{flag:'wx'});store.addAsset(a);const textIndex=await assetSearch.index(m.id,a.id);return reply(res,201,{...a,textIndex});
 }
 if(req.method==='GET'&&route==='/api/assets'){const pid=id(u.searchParams.get('project'));await manifest(pid);return reply(res,200,store.assets(pid))}
 if(req.method==='GET'&&route==='/api/file'){const m=await manifest(u.searchParams.get('project')),aid=u.searchParams.get('id');if(!/^a-[a-f0-9]{16}$/.test(aid||''))fail('无效资产');for(const cat of Object.values(categories)){try{const meta=JSON.parse(await fsp.readFile(path.join(m.root,cat,aid,'_资产记录.json'),'utf8'));const fp=path.join(m.root,cat,aid,'原文件',safeName(meta.name));res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(meta.name),'X-Content-Type-Options':'nosniff'});fs.createReadStream(fp).pipe(res);return}catch(e){if(e.code!=='ENOENT')throw e}}fail('文件不存在',404)}
 if(!['GET','HEAD'].includes(req.method))fail('不支持的操作',405);const item=staticFiles[route];if(!item)fail('页面不存在',404);let data=await fsp.readFile(path.join(__dirname,item[0]));if(item[0]==='app.js')data=Buffer.from(data.toString('utf8').replaceAll('__INSTANCE__',require('./runtime.cjs').instance));res.writeHead(200,{'Content-Type':item[1],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);
}catch(e){reply(res,e.status||(e.code==='ENOENT'?404:500),{error:(e.status||req.url.startsWith('/api/asset-')||req.url.startsWith('/api/claims')||req.url.startsWith('/api/discussion-review'))?e.message:e.code==='ENOENT'?'项目或文件不存在':'保存未完成，请检查本地服务'})}});
server.on('error',e=>{console.error(e.message);process.exitCode=1});server.listen(PORT,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+PORT));

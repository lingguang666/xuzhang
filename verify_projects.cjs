'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
const {openStore}=require('./store');
async function main(){
 const root=fs.mkdtempSync(path.join(__dirname,'验证数据/projects-')),clients=[];
 async function connect(){const c=new Client({name:'project-isolation-test',version:'1'});await c.connect(new StdioClientTransport({command:process.execPath,args:[path.join(process.env.XUZHANG_TEST_APP||__dirname,'mcp-server.js')],env:{...process.env,XUZHANG_DATA_ROOT:root},stderr:'pipe'}));clients.push(c);return async(name,args={})=>{const r=await c.callTool({name,arguments:args});return {...JSON.parse(r.content[0].text),error:!!r.isError}}}
 const store=openStore(root);
 try{
  const a=await connect(),b=await connect();assert.equal((await a('get_current_project')).projectId,null);assert.equal((await b('get_current_project')).projectId,null);
  const storage={projectDirectory:root,storageConfirmed:true};
  assert.equal((await a('create_project',{requestId:'unconfirmed-new',name:'未确认'})).error,true);assert.equal(store.list().length,0);
  const input={...storage,requestId:'create-paper-one',name:'论文甲',sections:[{name:'引言',claim:'甲的主张',draft:'甲的草稿'}],paperContext:{claim:'甲的全篇主张'}};
  const one=await a('create_project',input);assert.equal(one.error,false);assert.equal(one.selected,true);
  assert.equal((await b('get_current_project')).projectId,null);
  const two=await b('create_project',{...storage,requestId:'create-paper-two',name:'论文乙',templateId:'paper-review'});assert.equal(two.error,false);assert.notEqual(one.projectId,two.projectId);
  assert.equal((await a('get_current_project')).projectId,one.projectId);
  const ar=await a('read_project',{projectId:one.projectId}),br=await b('read_project',{projectId:two.projectId});assert.equal(ar.nodes[0].claim,'甲的主张');assert.equal(br.paperContext.settings.claim,'');assert.equal(br.pendingComments.length,0);assert.equal(br.evidence.length,0);
  const snap=JSON.stringify(store.list());
  for(const call of [a,b]){const wrong=call===a?two:one;assert.equal((await call('update_blueprint',{projectId:wrong.projectId,baseRevision:1,requestId:'wrong-target-write',nodeId:'I-0',patch:{claim:'禁止串写'},reason:'隔离验证'})).error,true);assert.equal((await call('read_text',{projectId:wrong.projectId})).error,true);assert.equal((await call('index_asset',{projectId:wrong.projectId,assetId:'not-mine'})).error,true)}
  assert.equal(JSON.stringify(store.list()),snap);
  const changed=await a('update_blueprint',{projectId:one.projectId,baseRevision:1,requestId:'change-paper-one',nodeId:'I-0',patch:{claim:'甲的新主张'},reason:'隔离验证'});assert.equal(changed.error,false);assert.equal(changed.name,'论文甲');assert.equal(store.get(two.projectId).revision,1);
  const retry=await a('create_project',input);assert.equal(retry.projectId,one.projectId);assert.equal(retry.replayed,true);assert.equal(store.get(one.projectId).state.blueprint.nodes[0].claim,'甲的新主张');assert.equal(store.list().length,2);
  assert.equal((await a('create_project',{...input,name:'改名'})).error,true);
  assert.equal((await b('create_project',{...input,requestId:'same-name-another'})).error,true);assert.equal((await b('get_current_project')).projectId,two.projectId);
  const duplicate=await b('create_project',{...input,requestId:'explicit-duplicate',allowSameName:true,selectCreated:false});assert.equal(duplicate.error,false);assert.notEqual(duplicate.projectId,one.projectId);assert.equal((await b('get_current_project')).projectId,two.projectId);
  // Replaying an earlier creation cannot silently switch an already bound connection.
  const replayOther=await b('create_project',input);assert.equal(replayOther.projectId,one.projectId);assert.equal(replayOther.selectedProjectId,two.projectId);
  const race={...storage,requestId:'concurrent-create',name:'并发项目',selectCreated:false};const [x,y]=await Promise.all([a('create_project',race),b('create_project',race)]);assert.equal(x.error,false);assert.equal(y.error,false);assert.equal(x.projectId,y.projectId);assert.equal(store.list().length,4);
  // A new connection starts unbound; retry after reconnect resolves the same persisted creation.
  const c=await connect();assert.equal((await c('get_current_project')).projectId,null);assert.equal((await c('create_project',input)).projectId,one.projectId);
  for(const r of store.list()){const m=r.state.project;assert.equal(m.root,path.join(root,'续章资料',r.id));assert.ok(fs.existsSync(path.join(m.root,'00_项目/项目.json')));assert.ok(fs.existsSync(path.join(m.root,'01_草稿/导入草稿.md')))}
  assert.equal(store.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  console.log('PASS: MCP creation, templates/drafts, isolated connections, cross-project read/write/index guards, same-name confirmation, retry/reconnect/concurrent idempotency, no silent rebind, independent folders');
 }finally{for(const c of clients)await c.close();store.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});

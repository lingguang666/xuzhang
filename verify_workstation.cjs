'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
async function main(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xuzhang-open-')),app=process.env.XUZHANG_TEST_APP||__dirname,store=require('./store').openStore(root),id='p-1122334455667788',other='p-8877665544332211';
 for(const pid of [id,other])store.addProject({id:pid,name:pid,input:{项目名称:pid,目标:'测试',内容:[{名称:'引言'}]}});store.close();
 const client=new Client({name:'workstation-test',version:'1'});let live;
 const call=async(name,args)=>{const r=await client.callTool({name,arguments:args});return {...JSON.parse(r.content[0].text),failed:!!r.isError}};
 const stop=async()=>{const s=JSON.parse(fs.readFileSync(path.join(root,'runtime.json')));const response=await fetch('http://127.0.0.1:'+s.port+'/api/runtime/stop',{method:'POST',headers:{Authorization:'Bearer '+s.token},signal:AbortSignal.timeout(3000)});assert.equal(response.status,200,await response.clone().text());await response.json();for(let n=0;n<100;n++){try{const health=await(await fetch('http://127.0.0.1:'+s.port+'/api/health',{signal:AbortSignal.timeout(500)})).json();if(health.instance!==s.instance)return}catch{return}await new Promise(r=>setTimeout(r,50))}throw Error('Test service did not stop')};
 try{
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(app,'mcp-server.js')],env:{...process.env,XUZHANG_DATA_ROOT:root},stderr:'pipe'}));
  assert.equal((await call('open_workstation',{projectId:id})).failed,true);
  await call('select_project',{projectId:id});assert.equal((await call('open_workstation',{projectId:other})).failed,true);
  live=await call('open_workstation',{projectId:id});assert.equal(live.failed,false,JSON.stringify(live));assert.equal(live.available,true);assert.equal(new URL(live.url).searchParams.get('project'),id);
  const before=JSON.parse(fs.readFileSync(path.join(root,'runtime.json')));assert.equal((await call('open_workstation',{projectId:id})).url,live.url);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'runtime.json'))).pid,before.pid);
  await stop();live=null;
  live=await call('open_workstation',{projectId:id});assert.equal(live.failed,false);assert.notEqual(JSON.parse(fs.readFileSync(path.join(root,'runtime.json'))).pid,before.pid);
  await client.close();assert.equal((await(await fetch(new URL('/api/health',live.url))).json()).app,'xuzhang');
  console.log('PASS workstation: selected project guard, start, health, reuse, recovery after stop, service survives MCP client close');
 }finally{await client.close();if(live)await stop()}
}
main().catch(e=>{console.error(e);process.exitCode=1});

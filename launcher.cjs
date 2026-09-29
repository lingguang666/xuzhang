'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {dataRoot,instance}=require('./runtime.cjs');
const stateFile=path.join(dataRoot,'runtime.json');
const mode=process.argv[2]||'start';
const projectId=process.argv[3]==='--project'?process.argv[4]:null;
function browserUrl(port){return 'http://127.0.0.1:'+port+'/'+(projectId?'?project='+encodeURIComponent(projectId):'')}
function validateTarget(){if(process.argv.length>3&&(!projectId||process.argv.length!==5||mode!=='start'))throw Error('Invalid launch arguments');if(!projectId)return;if(!/^p-[a-f0-9]{16}$/.test(projectId))throw Error('Invalid project ID');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(path.join(dataRoot,'续章.sqlite'),{readOnly:true});try{if(!db.prepare('SELECT id FROM projects WHERE id=?').get(projectId))throw Error('找不到入口指定的项目，请核对数据库位置。')}finally{db.close()}}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function health(port){try{const r=await fetch('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(800)});const h=await r.json();return h.app==='xuzhang'&&h.instance===instance}catch{return false}}
async function current(){let s;try{s=JSON.parse(fs.readFileSync(stateFile,'utf8'))}catch{}if(s&&Number.isInteger(s.port)&&s.port>=1024&&s.port<=65535&&s.instance===instance&&await health(s.port))return s;return await health(4318)?{port:4318,instance,manual:true}:null}
function openBrowser(port){if(process.env.XUZHANG_NO_BROWSER==='1')return;const url=browserUrl(port);if(process.platform==='win32')spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{detached:true,stdio:'ignore',windowsHide:true}).unref();else spawn(process.platform==='darwin'?'open':'xdg-open',[url],{detached:true,stdio:'ignore'}).unref()}
async function freePort(){for(let p=4318;p<4350;p++){if(await new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.listen(p,'127.0.0.1',()=>s.close(()=>resolve(true)))}))return p}throw Error('No available local port in 4318-4349')}
function writeConfig(){const slash=s=>s.replace(/\\/g,'/');const config='[mcp_servers.xuzhang]\ncommand = '+JSON.stringify(slash(process.execPath))+'\nargs = ['+JSON.stringify(slash(path.join(__dirname,'mcp-server.js')))+']\n\n[mcp_servers.xuzhang.env]\nXUZHANG_DATA_ROOT = '+JSON.stringify(slash(dataRoot))+'\n';const file=path.join(dataRoot,'codex-mcp.toml');fs.writeFileSync(file,config);console.log(file)}
async function main(){validateTarget();fs.mkdirSync(dataRoot,{recursive:true});
 if(mode==='config'){writeConfig();return}
 if(mode==='data'){console.log(dataRoot);if(process.platform==='win32'&&process.env.XUZHANG_NO_BROWSER!=='1')spawn('explorer.exe',[dataRoot],{stdio:'ignore',detached:true,windowsHide:true}).unref();return}
 const running=await current();
 if(mode==='stop'){if(!running){console.log('Xuzhang is not running.');return}if(running.manual)throw Error('此服务由终端启动，请在原终端停止服务。');const r=await fetch('http://127.0.0.1:'+running.port+'/api/runtime/stop',{method:'POST',headers:{Authorization:'Bearer '+running.token},signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Stop rejected');for(let i=0;i<30;i++){if(!await current()){console.log('Stopped. Data is preserved.');return}await delay(100)}throw Error('Service is still stopping')}
 if(mode!=='start')throw Error('Unknown launcher command');
 if(running){openBrowser(running.port);console.log(browserUrl(running.port));return}
 // O_EXCL prevents two double clicks from starting two writers with different ports.
 const lock=path.join(dataRoot,'launch.lock');let fd;
 try{fd=fs.openSync(lock,'wx')}catch(e){if(e.code!=='EEXIST')throw e;for(let i=0;i<50;i++){const r=await current();if(r){openBrowser(r.port);console.log(browserUrl(r.port));return}await delay(100)}throw Error('Another launch is pending. If it crashed, remove launch.lock in the data folder and retry.')}
 try{
  const port=await freePort(),token=crypto.randomBytes(32).toString('hex'),log=fs.openSync(path.join(dataRoot,'service.log'),'a');
  const child=spawn(process.execPath,[path.join(__dirname,'server.js')],{cwd:__dirname,env:{...process.env,PORT:String(port),XUZHANG_DATA_ROOT:dataRoot,XUZHANG_STOP_TOKEN:token},detached:true,windowsHide:true,stdio:['ignore',log,log]});
  let spawnError=null;child.on('error',e=>{spawnError=e});child.unref();fs.closeSync(log);
  fs.writeFileSync(stateFile,JSON.stringify({port,token,instance,pid:child.pid}));
  for(let i=0;i<100;i++){if(spawnError)throw spawnError;if(await current()){writeConfig();openBrowser(port);console.log(browserUrl(port));return}await delay(100)}
  throw Error('Startup failed. See service.log in '+dataRoot);
 }finally{fs.closeSync(fd);fs.unlinkSync(lock)}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});

'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const repo=path.join(__dirname,'..'),app=process.env.XUZHANG_TEST_APP||repo,node=process.env.XUZHANG_TEST_NODE||process.execPath;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'xuzhang-dist-')),env={...process.env,XUZHANG_DATA_ROOT:root,XUZHANG_NO_BROWSER:'1'};
const run=mode=>{const r=spawnSync(node,[path.join(app,'launcher.cjs'),mode],{env,encoding:'utf8',timeout:30000,windowsHide:true});assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout};
(async()=>{try{
run('start');const before=JSON.parse(fs.readFileSync(path.join(root,'runtime.json')));run('start');assert.equal(JSON.parse(fs.readFileSync(path.join(root,'runtime.json'))).pid,before.pid);
const base='http://127.0.0.1:'+before.port,post=async(route,data)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'X-Xuzhang-Client':'local-ui'},body:JSON.stringify(data)});assert.ok(r.ok,await r.clone().text());return r.json()};
assert.equal((await fetch(base+'/api/runtime/stop',{method:'POST'})).status,403);
const defaults=await(await fetch(base+'/api/storage-defaults')).json();assert.equal(defaults.database,path.join(root,'续章.sqlite'));
const denied=await fetch(base+'/api/projects',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'X-Xuzhang-Client':'local-ui'},body:JSON.stringify({format:'xuzhang-project-v1',项目名称:'未确认',目标:'',内容:[{名称:'引言'}]})});assert.equal(denied.status,400);
assert.equal((await fetch(base+'/api/open-local',{method:'POST'})).status,403);
const m=await post('/api/projects',{projectDirectory:root,storageConfirmed:true,format:'xuzhang-project-v1',项目名称:'发行版隔离测试',目标:'验证完整数据保存',内容:[{名称:'引言',草稿:'这是一段通用测试文字。'}]});
const asset=await post('/api/assets',{project:m.id,category:'参考资料',name:'notes.md',data:Buffer.from('通用素材检索测试：取样间隔 30 秒。').toString('base64')});assert.equal(asset.textIndex.status,'ready');assert.ok(asset.path.startsWith(path.join(root,'续章资料',m.id)));const download=await fetch(base+'/api/file?project='+m.id+'&id='+asset.id);assert.equal(download.status,200);assert.match(await download.text(),/取样间隔/);
const hits=await(await fetch(base+'/api/asset-search?project='+m.id+'&q='+encodeURIComponent('取样间隔'))).json();assert.ok(hits.results.length);
// Exercise the packaged Python standard library and pypdf, without any system installation.
const py=process.env.XUZHANG_TEST_APP?path.join(app,'runtime/python/python.exe'):require('../runtime.cjs').python;
const doc=spawnSync(py,['-c',"import io,zipfile,base64; b=io.BytesIO(); z=zipfile.ZipFile(b,'w'); z.writestr('word/document.xml','<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>Portable Word evidence</w:t></w:r></w:p></w:body></w:document>'); z.close(); print(base64.b64encode(b.getvalue()).decode())"],{encoding:'utf8',windowsHide:true});assert.equal(doc.status,0,doc.stderr);
const word=await post('/api/assets',{project:m.id,category:'参考资料',name:'test.docx',data:doc.stdout.trim()});assert.equal(word.textIndex.status,'ready',JSON.stringify(word.textIndex));
const content='BT /F1 12 Tf 30 700 Td (Portable PDF evidence) Tj ET';
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream'];
let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+o+'\nendobj\n'});const xref=Buffer.byteLength(pdf);pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
const pa=await post('/api/assets',{project:m.id,category:'参考资料',name:'test.pdf',data:Buffer.from(pdf).toString('base64')});assert.equal(pa.textIndex.status,'ready',JSON.stringify(pa.textIndex));
const located=await(await fetch(base+'/api/asset-search?project='+m.id+'&q=Portable')).json();assert.equal(located.results.length,2);
// Execute the generated Windows entry itself: warm launch, cold launch and exact project URL.
assert.ok(fs.existsSync(m.workstationEntry));assert.equal(path.dirname(m.workstationEntry),root);
const launchEntry=()=>{const r=spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','"'+m.workstationEntry+'"'],{env:{...env,XUZHANG_DATA_ROOT:path.join(root,'wrong-inherited-root')},encoding:'utf8',timeout:30000,windowsHide:true,windowsVerbatimArguments:true});assert.equal(r.status,0,r.stderr||r.stdout);assert.ok(r.stdout.includes('?project='+m.id),r.stdout);return JSON.parse(fs.readFileSync(path.join(root,'runtime.json')))};
if(process.platform==='win32'){assert.equal(launchEntry().pid,before.pid);run('stop');const cold=launchEntry();assert.notEqual(cold.pid,before.pid);assert.equal(launchEntry().pid,cold.pid)}
const invalid=spawnSync(node,[path.join(app,'launcher.cjs'),'start','--project','p-0000000000000000'],{env,encoding:'utf8',timeout:30000,windowsHide:true});assert.notEqual(invalid.status,0);
run('stop');await new Promise(r=>setTimeout(r,100));run('start');await new Promise(r=>setTimeout(r,100));const after=JSON.parse(fs.readFileSync(path.join(root,'runtime.json')));const state=await(await fetch('http://127.0.0.1:'+after.port+'/api/state')).json();assert.ok(state.projects.some(p=>p.id===m.id));assert.ok(fs.existsSync(asset.path));
run('config');assert.match(fs.readFileSync(path.join(root,'codex-mcp.toml'),'utf8'),/mcp_servers.xuzhang/);
console.log('PASS distribution: start, duplicate start, unauthorized stop, project creation, extraction, search, restart persistence, shared MCP config');
}finally{run('stop')}})().catch(e=>{console.error(e);process.exitCode=1});

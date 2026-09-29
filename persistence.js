// The server is authoritative; local copies retain unsent edits and migration inputs.
const SYNC_KEY=KEY+'-sqlite', JOURNAL_PREFIX=KEY+'-pending-';
let clientId=localStorage.getItem(SYNC_KEY+'-client');
if(!clientId){clientId='browser-'+crypto.randomUUID();localStorage.setItem(SYNC_KEY+'-client',clientId)}
let tabId=sessionStorage.getItem(SYNC_KEY+'-tab');
if(!tabId){tabId=crypto.randomUUID();sessionStorage.setItem(SYNC_KEY+'-tab',tabId)}
const JOURNAL=JOURNAL_PREFIX+tabId;
let versions={},pending={},syncReady=false,syncBusy=false,syncError='',syncTimer=null;
try{pending=JSON.parse(localStorage.getItem(JOURNAL)||'{}')}catch{}
const currentId=()=>state.project?.id||'demo';
function syncStatus(){const nav=document.querySelector('[data-page="relations"]');if(nav)nav.textContent='◎　决定、证据与影响'+((state.impacts||[]).filter(i=>i.status!=='resolved').length?' · '+state.impacts.filter(i=>i.status!=='resolved').length:'');const el=$('#save-status');if(!el)return;el.textContent=syncError||(!syncReady?'正在连接数据库…':Object.keys(pending).length?'有修改待保存…':'已保存到 SQLite · 版本 '+(versions[currentId()]||1));if(syncError&&$('#bp-draft-state'))$('#bp-draft-state').textContent='保存尚未完成，草稿已保留在此浏览器';let button=$('#storage-controls');if(!button){el.insertAdjacentHTML('afterend','<button id="storage-controls" data-action="storage-open">保存与恢复</button>')}}
function writeJournal(){localStorage.setItem(JOURNAL,JSON.stringify(pending))}
function queueSave(){if(!syncReady){syncError='数据库尚未连接，请先重试连接';syncStatus();return}const id=currentId();const snapshot=structuredClone(state);const prior=pending[id];pending[id]=prior?{...prior,next:snapshot}:{id,baseRevision:versions[id],state:snapshot,requestId:crypto.randomUUID()};try{writeJournal()}catch{syncError='本地恢复副本写入失败，请导出记录';syncStatus();return}syncError='';syncStatus();clearTimeout(syncTimer);syncTimer=setTimeout(flushSaves,450)}
async function flushSaves(){if(syncBusy||!syncReady)return;syncBusy=true;try{for(const id of Object.keys(pending)){while(pending[id]){const job=pending[id];const response=await api('/api/state',{id:job.id,baseRevision:job.baseRevision,state:job.state,requestId:job.requestId});versions[id]=response.revision;const next=job.next;if(response.impacts){if(next)next.impacts=response.impacts;if(currentId()===id)state.impacts=response.impacts;}if(next){pending[id]={id,baseRevision:response.revision,state:next,requestId:crypto.randomUUID()}}else delete pending[id];writeJournal();} }syncError='';if($('#bp-draft-state')&&state.blueprint.drafts[activeBlueprint])$('#bp-draft-state').textContent='编辑草稿已保存到数据库'}catch(e){syncError=(e.status===409?'版本冲突：':'保存未完成：')+e.message;toast(syncError)}finally{syncBusy=false;syncStatus();if(page==='relations')renderContent()}}
async function switchProject(id){if(assetBusy){toast('文件正在保存，请完成后再切换项目');return}await flushSaves();if(syncBusy||Object.keys(pending).length){toast('仍有未保存修改，请在“保存与恢复”中处理');$('#project-picker').value=currentId();return}try{const data=await api('/api/state');for(const row of data.projects){projectCatalog[row.id]=row.state;versions[row.id]=row.revision}const next=projectCatalog[id];if(next)activateProject(structuredClone(next));syncStatus()}catch(e){toast(e.message);$('#project-picker').value=currentId()}}
function storageDialog(){const unresolved=Object.keys(pending);const other=Object.keys(localStorage).filter(k=>k.startsWith(JOURNAL_PREFIX)&&k!==JOURNAL&&localStorage.getItem(k)!=='{}');$('#modal').innerHTML=`<h2>保存与恢复</h2><p>${esc(syncError||'当前工作保存在本机 SQLite 数据库。')}</p><p>${unresolved.length} 个项目有待保存修改。${other.length?'另有 '+other.length+' 份其他页面留下的恢复记录。':''}</p><p>迁移原始记录与历史版本均已保留。版本冲突时先导出本地修改，再载入数据库版本核对。</p><div class="actions">${btn('重试保存','storage-retry')}${btn('导出本地恢复记录','storage-export')}${btn('备份数据库','storage-backup')}${btn('载入数据库版本','storage-load')}${btn('关闭','close')}</div><div id="storage-message" role="status"></div>`;$('#modal').showModal()}
async function bootStorage(){
 syncReady=false;const app=$('#app');app.inert=true;syncStatus();
 try{
  const oldCurrent=currentId(),originalKey=localStorage.getItem(KEY),originalCatalog=localStorage.getItem(PROJECTS_KEY);
  let result=null;
  if(!localStorage.getItem(SYNC_KEY+'-migrated')){
   const catalog={...projectCatalog,[oldCurrent]:structuredClone(state)};
   // Preserve exact legacy values, including any pre-SQLite project cache.
   result=await api('/api/migrate',{client:clientId,catalog,legacy:{active:originalKey,catalog:originalCatalog}});
  }
  const data=await api('/api/state');projectCatalog={};versions={};for(const row of data.projects){projectCatalog[row.id]=row.state;versions[row.id]=row.revision}
  if(!Object.keys(projectCatalog).length)throw Error('数据库没有可用项目，请保留浏览器记录并检查迁移');
  // Keep a failed request's original base version and request ID across reloads.
  for(const [id,job]of Object.entries(pending)){if(projectCatalog[id])projectCatalog[id]=job.next||job.state}
  state=structuredClone(projectCatalog[oldCurrent]||Object.values(projectCatalog)[0]);applyProjectSource();activeBlueprint=state.blueprint.nodes[0].id;
  localStorage.setItem(SYNC_KEY+'-migrated','yes');cacheProject();syncReady=true;syncError='';shell();
  if(result?.recovered?.length){toast('已从浏览器恢复项目文字记录；相关原文件需在素材页核对')}
  if(result?.preserved.length){toast('数据库已有版本，浏览器旧内容已另存迁移备份，未覆盖数据库')}
  await flushSaves();
 }catch(e){syncError='连接或迁移未完成：'+e.message;syncStatus();const el=$('#save-status');if(el)el.insertAdjacentHTML('afterend','<button data-action="storage-reconnect">重试连接</button>');toast(syncError)}finally{$('#app').inert=!syncReady;if(!syncReady){$('#app').inert=false;document.querySelector('#content')?.setAttribute('inert','');}}
}
document.addEventListener('click',async e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(action==='storage-open')storageDialog();if(action==='storage-reconnect'){await bootStorage()}if(action==='storage-retry'){if(!syncReady)await bootStorage();else await flushSaves();storageDialog()}if(action==='storage-export'){const journals={};for(const key of Object.keys(localStorage).filter(k=>k.startsWith(JOURNAL_PREFIX)))journals[key]=localStorage.getItem(key);downloadJSON({format:'xuzhang-recovery-v1',state,versions,pending,journals},'续章_本地恢复记录.json')}if(action==='storage-backup'){try{await flushSaves();if(Object.keys(pending).length)throw Error('还有未保存修改，请先处理或导出本地恢复记录');const r=await api('/api/backup',{});$('#storage-message').textContent='数据库备份已保存：'+r.path+'。素材原文件仍在项目资料库。'}catch(err){$('#storage-message').textContent=err.message}}if(action==='storage-load'){
  if(syncBusy){toast('请等待当前保存完成');return}
  try{const id=currentId();if(pending[id]){await api('/api/migrate',{client:clientId,catalog:{[id]:pending[id].next||pending[id].state},reason:'冲突恢复前保留本地修改'})}const data=await api('/api/state'),row=data.projects.find(r=>r.id===id);if(!row)throw Error('找不到项目');delete pending[id];writeJournal();versions[id]=row.revision;activateProject(structuredClone(row.state));syncError='';syncStatus();$('#modal').close();toast('已载入数据库版本；冲突副本已保留') }catch(err){$('#storage-message').textContent=err.message}
 }});
window.addEventListener('beforeunload',e=>{if(Object.keys(pending).length){e.preventDefault();e.returnValue=''}});

document.addEventListener('click',e=>{if(syncReady)return;const a=e.target.closest('[data-action]')?.dataset.action;if(a&&!a.startsWith('storage-')&&!['close','export'].includes(a)){e.preventDefault();e.stopImmediatePropagation();toast('请先连接数据库，原记录仍保留在此浏览器')}},true);

async function connectionStatus(){try{const r=await api('/api/connection');const el=$('#codex-connection');if(el)el.textContent=r.clients.length?'MCP 客户端已连接：'+r.clients.map(c=>c.projectName||'尚未选择项目').filter((v,i,a)=>a.indexOf(v)===i).join('、'):r.configured?'已配置 xuzhang · 等待客户端连接':'MCP 尚未配置'}catch{const el=$('#codex-connection');if(el)el.textContent='连接状态暂时无法读取'}}

// Poll only version numbers. Never replace a form or local edits without an explicit load.
let remoteVersion=0,versionChecking=false;
function hasOpenInputs(){return Boolean(document.querySelector('form[data-unsaved="yes"]'))||$('#modal')?.open;}
document.addEventListener('input',e=>{const f=e.target.closest('form');if(f)f.dataset.unsaved='yes'});
document.addEventListener('change',e=>{const f=e.target.closest('form');if(f)f.dataset.unsaved='yes'});
function showRemoteVersion(){let el=$('#remote-version');if(!el){$('#save-status')?.parentElement.insertAdjacentHTML('afterend','<div id="remote-version" class="notice" hidden></div>');el=$('#remote-version')}if(!el)return;el.hidden=remoteVersion<=(versions[currentId()]||0);el.innerHTML=`<span>项目已有新版本 ${remoteVersion}，当前显示版本 ${versions[currentId()]||0}。本页输入保持不动。</span>${btn('载入新版本','remote-load')}`;}
async function checkRemoteVersion(){if(!syncReady||versionChecking)return;versionChecking=true;const id=currentId();try{const r=await api('/api/versions');if(id!==currentId())return;remoteVersion=r.projects.find(p=>p.id===id)?.revision||0;showRemoteVersion()}catch{}finally{versionChecking=false}}
async function loadRemoteVersion(){if(syncBusy||Object.keys(pending).length||hasOpenInputs()){toast('本页有输入或待保存修改，请先保存、关闭编辑窗口，或在“保存与恢复”中处理冲突。');return}const id=currentId(),base=versions[id];try{const data=await api('/api/state');if(id!==currentId()||base!==versions[id]||syncBusy||Object.keys(pending).length||hasOpenInputs()){toast('本页内容已变化，已保留输入，请处理后再载入。');return}const r=data.projects.find(p=>p.id===id);if(!r)throw Error('找不到项目');versions[id]=r.revision;projectCatalog[id]=r.state;activateProject(structuredClone(r.state));remoteVersion=0;showRemoteVersion();toast('已载入最新讨论成果与项目内容')}catch(e){toast(e.message)}}
document.addEventListener('click',async e=>{const a=e.target.closest('[data-action]')?.dataset.action;if(a==='remote-load')await loadRemoteVersion();if(a==='discussion-refresh'){await checkRemoteVersion();if(remoteVersion<=(versions[currentId()]||0))toast('当前已是最新保存版本')}});
setInterval(checkRemoteVersion,10000);
window.addEventListener('focus',checkRemoteVersion);

'use strict';
const {sourceFor}=require('./relations'),{currentParagraphs}=require('./draft-edit');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function read(store,project,revision){const r=store.db.prepare('SELECT revision,body,created_at FROM revisions WHERE project_id=? AND revision=?').get(project,revision);if(!r)fail('找不到本项目的这个版本',404);return {revision:r.revision,state:JSON.parse(r.body),time:r.created_at}}
function list(store,project,before){const current=store.get(project);if(!current)fail('项目不存在',404);const cursor=before===undefined?current.revision+1:Number(before);if(!Number.isSafeInteger(cursor)||cursor<1)fail('无效版本游标');const rows=store.db.prepare(`SELECT revision,created_at AS time,json_extract(body,'$.events[0].text') AS title FROM revisions WHERE project_id=? AND revision<? ORDER BY revision DESC LIMIT 31`).all(project,cursor);const more=rows.length>30;return {projectId:project,currentRevision:current.revision,items:rows.slice(0,30).map(r=>({...r,title:r.title||'项目初始化'})),nextBefore:more?rows[29].revision:null}}
function changes(before,after,source){
 const result=[];
 const add=(area,id,label,a,b)=>{if(!same(a,b))result.push({area,id,label,before:a??null,after:b??null})};
 add('思路','paper','全篇思路与规则',before?.paper,after.paper);add('蓝图','goal','作品目标',before?.blueprint?.goal,after.blueprint.goal);
 for(const [area,key]of [['蓝图','nodes'],['蓝图草稿','drafts']]){
  const a=key==='nodes'?Object.fromEntries((before?.blueprint?.nodes||[]).map(n=>[n.id,n])):before?.blueprint?.drafts||{},b=key==='nodes'?Object.fromEntries(after.blueprint.nodes.map(n=>[n.id,n])):after.blueprint.drafts||{};
  for(const id of new Set([...Object.keys(a),...Object.keys(b)]))add(area,id,b[id]?.part||a[id]?.part||id,a[id],b[id]);
 }
 add('蓝图','order','章节顺序',(before?.blueprint?.nodes||[]).map(n=>n.id),after.blueprint.nodes.map(n=>n.id));
 const paragraphs=s=>new Map(s?currentParagraphs(source,s).map(p=>[p.id,p.text]):[]),a=paragraphs(before),b=paragraphs(after);
 for(const id of new Set([...a.keys(),...b.keys()]))add('正文',id,id,a.get(id),b.get(id));
 for(const [area,key]of [['决定与依据','knowledge'],['证据','evidence'],['影响提醒','impacts'],['讨论成果','discussions'],['成果验收','discussionReviews']]){
  const a=new Map((before?.[key]||[]).map((r,i)=>[r.id||String(i),r])),b=new Map((after[key]||[]).map((r,i)=>[r.id||String(i),r]));
  for(const id of new Set([...a.keys(),...b.keys()]))add(area,id,b.get(id)?.title||a.get(id)?.title||id,a.get(id),b.get(id));
 }
 const comments=s=>new Map(s?[...source.comments||[],...s.comments||[]].map(c=>[c.id,{...c,...s.overrides?.[c.id]}]):[]),ac=comments(before),bc=comments(after);
 for(const id of new Set([...ac.keys(),...bc.keys()]))add('批注',id,bc.get(id)?.text||ac.get(id)?.text||id,ac.get(id),bc.get(id));
 for(const id of new Set([...Object.keys(before?.claimLinks||{}),...Object.keys(after.claimLinks||{})]))add('主张关联',id,id,before?.claimLinks?.[id],after.claimLinks?.[id]);
 add('手动颜色','colors','手动文字颜色',before?.colors||[],after.colors||[]);
 return result;
}
function detail(store,project,revision,from){
 const current=store.get(project);if(!current)fail('项目不存在',404);
 const selected=revision===undefined?current.revision:Number(revision);if(!Number.isSafeInteger(selected)||selected<1)fail('无效版本');
 const target=read(store,project,selected),base=from===undefined?selected-1:Number(from);if(!Number.isSafeInteger(base)||base<0||base>selected)fail('无效比较基准');
 const previous=base?read(store,project,base):null,source=sourceFor(store,target.state),diff=changes(previous?.state,target.state,source),old=new Map(previous?currentParagraphs(source,previous.state).map(p=>[p.id,p.text]):[]);
 return {projectId:project,currentRevision:current.revision,revision:selected,baseRevision:base,time:target.time,title:target.state.events?.[0]?.text||'项目初始化',state:target.state,changes:diff,counts:Object.fromEntries([...new Set(diff.map(c=>c.area))].map(area=>[area,diff.filter(c=>c.area===area).length])),paragraphs:currentParagraphs(source,target.state).map(p=>({id:p.id,type:p.type||(/^import-\d+$/.test(p.id)?'heading':'paragraph'),text:p.text,before:old.get(p.id)??'',changed:!old.has(p.id)||old.get(p.id)!==p.text})),limitations:'历史正文按段落文字展示；原稿图像、公式与表格版式请在作品预览核对。素材原文件不属于正文版本快照。'};
}
module.exports={list,detail,changes};

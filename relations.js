'use strict';
const crypto=require('node:crypto');
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,24);
const key=t=>t.kind+':'+t.id;
function sourceFor(store,s){
 if(s.project)return {paragraphs:s.project.input.内容.flatMap((n,i)=>[{id:'import-'+i,text:n.名称},...(n.草稿||'（这一部分尚无草稿）').split(/\n\s*\n/).map((text,j)=>({id:'import-'+i+'-'+j,text}))]),comments:[]};
 const rows=store.db.prepare('SELECT body FROM sources').all();if(rows.length!==1)throw Error('源论文版本不唯一或缺失');return JSON.parse(rows[0].body);
}
function targets(s,source){return new Map([
 ...s.blueprint.nodes.map(n=>['blueprint:'+n.id,n.part]),
 ...s.knowledge.map(k=>['decision:'+k.id,k.title]),
 ...Object.values(s.claimLinks||{}).map(c=>['claim:'+c.id,c.id==='paper'?'全篇核心主张':'章节分论点 '+c.id]),
 ...source.paragraphs.map(p=>['paragraph:'+p.id,(s.manuscript?.edits?.[p.id]?.text??p.text).slice(0,60)]),
 ...[...source.comments,...s.comments].map(c=>['comment:'+c.id,c.quote||c.text])]);}
function validateTargets(list,s,source){if(!Array.isArray(list)||list.length>100)throw Error('关联位置最多100项');const known=targets(s,source);for(const t of list)if(!t||!known.has(key(t)))throw Error('关联位置不存在：'+(t?.id||''));}
function evidenceStatus(e,s,source,assets){
 if(e.sourceType==='paragraph'){const p=source.paragraphs.find(p=>p.id===e.sourceId);if(!p)return '来源段落已不存在';const text=s.manuscript?.edits?.[p.id]?.text??p.text;return text===e.sourceText?'位置已核对':'来源正文已变化，需重新核对';}
 const a=assets.find(a=>a.id===e.sourceId);return !a?'素材已不存在':a.sha256!==e.sourceHash?'素材版本已变化，需重新核对':'已记录文件与位置，内容待核对';
}
function perform(s,a,ctx){
 const {source,assets,actor='Codex'}=ctx;const time=new Date().toISOString();
 if(a.action==='decision'){
  if(!a.title?.trim()||!a.content?.trim()||!a.reason?.trim()||!a.source?.trim())throw Error('请填写决定、理由和来源');
  validateTargets(a.targets||[],s,source);
  if(a.supersedes){const old=s.knowledge.find(k=>k.id===a.supersedes);if(!old||old.lifecycle==='superseded')throw Error('被替代记录不存在或已被替代');}
  s.knowledge.push({id:'D-'+digest(a.requestId),kind:'决定',title:a.title,body:a.content,source:a.source,reason:a.reason,scope:a.scope||'',status:'待核对',lifecycle:'candidate',supersedes:a.supersedes||null,targets:a.targets||[],createdAt:time,actor});
 }else if(a.action==='adopt'){
  if(actor!=='用户'&&!ctx.userInstruction?.trim())throw Error('采用决定需要用户明确指示');
  const n=s.knowledge.find(k=>k.id===a.id);if(!n||n.lifecycle!=='candidate')throw Error('只能采用候选决定');
  if(n.supersedes){const old=s.knowledge.find(k=>k.id===n.supersedes);if(!old||old.lifecycle==='superseded')throw Error('原决定已被其他决定替代，请重新比较');old.lifecycle='superseded';old.supersededBy=n.id;old.replacedAt=time;for(const t of old.targets||[]){if(!n.targets.some(x=>key(x)===key(t)))n.targets.push(t)}}
  n.lifecycle='active';n.status='已确认';n.adoptedAt=time;n.adoptedBy=actor;n.adoptionSource=ctx.userInstruction||'用户在网页点击采用';
 }else if(a.action==='evidence'){
  if(!a.title?.trim()||!a.locator?.trim()||!a.quote?.trim()||!a.purpose?.trim())throw Error('请填写证据标题、具体位置、摘录和支持内容');
  validateTargets(a.targets||[],s,source);if(!(a.targets||[]).length)throw Error('至少关联一个使用位置');
  s.evidence||=[];let e=a.id?s.evidence.find(e=>e.id===a.id):null;if(a.id&&!e)throw Error('证据记录不存在');
  let snapshot;
  if(a.sourceType==='paragraph'){const p=source.paragraphs.find(p=>p.id===a.sourceId);if(!p)throw Error('来源段落不存在');const text=s.manuscript?.edits?.[p.id]?.text??p.text;if(!text.includes(a.quote))throw Error('摘录不在当前来源段落中，请核对原文');snapshot={sourceText:text,sourceHash:digest(text)};}
  else if(a.sourceType==='asset'){const asset=assets.find(x=>x.id===a.sourceId);if(!asset)throw Error('请先导入来源文件');snapshot={sourceHash:asset.sha256,sourcePath:asset.path,sourceName:asset.name};if(a.sourceChunkId){const c=ctx.assetSearch.read(ctx.projectId,a.sourceChunkId);if(c.assetId!==a.sourceId||c.locator!==a.locator||!c.text.includes(a.quote))throw Error('摘录或位置与提取原文不一致，请重新核对');snapshot.sourceChunkId=c.chunkId;}}
  else throw Error('不支持的来源类型');
  const next={id:e?.id||'E-'+digest(a.requestId),title:a.title,sourceType:a.sourceType,sourceId:a.sourceId,locator:a.locator,quote:a.quote,purpose:a.purpose,targets:a.targets,...snapshot,updatedAt:time,actor,history:e?[...(e.history||[]),{...e,history:undefined}]:[]};
  if(e)s.evidence[s.evidence.indexOf(e)]=next;else s.evidence.push(next);
 }else if(a.action==='review-impact'){
  const i=(s.impacts||[]).find(i=>i.id===a.id);if(!i)throw Error('提醒不存在');if(!a.note?.trim())throw Error('请说明检查结果');
  i.status=actor==='用户'?'resolved':'review';i.note=a.note;i.reviewedAt=time;i.reviewedBy=actor;
 }else throw Error('不支持的操作');
 s.events.unshift({time,text:actor+'：'+({decision:'记录候选决定',adopt:'采用决定并保留替代链',evidence:'更新证据定位','review-impact':'记录影响检查结果'}[a.action])});
}
// Only explicit links are followed. A reminder asks for inspection, not automatic rewriting.
function reconcile(old,s,revision,source){
 s.impacts=structuredClone(s.impacts||[]);const graph=new Map(),labels=targets(s,source);
 const edge=(from,to)=>{const k=key(from);if(!graph.has(k))graph.set(k,[]);if(!graph.get(k).some(x=>key(x)===key(to)))graph.get(k).push(to)};
 for(const v of [old,s]){
  for(const c of Object.values(v.claimLinks||{})){labels.set('claim:'+c.id,c.id==='paper'?'全篇核心主张':'章节分论点 '+c.id);if(c.id!=='paper')edge({kind:'blueprint',id:c.id},{kind:'claim',id:c.id});for(const id of [...c.support,...c.counter])edge({kind:'evidence',id},{kind:'claim',id:c.id});for(const id of c.nodes)edge({kind:'claim',id:c.id},{kind:'blueprint',id});for(const id of c.paragraphs)edge({kind:'claim',id:c.id},{kind:'paragraph',id});}

  for(const d of v.knowledge)for(const t of d.targets||[])edge({kind:'decision',id:d.id},t);
  for(const e of v.evidence||[]){for(const t of e.targets)edge({kind:'evidence',id:e.id},t);if(e.sourceType==='paragraph')edge({kind:'paragraph',id:e.sourceId},{kind:'evidence',id:e.id});labels.set('evidence:'+e.id,e.title);}
  for(const n of v.blueprint.nodes){if(n.anchor)edge({kind:'blueprint',id:n.id},{kind:'paragraph',id:n.anchor});for(const id of n.comments)edge({kind:'blueprint',id:n.id},{kind:'comment',id});}
 }
 for(const c of [...source.comments,...s.comments].map(c=>({...c,...s.overrides[c.id]})))for(const seg of c.segments||[])edge({kind:'paragraph',id:seg.block},{kind:'comment',id:c.id});
 const changes=[];
 const fields=(x,names)=>names.map(n=>x?.[n]);
 const compare=(before,after,kind,names)=>{for(const b of before){const n=after.find(x=>x.id===b.id);if(JSON.stringify(fields(b,names))!==JSON.stringify(fields(n,names)))changes.push({kind,id:b.id,title:b.title||b.part||b.id});}};
 compare(Object.values(old.claimLinks||{}),Object.values(s.claimLinks||{}),'claim',['support','counter','conditions','boundary','nodes','paragraphs']);
 compare(old.knowledge,s.knowledge,'decision',['title','body','source','lifecycle','targets']);
 compare(old.evidence||[],s.evidence||[],'evidence',['sourceId','sourceHash','locator','quote','purpose','targets','sourceChunkId']);
 compare(old.blueprint.nodes,s.blueprint.nodes,'blueprint',['part','title','claim','question','evidence','logic','expression','anchor','comments']);
 if(JSON.stringify(old.paper)!==JSON.stringify(s.paper)&&s.claimLinks?.paper)changes.push({kind:'claim',id:'paper',title:'全篇核心主张'});
 if(old.blueprint.goal!==s.blueprint.goal||JSON.stringify(old.paper)!==JSON.stringify(s.paper))for(const n of s.blueprint.nodes)changes.push({kind:'blueprint',id:n.id,title:old.blueprint.goal!==s.blueprint.goal?'作品目标':'论文思路与规则'});
 for(const p of source.paragraphs)if((old.manuscript?.edits?.[p.id]?.text??p.text)!==(s.manuscript?.edits?.[p.id]?.text??p.text))changes.push({kind:'paragraph',id:p.id,title:'正文 '+p.id});
 for(const change of changes){const visited=new Set([key(change)]),queue=[{item:change,path:[key(change)]}];while(queue.length){const {item,path}=queue.shift();for(const t of graph.get(key(item))||[]){if(visited.has(key(t)))continue;visited.add(key(t));const chain=[...path,key(t)];queue.push({item:t,path:chain});const id='A-'+digest([revision,key(change),key(t)]);if(!s.impacts.some(i=>i.id===id))s.impacts.push({id,revision,source:{kind:change.kind,id:change.id},target:t,title:labels.get(key(t))||t.id,reason:change.title+'发生变化；请检查关联内容是否仍成立',chain,pathLabels:chain.map(k=>labels.get(k)||k),status:'open',createdAt:new Date().toISOString()});}}}
}
module.exports={sourceFor,targets,validateTargets,perform,reconcile,evidenceStatus};

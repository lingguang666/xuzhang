'use strict';
function currentParagraphs(source,state){return source.paragraphs.map(p=>({...p,text:state.manuscript?.edits?.[p.id]?.text??p.text}))}
function applyDraft(state,source,args){
 const paragraphs=currentParagraphs(source,state),byId=new Map(paragraphs.map(p=>[p.id,p]));
 if(new Set(args.edits.map(e=>e.paragraphId)).size!==args.edits.length)throw Error('同一段落不能重复提交');
 const all=[...source.comments,...state.comments].map(c=>({...c,...state.overrides[c.id]}));
 for(const e of args.edits){const p=byId.get(e.paragraphId);if(!p)throw Error('段落不存在：'+e.paragraphId);if(p.text!==e.expectedText)throw Error('原文与预期不一致，请重新读取：'+e.paragraphId);if(p.maths?.length)throw Error('此段含公式，需要专门处理公式，不能作为普通文字覆盖');if(e.text===p.text)throw Error('正文没有变化：'+e.paragraphId)}
 const editedIds=new Set(args.edits.map(e=>e.paragraphId));
 for(const id of args.commentIds){const c=all.find(c=>c.id===id);if(!c)throw Error('批注不存在：'+id);if(!c.segments.some(s=>editedIds.has(s.block)))throw Error('关联批注不在本次修改段落中：'+id)}
 for(const index of args.blueprintChangeIndices){if(!state.blueprint.changes[index])throw Error('蓝图修改记录不存在')}
 state.manuscript ||= {edits:{},changes:[]};const changes=[];
 for(const edit of args.edits){const p=byId.get(edit.paragraphId);changes.push({paragraphId:p.id,before:p.text,after:edit.text});
  for(const c of all.filter(c=>c.segments.some(seg=>seg.block===p.id))){const previous=state.overrides[c.id]||{};let needsReview=previous.anchorNeedsReview||false;
   const segments=(previous.segments||c.segments).map(seg=>{if(seg.block!==p.id)return seg;const quote=p.text.slice(seg.start,seg.end),index=quote?edit.text.indexOf(quote):-1;if(index>=0&&edit.text.indexOf(quote,index+1)<0)return {...seg,start:index,end:index+quote.length};needsReview=true;return {...seg,start:0,end:0}});
   state.overrides[c.id]={...previous,segments,anchorNeedsReview:needsReview,anchorHistory:[...(previous.anchorHistory||[]),{revision:args.baseRevision,paragraphId:p.id,text:p.text,segments:previous.segments||c.segments}],...(c.status==='done'?{status:'review'}:{})};
  }
  // Keep unmappable colours in history; never paint unrelated offsets in the revised paragraph.
  const kept=[];for(const color of state.colors){if(color.block!==p.id){kept.push(color);continue}const quote=p.text.slice(color.start,color.end),i=quote?edit.text.indexOf(quote):-1;if(i>=0&&edit.text.indexOf(quote,i+1)<0)kept.push({...color,start:i,end:i+quote.length})}
  state.manuscript.colorHistory ||= [];state.manuscript.colorHistory.push({paragraphId:p.id,revision:args.baseRevision,colors:state.colors.filter(c=>c.block===p.id)});state.colors=kept;
  state.manuscript.edits[p.id]={text:edit.text,revision:args.baseRevision+1};
 }
 const time=new Date().toLocaleString('zh-CN');state.manuscript.changes.push({revision:args.baseRevision+1,time,reason:args.reason,actor:'Codex',comments:args.commentIds,paragraphs:changes});
 for(const id of args.commentIds){const c=all.find(c=>c.id===id);state.overrides[id]={...state.overrides[id],status:'review',replies:[...(c.replies||[]),{time,text:'Codex：已提交草稿修改，待你检查。\n'+args.reason}]}}
 for(const index of args.blueprintChangeIndices){state.blueprint.changes[index].draftRevision=args.baseRevision+1}
 state.events.unshift({time,text:'Codex 修改正文 '+changes.length+' 段：'+args.reason+'；待用户检查'});
}
module.exports={currentParagraphs,applyDraft};

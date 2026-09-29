'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {openStore}=require('./store'),history=require('./version-history'),{diffText}=require('./text-diff');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'xuzhang-history-')),store=openStore(root),id='p-1122334455667788';
try{
 store.addProject({id,name:'阶段验证',root:path.join(root,id),input:{项目名称:'阶段验证',目标:'原目标',内容:[{名称:'引言',草稿:'第一段原文。\n\n第二段原文。'}]}});
 store.mutate(id,1,'history-update-2',{test:2},s=>{s.manuscript={edits:{'import-0-0':{text:'第一段修改。',revision:2}},changes:[]};s.events.unshift({text:'修改第一段'})});
 store.mutate(id,2,'history-update-3',{test:3},s=>{s.manuscript.edits['import-0-1']={text:'第二段新增内容。',revision:3};s.blueprint.goal='新目标';s.comments.push({id:'comment-one',text:'检查结论',segments:[]});s.events.unshift({text:'修改第二段和目标'})});
 const snapshot=JSON.stringify(store.list()),three=history.detail(store,id,3);
 assert.equal(three.baseRevision,2);assert.equal(three.paragraphs.find(p=>p.id==='import-0-0').changed,false);assert.equal(three.paragraphs.find(p=>p.id==='import-0-1').changed,true);assert.equal(three.counts['正文'],1);assert.equal(three.counts['批注'],1);assert.equal(three.counts['蓝图'],1);
 const cumulative=history.detail(store,id,undefined,1);assert.equal(cumulative.counts['正文'],2);assert.equal(history.detail(store,id,2).paragraphs.find(p=>p.id==='import-0-1').text,'第二段原文。');
 assert.throws(()=>history.detail(store,'p-0000000000000000',2),/不存在/);assert.throws(()=>history.detail(store,id,2,3),/基准/);assert.throws(()=>history.detail(store,id,99),/版本/);assert.equal(history.list(store,id).items[0].revision,3);assert.equal(history.list(store,id,3).items[0].revision,2);
 assert.equal(JSON.stringify(store.list()),snapshot);
 const d=diffText('甲旧乙旧丙','甲新乙新丙');assert.equal(d.runs.filter(r=>r.added).map(r=>r.text).join(''),'新新');assert.equal(d.runs.filter(r=>!r.added).map(r=>r.text).join(''),'甲乙丙');assert.equal(diffText('删除文字','文字').runs.some(r=>r.added),false);assert.equal(diffText('一致','一致').runs.some(r=>r.added),false);
 const big=diffText('甲'.repeat(2000),'乙'.repeat(2000));assert.equal(big.coarse,true);assert.equal(big.runs.map(r=>r.text).join(''),'乙'.repeat(2000));
 console.log('PASS history: immutable snapshot preview, project isolation, per-stage versus cumulative changes, comment/goal changes, cursor, bounded text diff and deletions');
}finally{store.close()}

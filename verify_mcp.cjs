'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
const {openStore}=require('./store');
async function main(){
 const root=fs.mkdtempSync(path.join(__dirname,'验证数据/mcp-'));
 const store=openStore(root);let pid='demo';{pid='p-1122334455667788';store.addProject({id:pid,name:'MCP隔离核查',input:{项目名称:'MCP隔离核查',目标:'核查读写',内容:[{名称:'测试部分',草稿:'测试正文'}]}});const r=store.get(pid);r.state.comments.push({id:'N-test',text:'请解释这一段',quote:'测试正文',segments:[{block:'import-0-0',start:0,end:4}],status:'todo'});store.save({id:pid,baseRevision:r.revision,requestId:'fixture',state:r.state})}
 const baseline=JSON.stringify(store.get(pid));
 const transport=new StdioClientTransport({command:process.execPath,args:[path.join(process.env.XUZHANG_TEST_APP||__dirname,'mcp-server.js')],env:{...process.env,XUZHANG_DATA_ROOT:root},stderr:'pipe'});
 const client=new Client({name:'xuzhang-verification',version:'1.0.0'});try{
 await client.connect(transport);const tools=await client.listTools();assert.equal(tools.tools.length,23);assert.match(client.getInstructions(),/不得替用户确认/);
 const call=async(name,args)=>{const r=await client.callTool({name,arguments:args});return {error:r.isError===true,data:JSON.parse(r.content[0].text)}};
 const list=await call('list_projects',{});assert.ok(list.data.some(p=>p.projectId===pid));
 assert.ok((await call('read_project',{projectId:pid})).error);assert.ok(!(await call('select_project',{projectId:pid})).error);
 let r=await call('read_project',{projectId:pid});assert.ok(r.data.nodes.length);const rev=r.data.revision;
 const txt=await call('read_text',{projectId:pid,offset:0,limit:2});assert.ok(txt.data.paragraphs.length);assert.ok(!(await call('list_assets',{projectId:pid})).error);
 const context=await call('read_text',{projectId:pid,commentId:'N-test'});assert.equal(context.data.comment.quote,'测试正文');
 const args={projectId:pid,baseRevision:rev,requestId:'test-change-1',nodeId:'I-0',patch:{claim:'测试主张'},commentIds:['N-test'],reason:'验证受控写入'};
 const changed=await call('update_blueprint',args);assert.ok(!changed.error);assert.equal(changed.data.revision,rev+1);assert.deepEqual(await call('update_blueprint',args),changed);
 assert.ok((await call('update_blueprint',{...args,requestId:'test-stale-2'})).error);assert.equal(store.get(pid).state.blueprint.nodes[0].claim,'测试主张');assert.equal(store.get(pid).state.comments[0].status,'todo');
 let decision=await call('record_decision',{projectId:pid,baseRevision:rev+1,requestId:'test-decision',title:'测试决定',content:'保留原意见',reason:'核查来源',source:'验证用例',scope:'测试项目'});assert.ok(!decision.error);
 const replyArgs={projectId:pid,baseRevision:decision.data.revision,requestId:'test-reply-1',reason:'核查回复',commentId:'N-test',text:'仅更新蓝图，正文未改'};
 const reply=await call('reply_comment',replyArgs);assert.ok(!reply.error);assert.deepEqual(await call('reply_comment',replyArgs),reply);assert.equal(store.get(pid).state.comments[0].status,'todo');
 const draftArgs={projectId:pid,baseRevision:reply.data.revision,requestId:'test-draft-1',reason:'验证正文可修改',edits:[{paragraphId:'import-0-0',expectedText:'测试正文',text:'更新后的测试正文草稿'}],commentIds:['N-test'],blueprintChangeIndices:[0]};
 const draft=await call('submit_draft',draftArgs);assert.ok(!draft.error);assert.deepEqual(await call('submit_draft',draftArgs),draft);
 assert.equal(store.get(pid).state.overrides['N-test'].status,'review');assert.equal(store.get(pid).state.overrides['N-test'].segments[0].start,4);
 const readDraft=await call('read_text',{projectId:pid,commentId:'N-test'});assert.equal(readDraft.data.paragraphs.find(p=>p.id==='import-0-0').text,'更新后的测试正文草稿');
 assert.ok((await call('submit_draft',{...draftArgs,baseRevision:draft.data.revision,requestId:'test-wrong-text'})).error);
 const nextDraft=await call('submit_draft',{...draftArgs,baseRevision:draft.data.revision,requestId:'test-draft-2',edits:[{paragraphId:'import-0-0',expectedText:'更新后的测试正文草稿',text:'这里是重新组织后的工作草稿。'}]});assert.ok(!nextDraft.error);assert.equal(store.get(pid).state.overrides['N-test'].anchorNeedsReview,true);
 assert.equal(store.get(pid).state.manuscript.changes.length,2);assert.equal(store.get(pid).state.project.input.内容[0].草稿,'测试正文');
 const current=store.get(pid);current.state.blueprint.drafts['I-0']={...current.state.blueprint.nodes[0],claim:'用户未提交草稿'};store.save({id:pid,baseRevision:current.revision,requestId:'user-draft',state:current.state});
 assert.ok((await call('update_blueprint',{...args,baseRevision:current.revision+1,requestId:'test-draftguard',patch:{claim:'不能覆盖'}})).error);

 let relationCurrent=await call('read_project',{projectId:pid});
 let relRead=await call('read_relations',{projectId:pid});assert.ok(!relRead.error);
 const bodyNow=await call('read_text',{projectId:pid,offset:1,limit:1});const para=bodyNow.data.paragraphs[0];
 const evidence=await call('locate_evidence',{projectId:pid,baseRevision:relationCurrent.data.revision,requestId:'mcp-evidence-new',reason:'协议端到端核查',title:'当前正文证据',sourceType:'paragraph',sourceId:para.id,locator:'第一段',quote:para.text,purpose:'支持当前蓝图',targets:[{kind:'blueprint',id:'I-0'}]});assert.ok(!evidence.error,JSON.stringify(evidence));
 relRead=await call('read_relations',{projectId:pid});assert.equal(relRead.data.evidence.length,1);assert.equal(relRead.data.evidence[0].locationStatus,'位置已核对');
 relationCurrent=await call('read_project',{projectId:pid});const pending=relationCurrent.data.pendingImpacts[0];assert.ok(pending);
 const reviewed=await call('review_impact',{projectId:pid,baseRevision:relationCurrent.data.revision,requestId:'mcp-impact-new',reason:'核查状态边界',id:pending.id,note:'AI已经核对，待用户确认'});assert.ok(!reviewed.error);
 relRead=await call('read_relations',{projectId:pid});assert.equal(relRead.data.impacts.find(i=>i.id===pending.id).status,'review');

 relationCurrent=await call('read_project',{projectId:pid});const candidate=relationCurrent.data.knowledge.find(k=>k.lifecycle==='candidate');assert.ok(candidate);
 const adopted=await call('adopt_decision',{projectId:pid,baseRevision:relationCurrent.data.revision,requestId:'mcp-adopt-explicit',reason:'验证明确指示采用',id:candidate.id,userInstruction:'隔离测试：采用这条测试决定'});assert.ok(!adopted.error);
 assert.equal(store.get(pid).state.knowledge.find(k=>k.id===candidate.id).lifecycle,'active');

 const secondId='p-aaaaaaaaaaaaaaaa';store.addProject({id:secondId,name:'另一个创作',input:{项目名称:'另一个创作',目标:'项目隔离',内容:[{名称:'视频脚本',草稿:'独立内容'}]}});
 const primaryBefore=JSON.stringify(store.get(pid));const secondBefore=JSON.stringify(store.get(secondId));
 assert.ok((await call('read_project',{projectId:secondId})).error);
 assert.ok((await call('record_decision',{projectId:secondId,baseRevision:1,requestId:'wrong-project-test',title:'不能写入',content:'错误项目',reason:'隔离测试',source:'测试',scope:'测试'})).error);
 assert.equal(JSON.stringify(store.get(secondId)),secondBefore);
 assert.ok(!(await call('select_project',{projectId:secondId})).error);
 assert.ok((await call('read_project',{projectId:pid})).error);
 assert.equal((await call('read_project',{projectId:secondId})).data.goal,'项目隔离');
 const otherTransport=new StdioClientTransport({command:process.execPath,args:[path.join(process.env.XUZHANG_TEST_APP||__dirname,'mcp-server.js')],env:{...process.env,XUZHANG_DATA_ROOT:root},stderr:'pipe'});
 const other=new Client({name:'second-connection',version:'1.0.0'});
 try{await other.connect(otherTransport);let initial=await other.callTool({name:'read_project',arguments:{projectId:secondId}});assert.equal(initial.isError,true);await other.callTool({name:'select_project',arguments:{projectId:pid}});assert.ok(!(await call('read_project',{projectId:secondId})).error);assert.equal(JSON.stringify(store.get(pid)),primaryBefore);}finally{await other.close()}

 const settings=await call('update_paper_context',{projectId:secondId,baseRevision:1,requestId:'paper-context-test',reason:'验证论文输入供skill读取',patch:{templateId:'paper-methods',claim:'候选主张，待验证',language:'zh'}});assert.ok(!settings.error,JSON.stringify(settings));
 const paperRead=await call('read_project',{projectId:secondId});assert.equal(paperRead.data.paperContext.routing.paper_type,'methods');assert.equal(paperRead.data.paperContext.settings.claim,'候选主张，待验证');assert.ok(paperRead.data.paperContext.rules.length);assert.ok(paperRead.data.paperContext.missingInputs.includes('关键证据与核查状态'));

 const batch={projectId:secondId,baseRevision:paperRead.data.revision,requestId:'discussion-atomic-001',reason:'核查讨论完整保存',title:'讨论成果隔离验证',goal:'一次保存论证与正文',summary:'保留待核查边界；候选选择尚未采用。',openQuestions:['证据仍待核查'],nextSteps:['核对原始资料'],references:[{kind:'blueprint',id:'I-0'}],operations:[{operation:'update_paper_context',patch:{claim:'整组候选主张'},reason:'记录思路'},{operation:'record_decision',title:'保留边界',content:'候选方案',source:'隔离测试',scope:'本节',reason:'避免过强结论'},{operation:'submit_draft',edits:[{paragraphId:'missing',expectedText:'',text:'不能落库'}],reason:'故意触发末项失败'}]};
 const beforeBatch=JSON.stringify(store.get(secondId)),beforeRevisions=store.db.prepare('SELECT COUNT(*) AS n FROM revisions').get().n;
 assert.ok((await call('submit_discussion',batch)).error);assert.equal(JSON.stringify(store.get(secondId)),beforeBatch);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM revisions').get().n,beforeRevisions);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM requests WHERE id=?').get('mcp:'+batch.requestId).n,0);
 const originalText=(await call('read_text',{projectId:secondId})).data.paragraphs.find(p=>p.type==='paragraph');
 batch.operations[2].edits=[{paragraphId:originalText.id,expectedText:originalText.text,text:'讨论后草稿，待检查。'}];
 const committed=await call('submit_discussion',batch);assert.ok(!committed.error,JSON.stringify(committed));assert.equal(committed.data.revision,batch.baseRevision+1);assert.deepEqual(await call('submit_discussion',batch),committed);
 const afterBatch=store.get(secondId);assert.equal(afterBatch.state.discussions.length,1);assert.equal(afterBatch.state.paper.claim,'整组候选主张');assert.equal(afterBatch.state.knowledge.at(-1).lifecycle,'candidate');assert.equal(afterBatch.state.manuscript.edits[originalText.id].text,'讨论后草稿，待检查。');assert.equal(afterBatch.state.discussions[0].revision,committed.data.revision);
 assert.ok((await call('submit_discussion',{...batch,requestId:'discussion-stale-002'})).error);
 assert.ok((await call('submit_discussion',{...batch,projectId:pid,requestId:'discussion-wrong-project'})).error);
 const oldRecord=structuredClone(afterBatch.state);oldRecord.discussions=[];assert.throws(()=>store.save({id:secondId,baseRevision:afterBatch.revision,requestId:'erase-discussion',state:oldRecord}),/讨论成果/);
 const nextClient=new Client({name:'discussion-continuation',version:'1'}),nextTransport=new StdioClientTransport({command:process.execPath,args:[path.join(process.env.XUZHANG_TEST_APP||__dirname,'mcp-server.js')],env:{...process.env,XUZHANG_DATA_ROOT:root},stderr:'pipe'});
 try{await nextClient.connect(nextTransport);await nextClient.callTool({name:'select_project',arguments:{projectId:secondId}});const resumed=JSON.parse((await nextClient.callTool({name:'read_project',arguments:{projectId:secondId}})).content[0].text);assert.equal(resumed.latestDiscussion.title,batch.title);assert.deepEqual(resumed.latestDiscussion.nextSteps,batch.nextSteps);assert.equal(resumed.paperContext.settings.claim,'整组候选主张')}finally{await nextClient.close()}

 const af=path.join(root,'检索测试.txt');fs.writeFileSync(af,'喷射压力记录：0.4 MPa。\n冷却时间待核对。');const aid='a-1122334455667788';store.addAsset({id:aid,project:secondId,path:af,name:'检索测试.txt',sha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(af)).digest('hex')});
 const idx=await call('index_asset',{projectId:secondId,assetId:aid});assert.equal(idx.data.status,'ready',JSON.stringify(idx));
 const hits=await call('search_assets',{projectId:secondId,query:'喷射压力'});assert.equal(hits.data.results.length,1);const chunk=hits.data.results[0];assert.equal(chunk.locator,'第1行');
 const assetText=await call('read_asset_text',{projectId:secondId,chunkId:chunk.chunkId});assert.match(assetText.data.text,/0.4 MPa/);assert.ok((await call('search_assets',{projectId:pid,query:'喷射压力'})).error);
 const rr=store.get(secondId);const ev=await call('locate_evidence',{projectId:secondId,baseRevision:rr.revision,requestId:'search-evidence-001',reason:'从检索原处登记',title:'喷射压力',sourceType:'asset',sourceId:aid,sourceChunkId:chunk.chunkId,locator:chunk.locator,quote:assetText.data.text,purpose:'核对实验条件',targets:[{kind:'blueprint',id:'I-0'}]});assert.ok(!ev.error,JSON.stringify(ev));

 const cr=store.get(secondId),ce=cr.state.evidence.at(-1);const cl=await call('update_claim_links',{projectId:secondId,baseRevision:cr.revision,requestId:'claim-mcp-001',reason:'核对关联写入',id:'I-0',support:[ce.id],counter:[],conditions:'测试范围',boundary:'不推广',nodes:['I-0'],paragraphs:[originalText.id]});assert.ok(!cl.error,JSON.stringify(cl));const cRead=await call('read_project',{projectId:secondId});assert.equal(cRead.data.claimLinks[0].supportEvidence[0].id,ce.id);assert.equal(cRead.data.claimLinks[0].reviewComplete,false);const dr=await call('read_discussion',{projectId:secondId,discussionId:cRead.data.latestDiscussion.id});assert.ok(dr.data.changes.some(x=>x.key.startsWith('paragraph:')));assert.ok((await call('read_discussion',{projectId:pid,discussionId:cRead.data.latestDiscussion.id})).error);
 console.log('PASS: MCP asset index, Chinese search, read source, wrong project guard and verified evidence');
 console.log('PASS: discussion atomic rollback, one revision, idempotency, stale/wrong-project rejection, immutable history, new connection continuation');
 assert.equal(store.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');console.log('PASS: MCP handshake, 23 tools, read context, write, idempotency, stale conflict, decision, reply, acceptance preserved, draft protection, manuscript updates, original preserved, anchor mapping');console.log(root);
 }finally{await client.close();store.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});

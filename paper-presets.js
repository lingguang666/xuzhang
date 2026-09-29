(function(root){
'use strict';
const fields=[['question','研究问题与意义'],['claim','核心主张'],['facts','已知事实与约束'],['evidence','关键证据与核查状态'],['boundary','适用边界与反例'],['argument','论证顺序'],['openQuestions','待解问题'],['terms','统一术语、缩写与单位'],['allocation','正文、图注、方法与补充材料的安排']];
const rules=[
 '先明确主张、证据和适用边界，再组织章节与句子；缺失事实标为待补，不编造结果、方法、创新性或引用。',
 '区分直接观察、数据支持的推断和待验证假设；结论强度与证据相称，不把“可能”改成“证明”。',
 '按研究意义、新意、可信依据、可复用性和适用范围组织读者需要的信息。',
 '证据靠近它支持的主张；每段承担一个主要任务，避免重复报数、重复结论和无依据的普遍化。',
 '正文保留支撑主要结论的必要证据；细节分别放入图注、方法或补充材料，会改变结论的证据不能藏起来。',
 '术语、缩写、符号和单位使用统一记录；引用标明实际阅读与核查的来源，不把二手解释当作原始数据。',
 '按批注和关联位置局部修改，保留已成立的内容；改动后核对相关章节、图表、引用及术语。',
 'AI修改保留理由和前后记录，待作者检查；未决选择与事实分开保存，不替作者确认结论。'
];
const presets=[
 {id:'paper-research',name:'研究论文',type:'research',description:'从研究问题与实验结果，组织发现、解释及意义。',chain:'研究需要 → 未解决问题 → 研究方案 → 关键证据 → 意义与边界',order:'先整理结果，再组织引言和结论；摘要由全文提炼。',sections:[['引言','为何值得研究，具体缺口是什么？'],['材料与方法','如何得到结果，能否复现？'],['结果','哪些观察直接回答研究问题？'],['讨论','证据怎样支持解释，与已有研究有什么关系？'],['结论','主要发现、意义与适用范围是什么？'],['摘要','用最短的证据链概括全文。']]},
 {id:'paper-methods',name:'方法论文',type:'methods',description:'提出方法，检验公平比较、可复现性与适用条件。',chain:'任务 → 现有方法的不足 → 新方法 → 公平评价 → 可复现性 → 适用边界',order:'先明确方法，再整理比较与验证结果，最后形成引言和摘要。',sections:[['引言','现有方法在哪个任务中存在什么具体不足？'],['方法','关键设计、假设、实现与复现条件是什么？'],['评价与结果','基线、指标和设置是否公平，优势由什么证据支持？'],['讨论','失败情况、资源代价及适用条件是什么？'],['结论','方法解决了什么问题？'],['摘要','概括方法、关键验证与使用价值。']]},
 {id:'paper-review',name:'综述论文',type:'review',description:'按问题综合文献，呈现共识、分歧和有依据的判断。',chain:'范围 → 组织原则 → 证据综合 → 分歧与缺口 → 有依据的立场 → 开放问题',order:'先确定范围和文献组织原则，再综合证据；避免逐篇罗列。',sections:[['范围与问题','覆盖什么主题、时间范围及纳入标准？'],['文献组织与证据','按机制、方法或应用建立怎样的分类？'],['主题综合','不同研究在哪些结论上相互支持或冲突？'],['分歧与研究缺口','差异来自条件、方法还是证据不足？'],['展望与结论','哪些问题值得继续研究，依据是什么？'],['摘要','概括范围、综合判断与价值。']]}
];
function get(id){const p=presets.find(p=>p.id===id);if(!p)throw Error('不支持的论文模板');return p}
function context(id='paper-research'){get(id);return {templateId:id,templateVersion:1,language:'zh',journal:'generic',targetJournal:'',wordLimit:'',...Object.fromEntries(fields.map(([id])=>[id,'']))}}
function validate(v){if(!v||typeof v!=='object'||Array.isArray(v))throw Error('论文设置格式无效');get(v.templateId);if(v.templateVersion!==1)throw Error('论文模板版本不支持');if(!['zh','en','zh-to-en'].includes(v.language)||!['generic','nature','nature-family','nat-comms','nat-mach-intell'].includes(v.journal))throw Error('论文语言或期刊类型无效');for(const f of ['targetJournal','wordLimit',...fields.map(([id])=>id)])if(typeof v[f]!=='string'||v[f].length>100000)throw Error('论文字段无效：'+f);return v}
function initial(input){return input.论文设置?structuredClone(validate(input.论文设置)):undefined}
function effective(s){return s.paper||s.project?.input?.论文设置||(!s.project?context():null)}
function packet(s){const c=effective(s);if(!c)return null;validate(c);const p=get(c.templateId);return {settings:c,templateName:p.name,rules,argumentChain:p.chain,draftingOrder:p.order,missingInputs:fields.filter(([k])=>!c[k].trim()).map(([,label])=>label),routing:{skill:'nature-writing',task:'manuscript',paper_type:p.type,journal:c.journal,language:c.language,note:c.language==='zh'?'保持中文；不要因skill中的zh-to-en默认映射自动翻译。':'按用户选择处理语言；章节随本次任务选择。'},source:{skillVersion:'1.5.0',presetVersion:1,manifest:'nature-writing/manifest.yaml',fragments:['nature-writing/static/core/stance.md','nature-writing/static/core/workflow.md','nature-writing/static/fragments/paper_type/'+p.type+'.md','nature-shared/core/reader-workflow.md','nature-shared/core/terminology-ledger.md'],note:'项目工作规则，参考本机skill整理；不是期刊官方规定。具体投稿要求需另行核查。'}}}
function template(id){const p=get(id);return {format:'xuzhang-project-v1',项目名称:'',作品类型:'论文',目标:'',受众:'',论文设置:context(id),内容:p.sections.map(([名称,问题])=>({名称,问题,核心表达:'',依据:'',推理:'',表达方式:'',草稿:''})),写作要求:[],未决问题:[]}}
const api={presets,fields,rules,get,context,validate,initial,effective,packet,template};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PaperPresets=api;
})(globalThis);

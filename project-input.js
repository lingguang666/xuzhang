'use strict';
const paperPresets=require('./paper-presets');
function fail(msg){throw Object.assign(new Error(msg),{status:400})}
function validateProject(o){o=structuredClone(o);if(o?.论文设置){try{paperPresets.validate(o.论文设置)}catch(e){fail(e.message)}}if(!o||o.format!=='xuzhang-project-v1')fail('需要续章初始化模板 xuzhang-project-v1');if(typeof o.项目名称!=='string'||!o.项目名称.trim()||o.项目名称.length>120)fail('请填写项目名称（最多120字）');if(typeof o.目标!=='string')fail('目标必须是文字');if(!Array.isArray(o.内容)||!o.内容.length||o.内容.length>100)fail('内容部分需要1—100项');for(const n of o.内容){if(!n||typeof n.名称!=='string'||!n.名称.trim())fail('每个内容部分需要名称');for(const k of ['名称','标题','问题','核心表达','依据','推理','表达方式','草稿'])if(n[k]!==undefined&&(typeof n[k]!=='string'||n[k].length>100000))fail('内容字段需为文字且不超过10万字')}for(const k of ['写作要求','未决问题'])if(o[k]!==undefined&&(!Array.isArray(o[k])||o[k].some(x=>typeof x!=='string')))fail(k+'必须为文字列表');o.项目名称=o.项目名称.trim();return o}
module.exports={validateProject};

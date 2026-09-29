'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');fs.mkdirSync(path.join(root,'验证数据'),{recursive:true});
for(const file of ['scripts/build.cjs','verify_relations.cjs','verify_claims_review.cjs','verify_mcp.cjs','verify_projects.cjs','verify_storage.cjs','verify_history.cjs','verify_workstation.cjs','scripts/verify-distribution.cjs']){const r=spawnSync(process.execPath,[path.join(root,file)],{cwd:root,stdio:'inherit',env:process.env});if(r.status!==0)process.exit(r.status||1)}

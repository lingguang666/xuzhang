'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
let ui=read('ui.js');
for(const [name,file] of Object.entries({BLUEPRINT:'blueprint',IMPORTS:'imports',VERSION:'version-ui',PERSISTENCE:'persistence',CLAIMS:'claims-ui',ASSET_SEARCH:'asset-search-ui',DISCUSSION:'discussion-ui',PAPER:'paper-ui',RELATIONS:'relations-ui'}))ui=ui.replace('/* '+name+'_EXTENSION */',read(file+'.js'));
if(/\/\* \w+_EXTENSION \*\//.test(ui))throw Error('Unresolved UI extension');
fs.writeFileSync(path.join(root,'app.js'),read('text-diff.js')+'\n'+read('paper-presets.js')+'\nconst PAPER = '+read('manuscript.json')+';\n'+ui);
console.log('Built app.js');

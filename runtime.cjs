'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const dataRoot=path.resolve(process.env.XUZHANG_DATA_ROOT||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'Xuzhang','data'));
const bundledPython=path.join(__dirname,'runtime','python','python.exe');
module.exports={dataRoot,instance:crypto.createHash('sha256').update(dataRoot.toLowerCase()).digest('hex').slice(0,20),python:process.env.XUZHANG_PYTHON||(fs.existsSync(bundledPython)?bundledPython:(process.platform==='win32'?'python':'python3'))};

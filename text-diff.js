(function(root){'use strict';
// Common ends keep typical edits small; bounded LCS avoids freezing on long rewrites.
function diffText(before,after){before=String(before??'');after=String(after??'');if(before===after)return {runs:[{text:after,added:false}],removed:'',coarse:false};
 let start=0,end=0;while(start<before.length&&start<after.length&&before[start]===after[start])start++;while(end<before.length-start&&end<after.length-start&&before[before.length-1-end]===after[after.length-1-end])end++;
 const a=before.slice(start,before.length-end),b=after.slice(start,after.length-end),runs=[];const push=(text,added)=>{if(!text)return;if(runs.at(-1)?.added===added)runs.at(-1).text+=text;else runs.push({text,added})};push(after.slice(0,start),false);let removed='',coarse=false;
 if(a.length*b.length>1500000){push(b,true);removed=a;coarse=true}else{const width=b.length+1,dp=new Uint32Array((a.length+1)*width);for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)dp[i*width+j]=a[i]===b[j]?1+dp[(i+1)*width+j+1]:Math.max(dp[(i+1)*width+j],dp[i*width+j+1]);let i=0,j=0;while(i<a.length||j<b.length){if(i<a.length&&j<b.length&&a[i]===b[j]){push(b[j++],false);i++}else if(j<b.length&&(i===a.length||dp[i*width+j+1]>=dp[(i+1)*width+j]))push(b[j++],true);else removed+=a[i++]}}
 push(end?after.slice(-end):'',false);return {runs,removed,coarse};
}
if(typeof module!=='undefined'&&module.exports)module.exports={diffText};else root.XuzhangDiff={diffText};
})(typeof globalThis!=='undefined'?globalThis:this);

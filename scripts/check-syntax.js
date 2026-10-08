'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const scanRoots=['server.js','public','src','db','scripts','tests'];
const ignored=new Set(['node_modules','.git','coverage','dist','.cache']);
function collect(relative,output=[]){
  const absolute=path.join(root,relative);
  if(!fs.existsSync(absolute))return output;
  const stat=fs.statSync(absolute);
  if(stat.isDirectory()){
    for(const entry of fs.readdirSync(absolute,{withFileTypes:true})){
      if(ignored.has(entry.name))continue;
      collect(path.join(relative,entry.name),output);
    }
  }else if(relative.endsWith('.js')){
    output.push(relative);
  }
  return output;
}

function main(){
  const files=scanRoots.flatMap(target=>collect(target)).sort();
  if(!files.length)throw new Error('No JavaScript files found');
  const failed=[];
  for(const file of files){
    const result=spawnSync(process.execPath,['--check',path.join(root,file)],{
      encoding:'utf8',timeout:10000,maxBuffer:1024*1024
    });
    if(result.status!==0){
      failed.push({file,message:(result.stderr||result.error?.message||'Unknown syntax failure').trim()});
    }
  }
  if(failed.length){
    for(const failure of failed)console.error('\n'+failure.file+'\n'+failure.message);
    console.error('Syntax check failed: '+failed.length+'/'+files.length);
    process.exitCode=1;
    return;
  }
  console.log('Syntax check passed: '+files.length+' JavaScript files.');
}

if(require.main===module)main();
module.exports={collect,scanRoots};

'use strict';
// V3.2.100: public, read-only identity of the code currently running.
// Coolify provides SOURCE_COMMIT at runtime; do not infer deployed SHA from GitHub.
const {version}=require('../../package.json');
function deployedCommit(env=process.env){
 const candidate=String(env.SOURCE_COMMIT||'').trim();
 return /^[a-f0-9]{40}$/i.test(candidate)?candidate.toLowerCase():null;
}
function releaseInfo(env=process.env){
 const commit=deployedCommit(env);
 return {version,commit,commitKnown:commit!==null};
}
module.exports={deployedCommit,releaseInfo};

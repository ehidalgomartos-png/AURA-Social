'use strict';
// Read-only external smoke check for the currently deployed RedLibertad release.
// Does not authenticate, publish, mutate data, or inspect user content.
const base = 'https://redlibertad.com';
const expectedVersion = process.env.EXPECTED_VERSION || '';
const checks = [
  { path:'/api/health', label:'API health', marker:null },
  { path:'/', label:'Public landing', marker:'RedLibertad' },
  { path:'/social.css?v=3.2.24.1', label:'Mobile polish CSS', marker:'solo-story-v32241' },
  { path:'/social.js?v=3.2.24.1', label:'Mobile polish JavaScript', marker:'only-active-v32241' },
  { path:'/editorial-home-v324.js?v=3.2.24', label:'Editorial feed module', marker:'editorial-feed-card-v3224' },
  { path:'/editorial-interleave-v3224.js?v=3.2.24', label:'2:1 editorial planner', marker:'allowedMode' }
];
async function request(path) {
  const response = await fetch(base + path, {
    redirect:'error',
    signal:AbortSignal.timeout(15000),
    headers:{'Accept':'*/*','Cache-Control':'no-cache','User-Agent':'RedLibertad-ReadOnly-ProductionQA/3.2.24.1'}
  });
  if(response.status!==200)throw Error('HTTP '+response.status);
  return {response, body:await response.text()};
}
async function main() {
  let failures=0;
  for (const check of checks) {
    try {
      const {response,body}=await request(check.path);
      if(check.path==='/api/health') {
        const health=JSON.parse(body);
        if(health.ok!==true||!health.version)throw Error('Unexpected health payload');
        if(expectedVersion && health.version!==expectedVersion)throw Error('Expected '+expectedVersion+' but deployed '+health.version);
        console.log('PASS '+check.label+': version='+health.version+', mode='+String(health.mode||'unknown'));
      } else {
        if(!body.includes(check.marker))throw Error('Expected release marker missing (possibly stale asset)');
        if(check.path==='/') {
          if(!String(response.headers.get('content-type')||'').includes('text/html'))throw Error('Landing did not return HTML');
        }
        console.log('PASS '+check.label+' ['+check.path+']');
      }
    } catch (error) {
      failures++;
      console.error('FAIL '+check.label+' ['+check.path+']: '+String(error.message||error));
    }
  }
  if(failures) {
    console.error('Production QA: '+failures+' failed check(s). Inspect Coolify and deployed commit.');
    process.exitCode=1;
  } else console.log('Production QA: all read-only checks passed. Visual mobile/desktop review still required.');
}
main().catch(error=>{console.error(error);process.exitCode=1});

'use strict';

// Per-process operational telemetry. Only bounded, anonymous aggregate counters.
// Never store URLs, query parameters, user IDs, IP addresses or request bodies.
const WINDOW_MINUTES=15;
const LATENCY_LIMITS_MS=Object.freeze([100,300,700,1500,3000,10000,Infinity]);
const GROUPS=Object.freeze(['auth','posts','profiles','messages','stories','communities','creator','search','media','moderation','admin','other']);

function classifyApiPath(path=''){
  const group=String(path).split('/')[2]||'';
  return GROUPS.includes(group) ? group : group==='relationships'?'profiles' :
    ['discovery','growth','notifications','live','events','shares'].includes(group)?'search':'other';
}

function excludeTelemetry(req){
  if(!String(req.path||'').startsWith('/api/'))return true;
  return ['/api/health','/api/ready','/api/admin/ops/runtime'].includes(req.path);
}

function createRuntimeMonitor({
  now=()=>Date.now(),
  monotonicMs=()=>Number(process.hrtime.bigint())/1e6,
  getMemory=()=>process.memoryUsage(),
  getUptime=()=>process.uptime()
}={}){
  const buckets=new Map();
  function prune(time=now()){
    const oldest=Math.floor(time/60000)-WINDOW_MINUTES+1;
    for(const [key,entry] of buckets){
      if(entry.minute<oldest || entry.minute>Math.floor(time/60000))buckets.delete(key);
    }
  }
  function record({path,method='GET',status=200,durationMs=0,at=now()}){
    if(!String(path||'').startsWith('/api/') || ['/api/health','/api/ready','/api/admin/ops/runtime'].includes(path))return;
    prune(at);
    const group=classifyApiPath(path);
    const minute=Math.floor(at/60000);
    const key=group+':'+minute;
    let counter=buckets.get(key);
    if(!counter){
      counter={minute,group,total:0,serverErrors:0,clientErrors:0,rateLimited:0,slow:0,durationTotal:0,latencies:Array(LATENCY_LIMITS_MS.length).fill(0)};
      buckets.set(key,counter);
    }
    counter.total++;
    if(status>=500)counter.serverErrors++;
    else if(status>=400)counter.clientErrors++;
    if(status===429)counter.rateLimited++;
    const ms=Math.max(0,Number.isFinite(durationMs)?durationMs:0);
    if(ms>=1500)counter.slow++;
    counter.durationTotal+=ms;
    const ix=LATENCY_LIMITS_MS.findIndex(bound=>ms<=bound);
    counter.latencies[ix]++;
  }
  function middleware(req,res,next){
    if(excludeTelemetry(req))return next();
    const start=monotonicMs();
    let accounted=false;
    const commit=status=>{
      if(accounted)return;
      accounted=true;
      if(String(res.getHeader?.('Content-Type')||'').startsWith('text/event-stream'))return;
      record({path:req.path,method:req.method,status,durationMs:monotonicMs()-start});
    };
    res.once('finish',()=>commit(res.statusCode));
    res.once('close',()=>commit(res.writableEnded?res.statusCode:499));
    next();
  }
  function snapshot(){
    prune();
    const totals={requests:0,serverErrors:0,clientErrors:0,rateLimited:0,slow:0,latencies:Array(LATENCY_LIMITS_MS.length).fill(0),durationTotal:0};
    const byGroup=new Map();
    for(const bucket of buckets.values()){
      for(const dest of [totals,byGroup.get(bucket.group)||(()=>{
        const x={category:bucket.group,requests:0,serverErrors:0,clientErrors:0,rateLimited:0,slow:0,latencies:Array(LATENCY_LIMITS_MS.length).fill(0),durationTotal:0};
        byGroup.set(bucket.group,x);return x;
      })()]){
        dest.requests+=bucket.total;
        dest.serverErrors+=bucket.serverErrors;
        dest.clientErrors+=bucket.clientErrors;
        dest.rateLimited+=bucket.rateLimited;
        dest.slow+=bucket.slow;
        dest.durationTotal+=bucket.durationTotal;
        bucket.latencies.forEach((n,i)=>{dest.latencies[i]+=n;});
      }
    }
    const format=item=>{
      const target=Math.ceil(item.requests*0.95);
      let count=0,p95Ms=0;
      for(let i=0;i<item.latencies.length;i++){
        count+=item.latencies[i];
        if(count>=target && target>0){
          p95Ms=LATENCY_LIMITS_MS[i]===Infinity?10000:LATENCY_LIMITS_MS[i];
          break;
        }
      }
      return {
        ...(item.category?{category:item.category}:{}),
        requests:item.requests,
        serverErrors:item.serverErrors,
        clientErrors:item.clientErrors,
        rateLimited:item.rateLimited,
        slow:item.slow,
        errorRatePct:item.requests?Math.round(item.serverErrors*1000/item.requests)/10:0,
        slowRatePct:item.requests?Math.round(item.slow*1000/item.requests)/10:0,
        avgMs:item.requests?Math.round(item.durationTotal/item.requests):0,
        p95UpperBoundMs:p95Ms
      };
    };
    const overall=format(totals);
    const groups=[...byGroup.values()].map(format).sort((a,b)=>b.requests-a.requests);
    const rss=getMemory().rss;
    let level='ok';
    if(overall.requests>=20 && (overall.errorRatePct>=5||overall.slowRatePct>=20))level='critical';
    else if(overall.serverErrors>=3 || overall.slow>=5)level='warning';
    return {
      windowMinutes:WINDOW_MINUTES,
      scope:'single_instance',
      generatedAt:new Date(now()).toISOString(),
      uptimeSeconds:Math.round(getUptime()),
      rssMB:Math.round(rss/1048576),
      level,overall,groups,
      sampleNote:overall.requests<20?'Muestra pequeña: las tasas pueden fluctuar.':''
    };
  }
  return {middleware,snapshot,record,prune,debugBucketCount:()=>buckets.size};
}

module.exports={createRuntimeMonitor,classifyApiPath,excludeTelemetry,WINDOW_MINUTES};

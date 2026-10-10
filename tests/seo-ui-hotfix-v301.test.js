'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('public/social.js');
const css=read('public/social.css');

function extract(startMarker,endMarker,suffix){
  const start=js.indexOf(startMarker);
  const end=js.indexOf(endMarker,start);
  assert.ok(start>=0&&end>start,'Missing Story handler markers');
  return js.slice(start,end)+'\n'+suffix;
}
function storyScenario(stories,person={id:3}){
  const calls=[];
  const groups=new Map();
  for(const story of stories){
    const key=String(story.user_id);
    groups.set(key,[...(groups.get(key)||[]),story]);
  }
  const context={
    visibleStories:stories,storyGroups:groups,me:person,
    showView:name=>calls.push(['view',name]),
    loadStories:async()=>calls.push(['loaded']),
    openStoryViewer:(user,index)=>calls.push(['open',user,index]),
    toast:s=>calls.push(['toast',s]),
    document:{querySelector:()=>({scrollIntoView:()=>calls.push(['scroll'])})},
    window:{scrollTo:()=>{}},
    loadFeed:async()=>{},
    loadMe:async()=>{},
    openSocialList:async()=>{}
  };
  const fn=vm.runInNewContext(extract('async function handleReturnPulseAction(action) {','function growthInviteUrl(code)', 'handleReturnPulseAction'),context);
  return {fn,calls};
}

test('unseen Stories shortcut opens the first eligible, not gated, not self Story',async()=>{
  const scenarios=storyScenario([
    {id:7,user_id:3,viewed_by_me:false,gated:false},
    {id:8,user_id:9,viewed_by_me:true,gated:false},
    {id:9,user_id:10,viewed_by_me:false,gated:true},
    {id:11,user_id:10,viewed_by_me:false,gated:false}
  ]);
  await scenarios.fn('stories');
  assert.deepEqual(scenarios.calls.slice(0,3),[
    ['view','feed'],['loaded'],['open',10,1]
  ]);
  assert.ok(!scenarios.calls.some(x=>x[0]==='scroll'));
});

test('when no unseen accessible Stories remain, shortcut scrolls and explains',async()=>{
  const scenario=storyScenario([{id:9,user_id:10,viewed_by_me:true,gated:false}]);
  await scenario.fn('stories');
  assert.ok(scenario.calls.some(x=>x[0]==='scroll'));
  assert.ok(scenario.calls.some(x=>x[0]==='toast'));
  assert.ok(!scenario.calls.some(x=>x[0]==='open'));
});

test('viewed Story immediately invalidates and refreshes the pending count',()=>{
  const source=extract('async function markStoryViewed(story){','function openStoryViewer(userId,index=0)', 'markStoryViewed');
  const context={
    api:async()=>({r:{ok:true}}),
    me:{id:3},storyGroups:new Map([['10',[{id:11,user_id:10,viewed_by_me:false}]]]),
    document:{querySelector:()=>({classList:{toggle:()=>{}}})},
    CSS:{escape:x=>x},
    returnPulseLoaded:true,
    loadReturnPulse:()=>{context.pulseUpdates++;return Promise.resolve();},
    pulseUpdates:0
  };
  const fn=vm.runInNewContext(source,context);
  const story=context.storyGroups.get('10')[0];
  return fn(story).then(()=>{
    assert.equal(story.viewed_by_me,true);
    assert.equal(context.returnPulseLoaded,false);
    assert.equal(context.pulseUpdates,1);
  });
});

test('Topics sitemap never returns an empty URL set',()=>{
  const s=read('src/public-topics-v185.js');
  assert.match(s,/if\(!urls\.length\)urls\.push\('/);
  assert.match(s,/o\+'\/temas'/);
  assert.match(s,/people\+c\.communities\+c\.posts>=2/);
});
test('Reels sitemap uses public directory if there are no eligible videos',()=>{
  const s=read('src/public-media-seo-v182.js');
  assert.match(s,/r\.rows\.length\?r\.rows\.map/);
  assert.match(s,/esc\(o\+'\/reels'\)/);
  assert.match(s,/p\.post_kind='reel'/);
});
test('Events and communities emit indexable directories for empty collections',()=>{
  const e=read('src/public-event-seo-v181.js');
  const c=read('src/public-community-seo-v180.js');
  assert.match(e,/if\(!urls\.length\)urls\.push/);
  assert.match(e,/o\+'\/eventos'/);
  assert.match(c,/if\(!urls\.length\)urls\.push/);
  assert.match(c,/o\+'\/comunidades'/);
  assert.match(c,/c\.privacy='public'/);
});
test('Hashtags and profiles sitemaps have safe public fallbacks',()=>{
  const s=read('server.js');
  assert.match(s,/if\(!urls\.length\)urls\.push.*origin\+'\/perfiles'/);
  assert.match(s,/if\(!urls\.length\)urls\.push.*origin\+'\/publicaciones'/);
  assert.match(s,/p\.content_level='normal'/);
});
test('sitemaps preserve correct XML envelopes and index routing',()=>{
  const sources=['server.js','src/public-topics-v185.js',
    'src/public-community-seo-v180.js','src/public-event-seo-v181.js',
    'src/public-media-seo-v182.js'];
  for(const file of sources){
    const s=read(file);
    assert.ok(s.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'),file);
    assert.ok(s.includes('</urlset>'),file);
  }
  const server=read('server.js');
  assert.match(server,/\/sitemap-index\.xml/);
  assert.match(server,/\/sitemap-topics\.xml/);
  assert.match(server,/\/sitemap-communities\.xml/);
});
test('profile cover and edit-preview show uncropped media on phone and desktop',()=>{
  assert.match(css,/\.profile-full \.cover\{[\s\S]*?background-size:contain/);
  assert.match(css,/\.profile-edit-cover-preview:not\(\.empty\)\{[\s\S]*?background-size:contain/);
  assert.match(css,/@media\(max-width:460px\)/);
  assert.match(css,/background-repeat:no-repeat/);
});
test('light Connections circle filters use readable contrast and clear focus',()=>{
  assert.match(css,/\.connections-center-toolbar \.connection-circle-filters button\{[\s\S]*?color:#173a52/);
  assert.match(css,/\.connections-center-toolbar \.connection-circle-filters button\.active\{[\s\S]*?color:#06574e/);
  assert.match(css,/\.connections-center-toolbar \.connection-circle-filters button span\{/);
  assert.match(css,/\.connections-center-toolbar \.connection-circle-filters button:focus-visible/);
});
test('existing profile previews and shared Connections views remain present',()=>{
  const html=read('public/app.html');
  const s=read('public/social.js');
  assert.match(s,/id="profileFull"|#profileFull/);
  assert.match(html,/profile-edit-cover-preview/);
  assert.match(html,/id="connectionsCenterCircleFilters"/);
  assert.match(s,/renderConnectionsCenterCircleFilters/);
});
test('release version and CI include this hotfix suite',()=>{
  const pkg=require('../package.json');
  assert.match(pkg.version,/^3\.[0-9]+\.[0-9]+(?:\.[0-9]+|\+[0-9a-z.-]+)?$/);
  assert.match(read('server.js'),new RegExp("const APP_VERSION='"+pkg.version.replace(/\+polish\./,'.').replace(/\./g,'\\.')+"'"));
  assert.match(pkg.scripts['test:hotfix'],/seo-ui-hotfix-v301\.test\.js/);
  assert.match(read('.github/workflows/validate-js.yml'),/npm run test:hotfix/);
});

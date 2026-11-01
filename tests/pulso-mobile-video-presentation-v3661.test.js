'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {renderPage,renderCard,cleanVideo,PUBLIC_VIDEO_SQL}=require('../src/routes/pulso-v3658');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const full=cleanVideo({
 id:'42',username:'creador_real',display_name:'Persona creadora',
 media_url:'/uploads/reels/reel42.mp4',caption:'Un título real. '.repeat(25),
 avatar_url:null,like_count:1,comment_count:2
});
test('V3.6.61: vídeo conserva su tamaño y proporciones sin zoom automático',()=>{
 const css=read('public/pulso-mobile-v3661.css');
 assert.match(css,/\.pulso-card \.pulso-video\{/);
 assert.match(css,/object-fit:contain;object-position:center/);
 assert.match(css,/\.pulso-card \.pulso-video\{object-fit:contain!important/);
 assert.doesNotMatch(css,/object-fit:cover|transform:scale\(/);
 assert.match(css,/env\(safe-area-inset-bottom,0px\)/);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/@media\(max-width:390px\)/);
});
test('V3.6.61: una descripción larga no tapa el vídeo y se puede desplegar',()=>{
 const html=renderCard(full);
 assert.match(html,/class="pulso-caption pulso-caption-clamped-v3661"/);
 assert.match(html,/class="pulso-caption-toggle-v3661"/);
 assert.match(html,/aria-expanded="false"/);
 assert.match(html,/aria-controls="pulso-caption-42"/);
 assert.match(html,/Ver descripción completa/);
 const short=renderCard({...full,caption:'Un vídeo corto'});
 assert.doesNotMatch(short,/pulso-caption-clamped-v3661|pulso-caption-toggle-v3661/);
 const css=read('public/pulso-mobile-v3661.css');
 assert.match(css,/-webkit-line-clamp:3/);
 assert.match(css,/\.pulso-caption-clamped-v3661\.is-expanded-v3661/);
 assert.match(css,/:focus-visible/);
 const js=read('public/pulso-mobile-v3661.js');
 assert.match(js,/addEventListener\('click'/);
 assert.match(js,/aria-controls/);
 assert.match(js,/aria-expanded/);
 assert.match(js,/textContent=expanded\?'Ver descripción completa':'Ver menos'/);
 assert.doesNotMatch(js,/innerHTML|fetch\(|localStorage|sendBeacon/);
});
test('V3.6.61: Reels cargados posteriormente reciben los mismos controles de descripción',()=>{
 const client=read('public/pulso-v3658.js');
 assert.match(client,/caption=String\(item.caption\)\.slice\(0,700\)/);
 assert.match(client,/pulso-caption-clamped-v3661/);
 assert.match(client,/pulso-caption-toggle-v3661/);
 assert.match(client,/toggle\.dataset\.pulsoCaptionToggle=''/);
 const html=renderPage([full],true);
 assert.match(html,/pulso-mobile-v3661\.css\?v=3.6.61/);
 assert.match(html,/pulso-mobile-v3661\.js\?v=3.6.61/);
 assert.match(html,/data-pulso-item/);
});
test('V3.6.61: página individual Reel es diferente del feed y enlaza de nuevo con Pulso',()=>{
 const publicRoute=read('src/public-media-seo-v182.js');
 assert.match(publicRoute,/const pulsoStyle=video\?/);
 assert.match(publicRoute,/pulso-reel-detail-v3661\.css\?v=3.6.61/);
 assert.match(publicRoute,/rp reel-pulso-frame-v3661/);
 assert.match(publicRoute,/reel-pulso-layout-v3661/);
 assert.match(publicRoute,/class="button ghost reel-pulso-explore-v3661" href="\/pulso">Explorar Pulso/);
 const css=read('public/pulso-reel-detail-v3661.css');
 assert.match(css,/\.reel-pulso-frame-v3661 video\{/);
 assert.match(css,/object-fit:contain/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.doesNotMatch(css,/object-fit:cover|transform:scale\(/);
});
test('V3.6.61: no se cambian los Reels, privacidad, multimedia, ni autores',()=>{
 const route=read('src/routes/pulso-v3658.js');
 const content=read('src/public-media-seo-v182.js');
 for(const criterion of [
  "p.moderation_status='published'","p.audience='public'",
  "p.content_level='normal'","p.post_kind='reel'",
  "p.media_type='video'","u.status='active'",
  "u.is_admin=false","u.discoverable=true"
 ])assert.ok(PUBLIC_VIDEO_SQL.includes(criterion),criterion);
 assert.match(content,/const publicFilter="p\.moderation_status='published'/);
 assert.match(route,/renderPage\(\[\],false,\{unavailable:true\}\)/);
 assert.doesNotMatch(read('public/pulso-mobile-v3661.js'),/api\/posts|api\/profiles/);
});

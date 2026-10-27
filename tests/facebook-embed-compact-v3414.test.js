'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('public/social-embeds-v341.js','utf8');
const context={window:{},URL};
vm.runInNewContext(src,context);
const {parse,activate,facebookFrameHeightV3414}=context.window.RedLibertadSocialEmbedsV341;
const fb=parse('https://www.facebook.com/pagina/posts/pfbid01XYabcde');
function node(type,width=0){
 return {type,clientWidth:width,children:[],attributes:{},
   getBoundingClientRect(){return {width};},
   getAttribute(n){return this.attributes[n]||null},
   setAttribute(n,v){this.attributes[n]=String(v)},
   replaceChildren(...items){this.children=items},
   appendChild(item){this.children.push(item);return item}};
}
const documentAt=width=>({createElement:type=>node(type,type==='div'?width:0)});
test('the original oversized 725px desktop embed is replaced by a compact height',async()=>{
 const root=node('root');
 await activate(fb,root,documentAt(600),{});
 const [area,footer]=root.children;
 const iframe=area.children[0];
 assert.equal(iframe.width,'500');
 assert.equal(iframe.height,'525');
 assert.equal(footer.children[0].href,fb.url);
 const expand=footer.children[1];
 assert.equal(expand.getAttribute('aria-expanded'),'false');
 assert.equal(expand.textContent,'Ampliar publicación');
 expand.onclick();
 assert.equal(iframe.height,'1075');
 assert.equal(expand.getAttribute('aria-expanded'),'true');
 expand.onclick();
 assert.equal(iframe.height,'525');
 assert.equal(expand.getAttribute('aria-expanded'),'false');
});
test('on mobile the iframe shrinks together with its content, not to 570px',async()=>{
 for(const width of [320,348,390]){
  const root=node('root');
  await activate(fb,root,documentAt(width),{});
  const iframe=root.children[0].children[0];
  assert.equal(Number(iframe.height),Math.round(width*1.05));
  assert.ok(Number(iframe.height)<570);
  assert.match(iframe.src,new RegExp('width='+width+'$'));
 }
});
test('Facebook long posts remain accessible with expansion and original links',async()=>{
 const root=node('root');await activate(fb,root,documentAt(348),{});
 const button=root.children[1].children[1];
 button.onclick();
 assert.equal(root.children[0].children[0].height,'760');
 assert.equal(root.children[1].children[0].href,fb.url);
 assert.match(root.children[1].children[0].rel,/noopener/);
});
test('Facebook sizing never alters other providers or triggers third-party loads by itself',()=>{
 const tiktok=parse('https://www.tiktok.com/@usuario/video/7483917201198731264');
 assert.ok(tiktok);
 assert.ok(facebookFrameHeightV3414(350)<570);
 assert.doesNotMatch(src,/autoPlay\s*=\s*true/i);
 const s=fs.readFileSync('public/facebook-auto-v3413.js','utf8');
 assert.match(s,/MAX_AUTO_PER_PAGE=6/);
 assert.match(s,/isEnabled\(\)/);
 assert.ok(!s.includes('fetch('));
});
test('CSS removes the Facebook minimum height while preserving mobile and offline scripts',()=>{
 const css=fs.readFileSync('public/social.css','utf8');
 const html=fs.readFileSync('public/app.html','utf8');
 const ci=fs.readFileSync('.github/workflows/validate-js.yml','utf8');
 const custom=css.slice(css.indexOf('/* V3.4.1.2 — Facebook embeds'));
 assert.match(custom,/min-height:0;/);
 assert.doesNotMatch(custom,/min-height:570px/);
 assert.match(custom,/social-embed-more-v3414/);
 assert.match(html,/social-card=3\.4\.1\.4/);
 assert.match(html,/social-embeds-v341\.js\?v=3\.4\.1\.4/);
 assert.match(ci,/facebook-embed-compact-v3414\.test\.js/);
});

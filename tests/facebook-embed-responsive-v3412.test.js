'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/social-embeds-v341.js','utf8');
const sandbox={window:{},URL};vm.runInNewContext(source,sandbox);
const {parse,playerUrl,activate,facebookEmbedWidthV3412,facebookFrameHeightV3414}=sandbox.window.RedLibertadSocialEmbedsV341;
const post=parse('https://www.facebook.com/RedLibertad/posts/pfbid01XYabcde');
const reel=parse('https://www.facebook.com/reel/783920193845112');
const tiktok=parse('https://www.tiktok.com/@usuario/video/7483917201198731264');

function node(type,width=0){
 return {type,clientWidth:width,children:[],attributes:{},
  setAttribute(name,value){this.attributes[name]=String(value)},
  getAttribute(name){return this.attributes[name]||null},
  getBoundingClientRect(){return {width};},
  replaceChildren(...items){this.children=[...items]},
  appendChild(item){this.children.push(item);return item}};
}
function doc(width){
 return {createElement:type=>node(type,type==='div'?width:0)};
}

test('Facebook embeds use a bounded plugin width and reject bogus dimensions',()=>{
 for(const [input,expected] of [[undefined,500],[0,500],[-1,500],[NaN,500],[350.9,350],[180,280],[999,500]]){
  assert.equal(facebookEmbedWidthV3412(input),expected);
 }
 assert.match(playerUrl(post,350),/&show_text=true&width=350$/);
 assert.match(playerUrl(reel,350),/^https:\/\/www\.facebook\.com\/plugins\/video\.php/);
 assert.equal(playerUrl(tiktok,350),'https://www.tiktok.com/player/v1/7483917201198731264?autoplay=0&music_info=1&description=1');
 assert.equal(playerUrl({...post,url:'https://evil.example/'},350),null);
});

test('desktop Facebook post stays compact with an accessible expand control',async()=>{
 const root=node('root'),document=doc(638);
 assert.equal(await activate(post,root,document,{}),true);
 const iframe=root.children[0].children[0];
 assert.equal(iframe.width,'500');
 assert.equal(iframe.height,'525');
 const expand=root.children[1].children[1];
 assert.equal(expand.textContent,'Ampliar publicación');
 assert.equal(expand.getAttribute('aria-expanded'),'false');
 expand.onclick();
 assert.equal(expand.getAttribute('aria-expanded'),'true');
 assert.equal(iframe.height,'1075');
 assert.equal(expand.textContent,'Reducir publicación');
 expand.onclick();
 assert.equal(iframe.height,'525');
 assert.equal(iframe.src,playerUrl(post,500));
 assert.equal(iframe.loading,'lazy');
 assert.equal(root.children[1].children[0].href,post.url);
 assert.match(root.children[1].children[0].rel,/noopener/);
});

test('mobile Facebook embed requests actual narrow width, not a clipped 500px plugin',async()=>{
 const root=node('root'),document=doc(348);
 assert.equal(await activate(post,root,document,{}),true);
 const iframe=root.children[0].children[0];
 assert.equal(iframe.width,'348');
 assert.match(iframe.src,/&width=348$/);
 assert.equal(iframe.height,'365');
 assert.equal(facebookFrameHeightV3414(348),365);
 assert.equal(facebookFrameHeightV3414(348,true),760);
 assert.equal(root.children[1].children[0].href,post.url);
});

test('Facebook reels get responsive video plugin without changing the safe host',async()=>{
 const root=node('root'),document=doc(390);
 assert.equal(await activate(reel,root,document,{}),true);
 const iframe=root.children[0].children[0];
 assert.match(iframe.src,/^https:\/\/www\.facebook\.com\/plugins\/video\.php\?/);
 assert.match(iframe.src,/width=390$/);
 assert.equal(iframe.width,'390');
});

test('TikTok still loads its existing official player with no Facebook dimensions',async()=>{
 const root=node('root'),document=doc(350);
 assert.equal(await activate(tiktok,root,document,{}),true);
 const iframe=root.children[0].children[0];
 assert.equal(iframe.src,playerUrl(tiktok));
 assert.equal(iframe.width,undefined);
});

test('CSS restricts Facebook width, keeps the external link visible and refreshes code',()=>{
 const css=fs.readFileSync('public/social.css','utf8');
 const html=fs.readFileSync('public/app.html','utf8');
 const ci=fs.readFileSync('.github/workflows/validate-js.yml','utf8');
 assert.match(css,/data-social-card="facebook"\] \.social-embed-active-v341 iframe/);
 assert.match(css,/max-width:500px/);
 assert.match(css,/min-height:0;/);
 assert.match(css,/margin-inline:auto/);
 assert.match(css,/\.social-embed-fallback-v341/);
 assert.match(html,/social-card=3\.4\.1\.7/);
 assert.match(html,/social-embeds-v341\.js\?v=3\.4\.1\.7/);
 assert.match(ci,/facebook-embed-responsive-v3412\.test\.js/);
});

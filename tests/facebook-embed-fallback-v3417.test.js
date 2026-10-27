'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/social-embeds-v341.js','utf8');
const sandbox={window:{},URL};
vm.runInNewContext(source,sandbox);
const {parse,activate}=sandbox.window.RedLibertadSocialEmbedsV341;
function node(type,width=350){
 return {type,children:[],attributes:{},clientWidth:width,className:'',
 getBoundingClientRect(){return {width};},
 setAttribute(key,val){this.attributes[key]=String(val)},
 getAttribute(key){return this.attributes[key]||null},
 appendChild(item){this.children.push(item);return item},
 replaceChildren(...items){this.children=[...items]}};
}
const doc={createElement:type=>node(type)};
test('unavailable Facebook iframe offers a compact, explicit fallback while keeping original link',async()=>{
 const info=parse('https://www.facebook.com/pagina/posts/pfbid01XYabcde');
 const root=node('root');
 assert.equal(await activate(info,root,doc,{}),true);
 const [area,footer]=root.children;
 const frame=area.children[0],link=footer.children[0],expand=footer.children[1],hide=footer.children[2];
 assert.equal(frame.type,'iframe');
 assert.equal(link.href,info.url);
 assert.match(link.rel,/noopener/);
 assert.match(hide.textContent,/Ocultar vista previa/);
 hide.onclick();
 assert.equal(area.children.length,1);
 assert.equal(area.children[0].type,'p');
 assert.match(area.children[0].textContent,/Facebook no puede mostrar/);
 assert.match(area.className,/social-embed-unavailable-v3417/);
 assert.equal(expand.hidden,true);
 assert.equal(hide.hidden,true);
 assert.equal(link.href,info.url);
});
test('iframe network error collapses automatically without affecting normal loaded embeds',async()=>{
 const info=parse('https://www.facebook.com/reel/783920193845112'),root=node('root');
 await activate(info,root,doc,{});
 const area=root.children[0],frame=area.children[0];
 assert.equal(typeof frame.onerror,'function');
 frame.onerror();
 assert.equal(area.children.length,1);
 assert.equal(root.children[1].children[0].href,info.url);
});
test('TikTok, Instagram, X and unsafe URL policy remain unchanged',async()=>{
 const tiktok=parse('https://www.tiktok.com/@alba/video/7483917201198731264');
 const root=node('root');
 assert.equal(await activate(tiktok,root,doc,{}),true);
 assert.equal(root.children[0].children[0].type,'iframe');
 assert.equal(root.children[1].children.length,1);
 assert.equal(parse('https://facebook.com.evil.test/reel/783920193845112'),null);
 const js=fs.readFileSync('public/social-embeds-v341.js','utf8');
 assert.match(js,/instagram:'https:\/\/www\.instagram\.com\/embed\.js'/);
 assert.match(js,/x:'https:\/\/platform\.x\.com\/widgets\.js'/);
 assert.doesNotMatch(js,/fetch\(/);
});
test('Facebook CSS, updated app cache busting and CI test wiring',()=>{
 const css=fs.readFileSync('public/social.css','utf8');
 const html=fs.readFileSync('public/app.html','utf8');
 const actions=fs.readFileSync('.github/workflows/validate-js.yml','utf8');
 assert.match(css,/social-embed-unavailable-v3417/);
 assert.match(css,/social-embed-hide-v3417/);
 assert.match(html,/social-embeds-v341\.js\?v=3\.4\.1\.7/);
 assert.match(actions,/facebook-embed-fallback-v3417\.test\.js/);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.6.10: atajos internos a secciones realmente existentes sin duplicar módulos',()=>{
 const html=read('public/admin.html');
 const nav=html.match(/<nav class="admin-quick-nav-v3610"[\s\S]*?<\/nav>/);
 assert.ok(nav,'Faltan atajos');
 const anchors=[...nav[0].matchAll(/href="#([^"]+)"/g)].map(m=>m[1]);
 const expected=['admin-users-v3610','admin-reports-v3610','editorialInbox','admin-growth-v3610','admin-seo-v3610','admin-alerts-v3610'];
 assert.deepEqual(anchors.filter(id=>expected.includes(id)),expected,'La navegación original conserva sus accesos y orden');
 assert.equal(new Set(anchors).size,anchors.length,'No debe haber destinos repetidos');
 for(const id of anchors){
   assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(nav[0],/href="\/resuelve\/admin"/);
 assert.match(nav[0],/href="\/admin\/actividad"/);
 assert.match(html,/id="users" class="user-list"/);
 assert.match(html,/id="reports" class="report-list"/);
});
test('V3.6.10: navegación responsiva usable por teclado sin recargar acciones',()=>{
 const css=read('public/admin.css');
 const block=css.slice(css.indexOf('/* V3.6.10'));
 assert.ok(block.startsWith('/* V3.6.10'));
 assert.match(block,/\.admin-quick-nav-v3610/);
 assert.match(block,/min-height:44px/);
 assert.match(block,/:focus-visible/);
 assert.match(block,/@media\(max-width:620px\)/);
 assert.match(block,/overflow-x:auto/);
 assert.match(block,/scroll-margin-top:94px/);
 assert.doesNotMatch(block,/display:none|overflow:hidden|position:fixed/);
});

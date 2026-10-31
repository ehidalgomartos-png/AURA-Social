'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.6.8: todos los accesos del menú privado apuntan a secciones existentes',()=>{
 const html=read('src/views/resuelve-admin-v3519.html');
 const nav=html.match(/<nav class="resuelve-admin-tabs"[\s\S]*?<\/nav>/);
 assert.ok(nav);
 const anchors=[...nav[0].matchAll(/href="#([a-z]+)"/g)].map(m=>m[1]);
 assert.deepEqual(anchors,['trabajo','impacto','seo','actividad','soluciones','confianza','avisos']);
 for(const id of anchors)assert.ok(html.includes('id="'+id+'"'),'Falta sección '+id);
 assert.match(html,/id="resuelveAdminContent" hidden/);
 assert.match(html,/noindex,nofollow,noarchive/);
});
test('V3.6.8: menú móvil desplazable, con foco y sin ocultar contenido',()=>{
 const css=read('public/resuelve-admin-v3519.css');
 const v=css.slice(css.indexOf('/* V3.6.8'));
 assert.ok(v.startsWith('/* V3.6.8'));
 assert.match(v,/overflow-x:auto/);
 assert.match(v,/flex-wrap:nowrap/);
 assert.match(v,/scroll-snap-type:x proximity/);
 assert.match(v,/:focus-visible/);
 assert.match(v,/@media\(max-width:650px\)/);
 assert.match(v,/scroll-margin-top:95px/);
 assert.doesNotMatch(v,/display:none|visibility:hidden/);
});

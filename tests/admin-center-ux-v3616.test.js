'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.6.16: cabecera identifica ambos centros sin información obsoleta',()=>{
 const html=read('public/admin.html');
 assert.match(html,/<title>Centro de administración \| RedLibertad y Resuelve<\/title>/);
 assert.match(html,/<h1>Centro de administración<\/h1>/);
 assert.match(html,/Las decisiones de moderación siempre requieren revisión humana/);
 assert.match(html,/class="admin-header-context-v3616"/);
 assert.match(html,/RedLibertad · Resuelve/);
 assert.doesNotMatch(html,/V2\.19 · Centro de crecimiento/);
 assert.equal((html.match(/<h1\b/g)||[]).length,1);
 const hero=html.slice(html.indexOf('<section class="admin-hero">'),html.indexOf('<nav class="admin-quick-nav'));
 assert.match(hero,/class="admin-hero-links-v3616"/);
 for(const href of ['/admin/actividad','/resuelve/admin'])
  assert.ok(hero.includes('href="'+href+'"'),href);
 assert.match(hero,/id="metrics"/);
});

test('V3.6.16: navegación conservada, destinos reales y pista móvil accesible',()=>{
 const html=read('public/admin.html');
 const css=read('public/admin.css');
 const nav=html.match(/<nav class="admin-quick-nav-v3610"[\s\S]*?<\/nav>/)?.[0];
 assert.ok(nav);
 assert.match(nav,/aria-describedby="adminQuickHintV3616"/);
 assert.match(html,/id="adminQuickHintV3616">Desliza las pestañas/);
 const links=[...nav.matchAll(/href="#([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(links).size,links.length);
 for(const id of links)assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 for(const target of ['admin-overview-v3611','admin-priorities-v3612','admin-users-v3610','admin-reports-v3610','admin-growth-v3610','admin-seo-v3610','admin-alerts-v3610'])
  assert.ok(links.includes(target),target);
 const block=css.slice(css.lastIndexOf('/* V3.6.16'));
 assert.ok(block.startsWith('/* V3.6.16'));
 assert.match(block,/\.admin-hero-links-v3616/);
 assert.match(block,/\.admin-quick-hint-v3616/);
 assert.match(block,/@media\(max-width:620px\)/);
 assert.match(block,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(block,/min-height:44px/);
 assert.match(block,/scrollbar-width:thin/);
 assert.match(block,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(block,/pointer-events:none|overflow:hidden|visibility:hidden/i);
});

test('V3.6.16: panel mantiene módulos de actividad, Resuelve y moderación',()=>{
 const html=read('public/admin.html');
 for(const id of ['adminOverviewSocialV3611','adminOverviewHelpV3611',
  'priorityTechCardV3612','priorityHelpCardV3612','reports','users']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(html,/href="\/admin\/actividad"/);
 assert.match(html,/href="\/resuelve\/admin"/);
 assert.match(html,/src="\/admin-priorities-v3612\.js" defer/);
 assert.match(html,/src="\/admin-overview-v3611\.js" defer/);
 const api=read('src/routes/admin-activity-v3317.js');
 assert.match(api,/requireAdmin/);
 const services=read('src/routes/admin-alerts-v215.js');
 assert.match(services,/requireAdmin/);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.5.33: public introduction explains real person-to-person help without sales pressure',()=>{
 const html=read('public/resuelve-como-funciona-v3533.html');
 assert.match(html,/<html lang="es">/);
 assert.match(html,/<title>Cómo funciona Resuelve/);
 assert.match(html,/meta name="robots" content="index,follow,max-image-preview:large"/);
 assert.match(html,/rel="canonical" href="https:\/\/redlibertad.com\/resuelve\/como-funciona"/);
 assert.match(html,/property="og:title"/);
 assert.match(html,/Sin presión para comprar, contratar o vender/);
 assert.match(html,/sin obligación de comprar/);
 assert.match(html,/no equivale a tener una acreditación verificada/);
 assert.match(html,/Son ejemplos orientativos/);
 assert.match(html,/Para aparecer en buscadores requiere, además, tu autorización/);
 assert.doesNotMatch(html,/mil usuarios|miles de clientes|valoración 5\/5|testimonio real ficticio/i);
 assert.match(html,/href="\/resuelve#questions"/);
 assert.match(html,/href="\/resuelve\?registro=1"/);
 const h1=html.match(/<h1\b/g)||[];
 assert.equal(h1.length,1);
});

test('V3.5.33: indexable page is server-served, in sitemap and reachable from Resuelve',()=>{
 const server=read('server.js'),home=read('public/resuelve.html');
 assert.match(server,/app\.get\('\/resuelve\/como-funciona'/);
 assert.match(server,/resuelve-como-funciona-v3533\.html/);
 assert.match(server,/res\.set\('X-Robots-Tag','index,follow'\)/);
 assert.match(server,/app\.get\('\/sitemap-resuelve-presentacion\.xml'/);
 assert.match(server,/<url><loc>https:\/\/redlibertad\.com\/resuelve\/como-funciona<\/loc><\/url>/);
 assert.match(server,/Sitemap: \$\{origin\}\/sitemap-resuelve-presentacion\.xml/);
 assert.match(server,/escapeHtml\(origin\+'\/sitemap-resuelve-presentacion\.xml'\)/);
 assert.ok(server.indexOf("app.get('/resuelve/como-funciona'")<server.indexOf("app.get('*',"));
 assert.match(home,/href="\/resuelve\/como-funciona" class="hero-tertiary"/);
 assert.match(home,/meta name="robots" content="noindex,follow"/);
});

test('V3.5.33: registration happens on Resuelve with the existing shared account',()=>{
 const js=read('public/resuelve-v350.js');
 assert.match(js,/if\(!state\.user&&new URLSearchParams\(location\.search\)\.get\('registro'\)==='1'\)openAuth\('register'\)/);
 assert.match(js,/authSubmit\('\/api\/auth\/register'/);
 assert.match(js,/entryType:'resuelve',entryKey:'resuelve',entryPath:'\/resuelve'/);
 assert.doesNotThrow(()=>new Function(js));
});

test('V3.5.33: mobile content is readable and accessible',()=>{
 const html=read('public/resuelve-como-funciona-v3533.html');
 const css=read('public/resuelve-como-funciona-v3533.css');
 assert.match(html,/href="#main">Saltar al contenido/);
 assert.match(html,/id="main"/);
 assert.match(html,/details><summary>|<details><summary>/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/grid-template-columns:1fr/);
 assert.match(css,/:focus-visible/);
 assert.doesNotMatch(html,/<script\b/i);
});
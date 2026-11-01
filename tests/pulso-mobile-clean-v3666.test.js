'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {renderPage,renderCard}=require('../src/routes/pulso-v3658');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const example={id:'25',video:'/uploads/reels/25.mp4',avatar:null,
 username:'autor_real',displayName:'Autor real',caption:'Un vídeo verdadero',
 likes:2,comments:1};

test('V3.6.66: el móvil muestra el vídeo sin la barra de flechas',()=>{
 const css=read('public/pulso-compact-mobile-v3666.css');
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/\.pulso-center-v3662 \.pulso-nav-v3664\{display:none\}/);
 assert.match(css,/@media\(max-width:530px\)/);
 assert.match(css,/100svh - 62px - 73px - env\(safe-area-inset-bottom,0px\)/);
 assert.match(css,/100svh - 58px - 73px - env\(safe-area-inset-bottom,0px\)/);
 assert.match(css,/\.pulso-feed\.pulso-feed-empty-v3660/);
 assert.doesNotMatch(css,/object-fit:cover|position:fixed|transform:scale\(/);
});

test('V3.6.66: en escritorio permanecen los atajos accesibles y el visor no pierde funciones',()=>{
 const html=renderPage([example],true);
 const nav=html.indexOf('pulso-navigation-v3664.css?v=3.6.64');
 const mobile=html.indexOf('pulso-compact-mobile-v3666.css?v=3.6.66');
 assert.ok(nav>=0 && mobile>nav);
 assert.match(html,/id="pulsoPreviousV3664" aria-label="Vídeo anterior"/);
 assert.match(html,/id="pulsoNextV3664" aria-label="Siguiente vídeo"/);
 assert.match(html,/tabindex="0" aria-label="Vídeos cortos de la comunidad"/);
 assert.match(html,/data-pulso-like="25"/);
 assert.match(html,/data-pulso-comments="25"/);
 assert.match(html,/data-pulso-share="\/reel\/25"/);
 assert.doesNotMatch(renderCard(example),/data-pulso-follow|Ver vídeo y participar/);
 const navigation=read('public/pulso-navigation-v3664.js');
 assert.match(navigation,/event.key==='ArrowDown'/);
 assert.match(navigation,/event.key==='ArrowUp'/);
 assert.match(navigation,/preloadNear\(index,items\)/);
});

test('V3.6.66: publicar vídeo sigue abriendo el editor real de Reel, sin duplicar formularios',()=>{
 const html=renderPage([example],false);
 assert.match(html,/href="\/app\?view=reels&crear=reel" class="pulso-create"/);
 const client=read('public/social.js');
 assert.match(client,/if\(view==='reels' && params\.get\('crear'\)==='reel'\)\{/);
 assert.match(client,/await openModal\('reel'\)/);
 assert.doesNotMatch(html,/id="mediaFile"|id="createForm"/);
});

test('V3.6.66: el acceso a comentar no promete un botón Seguir inexistente',()=>{
 const html=renderPage([example],false);
 assert.match(html,/Inicia sesión para dar Me gusta o comentar vídeos\./);
 assert.doesNotMatch(html,/comentar o seguir a un creador/);
 assert.match(html,/Ya tengo cuenta/);
 assert.match(html,/Crear cuenta gratis/);
});

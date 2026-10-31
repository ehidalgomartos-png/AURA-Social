'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('public/resuelve.html');
const js=read('public/resuelve-v350.js');
const css=read('public/resuelve-v350.css');

test('V3.6.57: visitante identifica Crear cuenta gratis, Entrar y explorar sin un nuevo botón',()=>{
 const actions=html.match(/<div id="heroActions" class="hero-actions">([\s\S]*?)<\/div>/)?.[1]||'';
 assert.match(actions,/<button id="joinResuelveButton" class="primary hero-main-action" type="button" aria-controls="resuelveAuthPanel" hidden>Crear cuenta gratis<\/button>/);
 assert.match(actions,/<button id="loginResuelveButton" class="secondary hero-login" type="button" hidden>Ya tengo cuenta<\/button>/);
 assert.match(actions,/<a id="viewQuestionsLink" href="#questions"/);
 assert.match(actions,/<button id="helpOthersButton" type="button"/);
 assert.equal((actions.match(/id="joinResuelveButton"/g)||[]).length,1);
 assert.equal((actions.match(/id="loginResuelveButton"/g)||[]).length,1);
 assert.doesNotMatch(actions,/id="joinResuelveButton"[^>]*>Pedir ayuda<\/button>/);
 assert.ok(actions.indexOf('Crear cuenta gratis')<actions.indexOf('Ya tengo cuenta'));
});

test('V3.6.57: el registro abre el formulario local y el acceso abre login',()=>{
 const start=js.indexOf('function bindResuelveAuth(){');
 const end=js.indexOf("el('resuelveAuthRegisterTab').addEventListener",start);
 assert.ok(start>=0&&end>start);
 const listeners={};
 const called=[];
 const code=js.slice(start+'function bindResuelveAuth(){'.length,end);
 vm.runInNewContext(code,{
  el:id=>({addEventListener:(type,handler)=>{assert.equal(type,'click');listeners[id]=handler;}}),
  openAuth:mode=>called.push(mode)
 },{timeout:2000});
 assert.equal(typeof listeners.joinResuelveButton,'function');
 assert.equal(typeof listeners.loginResuelveButton,'function');
 listeners.joinResuelveButton();
 listeners.loginResuelveButton();
 assert.deepEqual(called,['register','login']);
 assert.match(js,/function openAuth\(mode='register'\)\{[\s\S]*?setAuthMode\(mode\);[\s\S]*?el\('resuelveAuthPanel'\)\.hidden=false;/);
 assert.match(html,/<section id="resuelveAuthPanel"[^>]*hidden/);
 assert.match(html,/id="resuelveRegisterForm"/);
 assert.match(html,/id="resuelveAuthRegisterTab"[^>]*>Crear cuenta<\/button>/);
 assert.match(html,/Con esta misma cuenta podrás entrar en todo RedLibertad/);
});

test('V3.6.57: la persona identificada conserva Pedir ayuda y no ve los botones de acceso',()=>{
 assert.match(html,/<button id="askButton" class="primary hero-main-action" type="button" hidden>Pedir ayuda<\/button>/);
 const session=js.slice(js.indexOf('function renderSession(){'),js.indexOf("function bindResuelveAuth(){"));
 assert.match(session,/const guest=!state\.user/);
 assert.match(session,/el\('joinResuelveButton'\)\.hidden=!guest/);
 assert.match(session,/el\('loginResuelveButton'\)\.hidden=!guest/);
 assert.match(session,/el\('askButton'\)\.hidden=guest/);
 assert.match(js,/el\('askButton'\)\.addEventListener\('click'/);
});

test('V3.6.57: mismo diseño adaptable de la portada sin sumar elementos ni nuevas rutas',()=>{
 assert.match(css,/\.hero-actions\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
 assert.match(css,/\.hero-actions \.hero-main-action\{[\s\S]*?grid-column:1\/-1/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(html,/<button id="joinResuelveButton"/);
 assert.doesNotMatch(html,/href="\/registro-resuelve"/);
 assert.doesNotMatch(html,/onclick=|onload=/);
});

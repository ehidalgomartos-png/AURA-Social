'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('public/resuelve.html');
const css=read('public/resuelve-responsive-v3636.css');
const js=read('public/resuelve-v350.js');
const login=html.slice(html.indexOf('<form id="resuelveLoginForm"'),html.indexOf('</form>',html.indexOf('<form id="resuelveLoginForm"')));

test('V3.6.36: registro y acceso permanecen dentro de Resuelve con la misma cuenta',()=>{
 assert.match(html,/id="resuelveRegisterForm"/);
 assert.match(html,/id="resuelveLoginForm"/);
 assert.match(html,/name="acceptTerms" type="checkbox" required/);
 assert.match(html,/href="\/terms\/"/);
 assert.match(html,/href="\/privacy\/"/);
 assert.match(html,/Una única cuenta para Resuelve y RedLibertad/);
 assert.match(js,/authSubmit\('\/api\/auth\/register'/);
 assert.match(js,/authSubmit\('\/api\/auth\/login'/);
 assert.match(html,/resuelve-responsive-v3636\.css\?v=3\.6\.36/);
});
test('V3.6.36: opciones de ayuda reales y separadas dentro del formulario de acceso',()=>{
 assert.match(login,/<nav class="resuelve-auth-help-v3636" aria-label="Ayuda para acceder a Resuelve">/);
 assert.match(login,/<a href="\/recuperar-contrasena\/">Recuperar contraseña<\/a>/);
 assert.match(login,/<a href="\/verificar-email\/">Reenviar correo de verificación<\/a>/);
 assert.equal((login.match(/<a href=/g)||[]).length,2);
 assert.match(login,/type="password" autocomplete="current-password" required/);
 assert.match(login,/type="submit">Entrar y seguir en Resuelve/);
 assert.ok(login.indexOf('type="submit"')<login.indexOf('resuelve-auth-help-v3636'));
});
test('V3.6.36: enlaces táctiles, foco visible y columnas adecuadas por tamaño',()=>{
 assert.match(css,/#resuelveLoginForm \.resuelve-auth-help-v3636\{/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/min-height:46px/);
 assert.match(css,/\.resuelve-auth-help-v3636 a:focus-visible/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/@media\(max-width:355px\)/);
 assert.match(css,/@media\(min-width:651px\) and \(max-width:959px\)/);
 assert.match(css,/#questionSearchForm\.resuelve-search/);
 assert.doesNotMatch(css,/display:none|visibility:hidden|position:fixed|outline:none/);
});
test('V3.6.36: evita zoom de inputs móviles y mantiene las áreas de publicación',()=>{
 assert.match(css,/#resuelveAuthPanel \.resuelve-auth-form>input/);
 assert.match(css,/#askPanel #askForm :is\(input,textarea,select\)/);
 assert.match(css,/#detailPanel #answerForm :is\(input,textarea,select\)/);
 assert.match(css,/#questionSearchForm input/);
 assert.match(css,/#solutionFilterForm :is\(input,select\)/);
 assert.match(css,/font-size:16px/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/min-height:48px/);
 assert.match(html,/id="askPanel"/);
 assert.match(html,/id="answerForm"/);
 assert.match(html,/id="questionList"/);
 assert.match(html,/id="solutionList"/);
});

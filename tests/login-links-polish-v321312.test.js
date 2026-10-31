'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/styles.css'),'utf8');
const login=html.match(/<form id="loginForm"[^>]*>[\s\S]*?<\/form>/)?.[0]||'';

test('Login includes two distinct recovery options with direct valid paths',()=>{
  assert.match(login,/<nav class="auth-help-links" aria-label="Ayuda para acceder">/);
  assert.match(login,/<a class="auth-help-link" href="\/recuperar-contrasena\/">/);
  assert.match(login,/<a class="auth-help-link" href="\/verificar-email\/">/);
  assert.match(login,/Recuperar contraseña/);
  assert.match(login,/Reenviar correo de verificación/);
  assert.equal((login.match(/class="auth-help-link"/g)||[]).length,2);
});
test('Login preserves the sign-in form and validation feedback',()=>{
  assert.match(login,/name="email"[^>]*required/);
  assert.match(login,/name="password"[^>]*required/);
  assert.match(login,/<button class="button full coral" type="submit">Entrar<\/button>/);
  assert.ok(login.indexOf('id="loginMessage"')<login.indexOf('class="auth-help-links"'));
});
test('Help items never appear as an inline paragraph with bullet separator',()=>{
  assert.doesNotMatch(login,/<p class="auth-help-links">/);
  assert.doesNotMatch(login,/· <a href="\/verificar-email\/">/);
  assert.doesNotMatch(login,/V1\.79/);
});
test('Mobile help links have independent touch targets and visible keyboard focus',()=>{
  assert.match(css,/\.dark-card \.auth-help-links\s*\{\s*display:grid/);
  assert.match(css,/\.dark-card \.auth-help-link\s*\{[\s\S]*?min-height:49px/);
  assert.match(css,/\.dark-card \.auth-help-link:focus-visible/);
  assert.match(css,/@media\(max-width:359px\)/);
  assert.match(html,/\/styles\.css\?v=\d+\.\d+\.\d+(?:[.-][\w.-]+)?(?=["&])/);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
test('V3.5.15: registro dentro de Resuelve con cuenta única y consentimiento real',()=>{
 const html=read('public/resuelve.html');
 const js=read('public/resuelve-v350.js');
 const auth=read('src/routes/auth.js');
 const server=read('server.js');
 const css=read('public/resuelve-v350.css');
 for(const id of [
  'joinResuelveButton','loginResuelveButton','resuelveAuthPanel',
  'resuelveRegisterForm','resuelveLoginForm','resuelveSignupName',
  'resuelveSignupUsername','resuelveSignupEmail','resuelveSignupPassword',
  'resuelveSignupBirthDate','resuelveSignupTerms','resuelveAuthRegisterTab',
  'resuelveAuthLoginTab','resuelveAuthStatus'
 ])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/name="acceptTerms" type="checkbox" required/);
 assert.match(html,/name="birthDate" type="date" required/);
 assert.match(html,/name="password" type="password" autocomplete="new-password" minlength="10"/);
 assert.match(html,/name="username" autocomplete="username" minlength="3"/);
 assert.match(html,/href="\/terms\/"/);
 assert.match(html,/href="\/community-guidelines\/"/);
 assert.match(html,/href="\/privacy\/"/);
 assert.match(html,/href="\/recuperar-contrasena\/"/);
 assert.match(html,/Una única cuenta para Resuelve y RedLibertad/);
 assert.match(js,/function bindResuelveAuth\(\)/);
 assert.match(js,/function finishAuth\(\)/);
 assert.match(js,/await authSubmit\('\/api\/auth\/register'/);
 assert.match(js,/await authSubmit\('\/api\/auth\/login'/);
 assert.match(js,/await request\('\/api\/auth\/me'\)/);
 assert.match(js,/credentials:'same-origin'/);
 assert.match(js,/entryType:'resuelve',entryKey:'resuelve',entryPath:'\/resuelve'/);
 assert.match(js,/el\('resuelveSignupTerms'\)\.checked/);
 assert.match(js,/el\('resuelveSignupBirthDate'\)/);
 assert.match(js,/data\.verificationEmailSent/);
 assert.match(js,/renderSession\(\)/);
 assert.match(js,/if\(state\.question\)await openDetail\(state\.question\.id,false\)/);
 assert.match(auth,/router\.post\('\/register'/);
 assert.match(auth,/router\.post\('\/login'/);
 assert.match(auth,/router\.get\('\/me'/);
 assert.match(auth,/acceptTerms: z\.literal\(true\)/);
 assert.match(auth,/res\.cookie\('aura_token', token/);
 assert.match(auth,/resuelve:\/\^\\\/resuelve\$\//);
 assert.match(server,/app\.use\('\/api\/auth', authRoutes\)/);
 assert.doesNotMatch(js,/(?:localStorage|sessionStorage)\.(?:setItem|token)/);
 assert.doesNotMatch(js,/document\.cookie\s*=/);
 assert.match(css,/resuelve-auth-form/);
 assert.match(css,/@media\(max-width:650px\)/);
});

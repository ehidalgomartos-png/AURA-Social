'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const service=require('../src/services/resuelve-v350');

test('V3.5.26 optional speciality is constrained; self declaration is never verification',()=>{
 assert.equal(service.validateProfessionalRole('Electricista'),'Electricista');
 for(const bad of ['https://empresa.es','www.example.com','ventas@empresa.es','+34600111222','a','x'.repeat(90)]){
  assert.equal(service.validateProfessionalRole(bad),undefined,bad);
 }
 assert.equal(service.validateProfessionalRole(''),null);
 const code=read('src/services/resuelve-v350.js');
 assert.match(code,/ADD COLUMN IF NOT EXISTS declared_speciality VARCHAR\(70\)/);
 assert.match(code,/async function setHelperSpeciality\(userId,rawSpeciality\)/);
 assert.match(code,/validateProfessionalRole\(rawSpeciality\)/);
 assert.match(code,/ON CONFLICT\(user_id\) DO UPDATE SET declared_speciality=excluded.declared_speciality/);
 assert.match(code,/SELECT u.username,p.declared_speciality/);
 assert.match(code,/JOIN resuelve_helper_profiles_v3525 p ON p.user_id=u.id AND p.enabled=true/);
});

test('V3.5.26 preference remains independent and private for the account owner',()=>{
 const api=read('src/routes/resuelve-v350.js');
 assert.match(api,/router\.get\('\/helper-profile\/preference',requireAuth/);
 assert.match(api,/service\.helperProfileSettings\(req\.user\.id\)/);
 assert.match(api,/router\.post\('\/helper-profile\/speciality',requireAuth,checkOrigin,limiter\(12\)/);
 assert.match(api,/typeof req\.body\?\.speciality!=='string'/);
 assert.match(api,/service\.setHelperSpeciality\(req\.user\.id,req\.body\.speciality\)/);
 assert.match(api,/router\.get\('\/helpers\/:username'/);
 assert.doesNotMatch(api,/verified_professional|is_profession_verified/);
});

test('V3.5.26 frontend explicitly shows non-verification and uses safe text rendering',()=>{
 const js=read('public/resuelve-v350.js');
 const html=read('public/resuelve.html');
 const css=read('public/resuelve-v350.css');
 assert.doesNotThrow(()=>new Function(js));
 assert.match(html,/id="helperSpecialityForm"/);
 assert.match(html,/id="helperSpecialityInput" type="text" maxlength="70"/);
 assert.match(html,/No introduzcas teléfonos, empresas, enlaces ni datos personales/);
 assert.match(js,/write\('\/api\/resuelve\/helper-profile\/speciality',\{speciality:/);
 assert.match(js,/data\.helper\.declared_speciality/);
 assert.match(js,/RedLibertad no ha verificado sus títulos ni su identidad profesional/);
 assert.match(js,/create\('span',null,declared\)/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.match(css,/@media\(max-width:650px\)/);
});
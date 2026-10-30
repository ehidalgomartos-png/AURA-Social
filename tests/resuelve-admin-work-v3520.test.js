'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.5.20: inbox lives in the server-protected Resuelve admin HTML',()=>{
 const html=read('src/views/resuelve-admin-v3519.html');
 const server=read('server.js');
 const page=read('public/resuelve.html');
 assert.match(server,/app\.get\('\/resuelve\/admin',requireAdmin/);
 for(const id of ['trabajo','adminWorkSolutions','adminWorkReports','adminWorkStatus','refreshAdminWork'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.doesNotMatch(page,/adminWorkSolutions|adminWorkReports|adminWorkStatus/);
 assert.match(html,/Soluciones pendientes cargadas/);
 assert.match(html,/Avisos pendientes cargados/);
});

test('V3.5.20: safe UI only counts loaded results and labels unknown and incomplete data',()=>{
 const js=read('public/resuelve-admin-v3519.js');
 const css=read('public/resuelve-admin-v3519.css');
 assert.doesNotThrow(()=>new Function(js));
 assert.match(js,/function updateWork\(\)/);
 assert.match(js,/childElementCount\+\(next\?'\+':''\)/);
 assert.match(js,/error\?'Error':loaded\?/);
 assert.match(js,/Hay más páginas por consultar/);
 assert.match(js,/updateWork\(\);el\('libraryReviewStatus'\)/);
 assert.match(js,/item\.remove\(\);updateWork\(\);el\('adminReportsStatus'\)/);
 assert.match(js,/state\.solutionsError=true/);
 assert.match(js,/state\.reportsError=true/);
 assert.match(js,/Promise\.all\(\[solutions\(\),reports\(\)\]\)/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
});

test('V3.5.20: moderation requires confirmation and disables both report actions during write',()=>{
 const js=read('public/resuelve-admin-v3519.js');
 const api=read('src/routes/resuelve-v350.js');
 assert.match(js,/const dismiss=action\('Desestimar aviso'/);
 assert.match(js,/const hide=action\('Ocultar respuesta'/);
 assert.equal((js.match(/dismiss\.disabled=true;hide\.disabled=true;/g)||[]).length,2);
 assert.equal((js.match(/dismiss\.disabled=false;hide\.disabled=false;/g)||[]).length,2);
 assert.match(js,/confirm\('¿Has revisado el contexto y quieres desestimar/);
 assert.match(js,/confirm\('¿Has revisado el contenido\? Esta acción ocultará/);
 assert.match(js,/checks\.every\(check=>check\.checked\)/);
 assert.match(api,/router\.post\('\/admin\/reports\/:id\/dismiss',requireAuth,checkOrigin/);
 assert.match(api,/router\.post\('\/admin\/:kind\/:id\/hide',requireAuth,checkOrigin/);
});
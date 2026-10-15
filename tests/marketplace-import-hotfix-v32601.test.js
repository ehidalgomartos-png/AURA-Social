'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {safeHost,imageFailureCode,MAX_REDIRECTS}=require('../src/services/marketplace-import-photos-v3260');
test('Import V3.2.60.1: redirect destinations are strictly validated',()=>{
 assert.equal(MAX_REDIRECTS,2);
 assert.equal(safeHost(new URL('/new.jpg','https://shop.example.com/photo.jpg').href).hostname,'shop.example.com');
 for(const target of ['http://shop.example.com/a.jpg','https://127.0.0.1/a.jpg','https://localhost/a.jpg','https://shop.example.com:8443/a.jpg'])
  assert.throws(()=>safeHost(target),target);
 const src=fs.readFileSync('src/services/marketplace-import-photos-v3260.js','utf8');
 assert.match(src,/downloadImage\(target,redirects\+1\)/);
 assert.match(src,/safeHost\(raw\)/);
});
test('Import V3.2.60.1: network, DNS and filesystem failures are classified',()=>{
 assert.equal(imageFailureCode(Object.assign(new Error('DNS failed'),{code:'ENOTFOUND'})),'image_dns_error');
 assert.equal(imageFailureCode(Object.assign(new Error('No space'),{code:'ENOSPC'})),'image_storage_error');
 assert.equal(imageFailureCode(Object.assign(new Error('certificate'),{code:'CERT_HAS_EXPIRED'})),'image_tls_error');
 assert.equal(imageFailureCode(new Error('image_http_403')),'image_http_403');
 assert.equal(imageFailureCode(new Error('unexpected network error')),'image_connection_error');
});
test('Import V3.2.60.1: photo errors become item failures while DB errors propagate',()=>{
 const src=fs.readFileSync('src/routes/marketplace-import-v3260.js','utf8');
 assert.match(src,/let phase='images'/);
 assert.match(src,/phase='listing'/);
 assert.match(src,/phase==='images'/);
 assert.match(src,/else throw e/);
 assert.match(src,/Marketplace CSV step error/);
});

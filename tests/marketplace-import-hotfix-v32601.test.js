'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const net=require('node:net');
const {safeHost,imageFailureCode,pinnedIPv4Lookup,MAX_REDIRECTS}=require('../src/services/marketplace-import-photos-v3260');
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

test('Import V3.2.60.1: Node.js 22 multi-address lookup uses records, never undefined IP',async()=>{
 const address='93.184.216.34',lookup=pinnedIPv4Lookup(address);
 lookup('shop.example.com',{all:true},(err,records)=>{
  assert.ifError(err);
  assert.deepEqual(records,[{address,family:4}]);
 });
 lookup('shop.example.com',{family:4},(err,ip,family)=>{
  assert.ifError(err);
  assert.equal(ip,address);assert.equal(family,4);
 });
 assert.throws(()=>pinnedIPv4Lookup(undefined),/image_invalid_pinned_ip/);
 // Real localhost socket verifies Node 22's autoSelectFamily path without
 // outbound network traffic or retrieving a user's photos.
 const server=net.createServer(socket=>socket.end());
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 try{
  let sawAll=false;
  const connected=net.connect({host:'woo-products.example',port:server.address().port,
   lookup:(hostname,options,done)=>{
    sawAll ||= options?.all===true;
    pinnedIPv4Lookup('127.0.0.1')(hostname,options,done);
   }});
  await new Promise((resolve,reject)=>{
   connected.once('connect',()=>{connected.destroy();resolve();});
   connected.once('error',reject);
  });
  assert.equal(sawAll,true,'Node 22 should request all:true during autoSelectFamily');
 }finally{
  await new Promise(resolve=>server.close(resolve));
 }
});

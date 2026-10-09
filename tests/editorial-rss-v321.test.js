'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const net=require('node:net');
const rss=require('../src/services/editorial-rss-v321');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const now=new Date('2026-10-09T12:00:00Z');

test('IP público: negar localhost, privado, metadata cloud y redes especiales',()=>{
  const forbidden=['127.0.0.1','10.3.5.4','172.16.20.2','172.31.0.1','192.168.1.2','169.254.169.254','100.64.0.1','192.0.2.3','198.51.100.12','203.0.113.5','198.18.0.5','0.1.2.3','192.0.0.9','224.1.1.1','::1'];
  for(const ip of forbidden)assert.equal(rss.publicIPv4(ip),false,ip);
  assert.equal(rss.publicIPv4('8.8.8.8'),true);
});
test('DNS no acepta destinos mixtos aunque contengan una IP pública',async()=>{
  await assert.rejects(rss.resolvePublicIPv4('example.net',async()=>[{address:'8.8.8.8'},{address:'127.0.0.1'}]),{code:'feed_network_blocked'});
  assert.equal(await rss.resolvePublicIPv4('example.net',async()=>[{address:'8.8.8.8'}]),'8.8.8.8');
});
test('IPv6 solo global unicast pública y bloqueo DNS mixto',async()=>{
  for(const address of ['2606:4700:4700::1111','2a00:1450:4001::200e'])assert.equal(rss.publicIPv6(address),true,address);
  for(const address of ['::1','fe80::1','fc00::1','2001:db8::1','2002::1','::ffff:127.0.0.1'])assert.equal(rss.publicIPv6(address),false,address);
  await assert.rejects(rss.resolvePublicAddresses('example.org',async()=>[
    {family:4,address:'8.8.8.8'},{family:6,address:'::1'}
  ]),{code:'feed_network_blocked'});
  const addresses=await rss.resolvePublicAddresses('example.org',async()=>[
    {family:4,address:'8.8.8.8'},{family:6,address:'2606:4700:4700::1111'}
  ]);
  assert.deepEqual(addresses,[{family:4,address:'8.8.8.8'},{family:6,address:'2606:4700:4700::1111'}]);
});
test('errores DNS se distinguen sin mostrar detalles internos',async()=>{
  const cause=Object.assign(new Error('DNS lookup failed'),{code:'ENOTFOUND'});
  await assert.rejects(rss.fetchXml('https://example.org/rss',{
    lookup:async()=>{throw cause;}
  }),{code:'feed_dns_error'});
});
test('fallo IPv4 recuperable permite reintento IPv6 fijado por DNS y con TLS verificado',async()=>{
  const ips=[];
  let calls=0;
  function request(opts,handler){
    const req=new EventEmitter();
    req.setTimeout=()=>{};
    req.end=()=>{
      ++calls;
      opts.lookup(opts.hostname,{},(_error,address,family)=>ips.push({address,family,hostname:opts.hostname}));
      if(calls===1){
        const error=Object.assign(new Error('connection refused'),{code:'ECONNREFUSED'});
        process.nextTick(()=>req.emit('error',error));return;
      }
      const res=new EventEmitter();
      res.statusCode=200;res.headers={'content-type':'application/rss+xml'};
      res.destroy=()=>{};
      handler(res);
      res.emit('data',Buffer.from('<rss><channel/></rss>'));
      res.emit('end');
    };
    return req;
  }
  const xml=await rss.fetchXml('https://example.org/rss',{
    lookup:async()=>[
      {family:4,address:'8.8.8.8'},
      {family:6,address:'2606:4700:4700::1111'}],
    request
  });
  assert.match(xml,/<rss>/);
  assert.equal(calls,2);
  assert.deepEqual(ips,[
    {address:'8.8.8.8',family:4,hostname:'example.org'},
    {address:'2606:4700:4700::1111',family:6,hostname:'example.org'}
  ]);
});
test('lookup fijado cumple el contrato Node all:true y all:false con IPv4 e IPv6',()=>{
  for(const pin of [
    {address:'199.232.194.133',family:4},
    {address:'2606:4700:4700::1111',family:6}
  ]){
    const lookup=rss.pinnedAddressLookup(pin);
    lookup('feeds.elpais.com',{all:true},(error,addresses)=>{
      assert.equal(error,null);
      assert.deepEqual(addresses,[pin]);
    });
    lookup('feeds.elpais.com',{all:false},(error,address,family)=>{
      assert.equal(error,null);
      assert.equal(address,pin.address);
      assert.equal(family,pin.family);
    });
  }
});
test('socket Node.js autoSelectFamily:true usa dirección fijada sin ERR_INVALID_IP_ADDRESS',async()=>{
  // 127.0.0.1 solo para demostrar el contrato lookup del socket local.
  // En producción la resolución previa rechaza loopback y rangos privados.
  const server=net.createServer(socket=>{
    socket.on('error',()=>{}); // El par puede cerrar antes de que el servidor termine de escribir.
    socket.end();
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try{
    const port=server.address().port;
    await new Promise((resolve,reject)=>{
      const socket=net.connect({
        host:'feeds.elpais.com',port,autoSelectFamily:true,
        lookup:rss.pinnedAddressLookup({address:'127.0.0.1',family:4})
      });
      socket.setTimeout(2500,()=>socket.destroy(new Error('socket_timeout')));
      socket.once('connect',()=>{socket.end();resolve();});
      socket.on('error',reject);
    });
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});
test('fallo TLS se diferencia de transporte, sin desactivar verificación',async()=>{
  function request(_opts,_handler){
    const req=new EventEmitter();
    req.setTimeout=()=>{};
    req.end=()=>process.nextTick(()=>req.emit('error',Object.assign(new Error('untrusted certificate'),{code:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'})));
    return req;
  }
  await assert.rejects(rss.fetchXml('https://example.org/rss',{
    lookup:async()=>[{address:'8.8.8.8',family:4}],request
  }),{code:'feed_tls_error'});
});

test('canonización retira seguimiento y bloquea protocolos peligrosos',()=>{
  assert.equal(rss.canonicalArticleUrl('https://example.org/noticia/?utm_source=feed&x=1#comments'),'https://example.org/noticia?x=1');
  assert.equal(rss.canonicalArticleUrl('https://example.org/a?x=1&amp;y=2'),'https://example.org/a?x=1&y=2');
  for(const item of ['javascript:alert(1)','file:///etc/passwd','http://127.0.0.1/api','https://user:password@example.org/news'])assert.equal(rss.canonicalArticleUrl(item),null);
});
test('RSS extrae metadatos recientes sin imágenes ni HTML ejecutable',()=>{
  const xml='<rss version="2.0"><channel><title>Boletín</title>'+
    '<item><title>Noticias &amp; tecnología renovable</title><link>https://example.org/nueva?utm_source=rss</link><description><![CDATA[<p>Resumen <b>de referencia</b><script>texto</script></p>]]></description><pubDate>Thu, 08 Oct 2026 09:00:00 GMT</pubDate></item>'+
    '<item><title>Noticias &amp; tecnología renovable</title><link>https://example.org/duplicada</link></item>'+
    '<item><title>Una noticia muy antigua</title><link>https://example.org/antigua</link><pubDate>Thu, 08 Oct 2020 09:00:00 GMT</pubDate></item>'+
    '</channel></rss>';
  const items=rss.parseFeed(xml,{category:'tecnologia',sourceId:1,now});
  assert.equal(items.length,1);
  assert.equal(items[0].source_title,'Noticias & tecnología renovable');
  assert.equal(items[0].canonical_url,'https://example.org/nueva');
  assert.doesNotMatch(items[0].source_excerpt,/<[^>]+>/);
  assert.equal(items[0].title_fingerprint.length,64);
  assert.equal(items[0].category,'tecnologia');
});
test('Atom admite enlace alternativo y extracto sin publicar',()=>{
  const xml='<feed xmlns="http://www.w3.org/2005/Atom"><title>Revista</title><entry><title>Investigadores descubren nuevos materiales</title>'+
    '<link rel="self" href="https://example.org/api/1"/><link rel="alternate" href="https://example.org/materiales"/>'+
    '<summary>Avances en ciencia</summary><updated>2026-10-08T12:00:00Z</updated></entry></feed>';
  const items=rss.parseFeed(xml,{category:'tecnologia',now});
  assert.equal(items.length,1);
  assert.equal(items[0].canonical_url,'https://example.org/materiales');
});
test('DOCTYPE/entidades y entrada excesiva son rechazados',()=>{
  assert.throws(()=>rss.parseFeed('<!DOCTYPE rss [<!ENTITY huge "a">]><rss/>',{category:'actualidad',now}),{code:'feed_xml_rejected'});
  assert.throws(()=>rss.parseFeed('x'.repeat(rss.MAX_XML_BYTES+1),{category:'actualidad',now}),{code:'feed_xml_rejected'});
});
test('lector HTTPS no sigue redirecciones y fija DNS en conexión',async()=>{
  let options=null;
  function request(opts,handler){
    options=opts;
    const req=new EventEmitter();
    req.setTimeout=()=>{};
    req.end=()=>{
      const res=new EventEmitter();
      res.statusCode=302;res.headers={location:'https://127.0.0.1/private'};res.destroy=()=>{};
      handler(res);
    };
    return req;
  }
  await assert.rejects(rss.fetchXml('https://example.org/feed',{lookup:async()=>[{address:'8.8.8.8'}],request}),{code:'feed_redirect_blocked'});
  assert.equal(options.agent,false);
  assert.equal(options.method,'GET');
  assert.equal(options.lookup instanceof Function,true);
  assert.equal(options.headers['Accept-Encoding'],'identity');
  assert.equal(options.hostname,'example.org');
});
test('límite real de bytes y no solo Content-Length',async()=>{
  function request(_opts,handler){
    const req=new EventEmitter();
    req.setTimeout=()=>{};
    req.end=()=>{
      const res=new EventEmitter();
      res.statusCode=200;res.headers={'content-type':'application/rss+xml'};res.destroy=()=>{};
      handler(res);
      res.emit('data',Buffer.alloc(rss.MAX_XML_BYTES+1));
    };
    return req;
  }
  await assert.rejects(rss.fetchXml('https://example.org/rss',{lookup:async()=>[{address:'8.8.8.8'}],request}),{code:'feed_too_large'});
});
test('rutas editoriales requieren admin, cooldown y no publican posts',()=>{
  const route=read('src/routes/admin-editorial-inbox-v321.js');
  assert.match(route,/router\.use\(requireAdmin\)/);
  assert.match(route,/status!=='approved'/);
  assert.match(route,/pg_try_advisory_lock/);
  assert.match(route,/5\*60\*1000/);
  assert.match(route,/ON CONFLICT DO NOTHING/);
  for(const s of [route,read('src/services/editorial-rss-v321.js')]){
    assert.doesNotMatch(s,/INSERT INTO posts\b|INSERT INTO users\b|INSERT INTO community_posts\b/);
  }
  assert.match(read('server.js'),/const APP_VERSION='3\.2\.9'/);
  assert.match(read('public/admin.html'),/id="editorialInbox"/);
  assert.match(read('public/admin.js'),/loadEditorialInboxV321/);
});

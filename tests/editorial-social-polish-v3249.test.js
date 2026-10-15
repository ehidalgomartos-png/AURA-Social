'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const db=require('../src/db');
const {publicRouter}=require('../src/routes/editorial-publication-v323');
const {sourceLabel}=require('../public/editorial-source-v3249');
const {relatedNews}=require('../public/editorial-discovery-v3248');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function handler(endpoint){
  const layer=publicRouter.stack.find(x=>x.route?.path===endpoint&&x.route?.methods?.get);
  assert.ok(layer,'GET '+endpoint+' exists');
  return layer.route.stack.find(x=>x.method==='get').handle;
}
function response(){return {
 statusCode:200,body:null,headers:{},status(code){this.statusCode=code;return this;},
 type(value){this.headers.type=value;return this;},send(value){this.body=value;return this;},
 redirect(code,url){this.statusCode=code;this.location=url;return this;}
};}
const publication={
 id:9,title:'Resumen deportivo de una competición confirmada',
 summary:'Descripción editorial verificada por el equipo, con enlaces a los datos originales de la publicación.',
 category:'deportes',published_at:'2026-10-14T08:00:00Z',
 source_name:'Deportes',source_url:'https://www.marca.com/futbol/noticia.html',
 profile_name:'RedLibertad Deportes',profile_slug:'redlibertad-deportes',image_url:null
};
test('source attribution for generic category is derived from URL, not invented brand',()=>{
 assert.equal(sourceLabel('Deportes','https://www.marca.com/noticia.html'),'marca.com');
 assert.equal(sourceLabel('Actualidad','https://www.rtve.es/noticias/'), 'rtve.es');
 assert.equal(sourceLabel('Tecnología','https://example.org/technology'),'example.org');
 assert.equal(sourceLabel('MARCA','https://www.marca.com/noticia.html'),'MARCA');
 assert.equal(sourceLabel('RTVE','https://www.rtve.es/noticia.html'),'RTVE');
 assert.equal(sourceLabel('Cultura','http://unsafe.example/news'),'Fuente original');
 assert.equal(sourceLabel('','not-a-url'),'Fuente original');
 assert.equal(sourceLabel('Deportes','https://user:secret@marca.com/a'),'Fuente original');
 assert.equal(sourceLabel('FuEnTe','https://www.elpais.com/'),'elpais.com');
});
test('source label is corrected for existing publications without database mutation',async()=>{
 const previous=db.query;
 try{
   let queryCount=0;
   db.query=async()=>{
     queryCount++;
     return queryCount===3?{rowCount:0,rows:[]}:{rowCount:1,rows:[publication]};
   };
   const list=response();
   await handler('/')({query:{}},list);
   assert.equal(list.statusCode,200);
   assert.match(list.body,/Fuente: marca.com/);
   assert.doesNotMatch(list.body,/Fuente: Deportes/);
   const article=response();
   await handler('/p/:id')({params:{id:'9'}},article);
   assert.equal(article.statusCode,200);
   assert.match(article.body,/Fuente: marca.com/);
   assert.match(article.body,/href="https:\/\/www.marca.com\/futbol\/noticia.html"/);
   assert.equal(queryCount,3);
 }finally{db.query=previous;}
});
test('comment counter uses singular on 1 and plural otherwise',()=>{
 const client=read('public/editorial-social-v324.js');
 assert.match(client,/commentCount===1\?'comentario':'comentarios'/);
 assert.doesNotMatch(client,/Number\(result\.data\.commentCount\|\|0\)\+' comentarios/);
 const grammar=n=>n+' '+(n===1?'comentario':'comentarios');
 assert.deepEqual([grammar(0),grammar(1),grammar(2)],['0 comentarios','1 comentario','2 comentarios']);
});
test('related cards use full width, optional protected images and AI disclosure',()=>{
 const rows=[
  {id:1,title:'Una noticia <script>alert(1)</script>',summary:'Una descripción sin contenido activo',
   image_url:'/uploads/123.jpg',image_origin:'ai'},
  {id:2,title:'Otra noticia',summary:'Otra descripción',image_url:'https://evil.example/x.png',image_origin:'own'},
  {id:3,title:'Una tercera',summary:'Información',image_url:null},
  {id:4,title:'No se muestra',summary:'Cuarta noticia'}
 ];
 const html=relatedNews(rows,'deportes',{safeImage:url=>url==='/uploads/123.jpg'});
 assert.match(html,/Más noticias de Deportes/);
 assert.match(html,/Ilustración IA/);
 assert.match(html,/class="ed-related-photo-v3249"/);
 assert.match(html,/src="\/uploads\/123.jpg"/);
 assert.doesNotMatch(html,/src="https:\/\/evil.example/);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>/);
 assert.doesNotMatch(html,/No se muestra/);
 assert.equal((html.match(/ed-related-card-v3248/g)||[]).length,3);
 const css=read('public/editorial-v323.css');
 assert.match(css,/grid-template-columns:repeat\(auto-fit/);
 assert.match(css,/ed-related-read-v3249/);
 assert.match(css,/min-height:44px/);
 assert.match(read('src/routes/editorial-publication-v323.js'),/safeImage:safeLocalImageV3222/);
});
test('V3.2.60 preserves public filters, conversations and stable publishing',()=>{
 const routes=read('src/routes/editorial-publication-v323.js');
 assert.match(routes,/discoveryV3248\.filter\(req\.query\.categoria\)/);
 assert.match(routes,/AND pub\.category=\$1/);
 assert.match(routes,/edDiscussion/);
 assert.match(routes,/AND pub\.id<>\$2/);
 assert.match(routes,/sourceLabelV3249/);
 assert.match(routes,/pub\.unpublished_at IS NULL AND ep\.status='ready'/);
 assert.match(routes,/editorial-social-v324\.js\?v=3\.2\.63\.2/);
 assert.equal(JSON.parse(read('package.json')).version,'3.2.64.3');
 assert.match(read('server.js'),/APP_VERSION='3\.2\.64\.3'/);
 assert.match(read('.github/workflows/validate-js.yml'),/npm run test:editorial-social-polish/);
});

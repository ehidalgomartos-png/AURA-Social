'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/resuelve-v350.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/resuelve-v350.css'),'utf8');

function fixture(){
 const start=source.indexOf('function questionShareControl(q,compact=false){');
 const end=source.indexOf(' function connectedActions(q){',start);
 assert.ok(start>=0&&end>start,'componente de compartir localizado');
 const fragment=source.slice(start,end);
 const calls=[];
 const create=(tag,cls='',value='')=>({
  tag,cls,textContent:value,children:[],attrs:{},hidden:false,href:'',
  append(...children){this.children.push(...children);},
  setAttribute(key,value){this.attrs[key]=value;},
  addEventListener(name,callback){this.events??={};this.events[name]=callback;}
 });
 const button=(label,callback,cls)=>{const result=create('button',cls,label);result.events={click:callback};return result;};
 const clipboard={writeText:async value=>{calls.push(['copy',value]);}};
 const navigator={share:async payload=>{calls.push(['native',payload]);},clipboard};
 const window={isSecureContext:true,prompt:(...args)=>{calls.push(['prompt',args]);}};
 const location={origin:'https://redlibertad.com'};
 const questionShareControl=new Function('create','button','navigator','window','location','URL','URLSearchParams','encodeURIComponent','message',
   fragment+';return questionShareControl;')(create,button,navigator,window,location,URL,URLSearchParams,encodeURIComponent,()=>{});
 const all=(node)=>[node,...node.children.flatMap(all)];
 return {questionShareControl,all,calls};
}

test('V3.5.17.1: enviar una pregunta concreta a WhatsApp, Facebook, Telegram, correo y SMS',()=>{
 const {questionShareControl,all,calls}=fixture();
 const q={id:742,title:'¿Cómo solicitar una ayuda para mi familia?',body:'NO COPIAR: teléfono 612 999 000, datos privados'};
 const root=questionShareControl(q),nodes=all(root);
 const options=nodes.find(n=>n.cls==='question-share-options');
 const toggle=nodes.find(n=>n.textContent==='Enviar esta pregunta');
 assert.ok(options.hidden);
 assert.equal(toggle.attrs['aria-expanded'],'false');
 assert.equal(calls.length,0,'no se envía nada de forma automática');
 const actions=nodes.filter(n=>n.tag==='a');
 assert.deepEqual(actions.map(n=>n.textContent),['WhatsApp','Facebook','Telegram','Correo electrónico','SMS']);
 const url='https://redlibertad.com/resuelve/pregunta/742';
 for(const action of actions){
  assert.ok(decodeURIComponent(action.href.replace(/\+/g,' ')).includes(url),action.textContent);
  assert.ok(!action.href.includes('612'), 'sin teléfono ni cuerpo de la pregunta');
 }
 assert.match(actions[0].href,/^https:\/\/api\.whatsapp\.com\/send\?text=/);
 assert.match(decodeURIComponent(actions[0].href),/¿Cómo solicitar una ayuda para mi familia\?/);
 assert.match(actions[1].href,/^https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=/);
 assert.match(actions[2].href,/^https:\/\/t\.me\/share\/url\?/);
 assert.match(actions[3].href,/^mailto:\?subject=/);
 assert.match(actions[4].href,/^sms:\?body=/);
 assert.equal(actions[0].target,'_blank');
 assert.equal(actions[0].rel,'noopener noreferrer');
 toggle.events.click();
 assert.equal(options.hidden,false);
 assert.equal(toggle.attrs['aria-expanded'],'true');
 toggle.events.click();
 assert.equal(options.hidden,true);
 assert.equal(toggle.attrs['aria-expanded'],'false');
});

test('V3.5.17.1: copiar y menú del móvil solo actúan tras pulsar',async()=>{
 const {questionShareControl,all,calls}=fixture();
 const nodes=all(questionShareControl({id:7,title:'Busco orientación'} ,true));
 assert.match(nodes[0].cls,/question-share-compact/);
 const copy=nodes.find(n=>n.textContent==='Copiar enlace');
 const native=nodes.find(n=>n.textContent==='Compartir desde mi móvil');
 assert.equal(calls.length,0);
 await copy.events.click();
 assert.deepEqual(calls[0],['copy','https://redlibertad.com/resuelve/pregunta/7']);
 await native.events.click();
 assert.equal(calls[1][0],'native');
 assert.equal(calls[1][1].url,'https://redlibertad.com/resuelve/pregunta/7');
 assert.equal(calls[1][1].title,'Busco orientación');
});

test('V3.5.17.1: compartir desde listado y detalle, sin modificar el registro ni añadir APIs',()=>{
 assert.match(source,/button\(canOfferFirstReply\(q\)\?/);
 assert.match(source,/goToFirstReply\(q\.id\):openDetail\(q\.id\)/);
 assert.match(source,/questionShareControl\(q,true\)/);
 assert.match(source,/function connectedActions\(q\)/);
 assert.match(source,/questionShareControl\(q\)/);
 assert.match(source,/Elige a quién se la envías/);
 assert.match(source,/Podrá leerla sin cuenta/);
 assert.match(source,/navigator\.clipboard\.writeText\(questionUrl\)/);
 assert.doesNotMatch(source.slice(source.indexOf('function questionShareControl'),source.indexOf('function connectedActions')),/\.innerHTML\s*=|api\/posts|api\/messages|api\/notifications/);
 assert.match(css,/\.question-share-options\[hidden\]\{display:none!important\}/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/min-height:44px/);
});

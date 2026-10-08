'use strict';

// A standalone, printable, offline document. No scripts or external assets.
// The HTML is informative; it is NOT a signed or certified legal receipt.
function escapeHTML(value){
  return String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[char]);
}

const documentLabels=Object.freeze({
  terms:'Términos de Uso',
  community_guidelines:'Normas de la Comunidad',
  privacy:'Política de Privacidad'
});
const sourceLabels=Object.freeze({
  registration:'Registro durante el alta',
  'account-legal-center':'Confirmación voluntaria desde Cuenta',
  'legacy-terms-column':'Registro histórico anterior al versionado'
});

function utcDate(value){
  if(!value)return 'Sin fecha registrada';
  const parsed=new Date(value);
  if(Number.isNaN(parsed.getTime()))return 'Sin fecha registrada';
  return parsed.toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC');
}

function renderLegalConsentReceiptHTML(receipt){
  if(!receipt || receipt.format!=='redlibertad-legal-consent-record' || !receipt.account){
    throw new TypeError('invalid_legal_receipt');
  }
  const events=Array.isArray(receipt.legalAcceptances)?receipt.legalAcceptances:[];
  const documents=receipt.documents||{};
  const documentCards=Object.entries(documentLabels).map(([key,label])=>{
    const doc=documents[key]||{};
    return '<li class="document-card"><span class="label">'+escapeHTML(label)+'</span>'+
      '<strong>Versión vigente: '+escapeHTML(doc.currentVersion||'Sin información')+'</strong>'+
      '<small>Ruta del texto vigente: '+escapeHTML(doc.currentTextPath||'No disponible')+'</small></li>';
  }).join('');
  const history=events.map(record=>{
    const key=String(record.documentKey||'');
    const version=String(record.documentVersion||'Sin versión');
    const action=record.action==='acknowledged'?'Lectura reconocida':
      record.action==='accepted'?'Aceptación registrada':'Acción registrada: '+String(record.action||'Desconocida');
    const origin=sourceLabels[record.source]||('Origen: '+String(record.source||'No especificado'));
    const current=String(documents[key]?.currentVersion||'');
    const state=version==='legacy'?'Registro legacy (no acredita versiones posteriores)':
      current && version===current?'Coincide con la versión vigente':'Versión histórica o no vigente';
    const label=documentLabels[key]||('Documento: '+key);
    return '<li class="record"><div class="record-head"><h3>'+escapeHTML(label)+'</h3>'+
      '<span class="tag">'+escapeHTML(state)+'</span></div>'+
      '<dl><div><dt>Versión registrada</dt><dd>'+escapeHTML(version)+'</dd></div>'+
      '<div><dt>Acción</dt><dd>'+escapeHTML(action)+'</dd></div>'+
      '<div><dt>Fecha registrada (UTC)</dt><dd>'+escapeHTML(utcDate(record.recordedAt))+'</dd></div>'+
      '<div><dt>Procedencia</dt><dd>'+escapeHTML(origin)+'</dd></div></dl></li>';
  }).join('');
  const notice=String(receipt.notice||'Registro informativo, no certificado digital.');
  return '<!doctype html><html lang="es"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width, initial-scale=1">'+
    '<meta name="referrer" content="no-referrer">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">'+
    '<title>Registro legal personal · RedLibertad</title>'+
    '<style>'+
    '*{box-sizing:border-box}body{margin:0;background:#f2f5f7;color:#14283b;font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}'+
    '.paper{max-width:850px;margin:24px auto;padding:32px;background:#fff;border:1px solid #d6e2e8;border-radius:18px}'+
    '.brand{font-weight:850;letter-spacing:.07em;text-transform:uppercase;font-size:13px;color:#08786f}'+
    'h1{font-size:clamp(26px,5vw,36px);line-height:1.2;margin:8px 0 12px}h2{font-size:19px;margin:30px 0 12px}'+
    '.lead{font-size:15px;color:#435568;margin:0 0 16px}.notice{border-left:4px solid #08786f;background:#edf8f6;padding:12px 15px;border-radius:7px;font-size:13px}'+
    '.meta,.document-list,.records{list-style:none;padding:0;margin:0;display:grid;gap:10px}'+
    '.meta{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:18px}'+
    '.meta li,.document-card,.record{background:#fafcfd;border:1px solid #dbe6e9;border-radius:12px;padding:14px}'+
    '.label,.meta small,dt{display:block;color:#53667a;font-size:12px}strong{display:block;font-weight:750}small{overflow-wrap:anywhere}'+
    '.document-list{grid-template-columns:repeat(3,minmax(0,1fr))}.document-card{display:grid;align-content:start;gap:5px}'+
    '.record-head{display:flex;flex-wrap:wrap;gap:9px;justify-content:space-between;align-items:flex-start}'+
    '.record h3{margin:0;font-size:16px}.tag{background:#e7f2f0;color:#126a63;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:750}'+
    'dl{margin:12px 0 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}dd{margin:1px 0 0;overflow-wrap:anywhere;font-weight:600}'+
    '.empty{padding:18px;border:1px dashed #bacbd1;border-radius:12px}.footer{margin-top:26px;color:#556576;font-size:12px}'+
    '@media(max-width:620px){.paper{margin:0;border:0;border-radius:0;padding:20px 16px}.meta,.document-list,dl{grid-template-columns:minmax(0,1fr)}}'+
    '@media print{@page{size:A4;margin:13mm}body{background:#fff;font-size:11pt}.paper{margin:0;padding:0;max-width:none;border:0;border-radius:0}'+
    '.record,.document-card,.meta li,.notice{break-inside:avoid;print-color-adjust:exact}.footer{page-break-before:auto}h2{break-after:avoid}}'+
    '</style></head><body><main class="paper"><header><div class="brand">RedLibertad</div>'+
    '<h1>Registro personal de consentimientos</h1>'+
    '<p class="lead">Resumen legible de los hechos almacenados para esta cuenta, generado el '+escapeHTML(utcDate(receipt.generatedAt))+'.</p>'+
    '<p class="notice">'+escapeHTML(notice)+'</p></header>'+
    '<ul class="meta"><li><small>Cuenta</small><strong>@'+escapeHTML(receipt.account.username||'')+'</strong></li>'+
    '<li><small>Miembro desde (UTC)</small><strong>'+escapeHTML(utcDate(receipt.account.createdAt))+'</strong></li></ul>'+
    '<section><h2>Documentos vigentes al generar el archivo</h2>'+
    '<ul class="document-list">'+documentCards+'</ul>'+
    '<p class="footer">Estas versiones son las vigentes al generar el archivo. No son una copia de las versiones aceptadas históricamente.</p></section>'+
    '<section><h2>Historial de acciones ('+events.length+')</h2>'+
    (events.length?'<ol class="records">'+history+'</ol>':'<p class="empty">No constan acciones legales registradas en esta cuenta.</p>')+
    '</section><footer class="footer">Archivo privado e informativo, no certificado ni firmado digitalmente. Consérvalo en un lugar seguro. No incluye los textos completos ni acredita acciones no registradas.</footer>'+
    '</main></body></html>';
}

module.exports={renderLegalConsentReceiptHTML,escapeHTML,utcDate};

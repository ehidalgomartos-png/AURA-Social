'use strict';

/**
 * Build an informational, per-account snapshot of recorded legal actions.
 * This is not a digitally signed certificate or an archive of legal texts.
 */
function buildLegalConsentReceipt({account,legalAcceptances,legalDocuments,generatedAt}){
  if(!account || !account.username)throw new TypeError('account_required');
  const date=generatedAt || new Date().toISOString();
  const known=['terms','community_guidelines','privacy'];
  const documents=Object.fromEntries(known.map(key=>{
    const doc=legalDocuments?.[key]||{};
    return [key,{currentVersion:String(doc.version||''),currentTextPath:String(doc.path||'')}];
  }));
  const records=(Array.isArray(legalAcceptances)?legalAcceptances:[]).map(item=>({
    documentKey:item.document_key,
    documentVersion:item.document_version,
    action:item.action,
    source:item.source,
    recordedAt:item.accepted_at
  }));
  return {
    format:'redlibertad-legal-consent-record',
    schemaVersion:'1.0',
    generatedAt:date,
    account:{username:String(account.username),createdAt:account.created_at||null},
    documents,
    legalAcceptances:records,
    notice:'Registro informativo de acciones legales almacenadas. Una versión legacy indica un dato anterior al versionado; no acredita la aceptación de textos posteriores. Los enlaces apuntan al texto vigente, no a una copia histórica. No es una certificación digital.'
  };
}

module.exports={buildLegalConsentReceipt};

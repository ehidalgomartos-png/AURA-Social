'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('V3.5.36: suggestions rely only on private topics already chosen by user',()=>{
 const js=read('public/resuelve-v350.js'),api=read('src/routes/resuelve-v350.js');
 assert.match(js,/async function loadHelpSuggestions\(\)/);
 const block=js.slice(js.indexOf('async function loadHelpSuggestions()'),js.indexOf('async function loadHelpAlerts()'));
 assert.match(block,/if\(!state.user\)return/);
 assert.match(block,/request\('\/api\/resuelve\/help-topics'\)/);
 assert.match(block,/if\(!selected.length\)return/);
 assert.match(block,/request\('\/api\/resuelve\/questions\/for-me'\)/);
 assert.match(block,/q.status==='open'&&selected.includes\(q.category\)/);
 assert.match(block,/matches.slice\(0,3\)/);
 assert.match(block,/panel.hidden=true;list.replaceChildren\(\)/);
 assert.doesNotMatch(block,/write\(|notify|sendEmail|api\/posts/i);
 assert.match(api,/router.get\('\/questions\/for-me',requireAuth/);
});

test('V3.5.36: existing matching API isolates author and requires an active session',()=>{
 const service=read('src/services/resuelve-v350.js');
 const block=service.slice(service.indexOf('async function listToHelp('),service.indexOf('// V3.5.4'));
 assert.match(block,/JOIN resuelve_help_preferences p ON p.user_id=\$1 AND q.category=ANY\(p.categories\)/);
 assert.match(block,/u.status='active'/);
 assert.match(block,/WHERE q.status='open' AND q.author_id<>\$1/);
 assert.match(block,/ORDER BY q.id DESC LIMIT 24/);
 assert.doesNotMatch(block,/virtual|fake|user.email|phone/i);
});

test('V3.5.36: recommendations are accessible, mobile-first and never show empty fake cards',()=>{
 const js=read('public/resuelve-v350.js');
 const html=read('public/resuelve.html'),css=read('public/resuelve-v350.css');
 for(const id of ['helpSuggestions','helpSuggestionsList','helpSuggestionsStatus','helpSuggestionsMore'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/id="helpSuggestions"[^>]*hidden/);
 assert.match(js,/create\('a',null,q.title\)/);
 assert.match(js,/link.href='\/resuelve\?id='\+encodeURIComponent\(q.id\)/);
 assert.match(js,/helpSuggestionsMore'\)\.addEventListener\('click'/);
 assert.match(js,/await loadHelpSuggestions\(\)/);
 assert.match(css,/\.resuelve-help-suggestions/);
 assert.match(css,/@media\(max-width:740px\)/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.doesNotThrow(()=>new Function(js));
});
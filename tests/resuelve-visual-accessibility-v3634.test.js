'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=read('public/resuelve-v350.js');
const html=read('public/resuelve.html');
const css=read('public/resuelve-polish-v3634.css');

test('V3.6.34: question and solution card regions have accessible labels from real titles',()=>{
 const q=js.slice(js.indexOf(' function card(q){'),js.indexOf('// V3.5.16 — intereses'));
 const s=js.slice(js.indexOf(' function solutionCard(q){'),js.indexOf(' // V3.6.31'));
 assert.match(q,/heading\.id='resuelve-question-title-'\+String\(q\.id\)/);
 assert.match(q,/article\.setAttribute\('aria-labelledby',heading\.id\)/);
 assert.match(q,/bindDetailNavigation\(headingLink,q\.id,'questions'\)/);
 assert.match(s,/heading\.id='resuelve-solution-title-'\+String\(q\.id\)/);
 assert.match(s,/article\.setAttribute\('aria-labelledby',heading\.id\)/);
 assert.match(s,/bindDetailNavigation\(link,q\.id,'solutions'\)/);
 assert.doesNotMatch(q+s,/\.innerHTML|fetch\(|openAuth\(/);
});
test('V3.6.34: detail uses its real heading as accessible label',()=>{
 assert.match(html,/id="detailPanel"[^>]*aria-labelledby="detailTitle"/);
 const area=js.slice(js.indexOf('function renderDetail(data){'),js.indexOf('function goList(){'));
 assert.match(area,/detailHeading=create\('h2',null,q\.title\)/);
 assert.match(area,/detailHeading\.id='detailTitle'/);
 assert.match(area,/host\.append\([\s\S]*?detailHeading,meta/);
 assert.doesNotMatch(area,/\.innerHTML\s*=/);
});
test('V3.6.34: answers region, actual counts, and chosen solution remain accessible',()=>{
 assert.match(html,/id="answerList" class="answers" role="region" aria-labelledby="resuelveAnswersTitle"/);
 const block=js.slice(js.indexOf("const h=create('h3'"),js.indexOf('void loadAnswerFollowups(q.id)'));
 assert.match(block,/h\.id='resuelveAnswersTitle'/);
 assert.match(block,/data\.answers\.length/);
 assert.match(block,/const accepted=String\(a\.id\)===String\(q\.accepted_answer_id\)/);
 assert.match(block,/authorHeading\.id='resuelve-answer-author-'\+String\(a\.id\)/);
 assert.match(block,/item\.setAttribute\('aria-labelledby',authorHeading\.id\)/);
 assert.match(block,/chip\('✓ Solución elegida',true\)/);
 assert.doesNotMatch(block,/Math\.random\(|fake|INSERT|UPDATE|DELETE/);
});
test('V3.6.34: professional two-column desktop, clean one-column mobile and touch targets',()=>{
 assert.match(css,/@media\(min-width:960px\)/);
 assert.match(css,/#questions #questionList\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/min-height:46px/);
 assert.match(css,/overflow-wrap:anywhere/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(css,/display:none|position:fixed|visibility:hidden/);
});
test('V3.6.34: existing privacy protections and safe text rendering are preserved',()=>{
 assert.match(read('src/services/resuelve-v350.js'),/q\.library_approved_answer_id=q\.accepted_answer_id/);
 assert.match(read('src/services/resuelve-v350.js'),/q\.library_opt_out=FALSE/);
 assert.match(html,/resuelve-polish-v3634\.css/);
 assert.doesNotThrow(()=>new Function(js));
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
});

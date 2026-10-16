'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=file=>fs.readFileSync(file,'utf8');
const html=read('public/app.html'),css=read('public/community-compose-polish-v32771.css'),js=read('public/community-compose-polish-v32771.js');
const social=read('public/social.js');
test('community composer is one correctly bound full-width accessible form',()=>{
 const section=html.split('id="communityComposeSection"')[1].split('class="community-posts-section"')[0];
 assert.match(section,/id="communityPostForm"/);
 assert.match(section,/id="communityPostBody" name="body" rows="4" maxlength="2200"/);
 assert.match(section,/for="communityPostBody"/);
 assert.match(section,/id="communityPostFile" type="file" hidden/);
 assert.match(section,/name="contentLevel"/);
 assert.match(section,/id="communityPostMediaPreview"/);
 assert.match(section,/button class="primary community-compose-submit" type="submit"/);
 assert.match(section,/id="communityPostStatus" class="status"/);
 assert.equal((section.match(/id="communityPostFile"/g)||[]).length,1);
});
test('responsive community styles are scoped to composer without altering global media inputs',()=>{
 assert.match(css,/\.community-compose #communityPostBody\{[\s\S]*?width:100%/);
 assert.match(css,/font:500 16px/);
 assert.match(css,/\.community-compose \.community-compose-file-btn/);
 assert.match(css,/\.community-compose \.community-compose-submit/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(html,/community-compose-polish-v32771\.css\?v=3\.2\.77\.1/);
});
test('file preview and counter do not replace backend publication path',()=>{
 assert.match(html,/community-compose-polish-v32771\.js\?v=3\.2\.77\.1/);
 assert.match(js,/fileInput\.addEventListener\('change',updatePreview\)/);
 assert.match(js,/body\.addEventListener\('input',updateLength\)/);
 assert.match(js,/form\.addEventListener\('reset'/);
 assert.match(js,/URL\.revokeObjectURL/);
 assert.match(js,/fileInput\.value=''/);
 assert.match(social,/\$\('#communityPostForm'\)\?\.addEventListener\('submit'/);
 assert.match(social,/const file=\$\('#communityPostFile'\)\?\.files\?\.\[0\]/);
 assert.match(social,/fd\.get\('contentLevel'\)/);
});

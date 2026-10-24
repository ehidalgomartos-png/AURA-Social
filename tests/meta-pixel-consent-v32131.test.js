const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('Meta script loads only after opt-in and pixel ID matches RedLibertad', () => {
  const code = read('public/meta-pixel-consent.js');
  assert.match(code, /2349464439156555/);
  assert.match(code, /if \(decision !== 'accepted' \|\| loaded\) return false/);
  assert.match(code, /connect\.facebook\.net\/en_US\/fbevents\.js/);
  assert.match(code, /CompleteRegistration/);
  assert.match(code, /data-meta-consent="rejected"/);
  assert.match(code, /data-meta-consent="accepted"/);
  assert.doesNotMatch(code, /fbq\('track', 'Lead'\)/);
});
test('successful signup triggers conversion and landing page hosts consent controls', () => {
  const app = read('public/app.js');
  const index = read('public/index.html');
  assert.match(app, /if\(!r\.ok\)[\s\S]*?window\.RedLibertadMeta\?\.trackRegistration\(\)/);
  assert.match(index, /meta-pixel-consent\.js/);
  assert.match(index, /metaCookieSettings/);
});
test('CSP explicitly permits Meta script and connections', () => {
  const server = read('server.js');
  assert.match(server, /scriptSrc: \["'self'", 'https:\/\/connect\.facebook\.net'\]/);
  assert.match(server, /connectSrc: \["'self'", 'https:\/\/www\.facebook\.com'/);
});

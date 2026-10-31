const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const index = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');

test('portada mantiene las dos acciones principales y un enlace real a servicios', () => {
  const actions = index.match(/<div class="hero-actions">([\s\S]*?)<\/div>/)?.[1] || '';
  assert.match(actions, /href="#registro">Crear cuenta<\/a>/);
  assert.match(actions, /href="#acceso">Ya tengo cuenta<\/a>/);
  assert.match(actions, /class="button ghost hero-services-cta-v3647" href="\/explorar">Ver todos los servicios<\/a>/);
  assert.ok(actions.indexOf('Crear cuenta') < actions.indexOf('Ya tengo cuenta'));
  assert.ok(actions.indexOf('Ya tengo cuenta') < actions.indexOf('Ver todos los servicios'));
});

test('la tercera acción móvil ocupa ambas columnas y parece un enlace', () => {
  assert.match(styles, /@media\(max-width:639px\)\s*\{\s*\.hero-actions > \.hero-services-cta-v3647\s*\{/);
  assert.match(styles, /\.hero-actions > \.hero-services-cta-v3647\s*\{[^}]*grid-column:1 \/ -1;[^}]*width:100%;[^}]*min-height:44px;[^}]*border:0;[^}]*text-decoration:underline;/s);
  assert.match(index, /\/styles\.css\?v=3\.6\.53/);
  assert.doesNotMatch(styles, /\.hero-actions\s*>\s*\.hero-services-cta-v3647::after\s*\{/);
  assert.doesNotMatch(index, /Ver todos los servicios\s*(?:→|↗|&rarr;)/);
});

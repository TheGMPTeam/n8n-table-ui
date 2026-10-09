const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
test('forest theme exposes consistent tokens and accessible contrast', () => {
  const tokens = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map(m => [m[1],m[2]]));
  assert.equal(tokens.accent, '#b4f354');
  function luminance(hex) { const c = hex.slice(1).match(/../g).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4); return c[0]*.2126+c[1]*.7152+c[2]*.0722; }
  function contrast(a,b) { const v=[luminance(a),luminance(b)].sort((a,b)=>b-a); return (v[0]+.05)/(v[1]+.05); }
  for(const fg of ['text','muted','accent','success','warn','danger']) assert.ok(contrast(tokens[fg],tokens.panel)>=4.5, fg+' panel contrast');
  assert.ok(contrast(tokens.text,tokens.input)>=4.5);
  assert.ok(contrast('#15200e',tokens.accent)>=4.5);
});
test('theme keeps mobile table scrolling, keyboard focus and reduced motion', () => {
  assert.equal((html.match(/class="table-scroll" tabindex="0" role="region"/g)||[]).length,4);
  assert.match(css,/\.table-scroll\s*\{[^}]*overflow-x: auto/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/@media \(max-width: 760px\)/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css,/animation: none !important/);
});

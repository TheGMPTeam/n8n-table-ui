const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');
test('HUD surface preserves forest palette and accessible scroll regions', () => {
 assert.match(html, /Operational HUD/);
 assert.match(html, /--accent: #b4f354/);
 assert.equal((html.match(/class="table-scroll" tabindex="0" role="region"/g)||[]).length,3);
 assert.match(html, /prefers-reduced-motion/);
});
test('configuration inputs have associated labels', () => {
 for(const id of ['cfg-table-home','cfg-table-jobs','cfg-table-templates','cfg-refresh-interval']) assert.match(html,new RegExp('<label for="'+id+'">'));
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
test('mapped settings groups and creation cards have semantic labels',()=>{
 for(const name of ['Table routing','Connection details','Display & refresh']) assert.ok(html.includes('<legend>'+name+'</legend>'));
 for(const id of ['new-name','new-cols']) assert.ok(html.includes('for="'+id+'"'));
 assert.match(html,/class="creation-card"/);
 assert.match(html,/class="creation-summary"/);
});
test('reference accents target panels without introducing scroll locks or copied assets',()=>{
 assert.match(css,/#panel-tables \.panel-header/);
 assert.match(css,/\.settings-grid/);
 assert.match(css,/\.creation-layout/);
 assert.match(css,/Reference-mapped restrained accents/);
 const mapped=css.split('Reference-mapped restrained accents')[1];
 assert.doesNotMatch(mapped,/overflow:\s*hidden|backdrop-filter:\s*blur|url\(/);
 assert.match(mapped,/backdrop-filter: none/);
 assert.match(mapped,/@media \(max-width: 760px\)/);
});

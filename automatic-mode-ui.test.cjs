const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('updater shows readonly recommendation, no authorization checkbox or mode dropdown',()=>{
 const html=fs.readFileSync('index.html','utf8');
 const popup=html.slice(html.indexOf('function openUpdaterModal()'),html.indexOf('    (async () => {',html.indexOf('function openUpdaterModal()')));
 assert.doesNotMatch(popup,/updater-confirm|select id="updater-mode"|Explicit authorization checkbox/);
 assert.match(popup,/c\.recommendedMode/); assert.match(popup,/c\.modeReason/);
 assert.match(popup,/checked\.requiresConfirmation/); assert.match(popup,/window\.confirm/);
 assert.doesNotMatch(popup,/mode:\$|confirm:true/);
});

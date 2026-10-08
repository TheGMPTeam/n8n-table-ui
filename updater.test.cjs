const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
test('updater opens independently without locking page and restores focus on repeated close',()=>{
 const elements={}; const opener={focus(){this.focused=true}};
 for(const id of ['updater-overlay','updater-body','updater-title','updater-close','updater-modal']) elements[id]={style:{},focus(){this.focused=true},setAttribute(){},removeAttribute(){}};
 const document={body:{style:{overflow:'auto'}},activeElement:opener};
 const ctx={document,state:{modalOpen:false},$:s=>elements[s.slice(1)]};
 vm.createContext(ctx);
 vm.runInContext(html.slice(html.indexOf('  function showUpdaterModal('),html.indexOf('  function openUpdaterModal(')),ctx);
 for(let i=0;i<3;i++){
 ctx.showUpdaterModal('info',{});
 assert.equal(document.body.style.overflow,'auto');
 assert.equal(elements['updater-overlay'].style.display,'flex');
 ctx.hideUpdaterModal();
 assert.equal(document.body.style.overflow,'auto');
 assert.equal(elements['updater-overlay'].style.display,'none');
 assert.equal(opener.focused,true);
 }
});
test('updater has isolated visible dialog and unique close control',()=>{
 assert.match(html,/id="updater-modal"[^>]*role="dialog"/);
 assert.match(html,/#updater-overlay[^}]*pointer-events: none/);
 assert.match(html,/#updater-modal[^}]*pointer-events: auto/);
 assert.equal((html.match(/id="updater-close"/g)||[]).length,1);
 assert.match(html,/e.key === 'Escape'/);
});

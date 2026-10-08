const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
test('Home batch confirms snapshot, calls only helper, reports partial counts',async()=>{
 const script=html.match(/\/\/ HOME DELETE START([\s\S]*?)\/\/ HOME DELETE END/);assert.ok(script,'complete batch handler present');
 const calls=[];const nodes={'home-delete-all':{},'home-delete-selected':{},'home-delete-unavailable':{},'home-delete-selection':{}};
 const state={rowsTableId:'home',currentTableId:'home',rows:[{id:1,URL:'u1',Completed:true,Working:false},{id:2,URL:'u2',Completed:true,Working:false}]};
 const context={state,TABLES:{comfy:'home'},document:{getElementById:id=>nodes[id]},escapeHtml:String,escapeAttr:String,confirm:()=>{calls.push('confirm');return true;},fetch:async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return {ok:true,json:async()=>({results:[{id:1,fileDeleted:true,rowDeleted:true},{id:2,fileDeleted:true,rowDeleted:false,error:'fixture'}],fileDeleted:2,rowDeleted:1,failed:1})};},loadTable:async()=>{},setStatus:()=>{},Set,Date};
 vm.createContext(context);vm.runInContext(script[1]+';globalThis.testDelete=deleteHomeSelection;globalThis.select=homeDeleteSelection;homeDeleteAvailable=true;',context);
 context.select.add(1);context.select.add(2);await context.testDelete();assert.equal(calls[0],'confirm');assert.equal(calls[1].url,'/home-delete/delete');assert.deepEqual(JSON.parse(JSON.stringify(calls[1].body)),{rows:[{id:1,url:'u1'},{id:2,url:'u2'}]});assert.match(nodes['home-delete-unavailable'].textContent,/2 files.*1 rows.*1 failed/);assert.equal(context.select.has(2),true);assert.equal(context.select.has(1),false);
});

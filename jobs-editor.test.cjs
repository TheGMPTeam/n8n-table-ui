const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function editor(table){
  const nodes=new Map(); const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',style:{},focus(){},classList:{add(){},remove(){}},addEventListener(){},querySelectorAll(){return []}});return nodes.get(id)};
  const requests=[],timers=[];
  const row={id:17,Type:'script',API:'original API',prompt:'original prompt',Params:'{"seed":17}',Completed:false,Working:null};
  const c={document:{activeElement:null},isTrackingCol:()=>false,state:{currentTableId:table,templates:[],modalRow:null},TABLES:{shorts:'jobs',comfy:'home'},$:s=>s==='#modal-type'?null:node(s),log(){},escapeHtml:String,escapeAttr:String,colKey:k=>String(k).toLowerCase(),isCol:(k,...names)=>names.some(n=>n.toLowerCase()===k.toLowerCase()),isHiddenCol:k=>k==='id',isTrue:v=>v===true,canonicalType:String,setTimeout:f=>timers.push(f),setStatus(){},validateParams:s=>{JSON.parse(s);return s},callWebhook:async(p,b)=>requests.push({p,b}),loadTable:async()=>{},loadTemplates:async()=>{requests.push({templateFetch:true})},enrichRowsWithTemplateAPI:async()=>{}};
  vm.createContext(c); vm.runInContext(html.slice(html.indexOf('  function openModalByRow('),html.indexOf('  async function sendPatch(')),c);
  const start=html.indexOf('  async function sendPatch('); vm.runInContext(html.slice(start,html.indexOf('\n  function ',start)),c);
  c.openModalByRow(row,table,'edit'); return {c,row,node,requests,timers};
}
test('Jobs edit omits type selector and template API but keeps job fields',()=>{
 const {node}=editor('jobs'); const body=node('#modal-body').innerHTML;
 assert.doesNotMatch(body,/modal-type|Template API|modal-template-api/);
 assert.match(body,/modal-prompt/); assert.match(body,/modal-Params/);
});
test('Home editor retains type and template API controls',()=>{
 const {node}=editor('home'); assert.match(node('#modal-body').innerHTML,/modal-type/);assert.match(node('#modal-body').innerHTML,/Template API/);
});
test('Jobs save excludes type/API and never reloads templates, preserving existing row values',async()=>{
 const {c,row,node,requests,timers}=editor('jobs');
 const fields=[['prompt','changed prompt'],['Params','{"seed":18}'],['Type','injected type'],['API','injected API']];
 node('#modal-body').querySelectorAll=()=>fields.map(([key,value])=>({value,closest:()=>({querySelector:()=>({textContent:key})})}));
 await c.sendPatch();
 const patch=requests[0].b.row; assert.equal(patch.prompt,'changed prompt');assert.equal(patch.Params,'{"seed":18}');assert.equal(patch.Type,undefined);assert.equal(patch.API,undefined);
 Object.assign(row,patch);assert.equal(row.Type,'script');assert.equal(row.API,'original API');
 for(const timer of timers)await timer();assert.equal(requests.filter(r=>r.templateFetch).length,0);
});

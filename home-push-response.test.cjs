const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function harness(type,response={ok:true,status:200,text:async()=>'{"message":"Workflow was started"}'}) {
 const requests=[],statuses=[];
 const c={state:{currentTableId:'comfy',rowsTableId:'comfy',rows:[{id:1,type:type,Working:null},{id:2,Type:'Ideas',Working:false}]},TABLES:{comfy:'comfy',shorts:'shorts'},setStatus:(...s)=>statuses.push(s),log(){},colVal:(r,k)=>r[k],setTimeout(){},fetch:async(p,o)=>{requests.push({path:p,method:o.method,body:JSON.parse(o.body)});return response;}};
 vm.createContext(c);vm.runInContext(html.slice(html.indexOf('  function canPushRow('),html.indexOf('  // ─── Modal',html.indexOf('  function canPushRow('))),c);return {c,requests,statuses};
}
for(const type of ['Text to image','Image to video','FLF to video']) test('Home '+type+' uses ComfyUI exact row and no pre-lock',async()=>{const {c,requests,statuses}=harness(type);await c.doPush('1',type);assert.deepEqual(requests,[{path:'/dispatch/runner',method:'POST',body:{rowId:'1'}}]);assert.equal(c.state.rows[0].Working,null);assert.match(statuses.at(-1)[0],/completion is not yet verified/);});
test('unused Respond error is surfaced rather than claimed completed',async()=>{const {c,statuses}=harness('Text to image',{ok:false,status:500,text:async()=>'{"message":"Unused Respond to Webhook node found in the workflow"}'});await c.doPush('1','Scene');assert.match(statuses.at(-1)[0],/HTTP 500: Unused Respond to Webhook/);assert.equal(statuses.at(-1)[1],'danger');});
test('Home already-working row is not dispatched',async()=>{const {c,requests}=harness('Text to image');c.state.rows[0].Working=true;await c.doPush('1','Text to image');assert.equal(requests.length,0);});

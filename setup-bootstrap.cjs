'use strict';
// Fixed trusted-LAN setup contract. REST is inventory/readback only; writes use native CRUD.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const fail=(message,status=409)=>Object.assign(Error(message),{status});
function transport({n8nHost,n8nPort,key}){return (method,route,body)=>new Promise((resolve,reject)=>{
 const native=route.startsWith('/webhook/');if(!native&&!key)return reject(fail('Server-side n8n API credential is required',503));
 const headers={'Content-Type':'application/json',...(!native?{'X-N8N-API-KEY':key}:{})};
 const req=http.request({host:n8nHost,port:n8nPort,path:route,method,headers},res=>{let size=0,parts=[];res.on('data',c=>{size+=c.length;if(size>8*1024*1024)return req.destroy(fail('Setup response too large',502));parts.push(c)});res.on('error',reject);res.on('end',()=>{try{if(res.statusCode<200||res.statusCode>=300)throw fail('Native setup request failed: HTTP '+res.statusCode);resolve(JSON.parse(Buffer.concat(parts).toString()))}catch(e){reject(e)}})});
 req.setTimeout(30000,()=>req.destroy(fail('Setup request timed out; inspect native state before retry',504)));req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
})}
function unwrap(value){if(Array.isArray(value)){if(value.length!==1)throw fail('Ambiguous native response');value=value[0]}if(!value||typeof value!=='object'||value.error)throw fail('Native CRUD refused setup');return value}
function schema(t){return t.columns.filter(c=>!c.removed).map(c=>({name:c.name,type:c.type}))}
async function buildRequiredTables({request,tables,templates,includeTemplates=false,projectId}){
 let cursor=null,seen=new Set(),inventory=[];do{const page=await request('GET','/api/v1/data-tables?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));if(!Array.isArray(page.data))throw fail('Invalid table inventory');inventory.push(...page.data);cursor=page.nextCursor||null;if(cursor&&seen.has(cursor))throw fail('Repeated inventory cursor');seen.add(cursor)}while(cursor);
 const map={},names={},results=[];
 for(const required of tables){const matches=inventory.filter(t=>t.name===required.name);if(matches.length>1)throw fail('Ambiguous existing table: '+required.name);let id;
  if(matches.length)id=matches[0].id;else{const row={name:required.name,columns:required.columns,...(projectId?{projectId}:{})};const created=unwrap(await request('POST','/webhook/yt-create',{operation:'create',row}));if(typeof created.id!=='string'||!created.id)throw fail('Native create returned no table ID; inspect before retry');id=created.id;inventory.push({id,name:required.name})}
  const actual=await request('GET','/api/v1/data-tables/'+encodeURIComponent(id));if(actual.name!==required.name||JSON.stringify(schema(actual))!==JSON.stringify(required.columns))throw fail('Schema conflict: '+required.name+'; existing data preserved');
  const read=unwrap(await request('POST','/webhook/yt-get',{operation:'get',id,limit:1}));if(!Array.isArray(read.data))throw fail('CRUD get readback missing data');
  map[required.sourceId]=id;names[required.name]=id;results.push({name:required.name,id,ok:true,message:matches.length?'Compatible existing schema verified':'Created through CRUD and verified'});
 }
 if(includeTemplates){const id=map[templates.sourceTableId];if(!id)throw fail('Template schema not present');const current=unwrap(await request('POST','/webhook/yt-get',{operation:'get',id,limit:250}));if(current.nextCursor)throw fail('Existing template configuration is paginated; preserve it and validate manually');if(!Array.isArray(current.data))throw fail('Invalid template readback');if(!current.data.length){const ack=unwrap(await request('POST','/webhook/yt-wright',{operation:'write',id,row:{data:templates.rows}}));if(ack.success!==true||ack.insertedRows!==templates.rows.length)throw fail('Template acknowledgement mismatch; inspect before retry');const verified=unwrap(await request('POST','/webhook/yt-get',{operation:'get',id,limit:250}));if(verified.data?.length!==templates.rows.length)throw fail('Template readback count mismatch');for(let i=0;i<templates.rows.length;i++)for(const [key,value] of Object.entries(templates.rows[i]))if(verified.data[i][key]!==value)throw fail('Template configuration readback mismatch')}results.push({name:'ComfyUI template configuration',ok:true,message:current.data.length?'Existing templates preserved; operator validation required':'Written through CRUD and verified'})}
 return {ok:true,mapping:map,tablesByName:names,results,workflowRemappingRequired:true,schedulesActivated:false};
}
function createSetupHandler({dataDir,n8nHost,n8nPort,key,request=transport({n8nHost,n8nPort,key}),assetDir=path.join(__dirname,'full-stack')}){
 let busy=false;
 return async(req,res,pathname,buf)=>{if(!['/setup/build-required-tables','/setup/status'].includes(pathname))return false;const reply=(s,j)=>{res.writeHead(s,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(j))};let acquired=false;try{
  if(pathname==='/setup/status'){
   if(req.method!=='GET'||req.url?.includes('?'))throw fail('Plain GET required',405);
   let cursor=null,seen=new Set(),workflows=[];
   do{const page=await request('GET','/api/v1/workflows?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));if(!Array.isArray(page.data))throw fail('Workflow inventory unavailable',503);workflows.push(...page.data);cursor=page.nextCursor||null;if(cursor&&seen.has(cursor))throw fail('Repeated workflow cursor');seen.add(cursor)}while(cursor);
   const matches=workflows.filter(w=>w.name==='Data Table CRUD'&&w.active===true);
   if(matches.length!==1)throw fail('Publish exactly one configured Data Table CRUD workflow before building schemas',409);
   const current=await request('GET','/api/v1/workflows/'+encodeURIComponent(matches[0].id));const published=current.activeVersion||current;
   const paths=new Set(published.nodes.filter(n=>n.type==='n8n-nodes-base.webhook'&&!n.disabled&&n.parameters.httpMethod==='POST').map(n=>n.parameters.path));
   if(!['yt-create','yt-get','yt-wright','yt-update','yt-remove'].every(p=>paths.has(p)))throw fail('Published CRUD transport paths are incomplete',409);
   reply(200,{ok:true,crudPublished:true,message:'Native CRUD published with all five current POST routes; credentials are checked by actual setup operations'});return true;
  }
  if(req.method!=='POST')throw fail('POST required',405);
  const origin=req.headers.origin;const allowed=new Set((process.env.REVIEW_UI_ORIGINS||'http://10.0.0.157:3458,http://localhost:3458,http://127.0.0.1:3458').split(','));if(!allowed.has(origin)||new URL(origin).host!==req.headers.host)throw fail('Exact same-origin request required',403);
  if(buf.length>4096)throw fail('Request too large',413);let body;try{body=JSON.parse(buf)}catch{throw fail('Invalid JSON',400)}if(!body||Array.isArray(body)||Object.keys(body).length!==1||body.confirm!==true)throw fail('Explicit setup confirmation required',400);
  if(busy)throw fail('Setup is already running',429);busy=true;acquired=true;
  const result=await buildRequiredTables({request,tables:JSON.parse(fs.readFileSync(path.join(assetDir,'tables.json'))),templates:JSON.parse(fs.readFileSync(path.join(assetDir,'templates.json'))),includeTemplates:true,projectId:process.env.N8N_SETUP_PROJECT_ID});
  fs.mkdirSync(dataDir,{recursive:true});const file=path.join(dataDir,'setup-table-map.json');const tmp=file+'.'+process.pid+'.'+require('node:crypto').randomBytes(8).toString('hex');try{fs.writeFileSync(tmp,JSON.stringify(result)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,file)}finally{try{fs.unlinkSync(tmp)}catch{}}
  reply(200,result);
 }catch(e){reply(e.status||503,{ok:false,error:'setup_refused',message:e.status?e.message:'Setup failed; inspect n8n before retrying. Existing tables were not removed.'})}finally{if(acquired)busy=false}return true};
}
module.exports={buildRequiredTables,createSetupHandler};

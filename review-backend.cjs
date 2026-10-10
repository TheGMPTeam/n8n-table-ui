'use strict';
// Trusted-LAN Review transport. Private native header credential stays server-side.
const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
function createReviewHandler({dataDir,n8nHost,n8nPort,comfyHost,comfyPort,tokenFile}) {
 const ollama=require('./ollama-settings.cjs').createOllamaSettings({dataDir});
 const origins=new Set((process.env.REVIEW_UI_ORIGINS||'http://10.0.0.157:3458,http://localhost:3458,http://127.0.0.1:3458').split(','));
 const tickets=new Map(),jobBusy=new Set();let busy=0;const ttl=10*60*1000;
 const secret=()=>fs.readFileSync(path.join(dataDir,'review-secret'),'utf8').trim();
 const fail=(message,status=400)=>Object.assign(Error(message),{status});
 async function request(host,port,url,headers,body,max=4*1024*1024,timeout=20000){return new Promise((resolve,reject)=>{const r=http.request({host,port,path:url,method:body===undefined?'GET':'POST',headers:{...headers,...(body===undefined?{}:{'Content-Type':'application/json'})}},s=>{let n=0,parts=[];s.on('data',c=>{n+=c.length;if(n>max){r.destroy(fail('Upstream response too large',502));return;}parts.push(c)});s.on('end',()=>{let json;try{json=JSON.parse(Buffer.concat(parts).toString())}catch{return reject(fail('Invalid native response',502))}if(s.statusCode!==200)return reject(fail(s.statusCode===401?'Private native transport credential refused': 'Native review request refused',s.statusCode===401?401:409));resolve(json)});s.on('error',reject)});r.setTimeout(timeout,()=>r.destroy(fail('Native request timed out',504)));r.on('error',reject);r.end(body===undefined?undefined:JSON.stringify(body));})}
 async function native(payload){const result=await request(n8nHost,n8nPort,'/webhook/review-private-v1',{'X-Review-Transport':secret()},{...payload,trustSource:"trusted-lan-ui",approvedBy:"trusted-LAN Web UI"},4*1024*1024,payload.action==='enhance_prompt'?180000:20000);const b=Array.isArray(result)?result[0]:result;if(b?.error)throw fail(b.message||b.error,409);return b;}
 function mediaUrl(raw){let u;try{u=new URL(raw)}catch{throw fail('Invalid output URL')};if(u.protocol!=='http:'||u.hostname!==comfyHost||u.port!==String(comfyPort)||u.pathname!=='/view'||u.username||u.password||u.hash)throw fail('Output URL is not the fixed ComfyUI view endpoint');for(const key of u.searchParams.keys())if(!['filename','subfolder','type'].includes(key))throw fail('Unexpected media URL parameter');for(const key of ['filename','subfolder']){const s=u.searchParams.get(key)||'';if(s.includes('\\')||s.includes('\0')||s.startsWith('/')||s.split('/').includes('..')||s.length>1024)throw fail('Unsafe media path');}if(!u.searchParams.get('filename'))throw fail('Missing output filename');if(u.searchParams.has('type')&&!['output','input','temp'].includes(u.searchParams.get('type')))throw fail('Unknown output type');return u;}
 async function readableOutput(raw){const u=mediaUrl(raw);const token=fs.readFileSync(tokenFile,'utf8').split(/\r?\n/)[0].trim();return new Promise(resolve=>{const r=http.get({host:comfyHost,port:comfyPort,path:u.pathname+u.search,headers:{Authorization:'Bearer '+token,Range:'bytes=0-0'}},s=>{const readable=[200,206].includes(s.statusCode);s.destroy();resolve(readable)});r.setTimeout(5000,()=>{r.destroy();resolve(false)});r.on('error',()=>resolve(false));});}
 return async function handle(req,res,pathname,buf){if(await ollama.handle(req,res,pathname,buf))return true;if(!pathname.startsWith('/review/'))return false;const reply=(s,b)=>{res.writeHead(s,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(b))};
 try{
 if(!['/review/list','/review/decision','/review/enhance'].includes(pathname)){reply(404,{error:'not_found'});return true;}if(req.method!=='POST')throw fail('POST required',405);
 const origin=req.headers.origin;if(!origins.has(origin)||new URL(origin).host!==req.headers.host)throw fail('Exact same-origin request required',403);
 if(buf.length>128*1024)throw fail('Review request too large',413);
 let body;try{body=JSON.parse(buf)}catch{throw fail('Invalid JSON')};if(!body||Array.isArray(body))throw fail('Invalid request'); const now=Date.now(),key=origin,user={id:"trusted-LAN Web UI"};for(const [k,v]of tickets)if(v.expires<now)tickets.delete(k);
 if(typeof body.JobID!=='string'||!(/^[1-9][0-9]*$/.test(body.JobID))||!Number.isSafeInteger(Number(body.JobID)))throw fail('Positive production JobID required');
 if(busy>=2||jobBusy.has(body.JobID))throw fail('Review is already processing this job; refresh without retrying mutations',429);busy++;jobBusy.add(body.JobID);
 try{
 if(pathname==='/review/list'){
 const inspected=await native({JobID:body.JobID,action:'inspect',approvedBy:user.id});if(inspected.ready!==true)throw fail('Only complete, idle, dependency-valid production Review jobs can be reviewed',409);if(!Array.isArray(inspected.outputs)||!inspected.outputs.length||inspected.outputs.length>64)throw fail('No outputs or review asset limit exceeded',409);
 if(tickets.size>=512)throw fail('Review ticket limit reached',429);
 const listed=await native({JobID:body.JobID,action:'list',approvedBy:user.id});if(listed.ready!==true)throw fail('Assets changed while verifying; refresh Review',409);
 const decisionNonce=crypto.randomBytes(32).toString('hex');tickets.set(decisionNonce,{key,JobID:body.JobID,snapshot:listed.snapshot,expires:Date.now()+ttl});const outputs=await Promise.all(listed.outputs.map(async o=>({...o,readable:await readableOutput(o.URL)})));reply(200,{...listed,outputs,decisionNonce,expiresAt:Date.now()+ttl});
 }else{
 const enhancing=pathname==='/review/enhance',action=enhancing?'enhance_prompt':body.action;
 if((!enhancing&&(!['approve_asset','reject_asset','regenerate'].includes(action)||typeof body.reason!=='string'||body.reason.length>2000))||!Number.isSafeInteger(body.assetId)||body.assetId<=0)throw fail('Invalid per-asset decision or reason');
 if((action==='regenerate'||enhancing)&&(typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>(action==='regenerate'?5000:20000)))throw fail(action==='regenerate'?'Nonblank regeneration prompt required (maximum 5000 characters)':'Nonblank enhancement prompt required');
 const t=tickets.get(body.decisionNonce);if(!t||t.key!==key||t.JobID!==body.JobID||t.expires<now)throw fail('List this job again; decision nonce expired or used',409);
 tickets.delete(body.decisionNonce); // Consume before all I/O; ambiguous writes must never be automatically retried.
 const inspected=await native({JobID:body.JobID,action:'inspect',approvedBy:user.id});if(inspected.ready!==true)throw fail('Only complete, idle, dependency-valid production Review jobs can be reviewed',409);if(!Array.isArray(inspected.outputs)||inspected.outputs.length>64)throw fail('Invalid output count',409);
 const selected=inspected.outputs.find(o=>o.id===body.assetId);if(!selected||!await readableOutput(selected.URL))throw fail('Selected asset is not currently readable',409);
 const decided=await native({enhancementModel:enhancing?await ollama.selected():undefined,JobID:body.JobID,assetId:body.assetId,prompt:action==='regenerate'||enhancing?body.prompt:undefined,action,reason:enhancing?'':body.reason,approvedBy:user.id,expectedSnapshot:t.snapshot});
 if(enhancing){
  if(decided.JobID!==body.JobID||decided.assetId!==body.assetId||decided.beforePrompt!==body.prompt||typeof decided.enhancedPrompt!=='string'||!decided.enhancedPrompt.trim()||decided.enhancedPrompt.length>20000||decided.persisted!==false||decided.generationDispatched!==false||decided.snapshot!==t.snapshot)throw fail('Invalid draft enhancement response; original draft is unchanged',502);
  const fresh=await native({JobID:body.JobID,action:'inspect',approvedBy:user.id});if(fresh.ready!==true||!Array.isArray(fresh.outputs)||fresh.outputs.length>64)throw fail('Assets changed during enhancement; original draft is unchanged',409);
  const verified=await native({JobID:body.JobID,action:'verify',approvedBy:user.id});if(verified.ready!==true||verified.snapshot!==t.snapshot)throw fail('Source metadata changed during enhancement; original draft is unchanged',409);
  const decisionNonce=crypto.randomBytes(32).toString('hex'),expiresAt=Date.now()+ttl;tickets.set(decisionNonce,{key,JobID:body.JobID,snapshot:t.snapshot,expires:expiresAt});reply(200,{...decided,decisionNonce,expiresAt});
 }else reply(200,decided);
 }
 }finally{busy--;jobBusy.delete(body.JobID);}
 }catch(e){reply(e.status||503,{error:'review_refused',message:e.status?e.message:'Review service unavailable; no automatic retry'});}return true;
 };
}
module.exports={createReviewHandler};

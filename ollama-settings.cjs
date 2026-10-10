'use strict';
// Fixed operator connection: the existing LAN Ollama service. No browser-selected URL or credentials.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const BASE_URL=process.env.OLLAMA_BASE_URL||'http://10.0.0.157:11434';
const managedURL=new URL(BASE_URL);
if(managedURL.protocol!=='http:'||managedURL.username||managedURL.password||managedURL.search||managedURL.hash||managedURL.pathname!=='/')throw Error('OLLAMA_BASE_URL must be a credential-free server-managed HTTP service origin');
const fail=(message,status=400)=>Object.assign(Error(message),{status});
function readServiceTags(){return new Promise((resolve,reject)=>{
 const r=http.get(BASE_URL+'/api/tags',s=>{let size=0,parts=[];s.on('data',c=>{size+=c.length;if(size>4*1024*1024)return r.destroy(fail('Ollama model list too large',503));parts.push(c)});s.on('error',reject);s.on('end',()=>{try{if(s.statusCode!==200)throw fail('Ollama connection unavailable',503);resolve(JSON.parse(Buffer.concat(parts).toString()))}catch(e){reject(e)}})});
 r.setTimeout(10000,()=>r.destroy(fail('Ollama connection timed out',503)));r.on('error',()=>reject(fail('Ollama connection unavailable',503)));
})}
function createOllamaSettings({dataDir,readTags=readServiceTags}){
 const file=path.join(dataDir,'ollama-enhancement-settings.json');
 function read(){let saved;try{saved=JSON.parse(fs.readFileSync(file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw fail('Saved Ollama settings are invalid',503);saved={defaultEnhancementModel:'qwen3.8:latest'}};
 if(typeof saved.defaultEnhancementModel!=='string'||!saved.defaultEnhancementModel)throw fail('Saved Ollama model is invalid',503);
 return {defaultEnhancementModel:saved.defaultEnhancementModel,baseURL:BASE_URL,connectionManagedBy:'Existing n8n Ollama credential; endpoint is operator-managed'};}
 async function models(){const raw=await readTags();if(!Array.isArray(raw.models)||raw.models.some(m=>typeof m.name!=='string'||!m.name))throw fail('Invalid Ollama model list',503);const names=[...new Set(raw.models.map(m=>m.name))].sort();return {models:names,count:names.length,baseURL:BASE_URL};}
 async function selected(){const model=read().defaultEnhancementModel;if(!(await models()).models.includes(model))throw fail('Saved enhancement model is not installed. Choose an installed model in Config; original draft is unchanged.',409);return model;}
 async function save(body){if(!body||Array.isArray(body)||Object.keys(body).length!==1||typeof body.defaultEnhancementModel!=='string')throw fail('Only defaultEnhancementModel is accepted');if(!(await models()).models.includes(body.defaultEnhancementModel))throw fail('Selected enhancement model is not installed',409);
 fs.mkdirSync(dataDir,{recursive:true});const tmp=file+'.'+process.pid+'.'+require('node:crypto').randomBytes(8).toString('hex');try{fs.writeFileSync(tmp,JSON.stringify({defaultEnhancementModel:body.defaultEnhancementModel})+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,file)}finally{try{fs.unlinkSync(tmp)}catch{}}return read();}
 async function handle(req,res,pathname,buf){if(!pathname.startsWith('/ollama/'))return false;const reply=(s,b)=>{res.writeHead(s,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(b))};try{
 if(!['/ollama/settings','/ollama/models'].includes(pathname))throw fail('Not found',404);
 if(req.url.includes('?'))throw fail('Query parameters are not supported');
 if(req.method==='GET'){reply(200,pathname==='/ollama/models'?await models():read());return true;}
 if(req.method!=='POST'||pathname!=='/ollama/settings')throw fail('Method not allowed',405);
 const origin=req.headers.origin;const allowed=new Set((process.env.REVIEW_UI_ORIGINS||'http://10.0.0.157:3458,http://localhost:3458,http://127.0.0.1:3458').split(','));if(!allowed.has(origin)||new URL(origin).host!==req.headers.host)throw fail('Exact same-origin request required',403);
 if(buf.length>4096)throw fail('Settings request too large',413);let body;try{body=JSON.parse(buf)}catch{throw fail('Invalid JSON')};reply(200,await save(body));
 }catch(e){reply(e.status||503,{error:'ollama_settings_refused',message:e.status?e.message:'Ollama settings unavailable'});}return true;}
 return {read,models,selected,save,handle};
}
module.exports={createOllamaSettings,BASE_URL};

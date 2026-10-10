'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('Review transport uses persisted selection, Config exposes model control',()=>{
 const review=fs.readFileSync(path.join(__dirname,'review-backend.cjs'),'utf8'),html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
 assert.match(review,/enhancementModel:enhancing\?await ollama.selected\(\)/);
 assert.match(html,/id="cfg-enhancement-model"/);
 assert.match(fs.readFileSync(path.join(__dirname,'proxy-server.cjs'),'utf8'),/ollamaSettingsHash:OLLAMA_SETTINGS_HASH/);
});
test('missing installed model and discovery errors never fallback or overwrite settings',async()=>{
 const {createOllamaSettings}=require('./ollama-settings.cjs');const dir=fs.mkdtempSync(path.join(process.env.TMPDIR||os.tmpdir(),'ollama-guards-'));
 let available=true;
 try{const s=createOllamaSettings({dataDir:dir,readTags:async()=>{if(!available)throw Error('offline');return {models:[{name:'qwen3.8:latest'}]}}});
 await assert.rejects(s.save({defaultEnhancementModel:'unknown:latest'}),/not installed/);
 await assert.rejects(s.save({defaultEnhancementModel:'qwen3.8:latest',baseURL:'http:\/\/evil'}),/Only/);
 available=false;await assert.rejects(s.selected(),/offline/);assert.equal(s.read().defaultEnhancementModel,'qwen3.8:latest');
 const missing=createOllamaSettings({dataDir:dir,readTags:async()=>({models:[]})});await assert.rejects(missing.selected(),/not installed/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('settings mutations require exact trusted origin and accept only typed model key',async()=>{
 const {createOllamaSettings}=require('./ollama-settings.cjs');const dir=fs.mkdtempSync(path.join(process.env.TMPDIR||os.tmpdir(),'ollama-origin-'));const s=createOllamaSettings({dataDir:dir,readTags:async()=>({models:[{name:'qwen3.8:latest'}]})});
 async function call(origin,body){let status,result;await s.handle({url:'/ollama/settings',method:'POST',headers:{origin,host:'10.0.0.157:3458'}},{writeHead:v=>status=v,end:v=>result=JSON.parse(v)},'/ollama/settings',Buffer.from(JSON.stringify(body)));return {status,result};}
 try{assert.equal((await call('http://evil',{defaultEnhancementModel:'qwen3.8:latest'})).status,403);assert.equal((await call('http://10.0.0.157:3458',{defaultEnhancementModel:4})).status,400);assert.equal((await call('http://10.0.0.157:3458',{defaultEnhancementModel:'qwen3.8:latest'})).status,200);}finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('all installed exact tags are deduplicated without limits and choice persists',async()=>{
 const {createOllamaSettings}=require('./ollama-settings.cjs');
 const dir=fs.mkdtempSync(path.join(process.env.TMPDIR||os.tmpdir(),'ollama-settings-'));
 try {const tags=Array.from({length:301},(_,i)=>({name:`exact-${i}:latest`}));tags.push(tags[0],{name:'qwen3.8:latest'});
 const s=createOllamaSettings({dataDir:dir,readTags:async()=>({models:tags})});
 assert.equal((await s.models()).count,302);assert.equal(s.read().defaultEnhancementModel,'qwen3.8:latest');
 await s.save({defaultEnhancementModel:'exact-300:latest'});
 assert.equal(createOllamaSettings({dataDir:dir}).read().defaultEnhancementModel,'exact-300:latest');
 assert.equal(await s.selected(),'exact-300:latest');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

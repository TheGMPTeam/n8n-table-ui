const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
test('proxy blocks REST/fallback/review routes and cross-origin writes',async()=>{
 const keys=[];
 const dispatchRequests=[];
 const mediaAuth=[];
 const upstream=http.createServer(async(req,res)=>{if(req.url.startsWith('/view?')){mediaAuth.push(req.headers.authorization);res.setHeader('Content-Type','image/png');res.end('test-image');return;}let body='';for await(const chunk of req)body+=chunk;if(/Research|Production|Dispatcher|yt-Test/.test(req.url))dispatchRequests.push({method:req.method,url:req.url,body});keys.push(req.headers['x-n8n-api-key']);res.setHeader('Content-Type','application/json');res.end('[{"data":[],"nextCursor":null}]');});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const port=upstream.address().port;
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const proxyPort=reserve.address().port;await new Promise(r=>reserve.close(r));
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'ui-test-'));
 fs.writeFileSync(path.join(data,'PASSWORD'),'test-only-token\nusername');
 const child=spawn(process.execPath,['proxy-server.cjs'],{env:{...process.env,PORT:String(proxyPort),N8N_HOST:'127.0.0.1',N8N_PORT:String(port),N8N_API_KEY:'not-a-real-key',DATA_DIR:data,COMFYUI_HOST:'127.0.0.1',COMFYUI_PORT:String(port),COMFYUI_TOKEN_FILE:path.join(data,'PASSWORD')},stdio:['ignore','pipe','pipe']});
 try {
  await new Promise((resolve,reject)=>{child.stdout.on('data',d=>{if(d.toString().includes('listening'))resolve();});child.once('exit',()=>reject(new Error('proxy exited')));setTimeout(()=>reject(new Error('startup timeout')),5000).unref();});
  const base='http://127.0.0.1:'+proxyPort;
  assert.equal((await fetch(base+'/api/v1/workflows')).status,404);
  const oversized=await fetch(base+'/webhook/yt-update',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(1024*1024+1)});
  assert.equal(oversized.status,413);
  assert.equal((await oversized.json()).error,'payload_too_large');
  assert.equal(keys.length,0);
  assert.equal((await fetch(base+'/webhook/review-approve',{method:'POST',body:'{}'})).status,404);
  assert.equal((await fetch(base+'/webhook/yt-update',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'})).status,403);
  const r=await fetch(base+'/webhook/yt-get',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'get',id:'table',limit:250})});assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),null);assert.deepEqual(keys,[undefined]);
  for(const stage of ['research','scene','dispatcher','runner']) {
   const dispatch=await fetch(base+'/dispatch/'+stage,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({rowId:'12'})});assert.equal(dispatch.status,200);
  }
  assert.deepEqual(dispatchRequests,[{method:'GET',url:'/webhook/Research?Row=12&ByPass=true',body:''},{method:'GET',url:'/webhook/Production?RowID=12&ByPass=true',body:''},{method:'GET',url:'/webhook/Dispatcher?RowID=12&ByPass=true',body:''},{method:'POST',url:'/webhook/yt-Test',body:'{"Id":"12"}'}]);
  assert.ok(keys.every(k=>k===undefined));
  for(const payload of [{rowId:'0'},{rowId:'12',url:'http://evil'},{rowId:'12',ALL:true},{}]) assert.equal((await fetch(base+'/dispatch/runner',{method:'POST',body:JSON.stringify(payload)})).status,400);
  assert.equal((await fetch(base+'/dispatch/runner',{method:'POST',headers:{Origin:'https://evil.example'},body:'{"rowId":"12"}'})).status,403);
  assert.equal((await fetch(base+'/dispatch/approve',{method:'POST',body:'{"rowId":"12"}'})).status,404);
  const media=await fetch(base+'/media/comfy/view?filename=output.png&type=output');assert.equal(media.status,200);assert.equal(await media.text(),'test-image');assert.deepEqual(mediaAuth,['Bearer test-only-token']);assert.equal(media.headers.get('authorization'),null);
  assert.equal((await fetch(base+'/media/comfy/view?filename=../secret')).status,400);
  assert.equal((await fetch(base+'/media/comfy/view?filename=ok.png&url=http://evil')).status,400);
 }finally{child.kill();await new Promise(r=>child.once('exit',r));await new Promise(r=>upstream.close(r));fs.rmSync(data,{recursive:true,force:true});}
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const {spawn}=require('node:child_process');
test('durable authenticated media cache, encoding, ranges and failure isolation',async()=>{
 const data=fs.mkdtempSync(path.join(process.env.TMPDIR || '/home/dad/.hermes/cache/scratch','media-test-'));fs.writeFileSync(path.join(data,'token'),'mock-secret\nuser');let calls=0;let seen;
 const upstream=http.createServer((q,s)=>{calls++;seen=new URL(q.url,'http://localhost');assert.equal(q.headers.authorization,'Bearer mock-secret');const name=seen.searchParams.get('filename');if(name==='bad.png'){s.writeHead(302,{Location:'http://evil.test'});s.end();return;}if(name==='html.png'){s.setHeader('Content-Type','text/html');s.end('error');return;}if(name==='huge.mp4'){s.setHeader('Content-Type','video/mp4');s.setHeader('Content-Length',String(513*1024*1024));s.end();return;}if(name==='partial.mp4'){s.setHeader('Content-Type','video/mp4');s.setHeader('Content-Length','20');s.write('123');setImmediate(()=>s.destroy());return;}s.setHeader('Content-Type',name.endsWith('.mp4')?'video/mp4':'image/png');s.end('0123456789');});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const child=spawn(process.execPath,['proxy-server.cjs'],{env:{...process.env,PORT:String(port),DATA_DIR:data,COMFYUI_HOST:'127.0.0.1',COMFYUI_PORT:String(upstream.address().port),COMFYUI_TOKEN_FILE:path.join(data,'token')},stdio:['ignore','pipe','pipe']});
 try{await new Promise((r,j)=>{child.stdout.on('data',d=>{if(d.toString().includes('listening'))r();});child.once('exit',()=>j(Error('startup failed')));});const base='http://127.0.0.1:'+port;const url=base+'/media/comfy/view?'+new URLSearchParams({filename:'clip &+.mp4',subfolder:'video/nested space',type:'temp'});
 let res=await fetch(url);assert.equal(res.status,200);assert.equal(await res.text(),'0123456789');assert.equal(seen.searchParams.get('filename'),'clip &+.mp4');assert.equal(seen.searchParams.get('subfolder'),'video/nested space');assert.equal(seen.searchParams.get('type'),'temp');
 res=await fetch(url,{headers:{Range:'bytes=2-5'}});assert.equal(res.status,206);assert.equal(res.headers.get('content-range'),'bytes 2-5/10');assert.equal(await res.text(),'2345');assert.equal(calls,1);
 assert.equal((await fetch(url,{headers:{Range:'bytes=100-'}})).status,416);
 assert.ok(fs.readdirSync(path.join(data,'media-cache')).some(n=>n.endsWith('.media')));
 const img=await fetch(base+'/media/comfy/view?filename=image.png');assert.equal(img.headers.get('content-type'),'image/png');assert.equal(await img.text(),'0123456789');
 for(const query of ['filename=../secret','filename=a.png&subfolder=../x','filename=a.png&subfolder=%5Cx','filename=a.png&url=http://evil','filename=a.png&filename=b.png','filename=a.png&type=unknown'])assert.equal((await fetch(base+'/media/comfy/view?'+query)).status,400,query);
 const count=fs.readdirSync(path.join(data,'media-cache')).length;for(const name of ['bad.png','bad.png','html.png','huge.mp4','partial.mp4'])assert.equal((await fetch(base+'/media/comfy/view?filename='+name)).status,502);assert.equal(fs.readdirSync(path.join(data,'media-cache')).length,count);
 }finally{child.kill();await new Promise(r=>child.once('exit',r));await new Promise(r=>upstream.close(r));fs.rmSync(data,{recursive:true,force:true});}
});

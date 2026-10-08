const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawn}=require('node:child_process');
test('Home transport refuses unauthenticated access and absent activation',async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'home-transport-'));const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const child=spawn(process.execPath,['proxy-server.cjs'],{env:{...process.env,PORT:String(port),DATA_DIR:data},stdio:['ignore','pipe','pipe']});
 try{await new Promise((r,j)=>{child.stdout.on('data',d=>{if(d.toString().includes('listening'))r();});child.once('exit',()=>j(Error('startup')));});const base='http://127.0.0.1:'+port;
 const c=await fetch(base+'/home-delete/capabilities');assert.equal(c.status,200);assert.equal((await c.json()).available,false);
 assert.equal((await fetch(base+'/home-delete/delete',{method:'POST',headers:{Origin:base},body:'{"rows":[]}'})).status,503);
 assert.equal((await fetch(base+'/home-delete/delete',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'})).status,403);
 }finally{child.kill();await new Promise(r=>child.once('exit',r));fs.rmSync(data,{recursive:true,force:true});}
});

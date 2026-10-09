'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {classifyRuntime}=require('./updater-host.cjs');
const mounts=[{Type:'bind',Source:'/repo/index.html',Destination:'/app/index.html'},{Type:'bind',Source:'/repo/proxy-server.cjs',Destination:'/app/proxy-server.cjs'}];
test('bind-first HTML and backend classification uses actual Docker mounts',()=>{
 assert.deepEqual(classifyRuntime(['index.html'],mounts),{recommendedMode:'databind',runtimeAction:'none',modeReason:'Mounted static assets changed; no image update or restart.'});
 assert.equal(classifyRuntime(['proxy-server.cjs'],mounts).runtimeAction,'restart');
});
test('docs/tests do not become image updates; genuine baked assets and build inputs do',()=>{
 assert.equal(classifyRuntime(['README.md','docs/a.md','a.test.cjs'],mounts).recommendedMode,'noRuntimeUpdate');
 for(const f of ['Dockerfile','package-lock.json','package.json','webhook-workflow-template.json'])assert.equal(classifyRuntime([f],mounts).runtimeAction,'image');
 assert.throws(()=>classifyRuntime(['unmapped-executable.sh'],mounts),/Unknown runtime path/);
 assert.equal(classifyRuntime(['index.html'],[]).runtimeAction,'image');
});

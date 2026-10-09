'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const data=require('./docs/workflow-wiring-validators.json');
function validate(stage,output,script){
 const run=new Function('$input','$','$workflow','$execution',data.validators[stage]);
 const nodes={'Start AI Timing':{_aiStartedAt:Date.now(),Script:script===undefined?undefined:JSON.stringify(script)},'Capture Acquired Lock':{JobID:'validation-replay',_context:{currentId:1}}};
 const out=run({all:()=>[{json:{output}}]},name=>({item:{json:nodes[name]}}),{name:stage},{id:'validation-replay'});
 return out[0].json._aiMetric;
}
function clone(x){return structuredClone(x);}
test('real Research execution output passes complete content checks',()=>assert.equal(validate('Research',data.fixtures.research.output).ValidOutput,true));
test('missing required fact fails without filling it',()=>{const x=clone(data.fixtures.research.output);delete x.hook;const r=validate('Research',x);assert.equal(r.ValidOutput,false);assert.match(r.Error,/hook required/);assert.equal(x.hook,undefined);});
test('research duration mismatch and missing narration fail',()=>{const x=clone(data.fixtures.research.output);x.total_duration_seconds++;assert.equal(validate('Research',x).ValidOutput,false);x.total_duration_seconds--;x.full_voiceover='changed';assert.equal(validate('Research',x).ValidOutput,false);});
test('real Scene execution preserves full source script',()=>assert.equal(validate('Scene Production',data.fixtures.scene.output,data.fixtures.scene.input).ValidOutput,true));
test('scene omitted, reordered, changed narration, duration or unsupported type fail',()=>{for(const mutate of [x=>x.scenes.pop(),x=>x.scenes[0].scene_id='SCENE_99',x=>x.scenes[0].voiceover='invented',x=>x.scenes[0].duration='4s',x=>x.scenes[0].type='video']){const x=clone(data.fixtures.scene.output);mutate(x);assert.equal(validate('Scene Production',x,data.fixtures.scene.input).ValidOutput,false);}});
test('validator cannot assert a primary model was used from parsed output alone',()=>assert.equal(validate('Research',data.fixtures.research.output).Model,'unknown'));

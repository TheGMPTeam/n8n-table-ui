const assert=require('node:assert/strict');
const expression="={{ (() => { const value = $json.output; let parsed; try { parsed = typeof value === \"string\" ? JSON.parse(value) : value; } catch (e) { throw new Error(\"Scene Production: output must be valid JSON containing scenes\"); } if (!parsed || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) throw new Error(\"Scene Production: output.scenes must be a non-empty array\"); return { Scenes: JSON.stringify(parsed.scenes) }; })() }}";
const run=input=>new Function('$json','return ('+expression.slice(3,-2)+')')(input);
const output={scenes:[{scene_id:'SCENE_01',duration:'0-5',type:'image',prompt:'fixture'}]};
assert.deepEqual(JSON.parse(run({output:JSON.stringify(output)}).Scenes),output.scenes);
assert.deepEqual(JSON.parse(run({output}).Scenes),output.scenes);
for(const output of [null,'bad json',{}, {scenes:[]}, {scenes:'bad'}])assert.throws(()=>run({output}));
console.log('PASS JSON-string/object output and five invalid shapes');

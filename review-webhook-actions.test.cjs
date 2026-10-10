'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const workflow=JSON.parse(fs.readFileSync(process.env.REVIEW_WORKFLOW_FILE||'docs/review-workflow-contract.json'));
test('native regeneration rejects edited prompts over 5000 characters before any write',()=>{
 const body={trustSource:'trusted-lan-ui',JobID:'2',action:'regenerate',assetId:1,prompt:'x'.repeat(5001),reason:'',expectedSnapshot:'snapshot',approvedBy:'fixture',fingerprints:[]};
 const code=workflow.nodes.find(n=>n.name==='Review Request').parameters.jsCode;
 assert.throws(()=>vm.runInNewContext('(function(){'+code+'})()',{$input:{first:()=>({json:body})},$:()=>({isExecuted:true,first:()=>({json:{body}})})}),/5000/);
});

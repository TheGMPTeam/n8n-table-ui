const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');

test('filtered Jobs stage badges show matching and total counts',()=>{
  assert.match(html,/const stageCountLabel = id =>/);
  assert.match(html,/return matching \+ '\/' \+ all\.length/);
  assert.match(html,/count-badge[^\n]+stageCountLabel\(id\)/);
});

test('updater pill follows the persisted beta-first branch',()=>{
  assert.match(html,/const UPDATE_BRANCH_KEY = 'command-center-update-branch'/);
  assert.match(html,/return saved === 'main' \|\| saved === 'beta' \? saved : 'beta'/);
  assert.match(html,/fetch\('\/updates\/check\?branch=' \+ encodeURIComponent\(branch\)\)/);
  assert.match(html,/selector\.value = \$\('#bottombar-update-status'\)\?\.dataset\?\.branch \|\| 'beta'/);
  assert.match(html,/renderUpdatePill\(selected, c\)/);
});

test('updater blocked reason wraps instead of truncating',()=>{
  assert.match(html,/#updater-result, #updater-mode-summary \{ white-space: normal; overflow-wrap: anywhere; \}/);
});

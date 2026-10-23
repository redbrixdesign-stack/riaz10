import assert from 'node:assert/strict';
import {checkAssertions} from './lighthouse-audit.mjs';
const report=()=>({categories:{performance:{score:.7},accessibility:{score:.9},'best-practices':{score:.9},seo:{score:.9}},audits:{'viewport-insight':{score:1}}});
assert.deepEqual(checkAssertions(report()),[]);
for(const key of ['performance','accessibility','best-practices','seo']) {
 const lower=report();lower.categories[key].score-=.01;assert(checkAssertions(lower).some(message=>message.startsWith('categories:'+key+':')));
 const missing=report();delete missing.categories[key];assert(checkAssertions(missing).length);
}
for(const score of [0,null,undefined]) {const r=report();r.audits['viewport-insight'].score=score;assert(checkAssertions(r).length);}
const failed=report();failed.runtimeError={code:'PAGE_HUNG'};assert(checkAssertions(failed).length);
console.log('PASS maintained Lighthouse gate: unchanged floors, every category/viewport enforced, missing scores/runtime errors fail closed');

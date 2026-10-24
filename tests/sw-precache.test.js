'use strict';
// A precached versioned script must not depend on a network operation at all.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.env.BEELO_TEST_SW||'sw.js','utf8');
async function fixture({hit=true,reject=false,hung=false}={}) {
 const listeners={},calls=[],cached=new Response('SYNTHETIC cached script',{headers:{'Content-Type':'text/javascript'}});
 const scope={location:{origin:'https://synthetic.invalid',href:'https://synthetic.invalid/sw.js'},addEventListener:(name,fn)=>listeners[name]=fn};
 const s={self:scope,URL,Response,console,setTimeout,clearTimeout,caches:{match:async request=>{calls.push('cache:'+request.url);return hit?cached.clone():undefined;},open:async()=>({put:async()=>calls.push('put')})},fetch:async request=>{calls.push('network:'+request.url);if(reject)throw Error('SYNTHETIC offline');if(hung)return new Promise(()=>{});return new Response('SYNTHETIC network script',{headers:{'Content-Type':'text/javascript'}});}};
 vm.createContext(s);vm.runInContext(source,s);
 return {calls,fire(path,options={}){let response;const lifetimes=[];const request={method:'GET',url:new URL(path,scope.location.href).href,destination:'script',...options};listeners.fetch({request,respondWith:value=>response=Promise.resolve(value),waitUntil:value=>lifetimes.push(value)});return {response,lifetimes};}};
}
(async()=>{
 for(const path of ['js/services/quote-document.min.js?v=3','js/features/quotes/quotes.min.js?v=2','js/features/settings/settings.min.js?v=24']){
  const f=await fixture({hung:true});const e=f.fire(path);const response=await e.response;
  assert.equal(await response.text(),'SYNTHETIC cached script');
  assert.equal(f.calls.filter(call=>call.startsWith('network:')).length,0,'A precached versioned script must not start a network request');
  await Promise.race([Promise.all(e.lifetimes),new Promise((_,reject)=>setTimeout(()=>reject(Error('Cached response left a hanging event lifetime')),100))]);
 }
 const missing=await fixture({hit:false});assert.equal(await(await missing.fire('js/features/quotes/quotes.min.js?v=2').response).text(),'SYNTHETIC network script');assert(missing.calls.includes('put'));
 const offline=await fixture({hit:false,reject:true});assert.equal((await offline.fire('js/features/quotes/quotes.min.js?v=2').response).status,504,'Missing offline script remains a real error, not HTML or empty success');
 const changed=await fixture();const other=changed.fire('js/features/quotes/quotes.min.js?v=SYNTHETIC-new');await other.response;await Promise.all(other.lifetimes);assert(changed.calls.some(call=>call.startsWith('network:')),'Unknown version retains the existing refresh policy');
 const api=await fixture({reject:true});assert.equal((await api.fire('api/synthetic-private',{destination:''}).response).status,503);assert(!api.calls.some(call=>call.startsWith('cache:')),'Private GET is not served from static cache');
 const ignored=await fixture();assert.equal(ignored.fire('api/synthetic-private',{method:'POST'}).response,undefined);assert.deepEqual(ignored.calls,[]);
 console.log('PASS precache: cached immutable scripts have zero network/lifetime dependency; misses, versions, private API and POST boundaries retained');
})().catch(error=>{console.error(error);process.exitCode=1;});

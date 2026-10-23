import assert from 'node:assert/strict';
import {handle,_setRedisClient} from '../api/claude.mjs';
const names=['NODE_ENV','ALLOWED_ORIGIN','AI_SECRET','ANTHROPIC_API_KEY','RATE_LIMIT_MAX','RATE_LIMIT_WINDOW_MS','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN'];
const saved=Object.fromEntries(names.map(key=>[key,process.env[key]]));
const realFetch=globalThis.fetch,realError=console.error;const logs=[];let providerCalls=0;
const clearStore=()=>{for(const key of names.filter(key=>key.includes('REDIS')||key.startsWith('KV_')))delete process.env[key];_setRedisClient(null);};
try{
 console.error=(...args)=>logs.push(args.join(' '));
 globalThis.fetch=async()=>{providerCalls++;return{ok:true,json:async()=>({content:[{type:'text',text:'SYNTHETIC pong'}],usage:{input_tokens:1,output_tokens:1}})};};
 Object.assign(process.env,{NODE_ENV:'production',ALLOWED_ORIGIN:'https://synthetic.example',AI_SECRET:'SYNTHETIC-gate',ANTHROPIC_API_KEY:'SYNTHETIC-provider',RATE_LIMIT_MAX:'1',RATE_LIMIT_WINDOW_MS:'60000'});
 const request=()=>handle({method:'POST',headers:{origin:'https://synthetic.example','x-ai-key':'SYNTHETIC-gate','x-forwarded-for':'192.0.2.47'},body:{type:'ping',private:'SYNTHETIC-private-body'}});
 for(const partial of [null,'UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN']){
  clearStore();if(partial)process.env[partial]=partial.endsWith('URL')?'https://synthetic.invalid':'SYNTHETIC-token';
  const result=await request();assert.equal(result.status,503);assert.equal(JSON.parse(result.body).error,'usage_unavailable');assert.equal(result.headers['retry-after'],'30');assert.equal(providerCalls,0);
 }
 clearStore();_setRedisClient({eval:async()=>{throw Error('SYNTHETIC-sensitive-connection');}});
 assert.equal((await request()).status,503);assert.equal(providerCalls,0);
 _setRedisClient({eval:async()=>1});assert.equal((await request()).status,200);assert.equal(providerCalls,1);
 _setRedisClient({eval:async()=>0});assert.equal((await request()).status,429);assert.equal(providerCalls,1);
 _setRedisClient({eval:async()=>1});assert.equal((await handle({method:'POST',headers:{origin:'https://synthetic.example'},body:{type:'ping'}})).status,403);assert.equal(providerCalls,1);
 clearStore();assert.equal((await handle({method:'OPTIONS',headers:{origin:'https://synthetic.example'}})).status,204);assert.equal((await handle({method:'GET',headers:{}})).status,405);
 delete process.env.NODE_ENV;
 assert.equal((await request()).status,200,'Only development may use memory');assert.equal((await request()).status,429);assert.equal(providerCalls,2);
 const text=logs.join('\n');for(const secret of ['SYNTHETIC-sensitive-connection','SYNTHETIC-token','SYNTHETIC-gate','SYNTHETIC-provider','SYNTHETIC-private-body'])assert(!text.includes(secret));
 console.log('PASS Claude usage guard: missing/partial/unavailable production store returns retryable 503 without provider; healthy shared allow/deny and auth unchanged; dev-only memory; no payload/credential logs');
}finally{
 globalThis.fetch=realFetch;console.error=realError;_setRedisClient(null);for(const key of names){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
}

'use strict';
// Local synthetic acceptance only (excluded from the production artifact).
// This runner never deploys, sends messages,
// reads real browser profiles or needs API/CI credentials.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const directory=process.env.BEELO_ARTIFACT_DIR?path.resolve(process.env.BEELO_ARTIFACT_DIR):fs.mkdtempSync(path.join(os.tmpdir(),'beelo-release-'));
fs.mkdirSync(directory,{recursive:true});
const checks=['payment-link.e2e.cjs','protected-backup.e2e.cjs','context-encryption.e2e.cjs','lazy-state.e2e.cjs','social-share.e2e.cjs','cold-offline.e2e.cjs','claude-usage.e2e.cjs','test-session-boundary.e2e.cjs','visit-reminder-expiry.e2e.cjs','visit-reminder-lifecycle.e2e.cjs','visit-form-layout.e2e.cjs','modal-form-state.e2e.cjs','visit-draft.e2e.cjs','expense-date.e2e.cjs','sw-update.e2e.js'];
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((request,response)=>{
 try{
  const url=new URL(request.url,'http://localhost');const pathname=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
  if(!/^\/(index\.html|sw\.js|manifest\.json)$/.test(pathname)&&!/^\/(js|css|assets|tests\/browser)\//.test(pathname))throw Error('Not a fixture asset');
  const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))throw Error('Invalid path');
  response.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');response.setHeader('Cache-Control','no-store');response.end(fs.readFileSync(file));
 }catch(e){response.writeHead(404);response.end('Not found');}
});
const results=[];let active=null;
async function run(check,base){
 const env={...process.env,BEELO_TEST_URL:base,BEELO_EXPECT_CONTEXT_ENCRYPTION:'1',BEELO_ARTIFACT_DIR:directory,NODE_ENV:'test'};
 for(const key of Object.keys(env))if(/(?:TOKEN|SECRET|PASSWORD|API_KEY|REDIS_REST_|KV_REST_API_|SSH_AUTH_SOCK|GIT_ASKPASS)/.test(key))delete env[key];
 const started=Date.now();const log=fs.createWriteStream(path.join(directory,check+'.log'));
 const code=await new Promise((resolve,reject)=>{
  const child=active=spawn(process.execPath,[path.join(root,'tests/browser',check)],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},180000);
  child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
  child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',code=>{clearTimeout(timer);active=null;log.end(()=>resolve(timedOut?124:code??1));});
 });
 results.push({check,status:code===0?'passed':'failed',code,durationMs:Date.now()-started});
 fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify({sourceCommit:process.env.GITHUB_SHA||null,results},null,2)+'\n');
 console.log(`${code===0?'PASS':'FAIL'} ${check} (${Math.round((Date.now()-started)/1000)}s)`);
 if(code!==0){console.error(fs.readFileSync(path.join(directory,check+'.log'),'utf8').slice(-6000));throw Error('Browser acceptance stopped at '+check);}
}
(async()=>{
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  for(const check of checks)await run(check,base);
  console.log(`All synthetic browser acceptance checks passed. Evidence: ${directory}`);
 }finally{if(active)active.kill('SIGTERM');server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.message);process.exitCode=1;});

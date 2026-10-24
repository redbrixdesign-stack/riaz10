'use strict';
// Instrumented service worker is served only by this disposable test origin.
// Not a production asset, release gate, or physical Safari certification.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const out=process.env.BEELO_ARTIFACT_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'beelo-offline-diagnostic-'));
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const prefix=`(() => {
 const events=[];
 const log=(kind,url,extra={})=>{if(events.length<2000)events.push({kind,url,time:Date.now(),...extra});};
 self.__beeloDiagnosticLog=log;
 self.addEventListener('message',event=>{if(event.data?.type==='BEELO_TEST_DIAGNOSTIC')event.ports[0]?.postMessage(events);});
 const originalFetch=self.fetch.bind(self);
 self.fetch=(request,...args)=>{const url=typeof request==='string'?request:request.url;log('network-start',url);return originalFetch(request,...args).then(response=>{log('network-response',url,{status:response.status});return response;},error=>{log('network-error',url,{error:error.message});throw error;});};
 const originalMatch=caches.match.bind(caches);
 caches.match=(request,...args)=>{const url=typeof request==='string'?request:request.url;log('cache-start',url);return originalMatch(request,...args).then(response=>{log('cache-result',url,{hit:!!response,status:response?.status});return response;},error=>{log('cache-error',url,{error:error.message});throw error;});};
})();\n`;
const marker="self.addEventListener('fetch', e => {";
if(source.split(marker).length!==2)throw Error('Diagnostic injection marker changed; fail closed');
const worker=prefix+source.replace(marker,marker+`
 self.__beeloDiagnosticLog('dispatch',e.request.url);
 const originalRespond=e.respondWith.bind(e);
 e.respondWith=promise=>{self.__beeloDiagnosticLog('respond-start',e.request.url);originalRespond(Promise.resolve(promise).then(response=>{self.__beeloDiagnosticLog('respond-resolved',e.request.url,{status:response?.status});return response;},error=>{self.__beeloDiagnosticLog('respond-error',e.request.url,{error:error.message});throw error;}));};`);
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.woff2':'font/woff2','.png':'image/png'};
const server=http.createServer((request,response)=>{try{
 const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);const relative=pathname==='/'?'index.html':pathname.slice(1);
 if(!/^(?:index\.html|sw\.js|manifest\.json|(?:js|css|assets)\/)/.test(relative))throw Error('Fixture asset only');
 const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw Error('Invalid path');
 response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});response.end(relative==='sw.js'?worker:fs.readFileSync(file));
}catch(error){response.writeHead(404);response.end('Not found');}});
let activeChild=null;
process.once('SIGTERM',()=>{activeChild?.kill('SIGTERM');server.closeAllConnections();server.close();process.exit(143);});
(async()=>{const results=[];try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 for(const mode of ['socket-drop','origin-stop','cache-miss-control']){
  const directory=path.join(out,'diagnostic-'+mode);fs.mkdirSync(directory,{recursive:true});
  const log=fs.createWriteStream(path.join(directory,'journey.txt'));
  const status=await new Promise((resolve,reject)=>{
   const env={...process.env,BEELO_TEST_URL:`http://127.0.0.1:${server.address().port}`,BEELO_ARTIFACT_DIR:directory,BEELO_SW_TRACE:'1',BEELO_OFFLINE_DIAGNOSTIC_MODE:mode,BEELO_DIAGNOSTIC_CACHE_MISS:mode==='cache-miss-control'?'1':'0'};
   for(const key of Object.keys(env))if(/(?:TOKEN|SECRET|PASSWORD|API_KEY|REDIS_REST_|KV_REST_API_|SSH_AUTH_SOCK|GIT_ASKPASS)/.test(key))delete env[key];
   const child=activeChild=spawn(process.execPath,[path.join(__dirname,'cold-offline.e2e.cjs')],{cwd:root,env,stdio:['ignore','pipe','pipe']});
   let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},45000);
   child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});child.on('error',reject);child.on('close',code=>{clearTimeout(timer);activeChild=null;log.end(()=>resolve(timedOut?124:code??1));});
  });
  let verified=status===0;
  if(mode==='cache-miss-control'){
   verified=false;
   try{const failure=JSON.parse(fs.readFileSync(path.join(directory,'beelo-cold-offline-failed-webkit-quotes.json'),'utf8'));
    verified=status===1&&failure.workerTrace.some(event=>event.kind==='cache-result'&&event.url?.includes('quote-document.min.js')&&event.hit===false)&&failure.workerTrace.some(event=>event.kind==='respond-resolved'&&event.url?.includes('quote-document.min.js')&&event.status===504);
   }catch(error){console.error('Negative control evidence missing:',error.message);}
  }
  results.push({mode,status,verified,expectedFailure:mode==='cache-miss-control'});console.log(`${verified?'PASS':'FAIL'} diagnostic ${mode}${mode==='cache-miss-control'?' (must detect missing cached asset)':''}`);
 }
 fs.writeFileSync(path.join(out,'diagnostic-summary.json'),JSON.stringify({sourceCommit:process.env.GITHUB_SHA||null,serviceWorkerSha256:crypto.createHash('sha256').update(source).digest('hex'),instrumented:true,releaseAcceptance:false,results},null,2));
 if(results.some(result=>!result.verified))process.exitCode=1;
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});

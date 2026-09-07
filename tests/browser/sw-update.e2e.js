'use strict';
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'../..');
const original = fs.readFileSync(path.join(root,'sw.js'),'utf8');
const cache = original.match(/const CACHE_NAME = '([^']+)'/)[1];
let revision = 'a';
async function until(page, fn, arg) {
  const deadline = Date.now() + 30000;
  while (!await page.evaluate(fn, arg)) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for service-worker state');
    await page.waitForTimeout(100);
  }
}
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.png':'image/png'};
const server = http.createServer((req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    const target = path.resolve(root,'.'+decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!target.startsWith(root+path.sep)) throw new Error('invalid path');
    res.setHeader('Content-Type',types[path.extname(target)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-store');
    res.end(target === path.join(root,'sw.js') ? original.replace(cache,cache+'-test-'+revision) : fs.readFileSync(target));
  } catch(e) { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(base+'/tests/browser/seed-review.html');
    await page.waitForFunction(()=>document.body.textContent.startsWith('SEEDED'));
    await page.goto(base+'/index.html');
    await page.waitForFunction(()=>document.querySelector('#comp-scroll'));
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await page.evaluate(async()=>{ await caches.open('advisoros-stale-test'); await caches.open('other-app-test'); });
    revision = 'b';
    await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
    await until(page,async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
    assert.ok((await page.evaluate(()=>caches.keys())).includes(cache+'-test-a'), 'old version remains until deliberate activation');
    await page.evaluate(async()=>{
      const registration=await navigator.serviceWorker.getRegistration();
      App._waitingServiceWorker=registration.waiting;
      App.applyServiceWorkerUpdate();
    });
    await until(page,async()=>{
      const registration=await navigator.serviceWorker.getRegistration();
      return !registration.waiting && registration.active?.state === 'activated';
    });
    await until(page,async old=>!(await caches.keys()).includes(old),cache+'-test-a');
    const keys=await page.evaluate(()=>caches.keys());
    console.log('Post-update caches:', keys);
    assert.ok(keys.includes(cache+'-test-b'));
    assert.ok(keys.includes('other-app-test'));
    assert.ok(!keys.includes('advisoros-stale-test'));
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('#comp-scroll'));
    await context.setOffline(true);
    await page.goto(base+'/never-cached-route');
    await page.waitForFunction(()=>document.querySelector('#comp-scroll'));
    console.log('PASS: waiting update, deliberate activation, old-cache cleanup, foreign-cache preservation, new shell reload and uncached offline route fallback');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

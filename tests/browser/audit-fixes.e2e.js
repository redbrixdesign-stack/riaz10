'use strict';
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8000';
(async () => {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.stack));
      page.on('requestfailed', request => { if (request.url().startsWith(BASE)) console.log(name, 'request failed', request.url(), request.failure()); });
      await page.goto(BASE + '/tests/browser/seed-review.html');
      await page.waitForFunction(() => document.body.textContent.startsWith('SEEDED'));
      await page.evaluate(() => localStorage.setItem('advisoros_enc_test', '1'));
      await page.goto(BASE + '/index.html');
      await page.waitForFunction(() => document.querySelector('#home-schedule-heading'));
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1200);
      assert.equal(await page.locator('#home-schedule-heading').innerText(), 'Upcoming');
      assert.equal(await page.locator('#home-schedule-heading').evaluate(e => getComputedStyle(e).textTransform), 'none');
      assert.equal(await page.locator('.comp-home-route').count(), 0);
      await page.screenshot({path:`/private/tmp/beelo-fixed-home-${name}.png`});
      const composer = await page.locator('.comp-composer').boundingBox();
      const nav = await page.locator('#bottom-nav').boundingBox();
      assert.ok(composer.y + composer.height <= nav.y + 1, 'composer must clear bottom navigation');
      if (name === 'chromium') {
        const cdp = await context.newCDPSession(page);
        for (let swipe=0; swipe<3; swipe++) {
          const before = await page.locator('#comp-scroll').evaluate(e => e.scrollTop);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:550}]});
          for(let y=520;y>=220;y-=30) {
            await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y}]});
            await page.waitForTimeout(25);
          }
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          await page.waitForTimeout(250);
          const after = await page.locator('#comp-scroll').evaluate(e => e.scrollTop);
          assert.ok(after > before, `swipe ${swipe+1} must scroll Home`);
          const nextComposer = await page.locator('.comp-composer').boundingBox();
          assert.ok(Math.abs(nextComposer.y-composer.y)<2, JSON.stringify({composer,nextComposer,before,after}));
        }
      } else {
        await page.locator('#comp-scroll').evaluate(e => e.scrollTo(0,e.scrollHeight));
        assert.ok(await page.locator('#comp-scroll').evaluate(e => e.scrollTop>0));
        assert.ok(Math.abs((await page.locator('.comp-composer').boundingBox()).y-composer.y)<2);
      }
      await page.locator('#comp-input').fill('visits');
      await page.getByRole('button',{name:'Send',exact:true}).click();
      await page.waitForFunction(() => document.querySelector('.comp-bubble-user'));
      await page.evaluate(() => App.navigate('measure'));
      await page.getByRole('button',{name:'Select visit',exact:true}).click();
      await page.waitForFunction(() => document.querySelector('#modal-root')?.textContent.includes('visit') || document.querySelector('.modal-overlay'));
      await page.evaluate(() => { App.closeModal(); App.navigate('today'); });
      await page.waitForFunction(() => document.querySelector('#comp-scroll'));
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      await context.setOffline(true);
      if (name === 'chromium') {
        await page.reload();
        await page.waitForFunction(() => document.querySelector('#comp-scroll'));
      } else {
        // WebKit's automation runtime errors before navigation reaches the SW
        // when offline. Do not label an event-only test as a cold offline boot.
        await page.waitForFunction(() => document.querySelector('#offline-banner')?.style.display === 'flex');
        console.log('UNVERIFIED WebKit cold offline reload: runtime reports internal navigation error; physical Safari check remains required');
      }
      assert.ok(await page.locator('#bottom-nav').isVisible());
      await page.screenshot({path:`/private/tmp/beelo-fixed-offline-${name}.png`});
      await context.setOffline(false);
      assert.deepEqual(errors, []);
      console.log(`PASS ${name}: Home casing, route removal, scrolling, composer/nav clearance, Ask Beelo submit, Measure picker and ${name === 'chromium' ? 'offline reload' : 'offline event'}`);
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode=1; });

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = []; const uploads = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() !== 'GET') uploads.push(request.url()); });
    await page.goto((process.env.BASE_URL || 'http://127.0.0.1:8021') + '/pilot/visit-review/');
    await page.getByRole('button', { name: 'Prepare mock review' }).click();
    assert.match(await page.locator('#status').innerText(), /Select audio first/);
    // PCM WAV containing silence: entirely synthetic, never a customer recording.
    const wav = Buffer.alloc(46); wav.write('RIFF'); wav.writeUInt32LE(38,4); wav.write('WAVEfmt ',8);
    wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
    wav.writeUInt32LE(8000,24); wav.writeUInt32LE(16000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34);
    wav.write('data',36); wav.writeUInt32LE(2,40);
    await page.locator('#audio').setInputFiles({ name: 'SYNTHETIC.wav', mimeType: 'audio/wav', buffer: wav });
    await context.setOffline(true);
    await page.locator('#transcript').fill('Requirement: Blackout\nObservation: Width 1200 mm\nPromise: Send samples\nMissing: Drop\nNext: Confirm fabric');
    await page.locator('#prepare').click();
    assert.equal(await page.locator('#observations').inputValue(), 'Width 1200 mm');
    await page.locator('#approve').click();
    assert.match(await page.locator('#status').innerText(), /Confirm you reviewed/);
    await page.locator('#confirm').check();
    await page.locator('#next').fill('Ask about control side');
    assert.equal(await page.locator('#confirm').isChecked(), false);
    await page.locator('#confirm').check();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#approve').click()]);
    const stream = await download.createReadStream(); let text = ''; for await (const chunk of stream) text += chunk;
    const record = JSON.parse(text);
    assert.equal(record.summary.next, 'Ask about control side');
    assert.equal(record.mode, 'local-mock'); assert.equal(record.approval.status, 'approved');
    await page.locator('#prepare').click();
    if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT, fullPage: true });
    await page.locator('#discard').click();
    assert.equal(await page.locator('#review').isVisible(), false);
    assert.equal(await page.locator('#transcript').inputValue(), '');
    assert.deepEqual(errors, []); assert.deepEqual(uploads, []);
    console.log('PASS browser: selected audio, offline review, edited approval export, discard, no uploads or JS errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

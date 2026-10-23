const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
function silentWav(bytes) {
  const wav = Buffer.alloc(bytes);
  wav.write('RIFF'); wav.writeUInt32LE(bytes - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(bytes - 44, 40);
  return 'data:audio/wav;base64,' + wav.toString('base64');
}
(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      // This test mocks the provider transport, not offline SW recovery. WebKit
      // service-worker fetches bypass Playwright routing after reload.
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      await context.addInitScript(() => {
        localStorage.setItem('advisoros_enc_test', '1');
        localStorage.setItem('advisoros_config', JSON.stringify({ onboardingComplete: true }));
        localStorage.setItem('advisoros_consent', JSON.stringify({ v: 2 }));
      });
      let requests = 0;
      let transportError = null;
      await context.route('**/api/transcribe', async route => {
        requests++;
        assert(Buffer.byteLength(route.request().postData()) <= 4_100_000);
        if (transportError) return route.fulfill({ status: transportError.status, json: { ok: false, message: transportError.message } });
        await route.fulfill({ json: { ok: true, text: 'SYNTHETIC smaller recording transcript.' } });
      });
      const page = await context.newPage();
      await page.goto(process.env.BEELO_TEST_URL || 'http://127.0.0.1:8023');
      await page.waitForFunction(() => App.currentHash === 'today');
      const id = await page.evaluate(async () => (await DB.addCustomer({ firstName: 'SYNTHETIC', lastName: 'Size Boundary', address: { line1: '1 SYNTHETIC Test Lane' }, notes: 'Original synthetic context' })).id);
      await page.evaluate(id => AppointmentsFeature.openEditCustomerModal(id), id);
      await page.locator('#edit-cust-notes').waitFor();
      const large = silentWav(3_000_002);
      await page.evaluate(dataUrl => {
        NoteCapture.setRecordings('edit-cust-notes', [{ id: 'large-synthetic', mediaType: 'audio/wav', dataUrl }]);
        NoteCapture.refresh('edit-cust-notes');
      }, large);
      await page.locator('[data-audio-id="large-synthetic"] [data-action="NoteCapture.transcribe"]').click();
      await page.getByText('Recording too large to transcribe (3 MB limit). Audio remains available; record a shorter note or type your notes.', { exact: true }).waitFor();
      assert.equal(requests, 0, 'Oversize never uploads');
      assert.equal(await page.locator('#edit-cust-notes').inputValue(), 'Original synthetic context');
      await page.screenshot({ path: `/private/tmp/beelo-transcription-size-${engine.name()}.png` });
      await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
      await page.locator('#edit-cust-notes').waitFor({ state: 'hidden' });
      // Navigation includes the record ID; wait for the real hash transition, not just sheet closure.
      await page.waitForURL(url => url.hash === `#customer?id=${id}`);
      await page.locator('[data-action="CommunicationsFeature.openPreferences"]').waitFor();
      await page.reload(); await page.waitForFunction(() => !!App.currentHash);
      assert.equal(await page.evaluate(async id => (await DB.getCustomer(id)).audioNotes[0].dataUrl, id), large, 'Exact large audio retained across encrypted save/reload');
      await page.evaluate(id => AppointmentsFeature.openEditCustomerModal(id), id);
      await page.locator('#edit-cust-notes').waitFor();
      assert((await page.locator('[data-audio-id="large-synthetic"] audio').getAttribute('src')).startsWith('blob:'), 'Retained audio still has its local playback source');
      if (engine === chromium) await page.waitForFunction(() => document.querySelector('[data-audio-id="large-synthetic"] audio')?.readyState >= 1);
      else console.log('LIMIT WebKit headless WAV decoding: metadata did not load in the earlier attempt; byte retention/player source checked, audible playback not certified');
      await page.evaluate(dataUrl => {
        NoteCapture.setRecordings('edit-cust-notes', [...NoteCapture.getRecordings('edit-cust-notes'), { id: 'small-synthetic', mediaType: 'audio/wav', dataUrl }]);
        NoteCapture.refresh('edit-cust-notes');
      }, silentWav(32044));
      const notesBefore = await page.locator('#edit-cust-notes').inputValue();
      for (const error of [
        { status: 429, message: 'The shared pilot transcription allowance has been reached (100 attempts or 100 MB per UTC day). Try after midnight UTC; recording and playback remain available.' },
        { status: 429, message: 'Two transcriptions are already running. Try again shortly; your audio remains available.' },
        { status: 503, message: 'Transcription is temporarily paused because usage protection is unavailable. Try again later; recording and playback remain available.' }
      ]) {
        await page.waitForFunction(() => document.querySelectorAll('.toast').length === 0);
        transportError = error;
        const before = requests;
        await page.locator('[data-audio-id="small-synthetic"] [data-action="NoteCapture.transcribe"]').click();
        await page.getByText(error.message, { exact: true }).waitFor();
        assert.equal(requests, before + 1, 'No automatic quota retry');
        assert.equal(await page.locator('#edit-cust-notes').inputValue(), notesBefore);
        assert.equal(await page.evaluate(() => NoteCapture.transcribing.size), 0, 'Busy state released after denial');
        assert.equal(await page.locator('[data-audio-id="small-synthetic"] audio').count(), 1, 'Local playback still available');
      }
      await page.screenshot({ path: `/private/tmp/beelo-transcription-usage-${engine.name()}.png` });
      transportError = null;
      await page.locator('[data-audio-id="small-synthetic"] [data-action="NoteCapture.transcribe"]').click();
      await page.waitForFunction(() => document.getElementById('edit-cust-notes').value.includes('SYNTHETIC smaller recording transcript.'));
      assert.equal(requests, 4);
      assert((await page.locator('#edit-cust-notes').inputValue()).startsWith('Original synthetic context'));
      await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
      await page.locator('#edit-cust-notes').waitFor({ state: 'hidden' });
      const customer = await page.evaluate(id => DB.getCustomer(id), id);
      assert.equal(customer.audioNotes.length, 2);
      assert.equal(customer.audioNotes[0].dataUrl, large);
      assert(customer.notes.includes('SYNTHETIC smaller recording transcript.'));
      console.log(`PASS ${engine.name()}: oversize no-upload guidance, notes intact, encrypted audio save/reload and local player source, smaller mocked transcription, both recordings retained`);
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
(async () => {
  for (const file of ['followups.js', 'followups.min.js']) {
    let fail = false;
    const context = vm.createContext({ App: { registerFeature() {} }, TalkFeature: { SERVICE_OUTCOMES: {} }, DB: { async updateAppointment() { if (fail) throw new Error('Storage full'); } }, console });
    const feature = vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/features/followups', file), 'utf8') + '\n;FollowupsFeature;', context);
    const visit = { id: 1, customerId: 2, date: '2026-10-20T10:00:00Z', createdAt: '2026-10-15T10:00:00Z' };
    await feature.reconcileCommunicationDeadlines([visit], () => false, new Date('2026-10-20T11:00:00Z'));
    assert.equal(visit.communicationArchive.length, 1);
    assert.equal(visit.communicationArchive[0].type, 'day_before_confirmation');
    const other = { id: 3 };
    fail = true;
    await assert.rejects(feature.archiveMissedCommunication(other, 'introduction', new Date(), 'test'));
    assert.equal(other.communicationArchive, undefined, 'failed storage must remain retryable');
    fail = false;
    assert.equal(await feature.archiveMissedCommunication(other, 'introduction', new Date('2026-10-20'), 'test'), true);
    console.log('PASS deadline classification and storage retry:', file);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

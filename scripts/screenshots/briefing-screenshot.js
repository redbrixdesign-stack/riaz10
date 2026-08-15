const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:8001';
const OUTPUT = '/Users/muhammadasifriaz/Desktop/riaz10/screenshots-seeded/today-briefing-local.png';

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  await page.goto(BASE_URL + '/index.html#today', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#app', { timeout: 30000 });
  await page.waitForTimeout(5000);
  // Seed minimal data
  await page.evaluate(async () => {
    await DB.init();
    await DB.db.customers.clear();
    await DB.db.appointments.clear();
    const custId = await DB.db.customers.add({
      customerNumber: 'CUS-2026-0001',
      firstName: 'Sarah',
      lastName: 'Jones',
      phone: '07123 456789',
      email: 'sarah.jones@example.com',
      address: { line1: '12 Blenheim Road', town: 'Bristol', city: 'Bristol', postcode: 'BS1 4DJ' },
      source: 'referral',
      status: 'active',
      createdAt: new Date().toISOString()
    });
    const today = Utils.getToday().toISOString().split('T')[0];
    await DB.db.appointments.add({
      customerId: custId,
      date: new Date(today + 'T09:30:00').toISOString(),
      type: 'measure',
      status: 'confirmed',
      outcome: null,
      source: 'manual',
      createdAt: new Date().toISOString(),
      clientName: 'Sarah Jones'
    });
    await DB.db.appointments.add({
      customerId: custId,
      date: new Date(today + 'T14:00:00').toISOString(),
      type: 'fitting',
      status: 'confirmed',
      outcome: null,
      source: 'manual',
      createdAt: new Date().toISOString(),
      clientName: 'Sarah Jones'
    });
    localStorage.setItem('advisoros_config', JSON.stringify({ advisorName: 'Riaz Ahmed', weeklyTarget: 600 }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#app', { timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: OUTPUT, fullPage: true });
  console.log('Saved', OUTPUT);
  await browser.close();
}
capture().catch(e => { console.error(e); process.exit(1); });

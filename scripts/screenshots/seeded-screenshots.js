const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://beelo.beelestial.co.uk';
const OUTPUT_DIR = path.resolve(__dirname, '../../screenshots-seeded');
const VIEWPORT = { width: 390, height: 844 };

const ROUTES = [
  { name: 'today', hash: '#today' },
  { name: 'appointments', hash: '#appointments' },
  { name: 'route', hash: '#route' },
  { name: 'money', hash: '#money' },
  { name: 'talk', hash: '#talk' },
  { name: 'measure', hash: '#measure' },
  { name: 'ocr', hash: '#ocr' },
  { name: 'settings', hash: '#settings' },
  { name: 'followups', hash: '#followups' },
  { name: 'orders', hash: '#orders' },
  { name: 'customer', hash: '#customer' },
  { name: 'control', hash: '#control' },
  { name: 'companion', hash: '#companion' },
];

async function waitForAppReady(page) {
  await page.waitForSelector('#app', { timeout: 30000 });
  await page.waitForFunction(() => typeof DB !== 'undefined' && DB !== null, { timeout: 30000 });
  await page.waitForFunction(() => typeof DB !== 'undefined' && DB.db, { timeout: 30000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller != null, { timeout: 15000 }).catch(() => {});
  await page.evaluateHandle(() => document.fonts.ready);
}

async function seedData(page) {
  await page.evaluate(async () => {
    // Wait for DB init
    await DB.init();
    // Ensure encryption is disabled for seeding simplicity
    // Clear existing data
    const tables = ['customers','appointments','orders','expenses','trips','measurements','communications'];
    for (const t of tables) {
      await DB.db[t].clear();
    }
    // Seed customer
    const customerId = await DB.db.customers.add({
      customerNumber: 'CUS-2026-0001',
      firstName: 'Sarah',
      lastName: 'Jones',
      phone: '07123 456789',
      email: 'sarah.jones@example.com',
      address: {
        line1: '12 Blenheim Road',
        town: 'Bristol',
        city: 'Bristol',
        postcode: 'BS1 4DJ'
      },
      source: 'referral',
      status: 'active',
      createdAt: new Date().toISOString()
    });
    // Seed appointment for today
    const today = new Date().toISOString().split('T')[0];
    await DB.db.appointments.add({
      customerId,
      date: today,
      type: 'measure',
      status: 'confirmed',
      outcome: null,
      source: 'manual',
      createdAt: new Date().toISOString()
    });
    // Seed expense
    await DB.db.expenses.add({
      date: today,
      category: 'fuel',
      amount: 45.20,
      createdAt: new Date().toISOString()
    });
    // Seed settings
    await DB.db.settings.put({ key: 'advisorName', value: 'Riaz Ahmed' });
    await DB.db.settings.put({ key: 'weeklyTarget', value: 600 });
    // Persist config to localStorage for app
    localStorage.setItem('advisoros_config', JSON.stringify({ advisorName: 'Riaz Ahmed', weeklyTarget: 600 }));
  });
}

async function capture() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();
  await page.setDefaultNavigationTimeout(60000);
  await page.setDefaultTimeout(30000);

  console.log('Navigating to base URL for seeding...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await waitForAppReady(page);
  
  console.log('Seeding data...');
  await seedData(page);
  console.log('Seed complete');

  for (const route of ROUTES) {
    const url = BASE_URL + route.hash;
    console.log(`Capturing ${route.name} -> ${url}`);
    await page.goto(url, { waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await page.waitForTimeout(1500);
    const filePath = path.join(OUTPUT_DIR, `${route.name}-mobile-seeded.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`Saved ${filePath}`);
  }

  await browser.close();
  console.log('Done. Screenshots saved to', OUTPUT_DIR);
}

capture().catch(err => {
  console.error('Seeded screenshot capture failed:', err);
  process.exit(1);
});

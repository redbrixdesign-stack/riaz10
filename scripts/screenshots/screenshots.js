const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://beelo.beelestial.co.uk';
const OUTPUT_DIR = path.resolve(__dirname, '../../screenshots');
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
  { name: 'onboarding', hash: '#onboarding' },
];

async function waitForAppReady(page) {
  await page.waitForSelector('#app', { timeout: 30000 });
  // Wait for service worker controller
  await page.waitForFunction(() => navigator.serviceWorker.controller != null, { timeout: 15000 }).catch(() => {});
  // Wait for fonts
  await page.evaluateHandle(() => document.fonts.ready);
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

  console.log('Navigating to base URL...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await waitForAppReady(page);

  for (const route of ROUTES) {
    const url = BASE_URL + route.hash;
    console.log(`Capturing ${route.name} -> ${url}`);
    await page.goto(url, { waitUntil: 'networkidle' });
    await waitForAppReady(page);
    // Small extra wait for dynamic rendering
    await page.waitForTimeout(1500);
    const filePath = path.join(OUTPUT_DIR, `${route.name}-mobile.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`Saved ${filePath}`);
  }

  await browser.close();
  console.log('Done. Screenshots saved to', OUTPUT_DIR);
}

capture().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});

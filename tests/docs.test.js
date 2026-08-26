'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let failures = 0;

function ok(label, condition) {
  console.log(`  ${condition ? 'OK' : 'FAIL'} ${label}`);
  if (!condition) failures++;
}

const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const core = read('css/core.css');
const design = read('docs/DESIGN_SYSTEM.md');
const baseline = read('docs/VISUAL_BASELINE-v2.md');
const app = read('js/core/app.js');
const geo = read('js/core/geo.js');
const notifications = read('js/services/notification.js');
const serviceWorker = read('sw.js');
const indexHtml = read('index.html');
const manifest = JSON.parse(read('manifest.json'));
const lighthouse = read('lighthouserc.js');
const routeFeature = read('js/features/route/route.js');

console.log('documentation and product-language contracts');
for (const [token, value] of [
  ['--bg', '#0A0A0A'], ['--surface', '#121212'],
  ['--surface-elevated', '#171717'], ['--surface-muted', '#202020'],
  ['--warning', '#C08A2D'], ['--danger', '#C0563F']
]) {
  ok(`${token} ${value} agrees in CSS and design guide`,
    core.includes(`${token}: ${value}`) && design.includes(`\`${value}\``));
}

for (const match of baseline.matchAll(/`(tests\/browser\/[\w.-]+\.js)`/g)) {
  ok(`visual-baseline script exists: ${match[1]}`, fs.existsSync(path.join(root, match[1])));
}

ok('unlock UI uses Beelo', app.includes('Unlock Beelo') && !app.includes('Unlock AdvisorOS'));
ok('morning notification uses Beelo', notifications.includes('Open Beelo to see your day.'));
ok('shared back button has an accessible name', app.includes('aria-label="Back"'));
ok('shared back icon is decorative', app.includes('aria-hidden="true">arrow_back'));
ok('local passphrase uses masked-text account-credential avoidance when supported',
  app.includes('passphraseControl(id, placeholder)') &&
  app.includes("CSS.supports('-webkit-text-security', 'disc')") &&
  app.includes('autocomplete="one-time-code"') &&
  app.includes('<textarea ${common}') &&
  core.includes('.passphrase-input') &&
  core.includes('-webkit-text-security: disc'));
ok('passphrase markup is generated through the non-account credential helper',
  ['enc-passphrase-new', 'enc-passphrase-confirm', 'enc-passphrase'].every(id =>
    app.includes("this.passphraseControl('" + id + "'")));
const geoInit = (geo.match(/init\(\)\s*\{([\s\S]*?)\n\s*\},\n\n\s*async checkArrivalOnResume/) || [])[1] || '';
ok('app launch restores trip state without proactively requesting location',
  geoInit.includes('this.restoreActiveTrip()') && !geoInit.includes('this.getCurrentPosition()'));
ok('navigation clears focused controls and resets app plus window scroll',
  app.includes('active.blur()') &&
  app.includes('resetNavigationScroll(main)') &&
  app.includes('window.scrollTo(0, 0)'));
ok('all generated dialogs receive an accessible name',
  app.includes('this._nameDialog(sheet, options)') &&
  app.includes("container.setAttribute('aria-labelledby', heading.id)"));
ok('CSP is delivered once as a response header, not duplicated in meta markup',
  !/http-equiv=["']Content-Security-Policy/i.test(indexHtml));
ok('manifest has a stable app identity and required install fields',
  manifest.id === './' && manifest.start_url === './' && manifest.scope === './' &&
  ['standalone', 'fullscreen'].includes(manifest.display) &&
  manifest.icons.some(icon => icon.sizes === '192x192' && /any/.test(icon.purpose || 'any')) &&
  manifest.icons.some(icon => icon.sizes === '512x512' && /maskable/.test(icon.purpose || '')));
ok('service-worker updates wait for deliberate activation',
  !/install[\s\S]{0,250}skipWaiting\(\)/.test(serviceWorker) &&
  serviceWorker.includes("e.data?.type === 'SKIP_WAITING'") &&
  app.includes("worker.postMessage({ type: 'SKIP_WAITING' })"));
ok('offline HTML fallback is restricted to navigation requests',
  serviceWorker.includes("e.request.mode === 'navigate'") &&
  serviceWorker.includes("caches.match('index.html')") &&
  serviceWorker.includes("['script', 'style', 'font', 'image']"));
ok('service worker deletes only Beelo-owned caches',
  serviceWorker.includes('n.startsWith(CACHE_PREFIX)'));
ok('production Lighthouse performance regression floor remains enforced',
  /categories:performance'[\s\S]*minScore:\s*0\.7/.test(lighthouse));
ok('Leaflet stays off the first-screen path until Route is activated',
  routeFeature.includes('init() {}') &&
  routeFeature.includes('this.loadLeaflet();') &&
  !/init\(\)\s*\{[^}]*leaflet-css/s.test(routeFeature));

const readableUiFiles = [
  ...fs.readdirSync(path.join(root, 'js/features'), { recursive: true })
    .filter(file => file.endsWith('.js') && !file.endsWith('.min.js'))
    .map(file => path.join(root, 'js/features', file)),
  ...fs.readdirSync(path.join(root, 'tests/browser'))
    .filter(file => file.endsWith('.html'))
    .map(file => path.join(root, 'tests/browser', file))
];
const inlineStyleCount = readableUiFiles.reduce((count, file) =>
  count + (fs.readFileSync(file, 'utf8').match(/style="/g) || []).length, 0);
const componentRawColourCount = (read('css/components.css').match(/#[0-9a-f]{3,8}\b/gi) || []).length;
ok(`inline style debt does not grow (${inlineStyleCount} <= 93)`, inlineStyleCount <= 93);
ok(`raw component colour debt does not grow (${componentRawColourCount} <= 15)`, componentRawColourCount <= 15);

process.exit(failures ? 1 : 0);

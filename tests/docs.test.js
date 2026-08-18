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
const notifications = read('js/services/notification.js');

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

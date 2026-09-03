'use strict';

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/core/legal.js'), 'utf8');

let failures = 0;
function ok(label, condition) {
  console.log(`  ${condition ? 'OK' : 'FAIL'} ${label}`);
  if (!condition) failures++;
}

console.log('legal identity and network-disclosure contracts');
ok('verified legal company name', source.includes("name: 'BEELESTIAL LTD'"));
ok('verified company number', source.includes("companyNumber: '15297106'"));
ok('verified service address', source.includes('Apartment 6, 2 Copper Place, Manchester M14 7FZ'));
ok('published privacy contact', source.includes("email: 'hello@beelestial.co.uk'"));
ok('OpenAI voice transcription is disclosed', source.includes('OpenAI for speech-to-text processing'));
ok('address and route providers are disclosed', ['Mapbox', 'Nominatim/OSRM'].every(value => source.includes(value)));
ok('weather provider is disclosed', source.includes('Open-Meteo'));
ok('Claude processor is disclosed', source.includes("Anthropic's") && source.includes('Claude. Provider API keys'));
ok('obsolete no-server claim is absent', !source.includes('no account and no servers'));
ok('obsolete only-Claude egress claim is absent', !source.includes('The one optional feature that sends anything out'));
ok('material disclosure update requires version 2 acknowledgement',
  source.includes('Number(saved?.v) >= 2') && source.includes("JSON.stringify({ v: 2"));

process.exit(failures ? 1 : 0);

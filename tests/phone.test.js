'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const file of ['utils.js', 'utils.min.js']) {
  const sandbox = { CONFIG: { country: 'GB' } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/core', file), 'utf8') + ';globalThis.utils = Utils;', sandbox);
  const utils = sandbox.utils;
  const inputs = ['07700 900123', '7700900123', '+44 7700 900123', '0044 7700 900123',
    '+44 (0)7700 900123', '+4407700900123', '0044 (0)7700-900123', '44 (0)7700 900123'];
  for (const input of inputs) {
    assert.equal(utils.toWhatsAppPhone(input), '447700900123', `${file}: ${input}`);
    assert.equal(utils.toE164Phone(input), '+447700900123');
    assert.equal(utils.buildWhatsAppUrl(input, 'Hello & thanks'), 'https://wa.me/447700900123?text=Hello%20%26%20thanks');
  }
  assert.equal(utils.toWhatsAppPhone('+44 (0)20 7946 0123'), '442079460123');
  assert.equal(utils.toWhatsAppPhone('+44 (0)7700 900123', 'US'), '447700900123');
  for (const [input, expected] of [['+1 202 555 0123', '12025550123'], ['+39 06 6982 0000', '390669820000'], ['+49 30 12345678', '493012345678']]) {
    assert.equal(utils.toWhatsAppPhone(input), expected);
  }
  for (const input of ['', null, 'abc', '123', '1234567890123456']) assert.equal(utils.buildWhatsAppUrl(input), '');
  console.log(`${file}: phone normalization checks passed (no network requests)`);
}

// Public launch-page audit only: no real profiles, unlocks, provider calls or uploads.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import config from '../lighthouserc.js';

export function checkAssertions(lhr, assertions = config.ci.assert.assertions) {
  const failures = [];
  if (lhr.runtimeError) failures.push('Lighthouse runtime error: ' + lhr.runtimeError.code);
  for (const [id, [level, options]] of Object.entries(assertions)) {
    if (level !== 'error') throw Error('Unsupported assertion severity: ' + id);
    const score = id.startsWith('categories:') ? lhr.categories?.[id.slice(11)]?.score : lhr.audits?.[id]?.score;
    // Missing/null scores must fail, never silently remove an obsolete audit.
    if (typeof score !== 'number' || score < options.minScore) failures.push(`${id}: ${score ?? 'missing'} < ${options.minScore}`);
  }
  return failures;
}

async function main() {
  const [{default: lighthouse}, {launch}, {chromium}] = await Promise.all([import('lighthouse'), import('chrome-launcher'), import('playwright')]);
  const directory = path.resolve(process.env.BEELO_LIGHTHOUSE_DIR || '.lighthouseci');
  fs.mkdirSync(directory, {recursive:true});
  const urls = process.env.BEELO_LIGHTHOUSE_URL ? [process.env.BEELO_LIGHTHOUSE_URL] : config.ci.collect.url;
  for (const url of urls) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw Error('Expected a credential-free HTTP(S) launch URL');
  }
  const chrome = await launch({chromePath:chromium.executablePath(), chromeFlags:config.ci.collect.settings.chromeFlags.split(/\s+/)});
  const results = [];
  try {
    for (const [urlIndex, url] of urls.entries()) for (let run=0;run<config.ci.collect.numberOfRuns;run++) {
      const result = await lighthouse(url, {port:chrome.port, logLevel:'error', output:['json','html'], formFactor:config.ci.collect.settings.formFactor});
      if (!result?.lhr) throw Error('Lighthouse returned no report');
      const filename = `report-${urlIndex}-${run}`;
      for (const [index, extension] of ['json','html'].entries()) fs.writeFileSync(path.join(directory, filename+'.'+extension), result.report[index]);
      const failures = checkAssertions(result.lhr);
      results.push({url, run, lighthouseVersion:result.lhr.lighthouseVersion, scores:Object.fromEntries(Object.entries(result.lhr.categories).map(([key,value])=>[key,value.score])), failures});
      console.log(JSON.stringify(results.at(-1)));
    }
    fs.writeFileSync(path.join(directory,'assertions.json'),JSON.stringify(results,null,2)+'\n');
    if (results.some(result=>result.failures.length)) throw Error('Performance acceptance failed; see '+directory+'/assertions.json');
  } finally { await chrome.kill(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error=>{console.error(error.message);process.exitCode=1;});

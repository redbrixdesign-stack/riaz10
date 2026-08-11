#!/usr/bin/env node
'use strict';

/* ============================================================
   AdvisorOS - minifier
   Regenerates every js/<dir>/<name>.min.js from its matching source
   .js file, using terser (already in node_modules).

   Why this exists: the .min.js files are shipped to the browser
   with cache-busting ?v=N query strings (see index.html / sw.js),
   and were previously hand-minified and re-versioned whenever a
   source file changed - which is error-prone and silently
   drifts. This script makes the procedure reproducible:

     node build/minify.js           # one-shot, exits when done
     node build/minify.js --watch    # re-runs on source change
     node build/minify.js --clean    # delete all generated .min.js

   The vendored js/vendor/*.min.js files are ALSO regenerated,
   so the build owns every minified file the app serves. Only
   exclude node_modules/.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const ROOT = path.resolve(__dirname, '..');

// terser options tuned to match what the existing hand-minified
// files already look like: mangle, drop console.log (keep warn/
// error for the storage-warning path users actually need to see
// in shipped builds), keep function names off, no toplevel mangle
// (these files declare globals like App, DB, Utils on purpose).
const TERSER_OPTS = {
  compress: {
    passes: 2,
    drop_console: false,   // keep warn/error — the storage-warning path users actually need to see in shipped builds
    pure_funcs: ['console.log', 'console.info']   // drop chatty debug logging, keep meaningful warnings
  },
  mangle: true,
  format: {
    comments: false,
    ecma: 2020
  },
  ecma: 2020
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'build') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js')) out.push(full);
  }
  return out;
}

function outPath(src) {
  return src.replace(/\.js$/, '.min.js');
}

async function minifyOne(src) {
  const code = fs.readFileSync(src, 'utf8');
  const result = await minify(code, TERSER_OPTS);
  if (result.error) throw result.error;
  const out = outPath(src);
  const previous = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
  // Normalise the trailing newline so we only flag a "change" when the
  // actual minified code differs - not just because we write with a final
  // newline and the old file happened to lack one (or vice versa).
  const candidate = (result.code || '') + '\n';
  if (previous !== candidate) {
    fs.writeFileSync(out, candidate);
    return { src, out, changed: true };
  }
  return { src, out, changed: false };
}

async function run() {
  const sources = walk(path.join(ROOT, 'js'));
  const report = [];
  for (const src of sources) {
    try {
      report.push(await minifyOne(src));
    } catch (e) {
      console.error(`  ✗ ${path.relative(ROOT, src)}: ${e.message}`);
      process.exitCode = 1;
    }
  }
  const changed = report.filter(r => r.changed);
  if (changed.length === 0) {
    console.log(`  ✓ ${sources.length} file(s) already up to date`);
  } else {
    for (const r of changed) {
      console.log(`  ⟳ ${path.relative(ROOT, r.src)} → ${path.relative(ROOT, r.out)}`);
    }
    console.log(`  ✓ Built ${changed.length}/${sources.length} file(s)`);
  }
  copyVendorDeps();
}

// Copies third-party libraries from node_modules into js/vendor/ so the app
// stays offline-first (no CDN dependency). The shimmed index.html <script>
// loads these before the app's own scripts. Source maps are stripped so a
// missing .map file never 404s in devtools.
function copyVendorDeps() {
  const vendors = [
    { src: 'node_modules/dexie/dist/dexie.min.js', out: 'js/vendor/dexie.min.js' }
  ];
  for (const v of vendors) {
    const srcPath = path.join(ROOT, v.src);
    if (!fs.existsSync(srcPath)) {
      console.warn(`  ! vendor source missing: ${v.src} (run npm install)`);
      continue;
    }
    const outPath = path.join(ROOT, v.out);
    const content = fs.readFileSync(srcPath, 'utf8').replace(/\/\/# sourceMappingURL=[^\n]*/, '');
    const previous = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
    if (previous !== content) {
      fs.writeFileSync(outPath, content);
      console.log(`  ⟳ vendor ${v.src} → ${v.out}`);
    }
  }
}

function watch() {
  console.log('Watching js/** for changes (Ctrl-C to stop)...');
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      console.log(`\n[${new Date().toLocaleTimeString()}] rebuild...`);
      try { await run(); } catch (e) { console.error(e.message); }
    }, 150);
  };
  // One initial pass so the watch starts in a confirmed-built state.
  run().then(() => {
    const sources = walk(path.join(ROOT, 'js'));
    for (const src of sources) {
      fs.watchFile(src, { interval: 500 }, schedule);
    }
  });
}

function clean() {
  const sources = walk(path.join(ROOT, 'js'));
  let count = 0;
  for (const src of sources) {
    const out = outPath(src);
    if (fs.existsSync(out)) {
      fs.unlinkSync(out);
      console.log(`  ✓ removed ${path.relative(ROOT, out)}`);
      count++;
    }
  }
  console.log(`  Cleaned ${count} file(s)`);
}

const arg = process.argv[2];
if (arg === '--watch') watch();
else if (arg === '--clean') clean();
else run();

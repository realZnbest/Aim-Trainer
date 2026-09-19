export const BUNDLE_BUDGET_KB_GZIP = 250;

// Enforces the INITIAL JS budget: only chunks referenced by dist/index.html
// (the entry graph) count. three.js / recharts are lazy-loaded on demand.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const assets = join(dist, 'assets');

let html;
try {
  html = readFileSync(join(dist, 'index.html'), 'utf8');
} catch {
  console.log('No dist found, skipping budget check.');
  process.exit(0);
}

const refs = new Set();
for (const m of html.matchAll(/(assets\/[A-Za-z0-9_.-]+\.js)/g)) refs.add(m[1]);
// CSS is not JS; ignore. Also count imported CSS? No — JS budget only.
let total = 0;
for (const f of refs) {
  try {
    const buf = readFileSync(join(dist, f));
    const gz = gzipSync(buf).length;
    total += gz;
    console.log(`  ${f}: ${(gz / 1024).toFixed(1)} KB gzip`);
  } catch {
    console.warn(`  missing ${f}`);
  }
}
// Async chunks (not initial) — report only
try {
  for (const f of readdirSync(assets)) {
    if (!f.endsWith('.js') || refs.has(`assets/${f}`)) continue;
    const gz = gzipSync(readFileSync(join(assets, f))).length;
    console.log(`  (lazy) assets/${f}: ${(gz / 1024).toFixed(1)} KB gzip`);
  }
} catch {
  /* ignore */
}
const kb = total / 1024;
console.log(`Initial JS (gzip): ${kb.toFixed(1)} KB (budget ${BUNDLE_BUDGET_KB_GZIP} KB)`);
if (kb > BUNDLE_BUDGET_KB_GZIP) {
  console.error('Bundle budget exceeded!');
  process.exit(1);
}

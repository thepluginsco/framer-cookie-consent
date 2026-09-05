// @ts-check
/**
 * Runtime bundler.
 *
 * Bundles `src/index.ts` into a single self-contained, minified IIFE at
 * `dist/consent.min.js` — the exact artifact served from a free CDN (jsDelivr)
 * and loaded on the published site. There are no runtime dependencies, so the
 * output is fully standalone.
 *
 * Two modes:
 *   node build.mjs          → one-shot build, prints size, FAILS if over budget.
 *   node build.mjs --watch  → rebuild on change (dev), no size gate.
 *
 * We sell "tiny + lean", so the build hard-fails if the minified bundle exceeds
 * the size budget below. Keep it honest.
 */

import { build, context } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Hard ceiling for the minified bundle. Build fails above this.
 *
 * The bundle carries three banner layouts (card / bar / modal), light/dark/auto
 * theming, and the Pro features (accurate-geo endpoint resolver, multi-language
 * copy, consent-event analytics). It is still deferred and gzips to ~12 KB over
 * the wire, so the honest raw ceiling is 44 KB — with headroom so a careless
 * addition still trips the gate.
 */
const MAX_BYTES = 44 * 1024; // 44 KB (≈12 KB gzipped)

const OUTFILE = join(__dirname, 'dist', 'consent.min.js');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [join(__dirname, 'src', 'index.ts')],
  outfile: OUTFILE,
  bundle: true,
  format: 'iife',
  target: 'es2018',
  minify: true,
  sourcemap: 'external',
  legalComments: 'none',
  charset: 'utf8',
  // Dev-only code (e.g. the WCAG contrast assertion) is guarded by __CC_DEV__ and
  // dead-code-eliminated from the production bundle. `--watch` keeps it enabled.
  define: { __CC_DEV__: process.argv.includes('--watch') ? 'true' : 'false' },
};

/** Format a byte count as a compact KB string. */
function kb(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

/** Report the built bundle's size and enforce the budget. */
function reportSize() {
  const bytes = readFileSync(OUTFILE).byteLength;
  const budget = `${kb(bytes)} / ${kb(MAX_BYTES)} budget`;
  if (bytes > MAX_BYTES) {
    console.error(`✖ consent.min.js is ${budget} — OVER budget. Trim the runtime.`);
    process.exit(1);
  }
  console.log(`✔ consent.min.js — ${budget} (${bytes} bytes)`);
}

const watch = process.argv.includes('--watch');

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[runtime] esbuild watching src/ … (Ctrl+C to stop)');
} else {
  await build(options);
  reportSize();
}

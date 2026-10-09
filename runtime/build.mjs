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
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Hard ceiling for the minified bundle. Build fails above this.
 *
 * The bundle carries three banner layouts (card / bar / modal), light/dark/auto
 * theming, and the Pro / depth features (accurate-geo endpoint resolver,
 * multi-language copy, consent-event analytics, the Phase 4.1 A/B consent-rate
 * test, and the Phase 4.2 full preference center: per-category vendor lists +
 * per-vendor consent switches gated by the script blocker). It is still
 * deferred and gzips to ~17.5 KB over the wire (the redesigned banner + full
 * preference center — tinted category icons, cookie hero marks, sectioned modal
 * — added ~1.9 KB gzipped). The Phase-2 licensing wiring (boot-time entitlement
 * fetch + JWKS cache + offline ES256/JWKS token verify) adds ~2 KB, so the honest
 * raw ceiling is now 64 KB — the wire cost is what matters, and there is headroom
 * so a careless addition still trips the gate. Free-key activation (activated
 * status, free-activation cache, no-banner-when-unactivated) pushed it just past
 * 64 KB, so the ceiling was 65 KB. Translatable preference-center copy plus the
 * built-in Swedish pack (shared/locale-packs.ts) add ~2.5 KB raw (~0.9 KB
 * gzipped), so the ceiling became 68 KB. Built-in packs for every language are
 * fetched on demand (one JSON per visitor) rather than bundled; the loader plus
 * the language resolver add ~0.6 KB, so the ceiling is now 69 KB.
 */
const MAX_BYTES = 69 * 1024; // 69 KB (≈21.8 KB gzipped)

const OUTFILE = join(__dirname, 'dist', 'consent.min.js');

/**
 * The self-hosted variant shipped inside platform plugins (WordPress). Same
 * runtime, but its banner images resolve to an `images/` folder beside the file
 * instead of jsDelivr, so a published site loads nothing from a CDN. Built from
 * the same sources, so the CDN bundle (and its SRI hash) is unaffected.
 */
const SELF_HOSTED_OUTFILE = join(__dirname, 'dist', 'consent.self-hosted.min.js');

/** @type {import('esbuild').Plugin} */
const selfHostedAssets = {
  name: 'self-hosted-assets',
  setup(b) {
    b.onResolve({ filter: /\/brand-mark\.ts$/ }, (args) => ({
      path: join(args.resolveDir, 'brand-mark.self-hosted.ts'),
    }));
  },
};

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
  // __CC_SELF_HOSTED__ is true only in the self-hosted (WordPress) bundle below,
  // where the "Powered by" credit is the site owner's opt-in.
  define: { __CC_DEV__: process.argv.includes('--watch') ? 'true' : 'false', __CC_SELF_HOSTED__: 'false' },
};

/** Format a byte count as a compact KB string. */
function kb(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

/** Report the built bundle's size and enforce the budget. */
function reportSize(file = OUTFILE) {
  const bytes = readFileSync(file).byteLength;
  const budget = `${kb(bytes)} / ${kb(MAX_BYTES)} budget`;
  if (bytes > MAX_BYTES) {
    console.error(`✖ ${basename(file)} is ${budget} — OVER budget. Trim the runtime.`);
    process.exit(1);
  }
  console.log(`✔ ${basename(file)} — ${budget} (${bytes} bytes)`);
}

/**
 * Write each built-in language pack to `dist/locales/<code>.json`. The runtime
 * fetches only the one a visitor needs (see src/locale-loader.ts), so the packs
 * never count against the bundle budget. They come from shared's TypeScript
 * source, bundled in memory to read the data.
 */
async function writeLocalePacks() {
  const out = await build({
    stdin: {
      contents: "export { LOCALE_PACKS } from '../shared/src/locale-pack-data.ts'; export { LOCALE_PACK_CODES as CODES } from '../shared/src/locale-packs.ts';",
      resolveDir: __dirname,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
  });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
  const dir = join(__dirname, 'dist', 'locales');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const code of mod.CODES) {
    const pack = mod.LOCALE_PACKS[code];
    if (!pack) throw new Error(`locale pack "${code}" is listed but has no data`);
    writeFileSync(join(dir, `${code}.json`), JSON.stringify(pack));
  }
  console.log(`✔ locales — ${mod.CODES.length} packs written to dist/locales/`);
}

const watch = process.argv.includes('--watch');

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[runtime] esbuild watching src/ … (Ctrl+C to stop)');
} else {
  await build(options);
  reportSize();
  await build({
    ...options,
    outfile: SELF_HOSTED_OUTFILE,
    sourcemap: false,
    plugins: [selfHostedAssets],
    define: { ...options.define, __CC_SELF_HOSTED__: 'true' },
  });
  reportSize(SELF_HOSTED_OUTFILE);
  await writeLocalePacks();
}

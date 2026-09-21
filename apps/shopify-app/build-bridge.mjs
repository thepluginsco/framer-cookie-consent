// @ts-check
/**
 * Consent-bridge bundler.
 *
 * Bundles `src/consent-bridge.boot.ts` into a single self-contained, minified
 * IIFE at `extension/assets/consentful-consent-bridge.js` — the storefront asset
 * the theme app extension's app-embed block loads (deferred). It pulls in the
 * shared `mapToShopifyConsent` + `mergeConfig` (tree-shaken), so the Shopify
 * consent mapping can never drift from the tested core.
 *
 * The asset is tiny (only the mapper + merge + wiring), so — like the runtime
 * bundle — the build hard-fails if it exceeds a generous budget, keeping it
 * honest.
 */

import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Hard ceiling for the bundled bridge. It carries only the mapper + config
 * merge + a few dozen lines of wiring, so this has ample headroom. */
const MAX_BYTES = 16 * 1024; // 16 KB

const OUTFILE = join(__dirname, "extension", "assets", "consentful-consent-bridge.js");

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [join(__dirname, "src", "consent-bridge.boot.ts")],
  outfile: OUTFILE,
  bundle: true,
  format: "iife",
  target: "es2018",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  charset: "utf8",
};

/** Format a byte count as a compact KB string. */
function kb(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

await build(options);

const bytes = readFileSync(OUTFILE).byteLength;
const budget = `${kb(bytes)} / ${kb(MAX_BYTES)} budget`;
if (bytes > MAX_BYTES) {
  console.error(`✖ consent-bridge is ${budget} — OVER budget.`);
  process.exit(1);
}
console.log(`✔ consentful-consent-bridge.js — ${budget} (${bytes} bytes)`);

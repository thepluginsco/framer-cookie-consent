// @ts-check
/**
 * Consent-bridge bundler (Wix).
 *
 * Bundles `src/consent-bridge.boot.ts` into a single self-contained, minified
 * IIFE at `dist/consentful-wix-bridge.js` — the published-site asset the Wix
 * bootstrap loads (deferred) when its `bridgeUrl` is set. It pulls in the shared
 * `mapToWixConsent` + `mergeConfig` (tree-shaken), so the Wix consent mapping can
 * never drift from the tested core.
 *
 * The asset is tiny (only the mapper + merge + wiring), so — like the runtime
 * bundle — the build hard-fails if it exceeds a generous budget, keeping it
 * honest. Host the output on your CDN and pass its URL as the bootstrap's
 * `bridgeUrl` when declaring the app's embedded-script component.
 */

import { build } from "esbuild";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Hard ceiling for the bundled bridge. It carries only the mapper + config
 * merge + a few dozen lines of wiring, so this has ample headroom. */
const MAX_BYTES = 16 * 1024; // 16 KB

const OUTFILE = join(__dirname, "dist", "consentful-wix-bridge.js");

mkdirSync(dirname(OUTFILE), { recursive: true });

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
  console.error(`✖ wix consent-bridge is ${budget} — OVER budget.`);
  process.exit(1);
}
console.log(`✔ consentful-wix-bridge.js — ${budget} (${bytes} bytes)`);

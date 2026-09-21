/**
 * The platform-neutral custom-code LOADER — the tiny HTML block every adapter
 * injects into a published site so the config reaches the shared runtime.
 *
 * This is the "engine" side of Phase 2's one-engine/many-front-ends split: it is
 * pure string manipulation with ZERO platform coupling (no Framer, no DOM, no
 * network), so Framer, the universal `<script>` embed, Webflow, WordPress and
 * Shopify all emit the *identical* loader and only differ in HOW they read/write
 * the host's custom-code region (see {@link ./adapter}).
 *
 * The loader block:
 *   1. embeds the serialized {@link CookieConsentConfig} on `window.__CC_CONFIG__`,
 *   2. sets Google Consent Mode v2 defaults to `denied` INLINE (before anything
 *      else can fire), and
 *   3. loads the real runtime from a version-pinned jsDelivr URL.
 *
 * Everything lives between two HTML-comment markers so an adapter can find +
 * replace ONLY our block and never disturb other custom code on the page.
 */

import type { CookieConsentConfig } from "./config-schema.js";
import { serialize } from "./config-schema.js";
import { runtimeScriptUrl } from "./runtime-cdn.js";

/* -------------------------------------------------------------------------- */
/* Markers                                                                    */
/* -------------------------------------------------------------------------- */

/** Opening marker of our managed block. Never changes — it's how we find our own code. */
export const MARKER_START = "<!-- cookie-consent:start -->";
/** Closing marker of our managed block. */
export const MARKER_END = "<!-- cookie-consent:end -->";

/* -------------------------------------------------------------------------- */
/* HTML building                                                              */
/* -------------------------------------------------------------------------- */

/** Options for {@link buildLoaderHtml}. */
export interface BuildLoaderOptions {
  /**
   * Override the runtime `<script src>` URL. Defaults to the version-pinned
   * jsDelivr URL from {@link runtimeScriptUrl}. Handy for local testing or
   * self-hosting the bundle.
   */
  runtimeUrl?: string;
}

/**
 * Escape a JSON string so it is safe to inline inside a `<script>` element.
 *
 * In serialized config JSON the characters `<`, `>` and `&` only ever appear
 * inside string values, so replacing them with their `\uXXXX` escapes keeps the
 * text a VALID JavaScript object literal while making it impossible to break out
 * of the script tag (e.g. a `</script>` in a policy URL) or to open an HTML
 * comment. U+2028/U+2029 are also escaped — they are valid in JSON but are line
 * terminators in JS and would be a syntax error unescaped.
 *
 * Exported so the universal `<script>` embed builder ({@link ./embed}) reuses the
 * identical escaping — one engine, not a second copy that could drift.
 *
 * @param json - A JSON string (typically from `serialize(config)`).
 * @returns The same value, escaped for safe inlining in `<script>`.
 */
export function escapeForScript(json: string): string {
  // U+2028 / U+2029 are valid in JSON but are JS line terminators; match them
  // via fromCharCode so no raw control char lives in this source file.
  const lineSep = String.fromCharCode(0x2028);
  const paraSep = String.fromCharCode(0x2029);
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .split(lineSep).join("\\u2028")
    .split(paraSep).join("\\u2029");
}

/**
 * Build the JavaScript BODY of the config bootstrap — the `window.__CC_CONFIG__`
 * assignment, WITHOUT the surrounding `<script>` tags.
 *
 * Factored out so every front-end shares the exact same bytes: {@link buildLoaderHtml}
 * and the {@link ./embed} builder wrap it in `<script>…</script>` themselves,
 * while the Webflow adapter ({@link ./webflow}) hands the raw body to Webflow's
 * inline-script API (which supplies the `<script>` wrapper for you). One engine,
 * so a Framer site and a Webflow site can never publish different config JS.
 *
 * @param config - The active configuration to embed.
 * @returns The inline JS body, e.g. `window.__CC_CONFIG__={…};`.
 */
export function configScriptBody(config: CookieConsentConfig): string {
  return `window.__CC_CONFIG__=${escapeForScript(serialize(config))};`;
}

/**
 * Build the JavaScript BODY of the minimal inline Consent Mode v2 default
 * bootstrap — WITHOUT the surrounding `<script>` tags.
 *
 * This mirrors the runtime's `bootstrapConsentDefaults` in its simplest form: it
 * ensures a `gtag` shim exists and pushes an all-`denied` `consent default`
 * (with `security_storage: granted`) honouring `waitForUpdateMs`. It runs inline
 * so defaults are set the instant the head is parsed — even before the deferred
 * runtime downloads. The full runtime reconciles once loaded (re-emitting with
 * any prior consent, url-passthrough and ads-data-redaction).
 *
 * Exported (like {@link configScriptBody}) so the {@link ./embed} builder and the
 * Webflow adapter ({@link ./webflow}) reuse the identical default — one engine.
 *
 * @param waitForUpdateMs - Grace period (ms) tags should wait for an update.
 * @returns The inline JS body (an IIFE), without `<script>` tags.
 */
export function consentDefaultScriptBody(waitForUpdateMs: number): string {
  const wait = Number.isFinite(waitForUpdateMs) ? Math.max(0, Math.round(waitForUpdateMs)) : 500;
  return (
    `(function(){window.dataLayer=window.dataLayer||[];` +
    `function gtag(){dataLayer.push(arguments);}window.gtag=window.gtag||gtag;` +
    `gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',` +
    `ad_user_data:'denied',ad_personalization:'denied',security_storage:'granted',` +
    `wait_for_update:${wait}});})();`
  );
}

/**
 * Build the minimal inline Consent Mode v2 default bootstrap, wrapped in a
 * `<script>` element and ready to inline in an HTML `<head>`.
 *
 * Exported so the universal `<script>` embed builder ({@link ./embed}) emits the
 * identical inline default — one engine, not a divergent copy. The un-wrapped
 * body is {@link consentDefaultScriptBody}.
 *
 * @param waitForUpdateMs - Grace period (ms) tags should wait for an update.
 * @returns An inline `<script>` string.
 */
export function buildConsentDefaultSnippet(waitForUpdateMs: number): string {
  return `<script>${consentDefaultScriptBody(waitForUpdateMs)}</script>`;
}

/**
 * Build the complete loader HTML block to inject into the site `<head>`.
 *
 * The returned string is wrapped in {@link MARKER_START}/{@link MARKER_END} so
 * {@link upsertBlock}/{@link stripBlock} can target it precisely. It contains,
 * in order:
 *   1. `window.__CC_CONFIG__` = the serialized config (safely escaped),
 *   2. the inline Consent Mode default bootstrap (only when Consent Mode is on),
 *   3. the version-pinned, `defer`red runtime `<script>`.
 *
 * Kept intentionally tiny — it is on the critical path of every published page.
 *
 * @param config - The active configuration to embed.
 * @param options - See {@link BuildLoaderOptions}.
 * @returns The marker-wrapped HTML string.
 */
export function buildLoaderHtml(config: CookieConsentConfig, options: BuildLoaderOptions = {}): string {
  const runtimeUrl = options.runtimeUrl ?? runtimeScriptUrl();

  const parts = [
    MARKER_START,
    `<script>${configScriptBody(config)}</script>`,
    config.consentMode.enableConsentMode
      ? buildConsentDefaultSnippet(config.consentMode.waitForUpdateMs)
      : "",
    `<script src="${runtimeUrl}" defer></script>`,
    MARKER_END,
  ];

  return parts.filter(part => part !== "").join("\n");
}

/* -------------------------------------------------------------------------- */
/* Block splicing (marker-scoped, preserves everything else)                  */
/* -------------------------------------------------------------------------- */

/** Locate our block within `html`. Returns `null` when no complete block exists. */
function findBlock(html: string): { start: number; end: number } | null {
  const start = html.indexOf(MARKER_START);
  if (start === -1) return null;
  const endMarker = html.indexOf(MARKER_END, start);
  if (endMarker === -1) return null;
  return { start, end: endMarker + MARKER_END.length };
}

/** True when `html` already contains a complete managed loader block. */
export function hasBlock(html: string): boolean {
  return findBlock(html) !== null;
}

/**
 * Insert or replace our block inside existing custom code, preserving every
 * other line. Replaces an existing marker block in place; otherwise appends.
 * Collapses stray whitespace immediately around our block so repeated writes do
 * not accumulate blank lines. Pure; exported for tests.
 */
export function upsertBlock(existingHtml: string, block: string): string {
  const found = findBlock(existingHtml);
  if (found) {
    const before = existingHtml.slice(0, found.start).replace(/\s*$/, "");
    const after = existingHtml.slice(found.end).replace(/^\s*/, "");
    return [before, block, after].filter(part => part !== "").join("\n");
  }
  const trimmed = existingHtml.replace(/\s*$/, "");
  return trimmed === "" ? block : `${trimmed}\n${block}`;
}

/**
 * Remove our block from existing custom code, preserving everything else.
 * Returns `null` when nothing is left (so the caller can clear the location),
 * otherwise the remaining HTML. Pure; exported for tests.
 */
export function stripBlock(existingHtml: string): string | null {
  const found = findBlock(existingHtml);
  if (!found) return existingHtml.trim() === "" ? null : existingHtml;
  const before = existingHtml.slice(0, found.start).replace(/\s*$/, "");
  const after = existingHtml.slice(found.end).replace(/^\s*/, "");
  const remaining = [before, after].filter(part => part !== "").join("\n");
  return remaining === "" ? null : remaining;
}

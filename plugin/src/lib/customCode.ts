/**
 * The custom-code loader bridge — how the plugin's config reaches the live site.
 *
 * The plugin never ships the banner runtime itself. Instead it writes a tiny
 * HTML LOADER into the published site's custom code (via `framer.setCustomCode`)
 * that:
 *   1. embeds the serialized {@link CookieConsentConfig} on `window.__CC_CONFIG__`,
 *   2. sets Google Consent Mode v2 defaults to `denied` INLINE (before anything
 *      else can fire), and
 *   3. loads the real runtime from a version-pinned jsDelivr URL.
 *
 * Everything the loader emits lives between two HTML-comment markers so we can
 * find + replace ONLY our block on every config change and never disturb any
 * other custom code the user (or another plugin) placed at the same location.
 */

import type { CookieConsentConfig } from "../types"
import { serialize } from "../types"
import type { CustomCodeLocation } from "@framer/plugin"
import { getCustomCode, setCustomCode } from "./framer"
import { runtimeScriptUrl } from "./runtimeCdn"

/* -------------------------------------------------------------------------- */
/* Placement + markers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Where the loader is injected in the published site.
 *
 * `headStart` (start of `<head>`) is deliberate: the Consent Mode defaults must
 * run BEFORE any Google tag on the page, so the "denied by default" guarantee
 * holds. The `<script src>` itself is `defer`red, so an early head placement is
 * non-render-blocking. Shared with the "custom code disabled" detection
 * (`useCustomCodeStatus`).
 */
export const LOADER_LOCATION: CustomCodeLocation = "headStart"

/** Opening marker of our managed block. Never changes — it's how we find our own code. */
export const MARKER_START = "<!-- cookie-consent:start -->"
/** Closing marker of our managed block. */
export const MARKER_END = "<!-- cookie-consent:end -->"

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
  runtimeUrl?: string
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
 * @param json - A JSON string (typically from `serialize(config)`).
 * @returns The same value, escaped for safe inlining in `<script>`.
 */
function escapeForScript(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}

/**
 * Build the minimal inline Consent Mode v2 default bootstrap.
 *
 * This mirrors the runtime's `bootstrapConsentDefaults` in its simplest form: it
 * ensures a `gtag` shim exists and pushes an all-`denied` `consent default`
 * (with `security_storage: granted`) honouring `waitForUpdateMs`. It runs inline
 * so defaults are set the instant the head is parsed — even before the deferred
 * runtime downloads. The full runtime reconciles once loaded (re-emitting with
 * any prior consent, url-passthrough and ads-data-redaction).
 *
 * @param waitForUpdateMs - Grace period (ms) tags should wait for an update.
 * @returns An inline `<script>` string.
 */
function buildConsentDefaultSnippet(waitForUpdateMs: number): string {
  const wait = Number.isFinite(waitForUpdateMs) ? Math.max(0, Math.round(waitForUpdateMs)) : 500
  return (
    `<script>(function(){window.dataLayer=window.dataLayer||[];` +
    `function gtag(){dataLayer.push(arguments);}window.gtag=window.gtag||gtag;` +
    `gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',` +
    `ad_user_data:'denied',ad_personalization:'denied',security_storage:'granted',` +
    `wait_for_update:${wait}});})();</script>`
  )
}

/**
 * Build the complete loader HTML block to inject into the site `<head>`.
 *
 * The returned string is wrapped in {@link MARKER_START}/{@link MARKER_END} so
 * {@link injectLoader}/{@link removeLoader} can target it precisely. It contains,
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
  const runtimeUrl = options.runtimeUrl ?? runtimeScriptUrl()
  const configLiteral = escapeForScript(serialize(config))

  const parts = [
    MARKER_START,
    `<script>window.__CC_CONFIG__=${configLiteral};</script>`,
    config.consentMode.enableConsentMode
      ? buildConsentDefaultSnippet(config.consentMode.waitForUpdateMs)
      : "",
    `<script src="${runtimeUrl}" defer></script>`,
    MARKER_END,
  ]

  return parts.filter(part => part !== "").join("\n")
}

/* -------------------------------------------------------------------------- */
/* Block splicing (marker-scoped, preserves everything else)                  */
/* -------------------------------------------------------------------------- */

/** Locate our block within `html`. Returns `null` when no complete block exists. */
function findBlock(html: string): { start: number; end: number } | null {
  const start = html.indexOf(MARKER_START)
  if (start === -1) return null
  const endMarker = html.indexOf(MARKER_END, start)
  if (endMarker === -1) return null
  return { start, end: endMarker + MARKER_END.length }
}

/**
 * Insert or replace our block inside existing custom code, preserving every
 * other line. Replaces an existing marker block in place; otherwise appends.
 * Collapses stray whitespace immediately around our block so repeated writes do
 * not accumulate blank lines. Pure; exported for tests.
 */
export function upsertBlock(existingHtml: string, block: string): string {
  const found = findBlock(existingHtml)
  if (found) {
    const before = existingHtml.slice(0, found.start).replace(/\s*$/, "")
    const after = existingHtml.slice(found.end).replace(/^\s*/, "")
    return [before, block, after].filter(part => part !== "").join("\n")
  }
  const trimmed = existingHtml.replace(/\s*$/, "")
  return trimmed === "" ? block : `${trimmed}\n${block}`
}

/**
 * Remove our block from existing custom code, preserving everything else.
 * Returns `null` when nothing is left (so the caller can clear the location),
 * otherwise the remaining HTML. Pure; exported for tests.
 */
export function stripBlock(existingHtml: string): string | null {
  const found = findBlock(existingHtml)
  if (!found) return existingHtml.trim() === "" ? null : existingHtml
  const before = existingHtml.slice(0, found.start).replace(/\s*$/, "")
  const after = existingHtml.slice(found.end).replace(/^\s*/, "")
  const remaining = [before, after].filter(part => part !== "").join("\n")
  return remaining === "" ? null : remaining
}

/* -------------------------------------------------------------------------- */
/* TEMPORARY — licensing disabled for full-feature testing                    */
/* -------------------------------------------------------------------------- */

/**
 * While the team tests every feature end-to-end, licensing caps are OFF. Flip
 * this to `false` to restore real licensing.
 *
 * Pairs with the `plan` override in `consentful/model.ts` (which unlocks the Pro
 * UI controls). The runtime's license gate is UNCHANGED and still fully tested —
 * we simply hand it a paid-tier config so the published banner renders the FULL
 * configured design (real layout, theme, floating button, custom CSS,
 * white-label) instead of the unlicensed basic bar.
 */
export const LICENSING_DISABLED = true

/**
 * Stamp a paid-tier license onto the config we inject when {@link LICENSING_DISABLED}.
 * Defers to an already-present real license; a no-op once licensing is re-enabled.
 */
function withTestingLicense(config: CookieConsentConfig): CookieConsentConfig {
  if (!LICENSING_DISABLED) return config
  // A real paid license is already present → leave it untouched.
  if (config.license.tier !== "trial" && (config.license.key ?? "").length >= 8) return config
  return {
    ...config,
    license: { tier: "pro", key: "TESTING-LICENSE-UNGATED", whiteLabel: true },
  }
}

/* -------------------------------------------------------------------------- */
/* Framer wiring                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Re-generate the loader and write it into the site's custom code so the
 * published site always reflects the editor config.
 *
 * Reads the current custom code at {@link LOADER_LOCATION}, replaces ONLY our
 * marker block (or appends it if absent), and writes the result back — so it can
 * be called repeatedly (on every debounced config change) without duplicating
 * the block or clobbering other custom code. Skips the write entirely when the
 * resulting HTML is unchanged, avoiding needless churn.
 *
 * Requires the Framer "Site Settings" permission; when the user lacks it,
 * `setCustomCode` throws {@link import("./framer").FramerPermissionError}, which
 * callers surface to the user. Note that if the user has TURNED OFF custom code
 * in Framer, the write still succeeds but the code won't run — that state is
 * detected separately (see `useCustomCodeStatus`) and surfaced as a warning.
 *
 * @param config - The configuration to embed and publish.
 */
export async function injectLoader(config: CookieConsentConfig): Promise<void> {
  const block = buildLoaderHtml(withTestingLicense(config))
  const existing = await getCustomCode()
  const currentHtml = existing[LOADER_LOCATION].html ?? ""
  const nextHtml = upsertBlock(currentHtml, block)
  // Nothing changed (e.g. re-injecting an identical default) — don't write.
  if (nextHtml === currentHtml) return
  await setCustomCode({ html: nextHtml, location: LOADER_LOCATION })
}

/**
 * Remove ONLY our loader block from the site's custom code, leaving any other
 * custom code at {@link LOADER_LOCATION} intact. Clears the location entirely
 * (writes `null`) when nothing else remains. Used by the "remove banner" action.
 *
 * Requires the Framer "Site Settings" permission; throws
 * {@link import("./framer").FramerPermissionError} otherwise. A no-op (no write)
 * when our block isn't present.
 */
export async function removeLoader(): Promise<void> {
  const existing = await getCustomCode()
  const currentHtml = existing[LOADER_LOCATION].html ?? ""
  // Nothing of ours to remove.
  if (findBlock(currentHtml) === null) return
  const remaining = stripBlock(currentHtml)
  await setCustomCode({ html: remaining, location: LOADER_LOCATION })
}

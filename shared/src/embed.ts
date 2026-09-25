/**
 * The universal `<script>` EMBED builder — Phase 3.1's front-end.
 *
 * Where the Framer/Webflow/WordPress adapters WRITE the loader into a host's
 * custom-code region programmatically (see {@link ./loader} + {@link ./adapter}),
 * the universal embed has no such host API: the user copy-pastes a snippet into
 * their own site `<head>` (Wix, Squarespace, Ghost, Carrd, hand-coded, …). This
 * module builds that snippet.
 *
 * It is the SAME engine — it reuses {@link escapeForScript} and
 * {@link buildConsentDefaultSnippet} verbatim, so the embed and the Framer loader
 * can never drift — but formatted for a human paste target rather than a
 * marker-scoped splice: a friendly leading comment, no internal
 * `<!-- cookie-consent:start -->` markers, and a choice of two shapes the runtime
 * already understands ({@link readEmbeddedConfig}):
 *   - `"window"` (default, recommended): an inline `window.__CC_CONFIG__` script,
 *   - `"attribute"`: a single runtime `<script>` carrying `data-cc-config`.
 *
 * Both include the inline Consent Mode default (when enabled) so tags are denied
 * the instant the head parses — before the deferred runtime downloads.
 *
 * Pure string building: ZERO platform coupling, no DOM, no network.
 */

import type { CookieConsentConfig } from "./config-schema.js";
import { serialize, toPublishedConfig } from "./config-schema.js";
import { runtimeScriptUrl } from "./runtime-cdn.js";
import { buildConsentDefaultSnippet, escapeForScript } from "./loader.js";

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Which shape of snippet to emit:
 * - `"window"` — an inline `<script>window.__CC_CONFIG__={…}</script>` followed
 *   by the deferred runtime `<script>`. The default and recommended form:
 *   readable, and the config is a real JS object literal.
 * - `"attribute"` — a single runtime `<script src … data-cc-config="{…}" defer>`
 *   carrying the config in an HTML attribute. For hosts that allow only one tag
 *   or forbid inline script bodies.
 */
export type EmbedForm = "window" | "attribute";

/** Options for {@link buildEmbedSnippet}. */
export interface BuildEmbedOptions {
  /**
   * Override the runtime `<script src>` URL. Defaults to the version-pinned
   * jsDelivr URL from {@link runtimeScriptUrl}. Handy for local testing or
   * self-hosting the bundle.
   */
  runtimeUrl?: string;
  /** Snippet shape (see {@link EmbedForm}). Defaults to `"window"`. */
  form?: EmbedForm;
  /** Include the leading explanatory HTML comment. Defaults to `true`. */
  comment?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Attribute escaping                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Escape a JSON string so it is safe inside a double-quoted HTML attribute.
 *
 * The serialized config is JSON, so it contains `"` (which would close the
 * attribute) and may contain `&`, `<`, `>` inside string values. Escaping all
 * four to HTML entities keeps the attribute well-formed; the browser decodes
 * them back to the exact JSON before {@link readEmbeddedConfig} calls `parse`.
 *
 * @param json - A JSON string (typically from `serialize(config)`).
 * @returns The same value, escaped for a double-quoted `data-cc-config`.
 */
export function escapeForAttribute(json: string): string {
  return json
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* -------------------------------------------------------------------------- */
/* Snippet building                                                           */
/* -------------------------------------------------------------------------- */

/** The leading explanatory comment shown above the pasted snippet. */
const EMBED_COMMENT =
  "<!-- Consentful cookie consent — paste into your site <head>. " +
  "Edit your banner in Consentful and re-copy this snippet to update it. -->";

/**
 * Build the universal copy-paste embed snippet for `config`.
 *
 * The output is a small block a user pastes into their site `<head>`:
 *   1. a friendly explanatory comment (unless `comment: false`),
 *   2. the config — inline on `window.__CC_CONFIG__` (`"window"` form) or in the
 *      runtime tag's `data-cc-config` attribute (`"attribute"` form),
 *   3. the inline Consent Mode default (only when Consent Mode is enabled),
 *   4. the version-pinned, `defer`red runtime `<script>`.
 *
 * @param config - The active configuration to embed.
 * @param options - See {@link BuildEmbedOptions}.
 * @returns The ready-to-paste HTML snippet.
 */
export function buildEmbedSnippet(config: CookieConsentConfig, options: BuildEmbedOptions = {}): string {
  const runtimeUrl = options.runtimeUrl ?? runtimeScriptUrl();
  const form = options.form ?? "window";
  const includeComment = options.comment ?? true;

  const consentDefault = config.consentMode.enableConsentMode
    ? buildConsentDefaultSnippet(config.consentMode.waitForUpdateMs)
    : "";

  const parts =
    form === "attribute"
      ? [
          includeComment ? EMBED_COMMENT : "",
          consentDefault,
          `<script src="${runtimeUrl}" data-cc-config="${escapeForAttribute(serialize(toPublishedConfig(config)))}" defer></script>`,
        ]
      : [
          includeComment ? EMBED_COMMENT : "",
          `<script>window.__CC_CONFIG__=${escapeForScript(serialize(toPublishedConfig(config)))};</script>`,
          consentDefault,
          `<script src="${runtimeUrl}" defer></script>`,
        ];

  return parts.filter(part => part !== "").join("\n");
}

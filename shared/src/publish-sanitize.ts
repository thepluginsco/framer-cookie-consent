/**
 * Publish-time validation of every editable value that reaches a live site.
 *
 * The loader is a fixed template ({@link ./loader}): the config is serialized
 * JSON, escaped for `<script>`, and nothing editable is ever spliced into markup.
 * This module narrows what that JSON may contain, so an editable field can never
 * become something other than what it is meant to be:
 *
 *   - links: only `http(s):`, `mailto:`, root-relative paths and `#fragments`;
 *   - managed `src` scripts: only absolute `https://` URLs (others are dropped);
 *   - managed inline scripts: plain JavaScript only — a pasted `<script>` wrapper
 *     is unwrapped, entries carrying any other markup are dropped, and the body
 *     is size-capped. They still run ONLY after the visitor consents to their
 *     category (see the runtime's script blocker);
 *   - colours / fonts that the runtime interpolates into its stylesheet: strict
 *     grammars, so a value cannot close a rule and start another;
 *   - custom CSS: no markup, no legacy script-executing constructs, and every
 *     `url()` / `@import` restricted to `https:` (or inline images / fonts).
 *
 * Pure and dependency-free; applied by {@link toPublishedConfig} on every
 * platform.
 */

import type { CookieConsentConfig, ManagedScript } from './config-schema.js';

/** Upper bound for one inline managed script body (characters). */
export const MAX_INLINE_SCRIPT_LENGTH = 50_000;
/** Upper bound for the custom CSS block (characters). */
export const MAX_CUSTOM_CSS_LENGTH = 50_000;

/** True for a link the banner may render as an `href`. */
export function isSafeLink(value: string): boolean {
  const v = value.trim();
  if (v === '') return true;
  if (/^#[^\s]*$/.test(v)) return true;
  if (/^\/(?!\/)[^\s]*$/.test(v)) return true;
  return /^(https?:\/\/[^\s/]+|mailto:[^\s]+)/i.test(v) && !/[\s<>"'`]/.test(v);
}

/** True for an absolute `https://` URL with a host and no whitespace/markup. */
export function isSafeScriptUrl(value: string): boolean {
  const v = value.trim();
  return /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[^\s<>"'`]*)?$/i.test(v);
}

/**
 * Normalize an inline managed script body to plain JavaScript, or `null` when it
 * is not one. A single pasted `<script>…</script>` wrapper (without `src`) is
 * removed; anything else that looks like HTML markup is rejected.
 */
export function cleanInlineScript(value: string): string | null {
  let body = value.trim();
  const wrapped = /^<script\b([^>]*)>([\s\S]*)<\/script\s*>$/i.exec(body);
  if (wrapped) {
    if (/\bsrc\s*=/i.test(wrapped[1] ?? '')) return null;
    body = (wrapped[2] ?? '').trim();
  }
  if (/<\/?(script|iframe|object|embed|style|link|meta|img|svg)\b/i.test(body)) return null;
  if (body === '' || body.length > MAX_INLINE_SCRIPT_LENGTH) return null;
  return body;
}

/** A managed script entry that is safe to publish, or `null` to drop it. */
export function sanitizeManagedScript(script: ManagedScript): ManagedScript | null {
  if (script.type === 'src') {
    return isSafeScriptUrl(script.value) ? { ...script, value: script.value.trim() } : null;
  }
  const body = cleanInlineScript(script.value);
  return body === null ? null : { ...script, value: body };
}

/** True for a CSS colour the stylesheet may interpolate. */
export function isSafeColor(value: string): boolean {
  const v = value.trim();
  return (
    /^#[0-9a-f]{3,8}$/i.test(v) ||
    /^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(\s*[0-9a-z.,%\s/+-]*\)$/i.test(v) ||
    /^[a-z]{3,30}$/i.test(v)
  );
}

/** A font-family list the stylesheet may interpolate (no rule/markup breakers). */
export function cleanFontFamily(value: string): string {
  return value.replace(/[;{}<>\\@]/g, '').replace(/\/\*|\*\//g, '').trim();
}

/** Whether a `url()` / `@import` target in custom CSS is allowed. */
function isSafeCssUrl(target: string): boolean {
  const t = target.trim().replace(/^['"]|['"]$/g, '').trim();
  if (t === '') return false;
  return /^https:\/\//i.test(t) || /^data:(image|font)\//i.test(t) || /^#/.test(t);
}

/**
 * Custom CSS restricted to plain style rules: markup and comment-breakers are
 * removed, legacy script-executing constructs are neutralized, and external
 * references must be `https:` (or inline images / fonts).
 */
export function cleanCustomCss(value: string): string {
  let css = value.slice(0, MAX_CUSTOM_CSS_LENGTH).replace(/</g, '');
  css = css.replace(/expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding\s*:|behavior\s*:/gi, '/*removed*/');
  css = css.replace(/@import\s+(url\(\s*)?(['"]?)([^'")\s;]*)\2\s*\)?([^;]*);?/gi, (rule, _u, _q, target: string) =>
    isSafeCssUrl(target) ? rule : '',
  );
  css = css.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (match, _q, target: string) =>
    isSafeCssUrl(target) ? match : 'none',
  );
  return css;
}

/**
 * Validate every editable value that the published config carries. Values that
 * are already valid pass through unchanged, so a correctly configured site
 * publishes exactly what it did before. Pure.
 *
 * @param config - A config about to be published.
 * @returns A copy whose editable values are constrained as described above.
 */
export function sanitizeForPublish(config: CookieConsentConfig): CookieConsentConfig {
  const accent = isSafeColor(config.theme.accent) ? config.theme.accent.trim() : '#2F6FED';
  return {
    ...config,
    theme: { ...config.theme, accent, fontFamily: cleanFontFamily(config.theme.fontFamily) },
    strings: {
      ...config.strings,
      privacyPolicyUrl: isSafeLink(config.strings.privacyPolicyUrl) ? config.strings.privacyPolicyUrl.trim() : '',
    },
    scripts: config.scripts
      .map(sanitizeManagedScript)
      .filter((s): s is ManagedScript => s !== null),
    abTest: {
      ...config.abTest,
      variants: config.abTest.variants.map((v) =>
        v.theme.accent === undefined || isSafeColor(v.theme.accent)
          ? v
          : { ...v, theme: { ...v.theme, accent } },
      ),
    },
    advanced: { ...config.advanced, customCss: cleanCustomCss(config.advanced.customCss) },
  };
}

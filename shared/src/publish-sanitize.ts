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
 *   - custom CSS: a safe subset that can only restyle the banner. Nothing can
 *     load from elsewhere (`@import`, `@font-face` and other at-rules are
 *     dropped; `url()` accepts inline `data:image/` values only; `image-set()`
 *     and CSS escapes are removed), and every selector is scoped under the
 *     banner root `.cc-root`, so no rule can reach the rest of the page.
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

/** The banner's root class: every custom CSS rule is scoped under it. */
export const CUSTOM_CSS_SCOPE = '.cc-root';

/** At-rules whose blocks hold style rules (scoped recursively). */
const CONTAINER_AT_RULES = /^@(media|supports|container)\b/i;
/** At-rules kept as written: their blocks hold keyframes, not selectors. */
const KEYFRAMES_AT_RULE = /^@(-webkit-|-moz-)?keyframes\s+[\w-]+\s*$/i;

/** Split a selector list at top-level commas (not those inside `:is(...)` etc.). */
function splitSelectors(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of prelude) {
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** One selector scoped to the banner root (`html` / `body` / `:root` map to it). */
function scopeSelector(sel: string): string {
  const scope = CUSTOM_CSS_SCOPE;
  if (sel === scope || sel.startsWith(`${scope} `) || sel.startsWith(`${scope}.`) || sel.startsWith(`${scope}:`) || sel.startsWith(`${scope}>`) || sel.startsWith(`${scope}[`)) {
    return sel;
  }
  const rooted = sel.replace(/^(:root|html|body)\b\s*/i, '');
  return rooted === '' ? scope : `${scope} ${rooted}`;
}

/**
 * Scope a stylesheet: style rules get every selector prefixed with the banner
 * root; `@media` / `@supports` / `@container` are kept with their inner rules
 * scoped; `@keyframes` are kept as written; every other at-rule (including
 * `@import`, `@font-face`, `@namespace`, `@layer`, `@property`) is dropped, and
 * so is any malformed rule.
 */
function scopeStylesheet(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open === -1) break; // trailing text without a block (incl. `@import ...;`) is dropped
    const prelude = css.slice(i, open).replace(/^[\s;]+/, '').trim();
    // Find the matching close brace.
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    const body = css.slice(open + 1, depth === 0 ? j - 1 : j);
    i = j;
    if (prelude.startsWith('@')) {
      if (CONTAINER_AT_RULES.test(prelude)) out += `${prelude}{${scopeStylesheet(body)}}`;
      else if (KEYFRAMES_AT_RULE.test(prelude) && !/[{}]/.test(body.replace(/\{[^{}]*\}/g, ''))) out += `${prelude}{${body}}`;
      continue;
    }
    if (!prelude || /[{}]/.test(body)) continue;
    const selectors = splitSelectors(prelude);
    if (selectors.length === 0) continue;
    out += `${selectors.map(scopeSelector).join(',')}{${body}}`;
  }
  return out;
}

/**
 * Custom CSS restricted to a safe subset that can only restyle the banner:
 * markup, comments and CSS escapes are removed, legacy script-executing
 * constructs are neutralized, nothing can be loaded from another origin (only
 * inline `data:image/` URLs survive; `@import`, `@font-face`, `image-set()` are
 * removed), and every selector is scoped under the banner root.
 */
export function cleanCustomCss(value: string): string {
  let css = value.slice(0, MAX_CUSTOM_CSS_LENGTH);
  css = css.replace(/</g, '').replace(/\/\*[\s\S]*?(\*\/|$)/g, '').replace(/\\/g, '');
  css = css.replace(/expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding\s*:|behavior\s*:/gi, '/*removed*/');
  css = css.replace(/(-webkit-)?image-set\s*\([^;}]*\)/gi, 'none');
  css = css.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (match, _q, target: string) =>
    /^data:image\/(png|gif|jpe?g|webp|svg\+xml)[;,]/i.test(target.trim()) ? match : 'none',
  );
  // Statement at-rules (`@import "…";`, `@charset`, `@namespace`, `@layer x;`)
  // go first, so a bare quoted URL can never be imported.
  css = css.replace(/\/\*removed\*\//g, '').replace(/@[a-z-]+[^{};]*;/gi, '');
  return scopeStylesheet(css);
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

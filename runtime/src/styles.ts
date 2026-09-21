/**
 * Scoped stylesheet + WCAG contrast tooling for the banner UI (Consentful).
 *
 * The CSS returned by {@link buildStyleSheet} is fully scoped under a single root
 * class (`.cc-root`) so it can never clobber the host site, and it inherits the
 * site's font by default (no external fonts are ever loaded). The full palette is
 * DERIVED from {@link ThemeConfig.mode} (light / dark / auto) and
 * {@link ThemeConfig.accent} — matching the Consentful design — and the author's
 * `advanced.customCss` is appended LAST so it always wins.
 *
 * Dependency-free. The only import is a TYPE (erased at build time).
 */

import type { CookieConsentConfig, ThemeConfig } from '@framer-cookie-consent/shared';

/** Root scope class applied to the mounted container. Every selector is nested under it. */
export const ROOT_CLASS = 'cc-root';

/** `id` of the single injected `<style>` element (kept unique + idempotent). */
export const STYLE_ELEMENT_ID = 'cc-consent-styles';

/**
 * The banner's default typeface — the Consentful brand font, Plus Jakarta Sans,
 * backed by a system fallback stack. Used whenever the author hasn't set an
 * explicit `fontFamily` (the default `'inherit'`). No external font is fetched:
 * the face renders wherever the page already provides it (Framer sites that use
 * Plus Jakarta Sans, and the plugin's own preview, which self-hosts it) and
 * falls back cleanly to the system UI font elsewhere — so the banner keeps its
 * promise of never loading a third-party resource.
 */
export const DEFAULT_FONT_STACK =
  "'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/* -------------------------------------------------------------------------- */
/* Derived palette                                                            */
/* -------------------------------------------------------------------------- */

/** The concrete colours the banner renders with, resolved from theme mode + accent. */
export interface Palette {
  /** Banner surface background. */
  bg: string;
  /** Primary text. */
  text: string;
  /** Secondary/body text. */
  sub: string;
  /** Hairline border on the surface. */
  border: string;
  /** Border on the secondary (reject) button. */
  rejectBorder: string;
  /** Accent (accept button / links). */
  accent: string;
  /** Text on the accent button. */
  accentText: string;
}

/** The Consentful light palette (mirrors the design's preview values). */
const LIGHT = {
  bg: '#ffffff',
  text: '#191b1f',
  sub: '#6b7078',
  border: '#eceef2',
  rejectBorder: '#e2e4ea',
} as const;

/** The Consentful dark palette (mirrors the design's preview values). */
const DARK = {
  bg: '#16181d',
  text: '#f4f5f7',
  sub: '#a9adb6',
  border: '#2c2f37',
  rejectBorder: '#3a3d45',
} as const;

/**
 * Resolve the concrete {@link Palette} for a theme. `auto` resolves to the light
 * palette for the static sheet; {@link buildStyleSheet} additionally emits a
 * `prefers-color-scheme: dark` override so it flips with the visitor's system.
 *
 * @param theme - The active theme config.
 * @param scheme - Which base scheme to resolve (`light`/`dark`); defaults to the
 *   theme mode, treating `auto` as `light`.
 * @returns The resolved palette.
 */
export function derivePalette(theme: ThemeConfig, scheme?: 'light' | 'dark'): Palette {
  const dark = (scheme ?? theme.mode) === 'dark';
  const base = dark ? DARK : LIGHT;
  return { ...base, accent: theme.accent, accentText: '#ffffff' };
}

/* -------------------------------------------------------------------------- */
/* Colour parsing + WCAG contrast (dev-time assertion helper)                 */
/* -------------------------------------------------------------------------- */

/** An sRGB colour as 0–255 channels. */
export type Rgb = readonly [number, number, number];

/**
 * Parse a CSS colour string into sRGB channels. Supports `#rgb`, `#rrggbb`, and
 * `rgb()/rgba()`. Returns `null` for anything it can't statically resolve
 * (`inherit`, named colours, `hsl()`, …) so callers can skip the check rather
 * than guess.
 *
 * @param input - A CSS colour string.
 * @returns `[r, g, b]` (0–255), or `null` if unparseable.
 */
export function parseColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase();

  const short = /^#([0-9a-f]{3})$/.exec(s);
  if (short) {
    const h = short[1] as string;
    return [
      parseInt(h[0]! + h[0]!, 16),
      parseInt(h[1]! + h[1]!, 16),
      parseInt(h[2]! + h[2]!, 16),
    ];
  }

  const long = /^#([0-9a-f]{6})$/.exec(s);
  if (long) {
    const h = long[1] as string;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s);
  if (rgb) {
    const r = Number(rgb[1]);
    const g = Number(rgb[2]);
    const b = Number(rgb[3]);
    if ([r, g, b].every((n) => Number.isFinite(n))) {
      const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n)));
      return [clamp(r), clamp(g), clamp(b)];
    }
  }

  return null;
}

/** Linearise a single sRGB channel per the WCAG relative-luminance definition. */
function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * WCAG relative luminance of an sRGB colour (0 = black, 1 = white).
 * @see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/**
 * Contrast ratio between two colours (1–21). Returns `null` if either colour is
 * not statically parseable (e.g. `inherit`), so an unknowable pair is skipped
 * rather than reported as a false failure.
 *
 * @param foreground - The text/foreground colour.
 * @param background - The background colour behind it.
 * @returns The ratio (higher is better), or `null` when it can't be computed.
 */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return null;
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** A single colour pair that fails the WCAG AA text-contrast threshold. */
export interface ContrastIssue {
  /** Human-readable name of the failing pair (e.g. `"body text on background"`). */
  pair: string;
  /** The foreground colour that was checked. */
  foreground: string;
  /** The background colour that was checked. */
  background: string;
  /** The measured contrast ratio. */
  ratio: number;
  /** The ratio required to pass (4.5:1 for normal-size text at AA). */
  required: number;
}

/** WCAG AA minimum contrast ratio for normal body text. */
export const AA_TEXT_CONTRAST = 4.5;

/**
 * Check the theme's derived foreground/background pairs against WCAG AA (4.5:1).
 * Pure and side-effect-free — returns the list of failing pairs (empty when the
 * theme passes). Pairs whose colours can't be parsed are skipped, not failed.
 *
 * The only author-controlled colour is the accent, so the meaningful check is
 * "accent-button text on the accent" in whichever scheme(s) the theme uses.
 *
 * @param theme - The theme to validate.
 * @returns The failing pairs (empty array if all pass).
 */
export function checkThemeContrast(theme: ThemeConfig): ContrastIssue[] {
  const schemes: Array<'light' | 'dark'> =
    theme.mode === 'auto' ? ['light', 'dark'] : [theme.mode];
  const issues: ContrastIssue[] = [];
  for (const scheme of schemes) {
    const p = derivePalette(theme, scheme);
    const pairs: Array<{ pair: string; fg: string; bg: string }> = [
      { pair: `body text on background (${scheme})`, fg: p.text, bg: p.bg },
      { pair: `accept-button text on accent (${scheme})`, fg: p.accentText, bg: p.accent },
    ];
    for (const { pair, fg, bg } of pairs) {
      const ratio = contrastRatio(fg, bg);
      if (ratio !== null && ratio < AA_TEXT_CONTRAST) {
        issues.push({ pair, foreground: fg, background: bg, ratio, required: AA_TEXT_CONTRAST });
      }
    }
  }
  return issues;
}

/**
 * Dev-time assertion: warn (via `console.warn`) for each theme colour pair that
 * fails WCAG AA. We SELL compliance, so a misconfigured theme should be loud in
 * development. Never throws — a contrast warning must not break a live banner.
 *
 * @param config - The active configuration whose `theme` is checked.
 * @returns The issues found (also logged), for programmatic assertions in tests.
 */
export function assertThemeContrast(config: CookieConsentConfig): ContrastIssue[] {
  const issues = checkThemeContrast(config.theme);
  for (const i of issues) {
    // eslint-disable-next-line no-console
    console.warn(
      `[cookie-consent] Low contrast: ${i.pair} is ${i.ratio.toFixed(2)}:1 ` +
        `(${i.foreground} on ${i.background}); WCAG AA needs ${i.required}:1.`,
    );
  }
  return issues;
}

/* -------------------------------------------------------------------------- */
/* Stylesheet generation                                                      */
/* -------------------------------------------------------------------------- */

/** Serialize a numeric pixel value (guards against NaN sneaking into CSS). */
function px(n: number): string {
  return `${Number.isFinite(n) ? n : 0}px`;
}

/** The custom-property block for one palette (theme values enter the sheet here). */
function paletteVars(p: Palette, theme: ThemeConfig): string {
  const radius = Number.isFinite(theme.borderRadius) ? theme.borderRadius : 16;
  return [
    `--cc-bg:${p.bg}`,
    `--cc-tx:${p.text}`,
    `--cc-sub:${p.sub}`,
    `--cc-bd:${p.border}`,
    `--cc-rjb:${p.rejectBorder}`,
    `--cc-ac:${p.accent}`,
    `--cc-act:${p.accentText}`,
    `--cc-rd:${px(radius)}`,
    `--cc-rdb:${px(Math.min(radius, 14))}`,
    // Default (`inherit`) resolves to the Consentful brand stack; an explicit
    // author font is honoured verbatim.
    `--cc-ft:${theme.fontFamily && theme.fontFamily !== 'inherit' ? theme.fontFamily : DEFAULT_FONT_STACK}`,
  ].join(';');
}

/**
 * Build the complete, scoped stylesheet for the banner from a config. Every rule
 * is nested under `.${ROOT_CLASS}` so it cannot leak into the host page; the
 * author's `advanced.customCss` is appended last so it can override anything.
 *
 * @param config - The active configuration.
 * @returns A CSS string ready to place inside a `<style>` element.
 */
export function buildStyleSheet(config: CookieConsentConfig): string {
  const theme = config.theme;
  const r = `.${ROOT_CLASS}`;

  const base = derivePalette(theme, theme.mode === 'dark' ? 'dark' : 'light');

  // Compact, comment-free CSS: this string ships verbatim in the bundle (esbuild
  // cannot minify inside a JS string), so it is deliberately terse.
  const rules = [
    `${r}{${paletteVars(base, theme)};font-family:var(--cc-ft);color:var(--cc-tx);line-height:1.5;font-size:14px;box-sizing:border-box}`,
    `${r} *,${r} *::before,${r} *::after{box-sizing:border-box}`,
    `${r} :focus-visible{outline:2px solid var(--cc-ac);outline-offset:2px;border-radius:3px}`,
    `${r} .cc-overlay{position:fixed;inset:0;background:rgba(15,18,28,.45);z-index:2147483646}`,

    // Surface (banner + modal share it). The banner is a horizontal hero card:
    // decorative cookie figure, copy, then a stacked action column.
    `${r} .cc-banner{position:fixed;z-index:2147483647;background:var(--cc-bg);color:var(--cc-tx);border:1px solid var(--cc-bd);border-radius:var(--cc-rd);box-shadow:0 22px 60px rgba(23,28,45,.22);padding:22px 24px;width:calc(100% - 32px);max-width:460px}`,
    `${r} .cc-banner__inner{display:flex;align-items:center;flex-wrap:wrap;gap:18px}`,

    // Card positions.
    `${r} .cc-banner--card.cc-pos-bottom-left{bottom:20px;left:20px}`,
    `${r} .cc-banner--card.cc-pos-bottom-right{bottom:20px;right:20px}`,
    `${r} .cc-banner--card.cc-pos-bottom-center{bottom:20px;left:50%;transform:translateX(-50%);max-width:640px}`,
    `${r} .cc-banner--card.cc-pos-center{top:50%;left:50%;transform:translate(-50%,-50%);max-width:640px}`,

    // Bar layout: spans the bottom edge, content in a centred row.
    `${r} .cc-banner--bar{left:0;right:0;bottom:0;width:100%;max-width:none;border-radius:0;border-width:1px 0 0 0;box-shadow:0 -6px 24px rgba(23,28,45,.12);padding:16px 24px}`,
    `${r} .cc-banner--bar .cc-banner__inner{display:flex;gap:12px 22px;max-width:1120px;margin:0 auto}`,
    `${r} .cc-banner--bar .cc-banner__text{flex:1;min-width:0}`,
    `${r} .cc-banner--bar .cc-banner__disc{width:60px;height:60px}`,
    `${r} .cc-banner--bar .cc-banner__mark{width:50px;height:50px}`,
    `${r} .cc-banner--bar .cc-banner__title{font-size:17px}`,
    `${r} .cc-banner--bar .cc-banner__actions{flex-direction:row;min-width:0;align-self:center}`,
    `${r} .cc-banner--bar .cc-powered{flex-basis:auto;position:absolute;top:9px;right:16px;margin:0}`,

    // Modal layout: centred dialog.
    `${r} .cc-banner--modal{top:50%;left:50%;transform:translate(-50%,-50%);max-width:640px}`,

    // Decorative cookie figure: a tinted disc + brand mark, divided from the copy.
    `${r} .cc-banner__figure{flex:0 0 auto;position:relative;display:flex;align-items:center;padding-right:20px}`,
    `${r} .cc-banner__figure::after{content:"";position:absolute;top:6px;bottom:6px;right:0;width:1px;background:var(--cc-bd)}`,
    `${r} .cc-banner__disc{position:relative;display:flex;align-items:center;justify-content:center;width:90px;height:90px;border-radius:50%;background:radial-gradient(circle at 32% 30%,#eef2ff,#e6ebff);overflow:hidden}`,
    `${r} .cc-banner__disc::before{content:"";position:absolute;left:9px;bottom:11px;width:32px;height:24px;background-image:radial-gradient(currentColor 1.1px,transparent 1.3px);background-size:8px 8px;color:rgba(96,120,214,.35)}`,
    `${r} .cc-banner__mark{position:relative;width:74px;height:74px;object-fit:contain;filter:drop-shadow(0 6px 10px rgba(23,28,45,.16))}`,

    // Banner content.
    `${r} .cc-banner__text{flex:1 1 240px;min-width:200px}`,
    `${r} .cc-banner__title{margin:0;font-size:20px;font-weight:800;letter-spacing:-.02em;color:var(--cc-tx)}`,
    `${r} .cc-banner__message{margin:7px 0 0;font-size:13.5px;line-height:1.55;color:var(--cc-sub)}`,
    `${r} .cc-banner__links{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:12px}`,
    `${r} .cc-banner__manage{font:inherit;font-size:13px;font-weight:700;color:var(--cc-ac);background:none;border:none;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:2px}`,
    `${r} .cc-banner__manage:hover{opacity:.82}`,
    `${r} .cc-banner__sep{color:var(--cc-bd);font-size:12px;user-select:none}`,
    `${r} .cc-banner__policy{font-size:13px;color:var(--cc-sub);text-decoration:underline;text-underline-offset:2px}`,
    `${r} .cc-banner__policy:hover{color:var(--cc-tx)}`,
    `${r} .cc-banner__actions{display:flex;flex-direction:column;gap:10px;flex:0 0 auto;align-self:center;min-width:150px}`,
    `${r} .cc-banner__actions .cc-btn{width:100%}`,
    `${r} .cc-banner--bar .cc-banner__actions .cc-btn{width:auto}`,

    // Banner dismiss "×" (non-blocking layouts only).
    `${r} .cc-banner__close{position:absolute;top:12px;right:13px;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;background:none;border:none;border-radius:8px;color:var(--cc-sub);font-size:20px;line-height:1;cursor:pointer;padding:0}`,
    `${r} .cc-banner__close:hover{color:var(--cc-tx);background:rgba(127,131,138,.12)}`,

    // Buttons.
    `${r} .cc-btn{font:inherit;font-size:14px;font-weight:700;cursor:pointer;border:1px solid transparent;border-radius:var(--cc-rdb);padding:11px 22px;white-space:nowrap;transition:filter .12s ease,box-shadow .12s ease,background .12s}`,
    `${r} .cc-btn--primary{background:var(--cc-ac);color:var(--cc-act);box-shadow:0 6px 16px rgba(23,28,45,.16)}`,
    `${r} .cc-btn--primary{background:linear-gradient(180deg,color-mix(in srgb,var(--cc-ac) 82%,#fff),var(--cc-ac))}`,
    `${r} .cc-btn--primary:hover{filter:brightness(1.04)}`,
    `${r} .cc-btn--secondary{background:var(--cc-bg);color:var(--cc-tx);border-color:var(--cc-rjb);box-shadow:0 1px 2px rgba(23,28,45,.05)}`,
    `${r} .cc-btn--secondary:hover{background:rgba(127,131,138,.06)}`,

    // Powered-by credit — a right-aligned footer line on its own wrapped row.
    `${r} .cc-powered{display:flex;justify-content:flex-end;align-items:center;flex-basis:100%;margin:0;z-index:1}`,
    `${r} .cc-powered__link{display:inline-flex;flex-direction:row;align-items:center;gap:6px;text-decoration:none;line-height:1}`,
    `${r} .cc-powered__by{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--cc-sub)}`,
    `${r} .cc-powered__pic{display:contents}`,
    `${r} .cc-powered__logo{height:20px;width:auto;display:block}`,
    `${r} .cc-powered__link:hover .cc-powered__logo{opacity:.82}`,

    // Preferences modal — sectioned: header, scrollable body of card rows, footer.
    `${r} .cc-modal{position:fixed;z-index:2147483647;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--cc-bg);color:var(--cc-tx);border:1px solid var(--cc-bd);border-radius:var(--cc-rd);box-shadow:0 24px 70px rgba(23,28,45,.3);width:calc(100% - 32px);max-width:540px;max-height:calc(100vh - 48px);display:flex;flex-direction:column;overflow:hidden}`,
    `${r} .cc-modal__header{display:flex;align-items:flex-start;gap:16px;padding:22px 24px 14px}`,
    `${r} .cc-modal__figure{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:60px;height:60px;border-radius:50%;background:radial-gradient(circle at 32% 30%,#eef2ff,#e6ebff);overflow:hidden}`,
    `${r} .cc-modal__mark{width:50px;height:50px;object-fit:contain;filter:drop-shadow(0 4px 8px rgba(23,28,45,.16))}`,
    `${r} .cc-modal__heading{flex:1;min-width:0;padding-top:2px}`,
    `${r} .cc-modal__title{margin:0;font-size:19px;font-weight:800;letter-spacing:-.02em;color:var(--cc-tx)}`,
    `${r} .cc-modal__subtitle{margin:5px 0 0;font-size:13px;line-height:1.5;color:var(--cc-sub)}`,
    `${r} .cc-modal__close{flex:0 0 auto;background:none;border:none;cursor:pointer;color:var(--cc-sub);font-size:22px;line-height:1;padding:0 2px;margin-top:-2px}`,
    `${r} .cc-modal__close:hover{color:var(--cc-tx)}`,
    `${r} .cc-modal__body{overflow-y:auto;padding:6px 24px 10px;display:flex;flex-direction:column;gap:10px}`,
    `${r} .cc-modal__footer{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:16px 24px 20px;border-top:1px solid var(--cc-bd)}`,
    `${r} .cc-modal__note{display:flex;align-items:flex-start;gap:9px;flex:1 1 220px;min-width:0}`,
    `${r} .cc-modal__info{flex:0 0 auto;color:var(--cc-sub);margin-top:1px}`,
    `${r} .cc-modal__info svg{width:18px;height:18px;display:block}`,
    `${r} .cc-modal__note-text{min-width:0}`,
    `${r} .cc-modal__note-line{display:block;font-size:12px;color:var(--cc-sub);line-height:1.4}`,
    `${r} .cc-modal__note-links{display:flex;align-items:center;gap:8px;margin-top:3px}`,
    `${r} .cc-modal__note-link{font:inherit;font-size:12px;font-weight:600;color:var(--cc-sub);background:none;border:none;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:2px}`,
    `${r} .cc-modal__note-link:hover{color:var(--cc-tx)}`,
    `${r} .cc-modal__note-sep{color:var(--cc-bd);font-size:11px;user-select:none}`,
    `${r} .cc-modal__actions{display:flex;gap:10px;flex:0 0 auto}`,
    `${r} .cc-modal__actions .cc-btn{min-width:120px}`,

    // Verifiable-receipt download — a muted line above the footer.
    `${r} .cc-modal__receipt{margin:0 24px;padding:10px 0;border-top:1px solid var(--cc-bd)}`,
    `${r} .cc-receipt-btn{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12px;font-weight:600;color:var(--cc-sub);background:none;border:none;padding:0;cursor:pointer;text-decoration:none}`,
    `${r} .cc-receipt-btn:hover{color:var(--cc-tx);text-decoration:underline}`,
    `${r} .cc-receipt-btn__icon{font-size:14px;line-height:1;font-weight:800;color:var(--cc-ac)}`,

    // Category rows — each a bordered card holding a tinted icon, copy, control.
    `${r} .cc-cat-block{border:1px solid var(--cc-bd);border-radius:14px;background:var(--cc-bg)}`,
    `${r} .cc-cat{display:flex;align-items:center;gap:14px;padding:14px 16px}`,
    `${r} .cc-cat__icon{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px}`,
    `${r} .cc-cat__icon svg{width:20px;height:20px;display:block}`,
    `${r} .cc-cat__icon--neutral{background:#eef0f4;color:#6b7280}`,
    `${r} .cc-cat__icon--blue{background:#e6efff;color:#3b7bf6}`,
    `${r} .cc-cat__icon--violet{background:#f1e9ff;color:#8b5cf6}`,
    `${r} .cc-cat__icon--green{background:#e4f6ec;color:#1ba565}`,
    `${r} .cc-cat__text{flex:1;min-width:0}`,
    `${r} .cc-cat__head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}`,
    `${r} .cc-cat__label{font-size:14.5px;font-weight:700;color:var(--cc-tx)}`,
    `${r} .cc-cat__always{font-size:11px;font-weight:700;color:#3b7bf6;background:#e6efff;padding:2px 9px;border-radius:20px}`,
    `${r} .cc-cat__desc{margin:3px 0 0;font-size:12.5px;line-height:1.45;color:var(--cc-sub)}`,

    // Per-vendor list (Phase 4.2 preference center) — the services a category gates.
    `${r} .cc-cat__vendors{margin:0 16px 14px;padding:8px 12px;background:rgba(127,131,138,.07);border-radius:10px}`,
    `${r} .cc-cat__vendors-h{font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--cc-sub);margin-bottom:4px}`,
    `${r} .cc-vendor{display:flex;align-items:center;gap:12px;padding:7px 0;border-top:1px solid var(--cc-bd)}`,
    `${r} .cc-vendor:first-of-type{border-top:0}`,
    `${r} .cc-vendor__text{flex:1;min-width:0}`,
    `${r} .cc-vendor__name{font-size:12.5px;font-weight:600;color:var(--cc-tx)}`,
    `${r} .cc-vendor__meta{margin:1px 0 0;font-size:11px;line-height:1.4;color:var(--cc-sub);word-break:break-word}`,
    `${r} .cc-vendor__dot{flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:var(--cc-ac);opacity:.55}`,
    // Compact vendor switch (a smaller variant of the category toggle).
    `${r} .cc-switch--sm input{width:34px;height:20px}`,
    `${r} .cc-switch--sm .cc-switch__track{width:34px;height:20px}`,
    `${r} .cc-switch--sm .cc-switch__track::after{width:16px;height:16px}`,
    `${r} .cc-switch--sm input:checked ~ .cc-switch__track::after{transform:translateX(14px)}`,

    // Toggle switch (48x28 track).
    `${r} .cc-switch{position:relative;flex:0 0 auto;display:inline-flex;align-items:center}`,
    `${r} .cc-switch input{position:absolute;opacity:0;width:48px;height:28px;margin:0;cursor:pointer}`,
    `${r} .cc-switch__track{position:relative;width:48px;height:28px;border-radius:20px;background:var(--cc-rjb);transition:background .18s}`,
    `${r} .cc-switch__track::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(23,28,45,.28);transition:transform .18s}`,
    `${r} .cc-switch input:checked ~ .cc-switch__track{background:var(--cc-ac)}`,
    `${r} .cc-switch input:checked ~ .cc-switch__track::after{transform:translateX(20px)}`,
    `${r} .cc-switch input:disabled ~ .cc-switch__track{opacity:.6}`,
    `${r} .cc-switch input:focus-visible ~ .cc-switch__track{outline:2px solid var(--cc-ac);outline-offset:2px}`,
    // Required-category static "ON" control — a disabled-looking switch.
    `${r} .cc-cat__on{position:relative;flex:0 0 auto;width:52px;height:28px;border-radius:20px;background:var(--cc-rjb);color:var(--cc-sub);font-size:10px;font-weight:800;letter-spacing:.06em;display:inline-flex;align-items:center;padding-left:11px}`,
    `${r} .cc-cat__on::after{content:"";position:absolute;top:3px;right:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(23,28,45,.22)}`,

    // Floating re-open button.
    `${r} .cc-fab{position:fixed;z-index:2147483645;background:var(--cc-ac);color:var(--cc-act);border:none;border-radius:999px;box-shadow:0 6px 18px rgba(23,28,45,.28);padding:11px 18px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}`,
    `${r} .cc-fab-bottom-left{bottom:20px;left:20px}`,
    `${r} .cc-fab-bottom-right{bottom:20px;right:20px}`,
    `${r} .cc-fab-top-left{top:20px;left:20px}`,
    `${r} .cc-fab-top-right{top:20px;right:20px}`,

    // GPC "opt-out honored" badge — a compact, self-dismissing status pill.
    // Shares the fab corner classes for positioning; sits just above the fab.
    `${r} .cc-gpc-badge{position:fixed;z-index:2147483645;display:inline-flex;align-items:center;gap:7px;background:var(--cc-bg);color:var(--cc-tx);border:1px solid var(--cc-bd);border-radius:999px;box-shadow:0 6px 18px rgba(23,28,45,.18);padding:8px 14px;font:inherit;font-size:12px;font-weight:600}`,
    `${r} .cc-gpc-badge.cc-fab-bottom-left,${r} .cc-gpc-badge.cc-fab-bottom-right{bottom:64px}`,
    `${r} .cc-gpc-badge.cc-fab-top-left,${r} .cc-gpc-badge.cc-fab-top-right{top:64px}`,
    `${r} .cc-gpc-badge__check{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:var(--cc-ac);color:var(--cc-act);font-size:10px;font-weight:800;flex:0 0 auto}`,
    `${r} .cc-gpc-badge__text{white-space:nowrap}`,

    `${r} [hidden]{display:none !important}`,
    `@media (prefers-reduced-motion:reduce){${r} *,${r} *::before,${r} *::after{transition:none !important;animation:none !important}}`,
  ];

  // `auto` theme: flip to the dark palette with the visitor's system preference.
  if (theme.mode === 'auto') {
    const darkVars = paletteVars(derivePalette(theme, 'dark'), theme);
    rules.push(`@media (prefers-color-scheme:dark){${r}{${darkVars}}}`);
  }

  // Author overrides are appended LAST so they can win over anything above.
  return `${rules.join('\n')}\n${config.advanced.customCss}`;
}

/**
 * Inject the scoped stylesheet ONCE into `document.head`, keyed by a unique id.
 * Idempotent: re-injecting with a changed config updates the existing element's
 * contents rather than adding a second `<style>`.
 *
 * @param config - The active configuration.
 * @param doc - Target document (defaults to the ambient `document`).
 * @returns The `<style>` element that holds the sheet.
 */
export function injectStyles(config: CookieConsentConfig, doc: Document = document): HTMLStyleElement {
  let style = doc.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  style.textContent = buildStyleSheet(config);
  return style;
}

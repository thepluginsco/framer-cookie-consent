/**
 * Accessibility audit + badge generator (Phase 4.4).
 *
 * A pure, dependency-free engine that MARKETS the accessibility work the banner
 * already ships — the focus trap, ARIA dialog/region roles, `Esc`-to-close, focus
 * restoration, `:focus-visible` outlines, reduced-motion honouring and WCAG AA
 * colour contrast — by turning a {@link CookieConsentConfig} into:
 *
 *  1. a structured {@link A11yAuditResult} (a list of pass/warn/fail checks the
 *     plugin renders as a scorecard), and
 *  2. a human-readable **audit report** in Markdown the author can copy/download
 *     for their compliance file (`generateAccessibilityReport`), and
 *  3. a self-contained inline-SVG **"WCAG 2.1 AA" badge** the author can embed on
 *     their site (`buildAccessibilityBadge`) — ∅-infra, no account, no image host.
 *
 * Design rules (mirror {@link ./legal-docs.ts} and {@link ./config-schema.ts}):
 * - NO external dependencies and NO DOM. Pure string/data functions, so they run
 *   in the plugin, the App shells and Node tests unchanged.
 * - PURE: never mutate the input config; deterministic for a given input (the
 *   effective date is passed in, never read from the clock), so trivially tested.
 * - HONEST: every check is grounded in behaviour the runtime actually implements
 *   (see `runtime/src/banner.ts` + `runtime/src/styles.ts`). The one genuinely
 *   author-controllable failure — a low-contrast accent — is MEASURED, not
 *   assumed; the report never claims conformance it can't derive, and the badge is
 *   only offered when nothing FAILS.
 *
 * The contrast maths below intentionally mirror the WCAG relative-luminance
 * definition used by `runtime/src/styles.ts` (`parseColor`/`relativeLuminance`/
 * `contrastRatio`). It is duplicated rather than imported because `shared/` must
 * not depend on `runtime/`; both are locked by tests to the same standard.
 */

import type { CookieConsentConfig } from './config-schema.js';

/* -------------------------------------------------------------------------- */
/* WCAG contrast maths (mirrors runtime/src/styles.ts)                        */
/* -------------------------------------------------------------------------- */

/** WCAG AA minimum contrast ratio for normal-size body text. */
export const A11Y_AA_TEXT_CONTRAST = 4.5;

/** sRGB colour as 0–255 channels, or `null` when unparseable. */
type Rgb = readonly [number, number, number];

/**
 * Parse `#rgb`, `#rrggbb`, and `rgb()/rgba()` into sRGB channels. Returns `null`
 * for anything not statically resolvable (`inherit`, named colours, `hsl()`) so a
 * caller skips the check rather than reporting a false failure.
 */
export function parseColor(input: string): Rgb | null {
  const s = (input || '').trim().toLowerCase();

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

/** Linearise one sRGB channel per the WCAG relative-luminance definition. */
function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of an sRGB colour (0 = black, 1 = white). */
export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/**
 * Contrast ratio between two colours (1–21), or `null` if either is not
 * statically parseable — so an unknowable pair is skipped, never falsely failed.
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

/* -------------------------------------------------------------------------- */
/* Audit result                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The outcome of a single accessibility check:
 * - `pass` — a guarantee the runtime always ships, or a measured value that meets
 *   the threshold.
 * - `warn` — the banner is still operable, but an author choice weakens the
 *   experience (e.g. no visible reject control).
 * - `fail` — an author choice measurably breaks a WCAG success criterion (e.g. a
 *   low-contrast accent). A single `fail` withholds the AA badge.
 * - `info` — context the author should be aware of; it neither passes nor fails
 *   (e.g. custom CSS we cannot statically verify).
 */
export type A11yStatus = 'pass' | 'warn' | 'fail' | 'info';

/** One line item in the accessibility scorecard. */
export interface A11yCheck {
  /** Stable id (e.g. `'contrast-accent'`), for keys and tests. */
  id: string;
  /** Short human title (e.g. `'Colour contrast (AA)'`). */
  title: string;
  /** The outcome. */
  status: A11yStatus;
  /** One-sentence explanation of what was checked and what was found. */
  detail: string;
  /** The WCAG success criterion this maps to, when applicable. */
  wcag?: string;
}

/** The full audit outcome for a config. */
export interface A11yAuditResult {
  /** Every check, in display order (guarantees first, then derived findings). */
  checks: A11yCheck[];
  /** Count of `pass` checks. */
  passCount: number;
  /** Count of `warn` checks. */
  warnCount: number;
  /** Count of `fail` checks. */
  failCount: number;
  /** `true` when no check failed (warnings are allowed). */
  passed: boolean;
  /**
   * The badge tier the author has earned: `'wcag-aa'` when nothing failed,
   * otherwise `'attention'` (needs a fix before displaying an AA claim).
   */
  badge: 'wcag-aa' | 'attention';
}

/* -------------------------------------------------------------------------- */
/* Static guarantees — behaviour the runtime always ships                     */
/* -------------------------------------------------------------------------- */

/**
 * Checks that are TRUE for every Consentful banner regardless of configuration —
 * they describe machinery hard-wired into `runtime/src/banner.ts` and
 * `runtime/src/styles.ts`, so they always `pass`. Exposed as data (not inlined)
 * so tests can assert the list is stable and the report and scorecard share it.
 */
export const A11Y_GUARANTEES: readonly Omit<A11yCheck, 'status'>[] = [
  {
    id: 'keyboard',
    title: 'Fully keyboard operable',
    detail:
      'Every control (accept, reject, preferences, per-category switches, close) is a ' +
      'native focusable element reachable and operable with the keyboard alone.',
    wcag: 'WCAG 2.1 SC 2.1.1 Keyboard (Level A)',
  },
  {
    id: 'focus-trap',
    title: 'Focus trap with no keyboard trap',
    detail:
      'A blocking banner and the preferences dialog trap Tab/Shift+Tab focus and cycle ' +
      'at both ends, and always expose a way out (Esc or a close/accept control), so ' +
      'focus is contained but never stuck.',
    wcag: 'WCAG 2.1 SC 2.1.2 No Keyboard Trap (Level A)',
  },
  {
    id: 'focus-restore',
    title: 'Focus moved in and restored',
    detail:
      'Focus moves to the first control when a dialog opens and returns to the element ' +
      'that opened it when it closes, preserving a logical focus order.',
    wcag: 'WCAG 2.1 SC 2.4.3 Focus Order (Level A)',
  },
  {
    id: 'focus-visible',
    title: 'Visible focus indicator',
    detail:
      'A high-contrast :focus-visible outline is drawn on every interactive element, ' +
      'including the custom preference switches.',
    wcag: 'WCAG 2.1 SC 2.4.7 Focus Visible (Level AA)',
  },
  {
    id: 'esc-close',
    title: 'Esc closes the preferences dialog',
    detail:
      'The preferences dialog and a non-blocking banner close on Esc. A blocking modal ' +
      'stays up on Esc by design (dismissing it would set no consent), which the ' +
      'visitor resolves with a visible choice.',
    wcag: 'WCAG 2.1 SC 2.1.2 No Keyboard Trap (Level A)',
  },
  {
    id: 'roles-names',
    title: 'Correct roles, names and descriptions',
    detail:
      'The banner uses a dialog/region role with aria-modal, aria-labelledby and ' +
      'aria-describedby; every switch and icon-only control carries an accessible name, ' +
      'and decorative glyphs are aria-hidden.',
    wcag: 'WCAG 2.1 SC 4.1.2 Name, Role, Value (Level A)',
  },
  {
    id: 'status-messages',
    title: 'Status messages announced',
    detail:
      'The "opt-out honoured" (GPC) confirmation is exposed as an aria-live polite ' +
      'status region, so a screen reader announces it without moving focus.',
    wcag: 'WCAG 2.1 SC 4.1.3 Status Messages (Level AA)',
  },
  {
    id: 'reduced-motion',
    title: 'Honours reduced-motion preference',
    detail:
      'Under prefers-reduced-motion: reduce, all banner transitions and animations are ' +
      'disabled.',
    wcag: 'WCAG 2.1 SC 2.3.3 Animation from Interactions (Level AAA)',
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Derived checks — things an author choice can affect                        */
/* -------------------------------------------------------------------------- */

/**
 * The one WCAG pair an author actually controls: the accept button's white label
 * on the author-chosen accent colour (the runtime derives `accentText` as white
 * in both light and dark schemes — see `derivePalette` in `runtime/src/styles.ts`).
 * All other text pairs use our fixed, AA-passing palettes.
 */
function contrastCheck(config: CookieConsentConfig): A11yCheck {
  const accent = config.theme.accent;
  const ratio = contrastRatio('#ffffff', accent);
  const base: Omit<A11yCheck, 'status' | 'detail'> = {
    id: 'contrast-accent',
    title: 'Colour contrast (AA)',
    wcag: 'WCAG 2.1 SC 1.4.3 Contrast (Minimum) (Level AA)',
  };

  if (ratio === null) {
    return {
      ...base,
      status: 'info',
      detail:
        `The accent colour (${accent}) could not be measured statically, so its ` +
        'button-text contrast should be verified manually against WCAG AA (4.5:1).',
    };
  }
  const r = Math.round(ratio * 100) / 100;
  if (ratio >= A11Y_AA_TEXT_CONTRAST) {
    return {
      ...base,
      status: 'pass',
      detail:
        `Accept-button text (white on the ${accent} accent) has a contrast ratio of ` +
        `${r}:1, which meets the WCAG AA minimum of ${A11Y_AA_TEXT_CONTRAST}:1. Fixed ` +
        'body-text and surface colours are AA-compliant in both light and dark schemes.',
    };
  }
  return {
    ...base,
    status: 'fail',
    detail:
      `Accept-button text (white on the ${accent} accent) has a contrast ratio of ` +
      `${r}:1, below the WCAG AA minimum of ${A11Y_AA_TEXT_CONTRAST}:1. Choose a darker ` +
      'accent (or lighter button text) so the button label stays legible.',
  };
}

/** A visible reject control is required for an accessible, non-coercive choice. */
function rejectControlCheck(config: CookieConsentConfig): A11yCheck {
  const base: Omit<A11yCheck, 'status' | 'detail'> = {
    id: 'reject-parity',
    title: 'Reject is as reachable as accept',
    wcag: 'WCAG 2.1 SC 3.2.4 Consistent Identification (Level AA)',
  };
  if (config.banner.showRejectButton) {
    return {
      ...base,
      status: 'pass',
      detail:
        'A "reject" button sits alongside "accept" at the same level, so declining is ' +
        'exactly as easy — and as keyboard-reachable — as accepting.',
    };
  }
  return {
    ...base,
    status: 'warn',
    detail:
      'The banner has no visible reject button, so declining requires opening ' +
      'preferences. Enabling the reject button gives an equally reachable choice and ' +
      'avoids a consent dark pattern.',
  };
}

/** A persistent settings control lets a keyboard/AT user revisit their choice. */
function reopenControlCheck(config: CookieConsentConfig): A11yCheck {
  const base: Omit<A11yCheck, 'status' | 'detail'> = {
    id: 'reopen-control',
    title: 'Consent can be changed later',
    wcag: 'WCAG 2.1 SC 3.2.4 Consistent Identification (Level AA)',
  };
  if (config.advanced.floatingButton) {
    return {
      ...base,
      status: 'pass',
      detail:
        'A persistent cookie-settings button is shown on every page, so a visitor can ' +
        'reopen the accessible preferences dialog and change their decision at any time.',
    };
  }
  return {
    ...base,
    status: 'info',
    detail:
      'There is no persistent settings button. Visitors can still change their choice by ' +
      'reopening the banner, but a floating button (Behavior tab) gives a clearer, ' +
      'always-available control.',
  };
}

/** Author custom CSS can override our AA-safe styles; we can't verify it statically. */
function customCssCheck(config: CookieConsentConfig): A11yCheck | null {
  if (!config.advanced.customCss || !config.advanced.customCss.trim()) return null;
  return {
    id: 'custom-css',
    title: 'Custom CSS present',
    status: 'info',
    detail:
      'Custom CSS is applied on top of the accessible defaults. Confirm your overrides ' +
      'keep the focus outline visible and text contrast at or above 4.5:1.',
    wcag: 'WCAG 2.1 SC 1.4.3 Contrast (Minimum) (Level AA)',
  };
}

/* -------------------------------------------------------------------------- */
/* Audit                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Run the accessibility audit for a config. Pure and deterministic: the static
 * guarantees always pass, and the derived checks reflect the author's choices
 * (accent contrast is measured; reject/reopen/custom-CSS are read off the config).
 *
 * @param config - The active {@link CookieConsentConfig}.
 * @returns The structured {@link A11yAuditResult}.
 */
export function auditAccessibility(config: CookieConsentConfig): A11yAuditResult {
  const checks: A11yCheck[] = [
    ...A11Y_GUARANTEES.map((g) => ({ ...g, status: 'pass' as const })),
    contrastCheck(config),
    rejectControlCheck(config),
    reopenControlCheck(config),
  ];
  const css = customCssCheck(config);
  if (css) checks.push(css);

  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;
  for (const c of checks) {
    if (c.status === 'pass') passCount++;
    else if (c.status === 'warn') warnCount++;
    else if (c.status === 'fail') failCount++;
  }
  const passed = failCount === 0;
  return {
    checks,
    passCount,
    warnCount,
    failCount,
    passed,
    badge: passed ? 'wcag-aa' : 'attention',
  };
}

/* -------------------------------------------------------------------------- */
/* Report                                                                       */
/* -------------------------------------------------------------------------- */

/** Site-level facts the audit report cannot read from the banner config. */
export interface A11yReportInput {
  /** Website / product name shown in the report heading (e.g. `"Acme"`). */
  siteName?: string;
  /**
   * Report date as a display string (e.g. `"2026-09-19"`). PASSED IN so the
   * generator stays pure/deterministic; empty → a `[Report date]` placeholder.
   */
  reportDate?: string;
}

/** One generated document (same shape as the legal-doc generator). */
export interface GeneratedA11yReport {
  /** Document heading. */
  title: string;
  /** Suggested download filename. */
  filename: string;
  /** The report body as Markdown. */
  markdown: string;
}

const STATUS_MARK: Readonly<Record<A11yStatus, string>> = {
  pass: '✅ Pass',
  warn: '⚠️ Review',
  fail: '❌ Fail',
  info: 'ℹ️ Note',
};

const REPORT_DISCLAIMER =
  '> **Note:** This report describes the accessibility behaviour of the Consentful ' +
  'cookie banner as configured, generated from your settings. It covers the consent ' +
  'banner only, not the rest of your site, and is a good-faith summary rather than a ' +
  'formal WCAG conformance certification.';

function orPlaceholder(value: string | undefined, placeholder: string): string {
  const v = (value ?? '').trim();
  return v.length > 0 ? v : placeholder;
}

/**
 * Generate a Markdown accessibility audit report from the banner config. Pure and
 * deterministic (the date is passed in). Lists the always-on guarantees and the
 * config-derived findings, with a headline verdict.
 *
 * @param config - The active {@link CookieConsentConfig}.
 * @param input  - Site-level facts the config cannot supply (name, date).
 * @returns The document `{ title, filename, markdown }`.
 */
export function generateAccessibilityReport(
  config: CookieConsentConfig,
  input: A11yReportInput = {},
): GeneratedA11yReport {
  const site = orPlaceholder(input.siteName, '[Your Website]');
  const date = orPlaceholder(input.reportDate, '[Report date]');
  const result = auditAccessibility(config);

  const md: string[] = [];
  md.push('# Cookie Banner Accessibility Report', '');
  md.push(`_Site: ${site} · Report date: ${date}_`, '');
  md.push(REPORT_DISCLAIMER, '');

  const verdict = result.passed
    ? `**Result: meets WCAG 2.1 AA** for the consent banner — ${result.passCount} checks ` +
      `passed${result.warnCount ? `, ${result.warnCount} to review` : ''}.`
    : `**Result: ${result.failCount} issue${result.failCount === 1 ? '' : 's'} to fix** ` +
      `before claiming WCAG 2.1 AA — ${result.passCount} checks passed` +
      `${result.warnCount ? `, ${result.warnCount} to review` : ''}.`;
  md.push('## Summary', '', verdict, '');

  md.push('## Checks', '', '| Check | Result | WCAG | Detail |', '| --- | --- | --- | --- |');
  for (const c of result.checks) {
    const cell = (v: string) => (v || '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
    md.push(`| ${cell(c.title)} | ${STATUS_MARK[c.status]} | ${cell(c.wcag ?? '—')} | ${cell(c.detail)} |`);
  }
  md.push('');

  md.push('## What this covers', '');
  md.push(
    'Consentful builds the banner from a single accessible template: keyboard operation, ' +
      'focus management, ARIA semantics, status announcements, reduced-motion support and ' +
      'AA colour contrast are part of the runtime, not left to each author. The findings ' +
      'above reflect the current configuration; re-run this report after changing the ' +
      'theme, layout or controls.',
    '',
  );

  return {
    title: 'Cookie Banner Accessibility Report',
    filename: 'accessibility-report.md',
    markdown: md.join('\n').trimEnd() + '\n',
  };
}

/* -------------------------------------------------------------------------- */
/* Badge (inline SVG)                                                          */
/* -------------------------------------------------------------------------- */

/** Options for {@link buildAccessibilityBadge}. */
export interface A11yBadgeOptions {
  /** Optional link the badge points to (e.g. the hosted report). */
  href?: string;
  /**
   * Accent colour for the badge pill. Defaults to the Consentful indigo so the
   * badge reads as a third-party attestation, not the site's own accent.
   */
  accent?: string;
  /** Accessible label / tooltip. Defaults to a WCAG AA statement. */
  label?: string;
}

/** XML-escape a string for safe inclusion in SVG/HTML attributes and text. */
function xmlEscape(value: string): string {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build a self-contained, inline-SVG accessibility badge the author can paste
 * onto their site — ∅-infra (no image host, no request). Only meaningful to
 * display when {@link auditAccessibility} reports `passed`; the plugin gates on
 * that. The SVG has `role="img"` and a `<title>` so it is itself accessible, and
 * is wrapped in an `<a>` when `href` is given.
 *
 * @param options - Link, accent and label overrides.
 * @returns An HTML string containing the badge (`<a>`-wrapped when linked).
 */
export function buildAccessibilityBadge(options: A11yBadgeOptions = {}): string {
  const accent = parseColor(options.accent ?? '') ? (options.accent as string) : '#4b23d3';
  const label = options.label ?? 'Cookie banner meets WCAG 2.1 AA accessibility';
  const l = xmlEscape(label);
  const a = xmlEscape(accent);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="28" role="img" aria-label="${l}">` +
    `<title>${l}</title>` +
    `<rect width="150" height="28" rx="6" fill="${a}"/>` +
    `<g fill="#ffffff" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif">` +
    `<circle cx="17" cy="14" r="7" fill="none" stroke="#ffffff" stroke-width="1.6"/>` +
    `<circle cx="17" cy="10.4" r="1.3"/>` +
    `<path d="M13.8 12.1h6.4M15.4 12.1l-.5 5m3.2-5l.5 5m-2.6-3.1v3.1" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round" fill="none"/>` +
    `<text x="32" y="12" font-size="8.5" font-weight="700" letter-spacing="0.3">WCAG 2.1 AA</text>` +
    `<text x="32" y="22" font-size="7" opacity="0.85">Accessible consent</text>` +
    `</g></svg>`;

  if (options.href) {
    const href = xmlEscape(options.href);
    return `<a href="${href}" target="_blank" rel="noopener" aria-label="${l}" style="display:inline-block;line-height:0">${svg}</a>`;
  }
  return svg;
}

/**
 * Unit tests for the ACCESSIBILITY AUDIT + BADGE GENERATOR (Phase 4.4) in
 * `@framer-cookie-consent/shared`.
 *
 * These prove the audit DERIVES its findings from the same
 * {@link CookieConsentConfig} the banner runs on (accent contrast is MEASURED,
 * reject/reopen/custom-CSS read off the config), stays PURE (no mutation,
 * deterministic given a passed-in date), is HONEST (an AA badge is withheld when
 * anything fails; unparseable colours are flagged for manual review, never falsely
 * failed), and that the always-on guarantees are reported for every config.
 *
 * The contrast maths are locked to the WCAG relative-luminance definition, the
 * same standard `runtime/src/styles.ts` uses.
 *
 * Run with `vitest run`.
 */

import { test, expect } from 'vitest';

import {
  mergeConfig,
  auditAccessibility,
  generateAccessibilityReport,
  buildAccessibilityBadge,
  contrastRatio,
  parseColor,
  relativeLuminance,
  A11Y_GUARANTEES,
  A11Y_AA_TEXT_CONTRAST,
  DEFAULT_CONFIG,
  type CookieConsentConfig,
} from '@framer-cookie-consent/shared';

/** A merged config with the given deep-partial overrides. */
function cfg(over: Parameters<typeof mergeConfig>[0] = {}): CookieConsentConfig {
  return mergeConfig(over);
}

/* -------------------------------------------------------------------------- */
/* Contrast maths                                                             */
/* -------------------------------------------------------------------------- */

test('parseColor handles #rgb, #rrggbb and rgb(); returns null otherwise', () => {
  expect(parseColor('#fff')).toEqual([255, 255, 255]);
  expect(parseColor('#000000')).toEqual([0, 0, 0]);
  expect(parseColor('rgb(47, 111, 237)')).toEqual([47, 111, 237]);
  expect(parseColor('rgba(0,0,0,0.5)')).toEqual([0, 0, 0]);
  expect(parseColor('inherit')).toBeNull();
  expect(parseColor('rebeccapurple')).toBeNull();
  expect(parseColor('hsl(0,0%,0%)')).toBeNull();
});

test('contrastRatio: black-on-white is 21, identical is 1, unparseable is null', () => {
  expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  expect(contrastRatio('#777', '#777')).toBeCloseTo(1, 5);
  expect(contrastRatio('inherit', '#fff')).toBeNull();
  expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
  expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 5);
});

/* -------------------------------------------------------------------------- */
/* Static guarantees                                                          */
/* -------------------------------------------------------------------------- */

test('every guarantee is reported as a pass for any config', () => {
  const result = auditAccessibility(cfg());
  for (const g of A11Y_GUARANTEES) {
    const found = result.checks.find((c) => c.id === g.id);
    expect(found, `guarantee ${g.id} present`).toBeTruthy();
    expect(found!.status).toBe('pass');
    expect(found!.wcag).toBeTruthy();
  }
});

test('guarantee set is stable and non-empty with WCAG references', () => {
  expect(A11Y_GUARANTEES.length).toBeGreaterThanOrEqual(7);
  const ids = A11Y_GUARANTEES.map((g) => g.id);
  expect(new Set(ids).size).toBe(ids.length); // unique
  expect(ids).toContain('keyboard');
  expect(ids).toContain('focus-trap');
  expect(ids).not.toContain('contrast-accent'); // that is a DERIVED check, not a guarantee
});

/* -------------------------------------------------------------------------- */
/* Derived: accent contrast (measured)                                        */
/* -------------------------------------------------------------------------- */

test('default accent passes AA and yields the wcag-aa badge', () => {
  const result = auditAccessibility(cfg());
  const contrast = result.checks.find((c) => c.id === 'contrast-accent')!;
  expect(contrast.status).toBe('pass');
  expect(contrast.detail).toMatch(/\d+(\.\d+)?:1/);
  expect(result.failCount).toBe(0);
  expect(result.passed).toBe(true);
  expect(result.badge).toBe('wcag-aa');
});

test('a low-contrast accent FAILS and withholds the AA badge', () => {
  const accent = '#ffe100'; // white-on-yellow is far below 4.5:1
  expect(contrastRatio('#ffffff', accent)!).toBeLessThan(A11Y_AA_TEXT_CONTRAST);
  const result = auditAccessibility(cfg({ theme: { accent } }));
  const contrast = result.checks.find((c) => c.id === 'contrast-accent')!;
  expect(contrast.status).toBe('fail');
  expect(result.failCount).toBe(1);
  expect(result.passed).toBe(false);
  expect(result.badge).toBe('attention');
});

test('an unparseable accent is flagged for manual review, not failed', () => {
  const result = auditAccessibility(cfg({ theme: { accent: 'var(--brand)' } }));
  const contrast = result.checks.find((c) => c.id === 'contrast-accent')!;
  expect(contrast.status).toBe('info');
  expect(result.failCount).toBe(0);
  expect(result.passed).toBe(true);
});

/* -------------------------------------------------------------------------- */
/* Derived: reject parity, reopen control, custom CSS                         */
/* -------------------------------------------------------------------------- */

test('reject button present -> pass; absent -> warn (not fail)', () => {
  const withReject = auditAccessibility(cfg({ banner: { showRejectButton: true } }));
  expect(withReject.checks.find((c) => c.id === 'reject-parity')!.status).toBe('pass');

  const without = auditAccessibility(cfg({ banner: { showRejectButton: false } }));
  const check = without.checks.find((c) => c.id === 'reject-parity')!;
  expect(check.status).toBe('warn');
  // A warning must NOT block the badge.
  expect(without.failCount).toBe(0);
  expect(without.warnCount).toBeGreaterThanOrEqual(1);
  expect(without.badge).toBe('wcag-aa');
});

test('floating button present -> pass; absent -> info', () => {
  const on = auditAccessibility(cfg({ advanced: { floatingButton: true } }));
  expect(on.checks.find((c) => c.id === 'reopen-control')!.status).toBe('pass');
  const off = auditAccessibility(cfg({ advanced: { floatingButton: false } }));
  expect(off.checks.find((c) => c.id === 'reopen-control')!.status).toBe('info');
});

test('custom CSS adds an info check only when present', () => {
  expect(auditAccessibility(cfg()).checks.find((c) => c.id === 'custom-css')).toBeUndefined();
  const withCss = auditAccessibility(cfg({ advanced: { customCss: '.cc-banner{color:red}' } }));
  expect(withCss.checks.find((c) => c.id === 'custom-css')!.status).toBe('info');
  // Whitespace-only custom CSS is treated as absent.
  expect(
    auditAccessibility(cfg({ advanced: { customCss: '   \n  ' } })).checks.find((c) => c.id === 'custom-css'),
  ).toBeUndefined();
});

test('counts add up to the total number of checks', () => {
  const r = auditAccessibility(cfg({ banner: { showRejectButton: false } }));
  expect(r.passCount + r.warnCount + r.failCount + r.checks.filter((c) => c.status === 'info').length).toBe(
    r.checks.length,
  );
});

/* -------------------------------------------------------------------------- */
/* Purity                                                                      */
/* -------------------------------------------------------------------------- */

test('auditAccessibility does not mutate the config or DEFAULT_CONFIG', () => {
  const before = JSON.stringify(DEFAULT_CONFIG);
  const c = cfg({ theme: { accent: '#ffe100' } });
  const snapshot = JSON.stringify(c);
  auditAccessibility(c);
  auditAccessibility(DEFAULT_CONFIG);
  expect(JSON.stringify(c)).toBe(snapshot);
  expect(JSON.stringify(DEFAULT_CONFIG)).toBe(before);
});

/* -------------------------------------------------------------------------- */
/* Report                                                                       */
/* -------------------------------------------------------------------------- */

test('report: title, filename, disclaimer, date threading, trailing newline', () => {
  const doc = generateAccessibilityReport(cfg(), { siteName: 'Acme', reportDate: '2026-09-19' });
  expect(doc.title).toBe('Cookie Banner Accessibility Report');
  expect(doc.filename).toBe('accessibility-report.md');
  expect(doc.markdown).toContain('# Cookie Banner Accessibility Report');
  expect(doc.markdown).toContain('Acme');
  expect(doc.markdown).toContain('2026-09-19');
  expect(doc.markdown).toContain('formal WCAG conformance certification');
  expect(doc.markdown.endsWith('\n')).toBe(true);
});

test('report: missing inputs become bracketed placeholders, never fabricated', () => {
  const doc = generateAccessibilityReport(cfg());
  expect(doc.markdown).toContain('[Your Website]');
  expect(doc.markdown).toContain('[Report date]');
});

test('report: passing config shows an AA verdict; failing config shows a fix count', () => {
  const pass = generateAccessibilityReport(cfg());
  expect(pass.markdown).toContain('meets WCAG 2.1 AA');
  const fail = generateAccessibilityReport(cfg({ theme: { accent: '#ffe100' } }));
  expect(fail.markdown).toMatch(/1 issue to fix/);
  expect(fail.markdown).toContain('❌ Fail');
});

test('report: every check is listed as a table row', () => {
  const c = cfg({ banner: { showRejectButton: false }, advanced: { customCss: '.x{}' } });
  const result = auditAccessibility(c);
  const doc = generateAccessibilityReport(c);
  for (const check of result.checks) {
    expect(doc.markdown).toContain(check.title);
  }
});

test('report is deterministic for the same inputs', () => {
  const a = generateAccessibilityReport(cfg(), { siteName: 'Acme', reportDate: '2026-09-19' });
  const b = generateAccessibilityReport(cfg(), { siteName: 'Acme', reportDate: '2026-09-19' });
  expect(a.markdown).toBe(b.markdown);
});

/* -------------------------------------------------------------------------- */
/* Badge                                                                        */
/* -------------------------------------------------------------------------- */

test('badge: self-contained accessible SVG with WCAG label', () => {
  const svg = buildAccessibilityBadge();
  expect(svg.startsWith('<svg')).toBe(true);
  expect(svg).toContain('role="img"');
  expect(svg).toContain('<title>');
  expect(svg).toContain('WCAG 2.1 AA');
  // Self-contained: no external image reference (the only URL is the SVG namespace).
  expect(svg).not.toContain('<image');
  expect(svg).not.toContain('xlink:href');
  expect(svg).not.toContain('https://'); // no network request
});

test('badge: href wraps the SVG in a safe anchor', () => {
  const html = buildAccessibilityBadge({ href: 'https://acme.com/accessibility' });
  expect(html.startsWith('<a ')).toBe(true);
  expect(html).toContain('rel="noopener"');
  expect(html).toContain('https://acme.com/accessibility');
  expect(html).toContain('<svg');
});

test('badge: invalid accent falls back to the brand indigo; valid accent honoured', () => {
  expect(buildAccessibilityBadge({ accent: 'not-a-color' })).toContain('#4b23d3');
  expect(buildAccessibilityBadge({ accent: '#123456' })).toContain('#123456');
});

test('badge: label and href are XML-escaped', () => {
  const html = buildAccessibilityBadge({ label: 'A & B <ok>', href: 'https://x.com/?a=1&b=2' });
  expect(html).toContain('A &amp; B &lt;ok&gt;');
  expect(html).toContain('a=1&amp;b=2');
  expect(html).not.toContain('<ok>');
});

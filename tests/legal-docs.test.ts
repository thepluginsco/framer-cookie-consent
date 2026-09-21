/**
 * Unit tests for the BUNDLED LEGAL-DOC GENERATOR (Phase 4.3) in
 * `@framer-cookie-consent/shared`.
 *
 * These prove the generator DERIVES its output from the same
 * {@link CookieConsentConfig} the banner runs on (so a policy can never drift
 * from the banner), stays PURE (no mutation, deterministic given a passed-in
 * effective date), is HONEST (review disclaimer always present; missing inputs
 * become bracketed placeholders, never fabricated values), and enriches
 * recognised vendors with a policy link from the tracker catalog.
 *
 * Run with `vitest run`.
 */

import { test, expect } from 'vitest';

import {
  mergeConfig,
  generateCookiePolicy,
  generatePrivacyPolicy,
  generateLegalDocs,
  VENDOR_POLICY_URLS,
  DEFAULT_CONFIG,
  type CookieConsentConfig,
  type ManagedScript,
} from '@framer-cookie-consent/shared';

/** A managed script with sane defaults, overridable per test. */
function script(over: Partial<ManagedScript>): ManagedScript {
  return {
    id: over.id ?? 'ga4',
    name: over.name ?? 'Google Analytics 4',
    provider: over.provider ?? 'googletagmanager.com',
    tagId: over.tagId ?? '',
    purpose: over.purpose ?? '',
    category: over.category ?? 'analytics',
    type: over.type ?? 'src',
    value: over.value ?? 'https://www.googletagmanager.com/gtag/js?id=G-ABC123',
    async: over.async ?? true,
  };
}

const INPUT = {
  siteName: 'Acme',
  entityName: 'Acme Inc.',
  siteUrl: 'https://acme.com',
  contactEmail: 'privacy@acme.com',
  effectiveDate: '2026-09-19',
};

/* -------------------------------------------------------------------------- */
/* Cookie policy — structure & derivation                                     */
/* -------------------------------------------------------------------------- */

test('cookie policy: title, filename, effective date, and disclaimer', () => {
  const doc = generateCookiePolicy(mergeConfig(), INPUT);
  expect(doc.title).toBe('Cookie Policy');
  expect(doc.filename).toBe('cookie-policy.md');
  expect(doc.markdown).toMatch(/^# Cookie Policy/);
  expect(doc.markdown).toContain('Effective date: 2026-09-19');
  expect(doc.markdown).toContain('not legal advice');
  expect(doc.markdown.endsWith('\n')).toBe(true);
});

test('cookie policy: entity, site name and contact are threaded in', () => {
  const doc = generateCookiePolicy(mergeConfig(), INPUT);
  expect(doc.markdown).toContain('Acme Inc.');
  expect(doc.markdown).toContain('Acme');
  expect(doc.markdown).toContain('privacy@acme.com');
});

test('cookie policy: missing inputs become bracketed placeholders, not fabricated', () => {
  const doc = generateCookiePolicy(mergeConfig(), {});
  expect(doc.markdown).toContain('[Your Website]');
  expect(doc.markdown).toContain('[Your Company]');
  expect(doc.markdown).toContain('[Effective date]');
  expect(doc.markdown).toContain('[contact email]');
});

test('cookie policy: entityName falls back to siteName when omitted', () => {
  const doc = generateCookiePolicy(mergeConfig(), { siteName: 'Acme' });
  // entity placeholder should NOT appear; siteName is used for both.
  expect(doc.markdown).not.toContain('[Your Company]');
  expect(doc.markdown).toContain('Acme');
});

/* -------------------------------------------------------------------------- */
/* Categories & services table                                                */
/* -------------------------------------------------------------------------- */

test('cookie policy: lists each category using config string overrides', () => {
  const config = mergeConfig({
    strings: { categories: { analytics: { label: 'Statistics', description: 'Counts visits.' } } },
  });
  const doc = generateCookiePolicy(config, INPUT);
  expect(doc.markdown).toContain('**Statistics**');
  expect(doc.markdown).toContain('Counts visits.');
  // Necessary category is flagged as always-on / required.
  expect(doc.markdown).toMatch(/Strictly necessary\*\*.*always active/);
});

test('cookie policy: services table derives from managed scripts and shows tag ids', () => {
  const config = mergeConfig({
    scripts: [script({ tagId: 'G-ABC123', purpose: 'Measures site traffic' })],
  });
  const doc = generateCookiePolicy(config, INPUT);
  expect(doc.markdown).toContain('| Service | Provider | Category | Purpose |');
  expect(doc.markdown).toContain('Google Analytics 4 (G-ABC123)');
  expect(doc.markdown).toContain('Measures site traffic');
});

test('cookie policy: recognised vendor gets a policy link from the catalog', () => {
  const config = mergeConfig({ scripts: [script({})] });
  const doc = generateCookiePolicy(config, INPUT);
  expect(doc.markdown).toContain(`(${VENDOR_POLICY_URLS.Google})`);
});

test('cookie policy: unknown provider gets no fabricated link', () => {
  const config = mergeConfig({
    scripts: [script({ id: 'x', name: 'Custom Widget', provider: 'widgets.example.com', value: 'https://widgets.example.com/w.js' })],
  });
  const doc = generateCookiePolicy(config, INPUT);
  expect(doc.markdown).toContain('widgets.example.com');
  expect(doc.markdown).not.toContain('](http'); // no markdown link was emitted
});

test('cookie policy: pipe characters in fields do not break the table row', () => {
  const config = mergeConfig({
    scripts: [script({ id: 'x', name: 'A | B', provider: 'x.example', purpose: 'does | things', value: 'https://x.example/a.js' })],
  });
  const doc = generateCookiePolicy(config, INPUT);
  expect(doc.markdown).toContain('A \\| B');
  expect(doc.markdown).toContain('does \\| things');
});

test('cookie policy: no scripts yields an honest "no tracking services" statement', () => {
  const doc = generateCookiePolicy(mergeConfig({ scripts: [] }), INPUT);
  expect(doc.markdown).toContain('we do not');
  expect(doc.markdown).not.toContain('| Service | Provider |');
});

/* -------------------------------------------------------------------------- */
/* Consent mechanics read off the real behavior config                        */
/* -------------------------------------------------------------------------- */

test('opt-in model: says nothing runs before consent', () => {
  const doc = generateCookiePolicy(mergeConfig({ behavior: { consentModel: 'opt-in' } }), INPUT);
  expect(doc.markdown).toMatch(/before setting any non-essential cookies/);
});

test('opt-out model: says cookies may be set on arrival', () => {
  const doc = generateCookiePolicy(mergeConfig({ behavior: { consentModel: 'opt-out' } }), INPUT);
  expect(doc.markdown).toMatch(/may be set when you first arrive/);
});

test('auto model: describes region-aware consent', () => {
  const doc = generateCookiePolicy(mergeConfig({ behavior: { consentModel: 'auto' } }), INPUT);
  expect(doc.markdown).toMatch(/adapts to your location/);
});

test('GPC + DNT + receipts sentences appear only when enabled', () => {
  const on = generateCookiePolicy(
    mergeConfig({ behavior: { respectGpc: true, respectDoNotTrack: true }, receipts: { enabled: true } }),
    INPUT,
  );
  expect(on.markdown).toContain('Global Privacy Control');
  expect(on.markdown).toContain('Do Not Track');
  expect(on.markdown).toMatch(/timestamped record/);

  const off = generateCookiePolicy(
    mergeConfig({ behavior: { respectGpc: false, respectDoNotTrack: false }, receipts: { enabled: false } }),
    INPUT,
  );
  expect(off.markdown).not.toContain('Global Privacy Control');
  expect(off.markdown).not.toContain('Do Not Track');
  expect(off.markdown).not.toMatch(/timestamped record/);
});

test('floating button vs banner reopen, and consent expiry days, are reflected', () => {
  const withButton = generateCookiePolicy(
    mergeConfig({ advanced: { floatingButton: true }, behavior: { consentExpiryDays: 90 } }),
    INPUT,
  );
  expect(withButton.markdown).toContain('cookie-settings button');
  expect(withButton.markdown).toContain('90 days');

  const noButton = generateCookiePolicy(mergeConfig({ advanced: { floatingButton: false } }), INPUT);
  expect(noButton.markdown).toContain('reopening the cookie preferences');
});

/* -------------------------------------------------------------------------- */
/* Privacy policy                                                             */
/* -------------------------------------------------------------------------- */

test('privacy policy: has cookie section plus clearly-marked to-complete sections', () => {
  const doc = generatePrivacyPolicy(mergeConfig({ scripts: [script({})] }), INPUT);
  expect(doc.title).toBe('Privacy Policy');
  expect(doc.filename).toBe('privacy-policy.md');
  expect(doc.markdown).toContain('## Cookies and tracking');
  expect(doc.markdown).toContain('_[to complete]_');
  expect(doc.markdown).toContain('Your rights');
  // Still derives the same services table.
  expect(doc.markdown).toContain('| Service | Provider | Category | Purpose |');
});

test('generateLegalDocs returns both documents', () => {
  const docs = generateLegalDocs(mergeConfig(), INPUT);
  expect(docs.cookiePolicy.title).toBe('Cookie Policy');
  expect(docs.privacyPolicy.title).toBe('Privacy Policy');
});

/* -------------------------------------------------------------------------- */
/* Purity                                                                      */
/* -------------------------------------------------------------------------- */

test('generator does not mutate the input config or DEFAULT_CONFIG', () => {
  const before = JSON.stringify(DEFAULT_CONFIG);
  const config: CookieConsentConfig = mergeConfig({ scripts: [script({})] });
  const snapshot = JSON.stringify(config);
  generateLegalDocs(config, INPUT);
  expect(JSON.stringify(config)).toBe(snapshot);
  expect(JSON.stringify(DEFAULT_CONFIG)).toBe(before);
});

test('deterministic: same input yields identical output', () => {
  const config = mergeConfig({ scripts: [script({})] });
  expect(generateCookiePolicy(config, INPUT).markdown).toBe(generateCookiePolicy(config, INPUT).markdown);
});

/**
 * Unit tests for the full preference center + per-vendor consent (Phase 4.2).
 *
 * This file covers the pure, DOM-light layers:
 * - schema: the new `preferenceCenter` section + `ManagedScript.purpose` +
 *   the localizable `vendorsHeading`, and their merge/normalization;
 * - consent-state: per-vendor grants persist + round-trip, are filtered to
 *   known script ids, ride along on the receipt (verifying intact), and a
 *   category-only decision is byte-for-byte unaffected (back-compat);
 * - the pure `deniedVendorsOf` split.
 *
 * The DOM-backed runtime behaviour (script blocker gating + banner UI) lives in
 * `preference-center-runtime.test.ts`.
 */

import { test, beforeEach } from 'vitest';
import assert from 'node:assert/strict';

import { mergeConfig, parse, serialize, DEFAULT_CONFIG } from '@framer-cookie-consent/shared';
import {
  writeConsent,
  readConsent,
  installConsentApi,
  verifyReceipt,
} from '../runtime/src/consent-state.ts';
import { deniedVendorsOf } from '../runtime/src/script-blocker.ts';
import type { ConsentState } from '../runtime/src/consent-state.ts';

/* --------------------------- minimal fake DOM ----------------------------- */

function makeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

function makeDocument() {
  const jar = new Map<string, string>();
  const doc: { cookie: string } = { cookie: '' };
  Object.defineProperty(doc, 'cookie', {
    get: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    set: (str: string) => {
      const parts = str.split('; ');
      const pair = parts[0] ?? '';
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const maxAge = parts.find((a) => a.toLowerCase().startsWith('max-age='));
      if (maxAge && Number(maxAge.slice('max-age='.length)) <= 0) jar.delete(name);
      else jar.set(name, value);
    },
  });
  return doc;
}

const g = globalThis as Record<string, unknown>;

beforeEach(() => {
  g.localStorage = makeLocalStorage();
  g.document = makeDocument();
  g.window = { dispatchEvent: () => true };
  Object.defineProperty(g, 'location', {
    value: { origin: 'https://example.com', protocol: 'https:', host: 'example.com' },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(g, 'navigator', { value: { language: 'en-US' }, configurable: true, writable: true });
  if (typeof (g as { CustomEvent?: unknown }).CustomEvent === 'undefined') {
    g.CustomEvent = class {
      type: string;
      detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    };
  }
});

/* ------------------------------- schema ----------------------------------- */

test('preferenceCenter defaults to off; both flags coerce', () => {
  const d = mergeConfig();
  assert.deepEqual(d.preferenceCenter, { showVendors: false, perVendorToggles: false });

  const on = mergeConfig({ preferenceCenter: { showVendors: true, perVendorToggles: true } });
  assert.deepEqual(on.preferenceCenter, { showVendors: true, perVendorToggles: true });

  // Wrong-typed values fall back to the defaults, never propagate.
  const junk = mergeConfig({ preferenceCenter: { showVendors: 'yes' as unknown as boolean } });
  assert.equal(junk.preferenceCenter.showVendors, false);
  assert.equal(junk.preferenceCenter.perVendorToggles, false);
});

test('ManagedScript.purpose normalizes (defaults to empty, kept when present)', () => {
  const empty = mergeConfig({ scripts: [{ name: 'GA4', value: 'https://x/y.js', category: 'analytics' }] });
  assert.equal(empty.scripts[0]!.purpose, '', 'missing purpose becomes empty string');

  const kept = mergeConfig({
    scripts: [{ name: 'Meta', value: 'https://x/p.js', category: 'marketing', purpose: 'Ad measurement' }],
  });
  assert.equal(kept.scripts[0]!.purpose, 'Ad measurement');
});

test('vendorsHeading is present by default and survives serialize→parse', () => {
  assert.equal(DEFAULT_CONFIG.strings.vendorsHeading, 'Services');
  const round = parse(serialize(mergeConfig({ strings: { vendorsHeading: 'Providers' } })));
  assert.equal(round.strings.vendorsHeading, 'Providers');
});

/* ---------------------------- consent-state ------------------------------- */

const config = mergeConfig({
  behavior: { reconsentVersion: '1', consentExpiryDays: 180 },
  strings: { privacyPolicyUrl: 'https://example.com/privacy' },
  scripts: [
    { id: 'ga4', name: 'GA4', value: 'https://x/ga.js', category: 'analytics' },
    { id: 'meta', name: 'Meta Pixel', value: 'https://x/meta.js', category: 'marketing' },
  ],
});

test('writeConsent persists per-vendor grants and readConsent restores them', () => {
  writeConsent(config, { analytics: true, marketing: true }, undefined, 'custom', { ga4: true, meta: false });
  const back = readConsent(config);
  assert.ok(back, 'a decision should be stored');
  assert.deepEqual(back.vendors, { ga4: true, meta: false });
});

test('unknown vendor ids are dropped; an all-unknown map stores no vendors key', () => {
  const state = writeConsent(config, { analytics: true }, undefined, 'custom', {
    ga4: false,
    nope: true, // not a real script id
  });
  assert.deepEqual(state.vendors, { ga4: false }, 'only known ids survive');

  const none = writeConsent(config, { analytics: true }, undefined, 'custom', { ghost: true });
  assert.equal('vendors' in none, false, 'no vendors key when nothing known matched');
});

test('a category-only decision stores no vendors key (back-compat)', () => {
  const state = writeConsent(config, { analytics: true }, undefined, 'custom');
  assert.equal('vendors' in state, false);
});

test('the receipt carries vendors and still verifies; category-only receipt is unchanged', () => {
  const withVendors = writeConsent(config, { analytics: true, marketing: true }, undefined, 'custom', {
    ga4: true,
    meta: false,
  });
  assert.ok(withVendors.receipt);
  assert.deepEqual(withVendors.receipt.vendors, { ga4: true, meta: false });
  assert.equal(verifyReceipt(withVendors.receipt), true, 'vendored receipt verifies');
  // Tampering with a vendor flag breaks the fingerprint.
  const tampered = { ...withVendors.receipt, vendors: { ga4: false, meta: false } };
  assert.equal(verifyReceipt(tampered), false);

  const categoryOnly = writeConsent(config, { analytics: true }, undefined, 'custom');
  assert.ok(categoryOnly.receipt);
  assert.equal('vendors' in categoryOnly.receipt, false, 'no vendors field on a category-only receipt');
  assert.equal(verifyReceipt(categoryOnly.receipt), true);
});

test('installConsentApi.accept threads vendors through to the stored decision', () => {
  const api = installConsentApi(config);
  api.accept(['analytics', 'marketing'], 'custom', { ga4: true, meta: false });
  const state = api.getState();
  assert.ok(state);
  assert.deepEqual(state.vendors, { ga4: true, meta: false });
  // acceptAll carries no vendor map → all vendors allowed again.
  api.acceptAll();
  assert.equal('vendors' in (api.getState() as ConsentState), false);
});

/* --------------------------- deniedVendorsOf ------------------------------ */

test('deniedVendorsOf: only false-valued vendors are denied; absent map = none', () => {
  const base = { version: '1', timestamp: 1, categories: { analytics: true } } as ConsentState;
  assert.equal(deniedVendorsOf(base).size, 0, 'no vendors map → nothing denied');

  const withMap: ConsentState = { ...base, vendors: { ga4: true, meta: false, x: false } };
  const denied = deniedVendorsOf(withMap);
  assert.equal(denied.has('meta'), true);
  assert.equal(denied.has('x'), true);
  assert.equal(denied.has('ga4'), false, 'an allowed vendor is not denied');
});

/**
 * Unit tests for consent receipts (Phase 1.2).
 *
 * A receipt is a verifiable, self-contained record stamped onto every consent
 * decision and stored with the consent cookie. These tests cover stamping, the
 * method labels, integrity verification, export/round-trip, and the opt-out.
 */

import { test, beforeEach } from 'vitest';
import assert from 'node:assert/strict';

import { mergeConfig } from '@framer-cookie-consent/shared';
import {
  writeConsent,
  readConsent,
  clearConsent,
  installConsentApi,
  verifyReceipt,
  type ConsentReceipt,
} from '../runtime/src/consent-state.ts';

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
  // `location`/`navigator` may be read-only globals in the test runtime, so
  // define them (configurable) rather than assigning.
  Object.defineProperty(g, 'location', {
    value: { origin: 'https://example.com', protocol: 'https:', host: 'example.com' },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(g, 'navigator', {
    value: { language: 'en-US' },
    configurable: true,
    writable: true,
  });
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

/* --------------------------------- configs -------------------------------- */

const config = mergeConfig({
  behavior: { reconsentVersion: '1', consentExpiryDays: 180 },
  strings: { privacyPolicyUrl: 'https://example.com/privacy' },
});

/* --------------------------------- tests ---------------------------------- */

test('writeConsent stamps a fully-populated receipt', () => {
  const state = writeConsent(config, { analytics: true, marketing: false }, undefined, 'custom');
  const r = state.receipt;
  assert.ok(r, 'expected a receipt to be stamped');
  assert.equal(r.method, 'custom');
  assert.equal(r.policyVersion, '1');
  assert.equal(r.schemaVersion, config.meta.schemaVersion);
  assert.equal(r.origin, 'https://example.com');
  assert.equal(r.policyUrl, 'https://example.com/privacy');
  assert.equal(r.language, 'en-US');
  assert.ok(typeof r.id === 'string' && r.id.length > 0);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(r.issued), 'issued is an ISO timestamp');
  assert.equal(r.categories.necessary, true, 'required category is forced on in the receipt');
  assert.equal(r.categories.analytics, true);
  assert.equal(r.categories.marketing, false);
});

test('receipt signals reflect the granted categories', () => {
  const state = writeConsent(config, { analytics: true, marketing: false });
  const r = state.receipt as ConsentReceipt;
  // necessary → security_storage; analytics → analytics_storage.
  assert.ok(r.signals.includes('analytics_storage'));
  assert.ok(r.signals.includes('security_storage'));
  assert.ok(!r.signals.includes('ad_storage'), 'marketing denied → no ad_storage');
  // sorted + de-duplicated
  assert.deepEqual([...r.signals].sort(), r.signals);
});

test('verifyReceipt is true for an intact receipt, false after tampering', () => {
  const state = writeConsent(config, { analytics: true });
  const r = state.receipt as ConsentReceipt;
  assert.equal(verifyReceipt(r), true);

  const tampered: ConsentReceipt = { ...r, categories: { ...r.categories, marketing: true } };
  assert.equal(verifyReceipt(tampered), false);
});

test('receipt round-trips through storage (readConsent returns it)', () => {
  writeConsent(config, { analytics: true }, undefined, 'accept_all');
  const state = readConsent(config);
  assert.ok(state?.receipt);
  assert.equal(state.receipt.method, 'accept_all');
  assert.equal(verifyReceipt(state.receipt), true);
});

test('API method labels: acceptAll / rejectAll / accept(gpc)', () => {
  const api = installConsentApi(config);

  api.acceptAll();
  assert.equal(api.exportReceipt()?.method, 'accept_all');

  api.rejectAll();
  assert.equal(api.exportReceipt()?.method, 'reject_all');

  api.accept(['marketing'], 'gpc');
  const r = api.exportReceipt();
  assert.equal(r?.method, 'gpc');
  assert.equal(r?.categories.marketing, true);
});

test('exportReceipt returns null when no decision is stored', () => {
  const api = installConsentApi(config);
  assert.equal(api.exportReceipt(), null);
});

test('withdraw erases the stored record, so exportReceipt returns null after', () => {
  const api = installConsentApi(config);
  api.acceptAll();
  assert.ok(api.exportReceipt());
  api.withdraw();
  assert.equal(api.exportReceipt(), null);
  assert.equal(readConsent(config), null);
});

test('receipts.enabled=false suppresses stamping', () => {
  const off = mergeConfig({
    behavior: { reconsentVersion: '1', consentExpiryDays: 180 },
    receipts: { enabled: false },
  });
  const state = writeConsent(off, { analytics: true });
  assert.equal(state.receipt, undefined);
  const api = installConsentApi(off);
  api.acceptAll();
  assert.equal(api.exportReceipt(), null);
});

test('downloadReceipt is a safe no-op without a DOM download path', () => {
  const api = installConsentApi(config);
  // No stored decision → nothing to download.
  assert.equal(api.downloadReceipt(), false);
  api.acceptAll();
  // jsdom-free fake env lacks Blob/URL.createObjectURL → graceful false.
  const result = api.downloadReceipt();
  assert.equal(typeof result, 'boolean');
});

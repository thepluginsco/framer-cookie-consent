/**
 * Unit tests for the consent state + persistence layer.
 *
 * Run with `vitest run`. The runtime module's only shared import is a
 * type, so nothing but a fake DOM is needed here.
 *
 * Configs come from the shared workspace package, which Vitest transforms
 * from TypeScript source on the fly (no build step needed).
 */

import { test, beforeEach } from 'vitest';
import assert from 'node:assert/strict';

import { mergeConfig } from '@framer-cookie-consent/shared';
import {
  readConsent,
  writeConsent,
  clearConsent,
  hasConsentFor,
  onConsentChange,
  installConsentApi,
  CONSENT_STORAGE_KEY,
  DEFAULT_COOKIE_NAME,
} from '../runtime/src/consent-state.ts';

/* --------------------------- minimal fake DOM ----------------------------- */

/** In-memory localStorage stand-in. */
function makeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

/** Minimal `document.cookie` jar honoring `Max-Age=0` deletion. */
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

const baseConfig = mergeConfig({ behavior: { reconsentVersion: '1', consentExpiryDays: 180 } });

/* --------------------------------- tests ---------------------------------- */

test('no prior consent → readConsent returns null', () => {
  assert.equal(readConsent(baseConfig), null);
});

test('round-trip: writeConsent then readConsent returns the same categories', () => {
  writeConsent(baseConfig, { necessary: true, analytics: true, marketing: false });
  const state = readConsent(baseConfig);
  assert.ok(state, 'expected a stored state');
  assert.equal(state.version, '1');
  assert.equal(hasConsentFor(state, 'analytics'), true);
  assert.equal(hasConsentFor(state, 'marketing'), false);
  // required category is forced on even if omitted/false on write
  assert.equal(hasConsentFor(state, 'necessary'), true);
});

test('expiry: a decision older than consentExpiryDays is treated as absent', () => {
  writeConsent(baseConfig, { analytics: true });
  // Rewrite the stored record with a timestamp 181 days in the past.
  const raw = (g.localStorage as ReturnType<typeof makeLocalStorage>).getItem(CONSENT_STORAGE_KEY) as string;
  const parsed = JSON.parse(raw) as { timestamp: number };
  parsed.timestamp = Date.now() - 181 * 86_400_000;
  (g.localStorage as ReturnType<typeof makeLocalStorage>).setItem(CONSENT_STORAGE_KEY, JSON.stringify(parsed));
  (g.document as { cookie: string }).cookie = `${DEFAULT_COOKIE_NAME}=; Max-Age=0; Path=/`;
  assert.equal(readConsent(baseConfig), null);
});

test('version bump invalidates a prior decision (re-prompt)', () => {
  writeConsent(baseConfig, { analytics: true });
  const bumped = mergeConfig({ behavior: { reconsentVersion: '2', consentExpiryDays: 180 } });
  assert.equal(readConsent(bumped), null);
  // ...and the original version still reads fine.
  assert.ok(readConsent(baseConfig));
});

test('cookie fallback: consent survives localStorage being cleared', () => {
  writeConsent(baseConfig, { analytics: true });
  (g.localStorage as ReturnType<typeof makeLocalStorage>).clear();
  const state = readConsent(baseConfig);
  assert.ok(state, 'expected recovery from cookie');
  assert.equal(hasConsentFor(state, 'analytics'), true);
  // read heals the missing localStorage mirror
  assert.ok((g.localStorage as ReturnType<typeof makeLocalStorage>).getItem(CONSENT_STORAGE_KEY));
});

test('clearConsent wipes both stores', () => {
  writeConsent(baseConfig, { analytics: true });
  clearConsent();
  assert.equal((g.localStorage as ReturnType<typeof makeLocalStorage>).getItem(CONSENT_STORAGE_KEY), null);
  assert.equal(readConsent(baseConfig), null);
});

test('pub/sub + window API: acceptAll persists and notifies subscribers', () => {
  const seen: string[] = [];
  const off = onConsentChange((s) => {
    for (const [id, granted] of Object.entries(s.categories)) if (granted) seen.push(id);
  });
  const api = installConsentApi(baseConfig);
  api.acceptAll();
  assert.ok(seen.includes('marketing') && seen.includes('analytics'));
  assert.equal((globalThis as { window?: { CookieConsent?: unknown } }).window?.CookieConsent, api);
  const state = api.getState();
  assert.ok(state && hasConsentFor(state, 'marketing'));
  off();
});

test('rejectAll grants only required categories', () => {
  const api = installConsentApi(baseConfig);
  api.rejectAll();
  const state = api.getState();
  assert.ok(state);
  assert.equal(hasConsentFor(state, 'necessary'), true);
  assert.equal(hasConsentFor(state, 'analytics'), false);
  assert.equal(hasConsentFor(state, 'marketing'), false);
});

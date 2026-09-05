/**
 * Additional consent-state coverage: withdraw, openPreferences dispatch, the
 * plain-http `Secure` omission, and listener isolation. These round out the
 * compliance-critical persistence layer beyond the happy-path round-trips in
 * `consent-state.test.ts`.
 *
 * Run with `vitest run`.
 */

import { test, beforeEach, afterEach, expect, vi } from 'vitest';

import { mergeConfig } from '@framer-cookie-consent/shared';
import {
  writeConsent,
  readConsent,
  onConsentChange,
  emitConsentChange,
  installConsentApi,
  CONSENT_STORAGE_KEY,
  type ConsentState,
} from '../runtime/src/consent-state.ts';

const g = globalThis as Record<string, unknown>;

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

/** A document that RECORDS the raw cookie strings written to it. */
function makeRecordingDocument() {
  const writes: string[] = [];
  const jar = new Map<string, string>();
  const doc: { cookie: string; writes: string[] } = { cookie: '', writes };
  Object.defineProperty(doc, 'cookie', {
    get: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    set: (str: string) => {
      writes.push(str);
      const pair = str.split('; ')[0] ?? '';
      const eq = pair.indexOf('=');
      jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    },
  });
  return doc;
}

let dispatched: Array<{ type: string; detail?: unknown }>;

beforeEach(() => {
  g.localStorage = makeLocalStorage();
  g.document = makeRecordingDocument();
  dispatched = [];
  g.window = { dispatchEvent: (e: { type: string; detail?: unknown }) => (dispatched.push(e), true) };
  g.CustomEvent = class {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  delete g.location;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete g.location;
});

const config = mergeConfig();

/* --------------------------------- withdraw ------------------------------- */

test('withdraw: clears storage and emits a fully-denied state to subscribers', () => {
  const api = installConsentApi(config);
  api.acceptAll();

  const seen: ConsentState[] = [];
  const off = onConsentChange((s) => seen.push(s));
  api.withdraw();
  off();

  // Subscribers were told of the withdrawal, with every optional category denied.
  expect(seen).toHaveLength(1);
  expect(seen[0]!.categories.necessary).toBe(true); // required stays on
  expect(seen[0]!.categories.analytics).toBe(false);
  expect(seen[0]!.categories.marketing).toBe(false);
  // And the stored decision is gone.
  expect(api.getState()).toBeNull();
});

/* ------------------------------ openPreferences --------------------------- */

test('openPreferences: dispatches the cookieconsent:openpreferences event', () => {
  const api = installConsentApi(config);
  api.openPreferences();
  expect(dispatched.some((e) => e.type === 'cookieconsent:openpreferences')).toBe(true);
});

/* ---------------------------- plain-http Secure --------------------------- */

test('persist omits "; Secure" on a plain-http, non-localhost origin', () => {
  g.location = { protocol: 'http:', hostname: 'insecure.example.com' };
  writeConsent(config, { analytics: true });
  const doc = g.document as unknown as { writes: string[] };
  const write = doc.writes.find((w) => w.startsWith('cc_consent='))!;
  expect(write).toBeTruthy();
  expect(write.includes('Secure')).toBe(false);
});

test('persist keeps "; Secure" on https', () => {
  g.location = { protocol: 'https:', hostname: 'secure.example.com' };
  writeConsent(config, { analytics: true });
  const doc = g.document as unknown as { writes: string[] };
  const write = doc.writes.find((w) => w.startsWith('cc_consent='))!;
  expect(write.includes('Secure')).toBe(true);
});

test('persist keeps "; Secure" on plain-http localhost (dev origin)', () => {
  g.location = { protocol: 'http:', hostname: 'localhost' };
  writeConsent(config, { analytics: true });
  const doc = g.document as unknown as { writes: string[] };
  const write = doc.writes.find((w) => w.startsWith('cc_consent='))!;
  expect(write.includes('Secure')).toBe(true);
});

/* ------------------------- corrupt / partial records ---------------------- */

test('readConsent returns null for a malformed JSON record', () => {
  (g.localStorage as ReturnType<typeof makeLocalStorage>).setItem(CONSENT_STORAGE_KEY, '{not json');
  expect(readConsent(config)).toBeNull();
});

test('readConsent returns null for a structurally-invalid record (missing fields)', () => {
  (g.localStorage as ReturnType<typeof makeLocalStorage>).setItem(
    CONSENT_STORAGE_KEY,
    JSON.stringify({ version: '1' }), // no timestamp / categories
  );
  expect(readConsent(config)).toBeNull();
});

/* --------------------------- listener robustness -------------------------- */

test('a throwing subscriber does not prevent the others from being notified', () => {
  const good: ConsentState[] = [];
  const offBad = onConsentChange(() => {
    throw new Error('bad listener');
  });
  const offGood = onConsentChange((s) => good.push(s));

  expect(() =>
    emitConsentChange({ version: '1', timestamp: 1, categories: { necessary: true } }),
  ).not.toThrow();
  expect(good).toHaveLength(1);

  offBad();
  offGood();
});

/**
 * Unit tests for the runtime consent-analytics reporter (Pro).
 *
 * `buildConsentEvent` (classify a decision, anonymize) is pure. `reportConsent`
 * is exercised with a stubbed `navigator.sendBeacon` to prove it fires only when
 * an endpoint is configured and never carries PII. Run with `vitest run`.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { mergeConfig } from '@framer-cookie-consent/shared';
import { buildConsentEvent, reportConsent } from '../runtime/src/analytics.ts';
import type { ConsentState } from '../runtime/src/consent-state.ts';

const config = mergeConfig(); // necessary + analytics + marketing + preferences

function state(categories: Record<string, boolean>): ConsentState {
  return { version: config.behavior.reconsentVersion, timestamp: Date.now(), categories };
}

/* ---------------------------- buildConsentEvent --------------------------- */

test('buildConsentEvent: all optional granted → accept', () => {
  const e = buildConsentEvent(config, state({ necessary: true, analytics: true, marketing: true, preferences: true }));
  assert.equal(e.type, 'accept');
});

test('buildConsentEvent: no optional granted → reject', () => {
  const e = buildConsentEvent(config, state({ necessary: true, analytics: false, marketing: false, preferences: false }));
  assert.equal(e.type, 'reject');
});

test('buildConsentEvent: a mix → custom', () => {
  const e = buildConsentEvent(config, state({ necessary: true, analytics: true, marketing: false, preferences: false }));
  assert.equal(e.type, 'custom');
  assert.equal(e.categories['analytics'], 1);
  assert.equal(e.categories['marketing'], 0);
});

test('buildConsentEvent: required categories are excluded from the payload', () => {
  const e = buildConsentEvent(config, state({ necessary: true, analytics: true }));
  assert.equal('necessary' in e.categories, false);
});

test('buildConsentEvent: payload carries no identifiers (anonymous)', () => {
  const e = buildConsentEvent(config, state({ necessary: true, analytics: true }));
  const keys = Object.keys(e).sort();
  assert.deepEqual(keys, ['categories', 'type', 'version']);
});

/* ------------------------------ reportConsent ----------------------------- */

/** Run `fn` with `window` present and `navigator` stubbed, then restore both. */
function withBrowser(nav: unknown, fn: () => void): void {
  const g = globalThis as Record<string, unknown>;
  const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const hadWindow = 'window' in g;
  g.window = {};
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  try {
    fn();
  } finally {
    if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc);
    else delete g.navigator;
    if (!hadWindow) delete g.window;
  }
}

test('reportConsent: no-op when analytics is disabled (empty endpoint)', () => {
  let called = 0;
  withBrowser({ sendBeacon: () => { called += 1; return true; } }, () => {
    reportConsent(config, state({ necessary: true, analytics: true })); // endpoint '' by default
    assert.equal(called, 0);
  });
});

test('reportConsent: sends a beacon to the endpoint when configured', () => {
  const cfg = mergeConfig({ analytics: { endpoint: 'https://collect.test/' } });
  let url = '';
  let payload = '';
  const nav = {
    sendBeacon: (u: string, body: Blob | string) => {
      url = u;
      payload = typeof body === 'string' ? body : '[blob]';
      return true;
    },
  };
  // Force the string path (no Blob) so we can inspect the payload.
  const g = globalThis as Record<string, unknown>;
  const Blob0 = g.Blob;
  delete g.Blob;
  try {
    withBrowser(nav, () => {
      reportConsent(cfg, state({ necessary: true, analytics: true, marketing: false }));
    });
    assert.equal(url, 'https://collect.test/');
    const parsed = JSON.parse(payload) as { type: string; categories: Record<string, number> };
    assert.equal(parsed.type, 'custom');
    assert.equal(parsed.categories['analytics'], 1);
  } finally {
    if (Blob0) g.Blob = Blob0;
  }
});

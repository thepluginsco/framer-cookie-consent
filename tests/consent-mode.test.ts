/**
 * Unit tests for the Google Consent Mode v2 engine.
 *
 * Run with `vitest run`. Mapping is verified through the
 * pure `mapCategoriesToSignals`; the `default`/`update` dataLayer emissions are
 * verified against a minimal fake `window`.
 */

import { test, beforeEach } from 'vitest';
import assert from 'node:assert/strict';

import { mergeConfig } from '@framer-cookie-consent/shared';
import {
  mapCategoriesToSignals,
  bootstrapConsentDefaults,
  updateConsent,
} from '../runtime/src/consent-mode.ts';

const g = globalThis as Record<string, unknown>;

beforeEach(() => {
  // Fresh window/dataLayer per test; empty storage so no prior consent leaks in.
  g.window = { dispatchEvent: () => true };
  g.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  g.document = { cookie: '' };
});

/** Return all dataLayer entries as plain arrays for easy assertions. */
function calls(): unknown[][] {
  const dl = (g.window as { dataLayer?: unknown[] }).dataLayer ?? [];
  return dl.map((a) => Array.from(a as ArrayLike<unknown>));
}

/** Find the arguments object for a given gtag command verb. */
function find(command: string, verb: string): Record<string, unknown> | undefined {
  const hit = calls().find((c) => c[0] === command && c[1] === verb);
  return hit ? (hit[2] as Record<string, unknown>) : undefined;
}

const config = mergeConfig({});

/* ------------------------------ pure mapping ------------------------------ */

test('mapCategoriesToSignals: no consent → every signal denied', () => {
  const m = mapCategoriesToSignals(config, {});
  assert.deepEqual(m, {
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
});

test('mapCategoriesToSignals: analytics-only grants only analytics_storage', () => {
  const m = mapCategoriesToSignals(config, { necessary: true, analytics: true });
  assert.equal(m.analytics_storage, 'granted');
  assert.equal(m.ad_storage, 'denied');
  assert.equal(m.ad_user_data, 'denied');
  assert.equal(m.ad_personalization, 'denied');
});

test('mapCategoriesToSignals: granting marketing sets all three ad_* signals', () => {
  const m = mapCategoriesToSignals(config, { marketing: true });
  assert.equal(m.ad_storage, 'granted');
  assert.equal(m.ad_user_data, 'granted');
  assert.equal(m.ad_personalization, 'granted');
  assert.equal(m.analytics_storage, 'denied'); // marketing does not grant analytics
});

test('mapCategoriesToSignals: accept-all grants every signal', () => {
  const m = mapCategoriesToSignals(config, { analytics: true, marketing: true, functional: true });
  assert.deepEqual(m, {
    ad_storage: 'granted',
    analytics_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
  });
});

test('mapCategoriesToSignals: reject-all (necessary only) denies every signal', () => {
  const m = mapCategoriesToSignals(config, { necessary: true });
  assert.deepEqual(m, {
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
});

/* --------------------------------- default -------------------------------- */

test('bootstrapConsentDefaults: all four signals denied + security granted', () => {
  // url-passthrough is off by default now, so enable it here to assert the wiring.
  const cfg = mergeConfig({ consentMode: { enableUrlPassthrough: true, enableAdsDataRedaction: true } });
  bootstrapConsentDefaults(cfg);
  const def = find('consent', 'default');
  assert.ok(def, 'expected a consent default push');
  assert.equal(def.ad_storage, 'denied');
  assert.equal(def.analytics_storage, 'denied');
  assert.equal(def.ad_user_data, 'denied');
  assert.equal(def.ad_personalization, 'denied');
  assert.equal(def.security_storage, 'granted');
  assert.equal(def.wait_for_update, cfg.consentMode.waitForUpdateMs);
  // url_passthrough + ads_data_redaction are applied via gtag('set', ...)
  assert.ok(calls().some((c) => c[0] === 'set' && c[1] === 'url_passthrough' && c[2] === true));
  assert.ok(calls().some((c) => c[0] === 'set' && c[1] === 'ads_data_redaction' && c[2] === true));
});

/* --------------------------------- update --------------------------------- */

test('updateConsent: emits consent update with correct analytics-only mapping', () => {
  updateConsent(config, { version: '1', timestamp: 1, categories: { necessary: true, analytics: true } });
  const upd = find('consent', 'update');
  assert.ok(upd, 'expected a consent update push');
  assert.equal(upd.analytics_storage, 'granted');
  assert.equal(upd.ad_storage, 'denied');
});

test('updateConsent: idempotent for identical consecutive state (no duplicate push)', () => {
  const state = { version: '1', timestamp: 2, categories: { necessary: true, functional: true } };
  updateConsent(config, state);
  const before = calls().length;
  updateConsent(config, state);
  assert.equal(calls().length, before);
});

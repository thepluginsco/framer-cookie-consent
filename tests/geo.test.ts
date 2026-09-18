/**
 * Unit tests for region detection + re-consent policy.
 *
 * The mapping is exercised through the PURE `classifyRegion` (explicit inputs,
 * no globals) and the decisions through `shouldShowBanner` with an injected
 * region, so nothing here needs a live browser or network. Run with
 * `vitest run`.
 *
 * Required coverage:
 * - EU time zone → show.
 * - US (non-CA) time zone under `eu-only` → no banner (auto-consent / no block).
 * - Uncertain detection → show (fail safe toward privacy).
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { mergeConfig } from '@framer-cookie-consent/shared';
import { type ConsentState } from '../runtime/src/consent-state.ts';
import {
  classifyRegion,
  detectRegion,
  resolveRegion,
  regionFromCountry,
  createEndpointResolver,
  needsReconsent,
  shouldShowBanner,
  shouldShowFloatingButton,
  resolveConsentModel,
  impliedConsentGrants,
  shouldApplyImpliedConsent,
  isDoNotTrackEnabled,
  isGpcEnabled,
  isSaleCategory,
  gpcGrantedCategories,
  type RegionInfo,
} from '../runtime/src/geo.ts';

// Baseline config: EU-only, and DNT NOT respected (the neutral default many
// tests assume — the schema default now respects DNT, so we opt out explicitly).
const euOnly = mergeConfig({ behavior: { showMode: 'eu-only', respectDoNotTrack: false } });
const everywhere = mergeConfig({ behavior: { showMode: 'everywhere' } });

/** A fresh, valid consent decision under the config's current version. */
function validState(config = euOnly): ConsentState {
  return { version: config.behavior.reconsentVersion, timestamp: Date.now(), categories: { necessary: true } };
}

/* ------------------------------ classifyRegion ---------------------------- */

test('classifyRegion: EU time zone → isEU, certain', () => {
  const r = classifyRegion('Europe/Berlin', 'de-DE');
  assert.equal(r.isEU, true);
  assert.equal(r.region, 'DE');
  assert.equal(r.certain, true);
});

test('classifyRegion: UK and Switzerland are regulated show-regions', () => {
  const uk = classifyRegion('Europe/London', 'en-GB');
  assert.equal(uk.isUK, true);
  assert.equal(uk.isEU, false);

  const ch = classifyRegion('Europe/Zurich', 'de-CH');
  assert.equal(ch.region, 'CH');
  assert.equal(ch.isEU, false);
});

test('classifyRegion: Pacific US zone → California-ish, marked uncertain', () => {
  const r = classifyRegion('America/Los_Angeles', 'en-US');
  assert.equal(r.isCalifornia, true);
  assert.equal(r.certain, false); // LA zone can't pin the state down
});

test('classifyRegion: US non-CA zone → confidently non-regulated', () => {
  const r = classifyRegion('America/New_York', 'en-US');
  assert.equal(r.isEU, false);
  assert.equal(r.isUK, false);
  assert.equal(r.isCalifornia, false);
  assert.equal(r.certain, true);
});

test('classifyRegion: no time zone → uncertain (fail safe)', () => {
  const r = classifyRegion(null);
  assert.equal(r.certain, false);
  assert.equal(r.region, 'UNKNOWN');
});

test('classifyRegion: unknown European zone → uncertain (might be EU)', () => {
  const r = classifyRegion('Europe/Kyiv', 'uk-UA');
  assert.equal(r.certain, false);
});

test('classifyRegion: EU locale contradicting a US zone downgrades certainty', () => {
  const r = classifyRegion('America/New_York', 'de-DE');
  assert.equal(r.certain, false); // locale says DE → be cautious, show
});

/* ----------------------------- shouldShowBanner --------------------------- */

test('eu-only + EU time zone → show', () => {
  const region = classifyRegion('Europe/Paris', 'fr-FR');
  assert.equal(shouldShowBanner(euOnly, null, region, false), true);
});

test('eu-only + US non-CA time zone → NO banner (auto-consent / no block)', () => {
  const region = classifyRegion('America/New_York', 'en-US');
  assert.equal(shouldShowBanner(euOnly, null, region, false), false);
});

test('eu-only + uncertain detection → show (fail safe)', () => {
  const region = classifyRegion(null);
  assert.equal(shouldShowBanner(euOnly, null, region, false), true);
});

test('eu-only + California → show', () => {
  const region = classifyRegion('America/Los_Angeles', 'en-US');
  assert.equal(shouldShowBanner(euOnly, null, region, false), true);
});

test('everywhere → show regardless of region when no consent', () => {
  const region = classifyRegion('America/New_York', 'en-US'); // clearly non-EU
  assert.equal(shouldShowBanner(everywhere, null, region, false), true);
});

test('valid existing consent → no banner even in a show-region', () => {
  const region = classifyRegion('Europe/Berlin', 'de-DE');
  assert.equal(shouldShowBanner(euOnly, validState(), region, false), false);
});

test('respectDoNotTrack + DNT → no banner (reject-by-default)', () => {
  const config = mergeConfig({ behavior: { showMode: 'eu-only', respectDoNotTrack: true } });
  const region = classifyRegion('Europe/Berlin', 'de-DE'); // would otherwise show
  assert.equal(shouldShowBanner(config, null, region, true), false);
  // DNT ignored when the author didn't opt in.
  assert.equal(shouldShowBanner(euOnly, null, region, true), true);
});

/* --------------------- consent model (opt-in vs opt-out) ------------------ */

test('resolveConsentModel: explicit opt-in / opt-out ignore the region', () => {
  const optIn = mergeConfig({ behavior: { consentModel: 'opt-in' } });
  const optOut = mergeConfig({ behavior: { consentModel: 'opt-out' } });
  const eu = classifyRegion('Europe/Berlin', 'de-DE');
  const us = classifyRegion('America/New_York', 'en-US');
  assert.equal(resolveConsentModel(optIn, us), 'opt-in');
  assert.equal(resolveConsentModel(optOut, eu), 'opt-out');
});

test('resolveConsentModel: auto → opt-in in the EU, opt-out in the US', () => {
  const auto = mergeConfig({ behavior: { consentModel: 'auto' } });
  assert.equal(resolveConsentModel(auto, classifyRegion('Europe/Paris', 'fr-FR')), 'opt-in');
  assert.equal(resolveConsentModel(auto, classifyRegion('America/New_York', 'en-US')), 'opt-out');
});

test('resolveConsentModel: auto → opt-in for California and for uncertain reads (fail safe)', () => {
  const auto = mergeConfig({ behavior: { consentModel: 'auto' } });
  assert.equal(resolveConsentModel(auto, classifyRegion('America/Los_Angeles', 'en-US')), 'opt-in');
  assert.equal(resolveConsentModel(auto, classifyRegion(null)), 'opt-in'); // uncertain → opt-in
});

test('impliedConsentGrants: grants the author defaults (required + defaultEnabled)', () => {
  // Defaults: necessary(req), analytics(on), marketing(off), preferences(off).
  assert.deepEqual(impliedConsentGrants(mergeConfig()).sort(), ['analytics', 'necessary']);
});

test('impliedConsentGrants: honours a default-on marketing category (unlike GPC)', () => {
  const cfg = mergeConfig({
    categories: [
      { id: 'necessary', label: 'N', description: '', required: true, defaultEnabled: true, signals: ['security_storage'] },
      { id: 'marketing', label: 'M', description: '', required: false, defaultEnabled: true, signals: ['ad_storage'] },
    ],
  });
  assert.deepEqual(impliedConsentGrants(cfg).sort(), ['marketing', 'necessary']);
});

test('shouldApplyImpliedConsent: only with no valid decision AND an opt-out model', () => {
  const auto = mergeConfig({ behavior: { consentModel: 'auto' } });
  const us = classifyRegion('America/New_York', 'en-US');
  const eu = classifyRegion('Europe/Berlin', 'de-DE');
  // No decision + opt-out region → apply implied consent.
  assert.equal(shouldApplyImpliedConsent(auto, null, us), true);
  // No decision + opt-in region → do not (the banner prompts instead).
  assert.equal(shouldApplyImpliedConsent(auto, null, eu), false);
  // A valid decision already on record → never re-apply.
  assert.equal(shouldApplyImpliedConsent(auto, validState(auto), us), false);
});

test('shouldApplyImpliedConsent: an expired opt-out decision re-applies implied consent', () => {
  const cfg = mergeConfig({ behavior: { consentModel: 'opt-out', consentExpiryDays: 30 } });
  const expired: ConsentState = {
    version: cfg.behavior.reconsentVersion,
    timestamp: Date.now() - 60 * 86_400_000, // 60 days > 30-day expiry
    categories: { necessary: true },
  };
  assert.equal(shouldApplyImpliedConsent(cfg, expired, classifyRegion('America/New_York')), true);
});

/* -------------------------------- reconsent ------------------------------- */

test('needsReconsent: true when no decision, false when valid', () => {
  assert.equal(needsReconsent(euOnly, null), true);
  assert.equal(needsReconsent(euOnly, validState()), false);
});

test('needsReconsent: a reconsentVersion bump re-shows the banner', () => {
  const state = validState();
  const bumped = mergeConfig({ behavior: { showMode: 'eu-only', reconsentVersion: '2' } });
  assert.equal(needsReconsent(bumped, state), true);
  const region = classifyRegion('Europe/Berlin', 'de-DE');
  assert.equal(shouldShowBanner(bumped, state, region, false), true);
});

test('needsReconsent: an expired decision re-shows the banner', () => {
  const config = mergeConfig({ behavior: { showMode: 'eu-only', consentExpiryDays: 30 } });
  const old: ConsentState = {
    version: config.behavior.reconsentVersion,
    timestamp: Date.now() - 60 * 86_400_000, // 60 days ago > 30-day expiry
    categories: { necessary: true },
  };
  assert.equal(needsReconsent(config, old), true);
});

/* ---------------------------- floating button ----------------------------- */

test('shouldShowFloatingButton: only when enabled AND a decision exists', () => {
  const off = mergeConfig({ advanced: { floatingButton: false } });
  const on = mergeConfig({ advanced: { floatingButton: true } });
  assert.equal(shouldShowFloatingButton(off, validState()), false); // disabled
  assert.equal(shouldShowFloatingButton(on, null), false); // banner still up
  assert.equal(shouldShowFloatingButton(on, validState(on)), true); // decided → offer re-open
});

/* --------------------------- environment wrappers ------------------------- */

test('detectRegion returns a well-formed RegionInfo from the live environment', () => {
  const r: RegionInfo = detectRegion();
  assert.equal(typeof r.region, 'string');
  assert.equal(typeof r.isEU, 'boolean');
  assert.equal(typeof r.certain, 'boolean');
});

test('resolveRegion: awaits an accurate resolver and merges its answer', async () => {
  const r = await resolveRegion(async () => ({ region: 'FR', isEU: true, certain: true }));
  assert.equal(r.region, 'FR');
  assert.equal(r.isEU, true);
  assert.equal(r.certain, true);
});

test('resolveRegion: a throwing resolver falls back to the heuristic', async () => {
  const r = await resolveRegion(async () => {
    throw new Error('worker down');
  });
  assert.equal(typeof r.certain, 'boolean'); // heuristic result, no throw
});

test('resolveRegion: no resolver → heuristic, no network', async () => {
  const r = await resolveRegion();
  assert.deepEqual(Object.keys(r).sort(), ['certain', 'isCalifornia', 'isEU', 'isUK', 'region']);
});

test('isDoNotTrackEnabled reads the DNT signal', (t) => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    Object.defineProperty(globalThis, 'navigator', { value: { doNotTrack: '1' }, configurable: true });
  } catch {
    t.skip('navigator not configurable in this runtime');
    return;
  }
  try {
    assert.equal(isDoNotTrackEnabled(), true);
  } finally {
    if (desc) Object.defineProperty(globalThis, 'navigator', desc);
    else delete (globalThis as Record<string, unknown>).navigator;
  }
});

/* -------------------------------------------------------------------------- */
/* Global Privacy Control (opt-out of sale/sharing)                            */
/* -------------------------------------------------------------------------- */

test('isSaleCategory: only ad/marketing categories count as "sale"', () => {
  const cfg = mergeConfig();
  const byId = (id: string) => cfg.categories.find((c) => c.id === id)!;
  assert.equal(isSaleCategory(byId('marketing')), true); // ad_storage etc.
  assert.equal(isSaleCategory(byId('analytics')), false); // analytics_storage
  assert.equal(isSaleCategory(byId('necessary')), false);
  assert.equal(isSaleCategory(byId('preferences')), false); // functionality_storage
});

test('gpcGrantedCategories: denies ad categories, keeps author defaults for the rest', () => {
  // Defaults: necessary(req), analytics(on), marketing(off/ad), preferences(off).
  const granted = gpcGrantedCategories(mergeConfig());
  assert.deepEqual(granted.sort(), ['analytics', 'necessary']);
  // Never a blanket reject — analytics (a non-ad default-on category) survives.
  assert.ok(granted.includes('analytics'));
  assert.ok(!granted.includes('marketing'));
});

test('gpcGrantedCategories: a default-on marketing category is still forced off', () => {
  // Even if the author left marketing opt-out ON, GPC must deny sale/sharing.
  const cfg = mergeConfig({
    categories: [
      { id: 'necessary', label: 'N', description: '', required: true, defaultEnabled: true, signals: ['security_storage'] },
      { id: 'marketing', label: 'M', description: '', required: false, defaultEnabled: true, signals: ['ad_storage'] },
      { id: 'analytics', label: 'A', description: '', required: false, defaultEnabled: false, signals: ['analytics_storage'] },
    ],
  });
  const granted = gpcGrantedCategories(cfg);
  assert.ok(!granted.includes('marketing')); // sale category → denied
  assert.ok(!granted.includes('analytics')); // author default was off → stays off
  assert.deepEqual(granted, ['necessary']);
});

test('isGpcEnabled reads navigator.globalPrivacyControl', (t) => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    Object.defineProperty(globalThis, 'navigator', { value: { globalPrivacyControl: true }, configurable: true });
  } catch {
    t.skip('navigator not configurable in this runtime');
    return;
  }
  try {
    assert.equal(isGpcEnabled(), true);
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    assert.equal(isGpcEnabled(), false);
  } finally {
    if (desc) Object.defineProperty(globalThis, 'navigator', desc);
    else delete (globalThis as Record<string, unknown>).navigator;
  }
});

/* -------------------------------------------------------------------------- */
/* Accurate geo: regionFromCountry + endpoint resolver (Pro)                   */
/* -------------------------------------------------------------------------- */

test('regionFromCountry: an EU country is regulated + certain', () => {
  const r = regionFromCountry('DE');
  assert.equal(r.isEU, true);
  assert.equal(r.certain, true);
});

test('regionFromCountry: US-CA region flags California (certain, since authoritative)', () => {
  const r = regionFromCountry('US', 'US-CA');
  assert.equal(r.isCalifornia, true);
  assert.equal(r.certain, true);
});

test('regionFromCountry: a plain US country is non-regulated + certain', () => {
  const r = regionFromCountry('US');
  assert.equal(r.isEU, false);
  assert.equal(r.isCalifornia, false);
  assert.equal(r.certain, true);
});

test('regionFromCountry: empty/unknown code is uncertain (fail safe)', () => {
  assert.equal(regionFromCountry('').certain, false);
  assert.equal(regionFromCountry(null).certain, false);
});

test('createEndpointResolver: parses a country payload into a confident region', async () => {
  const fetchFn = (async () =>
    new Response(JSON.stringify({ country: 'FR' }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
  const original = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try {
    const override = await createEndpointResolver('https://geo.test/')();
    assert.ok(override);
    assert.equal(override!.isEU, true);
    assert.equal(override!.certain, true);
  } finally {
    globalThis.fetch = original;
  }
});

test('createEndpointResolver: a non-2xx response resolves null (falls back to heuristic)', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch;
  try {
    assert.equal(await createEndpointResolver('https://geo.test/')(), null);
  } finally {
    globalThis.fetch = original;
  }
});

test('createEndpointResolver: a transport failure resolves null (never throws)', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;
  try {
    assert.equal(await createEndpointResolver('https://geo.test/')(), null);
  } finally {
    globalThis.fetch = original;
  }
});

test('resolveRegion: merges an endpoint answer over the heuristic', async () => {
  const resolver = async () => regionFromCountry('IT'); // Italy = EU
  const r = await resolveRegion(resolver);
  assert.equal(r.isEU, true);
  assert.equal(r.certain, true);
});

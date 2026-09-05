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
  isDoNotTrackEnabled,
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

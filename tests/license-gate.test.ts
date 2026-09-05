/**
 * Tests for the runtime license gate (`runtime/src/license-gate.ts`) — the real
 * licensing logic and its graceful-degradation behaviour. Licensing is uniform
 * across every origin (there is no "free on staging" special case): a site is
 * licensed purely by its injected `config.license`. Everything here is
 * CLIENT-SIDE with NO network (that is the whole point of the runtime check),
 * and the DOM assertions run under jsdom.
 *
 * Run with `vitest run`.
 *
 * Required coverage:
 * - valid paid tier + present key → licensed → full banner;
 * - no license (or paid tier but missing/short key) → basic branded fallback
 *   banner, white-label OFF, and scripts are STILL blocked (compliance never
 *   degrades).
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { mergeConfig } from '@framer-cookie-consent/shared';
import {
  isLicensed,
  hasWhiteLabel,
  resolveBannerConfig,
  basicBannerConfig,
  revalidateLicense,
  REVALIDATION_ENABLED,
} from '../runtime/src/license-gate.ts';
import { mountBanner } from '../runtime/src/banner.ts';
import {
  createScriptBlocker,
  INERT_SCRIPT_TYPE,
  ACTIVATED_ATTR,
} from '../runtime/src/script-blocker.ts';
import type { ConsentState } from '../runtime/src/consent-state.ts';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/** A plausibly-real Lemon Squeezy key (UUID-ish, passes the format guard). */
const REAL_KEY = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';

/** A licensed Pro config. */
const proLicensed = mergeConfig({
  banner: { layout: 'card' },
  license: { tier: 'pro', key: REAL_KEY, whiteLabel: true },
});

/** A licensed Lifetime config (paid, but NOT white-label per the runtime rule). */
const lifetimeLicensed = mergeConfig({
  license: { tier: 'lifetime', key: REAL_KEY, whiteLabel: true },
});

/** An unlicensed config (default trial, no key). */
const unlicensed = mergeConfig({ license: { tier: 'trial', key: null } });

/** A paid tier but MISSING key — must not pass the presence check. */
const proNoKey = mergeConfig({ license: { tier: 'pro', key: null, whiteLabel: true } });

/* -------------------------------------------------------------------------- */
/* jsdom harness (for the banner-mount assertions)                            */
/* -------------------------------------------------------------------------- */

/** Install a fresh jsdom document as the globals the runtime touches. */
function setupDom(url = 'https://acme.com/'): JSDOM {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'dangerously',
    url,
  });
  const w = dom.window;
  (w as unknown as Record<string, unknown>).__ran = {};
  const g = globalThis as Record<string, unknown>;
  g.window = w;
  g.document = w.document;
  g.localStorage = w.localStorage;
  g.MutationObserver = w.MutationObserver;
  for (const name of [
    'Event',
    'CustomEvent',
    'KeyboardEvent',
    'MouseEvent',
    'Node',
    'HTMLElement',
    'HTMLAnchorElement',
    'HTMLInputElement',
    'HTMLButtonElement',
    'HTMLStyleElement',
    'HTMLScriptElement',
  ]) {
    g[name] = (w as unknown as Record<string, unknown>)[name];
  }
  return dom;
}

/** A no-op consent API sufficient to mount the banner. */
function noopApi() {
  return {
    getState: () => null,
    accept: () => {},
    acceptAll: () => {},
    rejectAll: () => {},
    openPreferences: () => {},
    withdraw: () => {},
  };
}

/* -------------------------------------------------------------------------- */
/* isLicensed                                                                  */
/* -------------------------------------------------------------------------- */

test('isLicensed: a paid tier + present key is licensed', () => {
  assert.equal(isLicensed(proLicensed), true);
  assert.equal(isLicensed(lifetimeLicensed), true);
  assert.equal(isLicensed(mergeConfig({ license: { tier: 'agency', key: REAL_KEY } })), true);
});

test('isLicensed: no valid license is NOT licensed, on any origin', () => {
  assert.equal(isLicensed(unlicensed), false, 'trial + no key');
  assert.equal(isLicensed(proNoKey), false, 'paid tier but no key');
  assert.equal(
    isLicensed(mergeConfig({ license: { tier: 'pro', key: 'short' } })),
    false,
    'key too short fails the format guard',
  );
  assert.equal(
    isLicensed(mergeConfig({ license: { tier: 'trial', key: REAL_KEY } })),
    false,
    'trial tier is never licensed',
  );
});

/* -------------------------------------------------------------------------- */
/* hasWhiteLabel                                                               */
/* -------------------------------------------------------------------------- */

test('hasWhiteLabel: only pro/agency AND licensed may hide the credit', () => {
  assert.equal(hasWhiteLabel(proLicensed), true, 'pro + licensed');
  assert.equal(
    hasWhiteLabel(mergeConfig({ license: { tier: 'agency', key: REAL_KEY } })),
    true,
    'agency + licensed',
  );
  assert.equal(hasWhiteLabel(lifetimeLicensed), false, 'lifetime never white-labels');
  // Unlicensed → never, regardless of the injected flag.
  assert.equal(hasWhiteLabel(proNoKey), false, 'pro but unlicensed');
  assert.equal(hasWhiteLabel(unlicensed), false, 'trial shows the credit');
});

/* -------------------------------------------------------------------------- */
/* revalidation seam (disabled)                                                */
/* -------------------------------------------------------------------------- */

test('revalidation seam is disabled and echoes the local verdict without network', async () => {
  assert.equal(REVALIDATION_ENABLED, false);
  assert.equal(await revalidateLicense(proLicensed), true);
  assert.equal(await revalidateLicense(unlicensed), false);
});

/* -------------------------------------------------------------------------- */
/* resolveBannerConfig — pure shaping                                          */
/* -------------------------------------------------------------------------- */

test('resolveBannerConfig: licensed keeps the full banner + derived white-label', () => {
  const full = resolveBannerConfig(proLicensed);
  assert.equal(full.banner.layout, 'card', 'premium layout preserved');
  assert.equal(full.license.whiteLabel, true, 'pro white-label derived by the runtime');

  // Lifetime is licensed (full banner) but the runtime forces white-label OFF.
  const lt = resolveBannerConfig(lifetimeLicensed);
  assert.equal(lt.license.whiteLabel, false);
});

test('resolveBannerConfig: unlicensed degrades to basic branded bar', () => {
  const basic = resolveBannerConfig(unlicensed);
  assert.equal(basic.banner.layout, 'bar', 'forced to an unobtrusive bar');
  assert.equal(basic.banner.overlay, false, 'no blocking overlay');
  assert.equal(basic.license.whiteLabel, false, 'white-label off on the free fallback');
  assert.equal(basic.strings.poweredByHidden, false, 'the credit is forced on');
  assert.equal(basic.advanced.customCss, '', 'premium custom CSS stripped');
  assert.equal(basic.advanced.floatingButton, false, 'floating button stripped');
});

test('basicBannerConfig: preserves all compliance-relevant content', () => {
  const source = mergeConfig({
    scripts: [{ id: 'ga', name: 'GA4', category: 'analytics', type: 'src', value: 'https://x/a.js' }],
    strings: { title: 'Custom title', message: 'Custom message' },
  });
  const basic = basicBannerConfig(source);
  assert.deepEqual(basic.categories, source.categories, 'categories untouched');
  assert.deepEqual(basic.scripts, source.scripts, 'gated scripts untouched');
  assert.deepEqual(basic.consentMode, source.consentMode, 'Consent Mode wiring untouched');
  assert.equal(basic.strings.title, 'Custom title', 'copy preserved');
  assert.equal(basic.strings.message, 'Custom message');
});

/* -------------------------------------------------------------------------- */
/* DOM: licensed → full white-label banner                                     */
/* -------------------------------------------------------------------------- */

test('DOM: a licensed Pro site renders the full banner with NO "powered by" credit', () => {
  setupDom();
  const cfg = resolveBannerConfig(proLicensed);
  const ctrl = mountBanner(cfg, { api: noopApi() });

  assert.ok(ctrl.root.querySelector('.cc-banner--card'), 'premium card layout rendered');
  assert.equal(ctrl.root.querySelector('.cc-powered'), null, 'white-label hides the credit');
  ctrl.destroy();
});

/* -------------------------------------------------------------------------- */
/* DOM: unlicensed → basic branded banner + still blocks scripts               */
/* -------------------------------------------------------------------------- */

test('DOM: an unlicensed site renders the basic branded bar (credit shown)', () => {
  setupDom();
  const cfg = resolveBannerConfig(unlicensed);
  const ctrl = mountBanner(cfg, { api: noopApi() });

  assert.ok(ctrl.root.querySelector('.cc-banner--bar'), 'degraded to a bar layout');
  const credit = ctrl.root.querySelector('.cc-powered a');
  assert.ok(credit, 'the "powered by" credit is shown (branded, white-label off)');
  ctrl.destroy();
});

test('DOM: an unlicensed site STILL blocks scripts until consent (compliance never degrades)', () => {
  const dom = setupDom();
  // An inert analytics tracker that flips a flag if it ever executes.
  const s = dom.window.document.createElement('script');
  s.type = INERT_SCRIPT_TYPE;
  s.setAttribute('data-cc-category', 'analytics');
  s.text = 'window.__ran.analytics = true;';
  dom.window.document.body.appendChild(s);

  // Boot the blocker on the ORIGINAL (unlicensed) config with NO prior consent —
  // exactly what boot() does regardless of the license verdict.
  const blocker = createScriptBlocker(unlicensed);
  const noConsent: ConsentState = {
    version: unlicensed.behavior.reconsentVersion,
    timestamp: 1,
    categories: {},
  };
  blocker.applyConsent(noConsent);

  assert.equal(
    (dom.window as unknown as { __ran: Record<string, boolean> }).__ran.analytics,
    undefined,
    'the tracker must NOT run on an unlicensed site before consent',
  );
  assert.equal(s.getAttribute('type'), INERT_SCRIPT_TYPE, 'placeholder stays inert');
  assert.equal(s.hasAttribute(ACTIVATED_ATTR), false, 'placeholder was not activated');
  blocker.disconnect();
});

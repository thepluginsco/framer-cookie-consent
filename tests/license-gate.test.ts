/**
 * Tests for the runtime license gate (`runtime/src/license-gate.ts`) — how a
 * runtime-verified {@link VerifiedEntitlement} (or `null`) shapes the banner.
 *
 * Licensing truth is the domain-scoped token fetched + verified at boot (see
 * `entitlement.ts` / `license-token.ts`), NOT the injected `config.license`.
 * This gate is a PURE transform of that verdict → banner config; it does no
 * network I/O. The DOM assertions run under jsdom.
 *
 * Run with `vitest run`.
 *
 * Required coverage:
 * - a verified entitlement → licensed → full banner (white-label derived from
 *   the token's feature flag, never the injected config);
 * - `null` (unlicensed / offline / dev host) → basic branded fallback banner,
 *   white-label OFF, and scripts are STILL blocked (compliance never degrades).
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
} from '../runtime/src/license-gate.ts';
import type { VerifiedEntitlement } from '../runtime/src/license-token.ts';
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

const nowSec = () => Math.floor(Date.now() / 1000);

/** Build a verified entitlement; `whiteLabel` toggles the token feature flag. */
function entitlement(whiteLabel: boolean): VerifiedEntitlement {
  return {
    licenseId: 'lic_1',
    domain: 'acme.com',
    status: 'active',
    type: 'monthly',
    plan: { slug: whiteLabel ? 'pro' : 'starter', name: whiteLabel ? 'Pro' : 'Starter' },
    features: whiteLabel ? { white_label: { kind: 'flag', value: true } } : {},
    iat: nowSec(),
    exp: nowSec() + 3600,
  };
}

/** A verified, white-label entitlement (full banner + credit may hide). */
const WHITE_LABEL = entitlement(true);
/** A verified entitlement WITHOUT the white-label feature (full banner, credit on). */
const NO_WHITE_LABEL = entitlement(false);

/** A licensed-intent config (premium card layout) to shape. */
const proConfig = mergeConfig({ banner: { layout: 'card' } });

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

test('isLicensed: a verified entitlement is licensed; null is not', () => {
  assert.equal(isLicensed(WHITE_LABEL), true);
  assert.equal(isLicensed(NO_WHITE_LABEL), true, 'licensed even without white-label');
  assert.equal(isLicensed(null), false, 'no token → unlicensed (offline / dev / no seat)');
});

/* -------------------------------------------------------------------------- */
/* hasWhiteLabel                                                               */
/* -------------------------------------------------------------------------- */

test('hasWhiteLabel: only when the verified token carries the white_label flag', () => {
  assert.equal(hasWhiteLabel(WHITE_LABEL), true, 'flag present + enabled');
  assert.equal(hasWhiteLabel(NO_WHITE_LABEL), false, 'no flag → credit stays');
  assert.equal(hasWhiteLabel(null), false, 'unlicensed never white-labels');
});

/* -------------------------------------------------------------------------- */
/* resolveBannerConfig — pure shaping                                          */
/* -------------------------------------------------------------------------- */

test('resolveBannerConfig: licensed keeps the full banner + token-derived white-label', () => {
  const full = resolveBannerConfig(proConfig, WHITE_LABEL);
  assert.equal(full.banner.layout, 'card', 'premium layout preserved');
  assert.equal(full.license.whiteLabel, true, 'white-label derived from the token');

  // Licensed but the token lacks the flag → runtime forces white-label OFF.
  const noWl = resolveBannerConfig(proConfig, NO_WHITE_LABEL);
  assert.equal(noWl.banner.layout, 'card', 'still the full banner');
  assert.equal(noWl.license.whiteLabel, false);
});

test('resolveBannerConfig: unlicensed (null) degrades to the basic branded bar', () => {
  const basic = resolveBannerConfig(proConfig, null);
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

test('DOM: a licensed site renders the full banner AND the "powered by" credit', () => {
  setupDom();
  const cfg = resolveBannerConfig(proConfig, WHITE_LABEL);
  const ctrl = mountBanner(cfg, { api: noopApi() });

  assert.ok(ctrl.root.querySelector('.cc-banner--card'), 'premium card layout rendered');
  // The credit now shows on every tier (white-label no longer hides it).
  assert.ok(ctrl.root.querySelector('.cc-powered'), 'the credit shows on all versions');
  ctrl.destroy();
});

/* -------------------------------------------------------------------------- */
/* DOM: unlicensed → basic branded banner + still blocks scripts               */
/* -------------------------------------------------------------------------- */

test('DOM: an unlicensed site renders the basic branded bar (credit shown)', () => {
  setupDom();
  const cfg = resolveBannerConfig(proConfig, null);
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
  const cfg = mergeConfig();
  const blocker = createScriptBlocker(cfg);
  const noConsent: ConsentState = {
    version: cfg.behavior.reconsentVersion,
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

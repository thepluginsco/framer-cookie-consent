/**
 * DOM-backed tests for the full preference center (Phase 4.2), under jsdom.
 *
 * Coverage:
 * - script blocker: a vendor the visitor turned OFF stays blocked even when its
 *   category is granted; a sibling vendor in the same category still runs;
 *   re-enabling the vendor activates it; markup placeholders are untouched;
 * - banner UI: `showVendors` lists the scripts a category gates (name + purpose);
 *   `perVendorToggles` renders a switch per vendor and records the choice on save;
 *   a vendor switch is disabled while its category toggle is off.
 *
 * jsdom runs with `runScripts: 'dangerously'` so injected inline scripts truly
 * execute — that is how we prove a denied vendor did NOT run.
 */

import { test, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { mergeConfig } from '@framer-cookie-consent/shared';
import { createScriptBlocker, type ScriptBlocker } from '../runtime/src/script-blocker.ts';
import { writeConsent, type ConsentState } from '../runtime/src/consent-state.ts';
import { mountBanner } from '../runtime/src/banner.ts';

const g = globalThis as Record<string, unknown>;
let dom: InstanceType<typeof JSDOM>;

const GLOBALS = [
  'MutationObserver',
  'CustomEvent',
  'Event',
  'KeyboardEvent',
  'MouseEvent',
  'Node',
  'HTMLElement',
  'HTMLAnchorElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLStyleElement',
] as const;

beforeEach(() => {
  dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    runScripts: 'dangerously',
    url: 'https://example.com/',
  });
  const w = dom.window;
  (w as unknown as Record<string, unknown>).__ran = {};
  g.window = w;
  g.document = w.document;
  g.localStorage = w.localStorage;
  for (const name of GLOBALS) g[name] = (w as unknown as Record<string, unknown>)[name];
});

afterEach(() => {
  dom.window.close();
  delete g.window;
  delete g.document;
  delete g.localStorage;
  for (const name of GLOBALS) delete g[name];
});

/** A config with two vendors under different categories, each flipping a flag. */
function vendorConfig() {
  return mergeConfig({
    preferenceCenter: { showVendors: true, perVendorToggles: true },
    scripts: [
      { id: 'ga4', name: 'Google Analytics 4', value: "window.__ran.ga4=true", type: 'inline', category: 'analytics', purpose: 'Traffic measurement' },
      { id: 'clarity', name: 'Microsoft Clarity', value: "window.__ran.clarity=true", type: 'inline', category: 'analytics' },
      { id: 'meta', name: 'Meta Pixel', value: "window.__ran.meta=true", type: 'inline', category: 'marketing' },
    ],
  });
}

function ran(flag: string): boolean {
  return (dom.window as unknown as { __ran: Record<string, boolean> }).__ran[flag] === true;
}

function state(categories: Record<string, boolean>, vendors?: Record<string, boolean>): ConsentState {
  const s: ConsentState = { version: '1', timestamp: 1, categories };
  if (vendors) s.vendors = vendors;
  return s;
}

/* ---------------------------- script blocker ------------------------------ */

test('a denied vendor stays blocked while its category is granted; a sibling still runs', () => {
  const config = vendorConfig();
  const blocker: ScriptBlocker = createScriptBlocker(config);
  // analytics granted, but the ga4 vendor is turned off.
  blocker.applyConsent(state({ necessary: true, analytics: true, marketing: false }, { ga4: false }));

  assert.equal(ran('ga4'), false, 'the denied vendor must not run');
  assert.equal(ran('clarity'), true, 'a non-denied vendor in the same granted category runs');
  assert.equal(ran('meta'), false, 'a denied category never runs regardless of vendors');
  blocker.disconnect();
});

test('re-enabling a previously-denied vendor activates it', () => {
  const config = vendorConfig();
  const blocker = createScriptBlocker(config);
  blocker.applyConsent(state({ necessary: true, analytics: true }, { ga4: false }));
  assert.equal(ran('ga4'), false);

  // A later decision that no longer denies ga4 must let it run (it was never
  // marked injected, so the change subscription can activate it).
  blocker.applyConsent(state({ necessary: true, analytics: true }, { ga4: true }));
  assert.equal(ran('ga4'), true, 're-enabling the vendor activates it');
  blocker.disconnect();
});

test('per-vendor denial does not touch markup placeholders (they stay category-gated)', () => {
  const config = vendorConfig();
  const ph = dom.window.document.createElement('script');
  ph.type = 'text/plain';
  ph.setAttribute('data-cc-category', 'analytics');
  ph.text = 'window.__ran.placeholder=true;';
  dom.window.document.body.appendChild(ph);

  const blocker = createScriptBlocker(config);
  // Denying every config vendor by id must not stop a markup placeholder whose
  // category is granted (placeholders carry no vendor id).
  blocker.applyConsent(state({ necessary: true, analytics: true }, { ga4: false, clarity: false }));
  assert.equal(ran('placeholder'), true, 'the placeholder runs — vendor denials are id-scoped');
  blocker.disconnect();
});

/* -------------------------------- banner ---------------------------------- */

/** Recording API that captures the arguments to `accept`. */
function recordingApi() {
  const calls: Array<{ cats: string[]; method?: string; vendors?: Record<string, boolean> }> = [];
  return {
    calls,
    getState: () => null,
    accept: (cats: string[], method?: string, vendors?: Record<string, boolean>) =>
      calls.push({ cats, method, vendors }),
    acceptAll: () => calls.push({ cats: ['*'], method: 'accept_all' }),
    rejectAll: () => calls.push({ cats: [], method: 'reject_all' }),
    openPreferences: () => {},
    withdraw: () => {},
    exportReceipt: () => null,
    downloadReceipt: () => false,
  };
}

test('showVendors lists the scripts a category gates, with name + purpose', () => {
  const config = mergeConfig({
    preferenceCenter: { showVendors: true, perVendorToggles: false },
    scripts: [{ id: 'ga4', name: 'Google Analytics 4', value: 'https://x/ga.js', category: 'analytics', purpose: 'Traffic measurement' }],
  });
  const ctrl = mountBanner(config, { api: recordingApi() as never });
  const vendors = ctrl.root.querySelectorAll('.cc-vendor');
  assert.equal(vendors.length, 1, 'one vendor row under analytics');
  assert.equal(ctrl.root.querySelector('.cc-vendor__name')!.textContent, 'Google Analytics 4');
  assert.equal(ctrl.root.querySelector('.cc-vendor__meta')!.textContent, 'Traffic measurement');
  // No per-vendor switch when perVendorToggles is off.
  assert.equal(ctrl.root.querySelector('#cc-vendor-ga4'), null);
});

test('no vendor list renders when showVendors is off (default)', () => {
  const config = mergeConfig({
    scripts: [{ id: 'ga4', name: 'GA4', value: 'https://x/ga.js', category: 'analytics' }],
  });
  const ctrl = mountBanner(config, { api: recordingApi() as never });
  assert.equal(ctrl.root.querySelector('.cc-vendor'), null);
});

test('perVendorToggles renders a switch per vendor and records the choice on save', () => {
  const config = mergeConfig({
    preferenceCenter: { showVendors: true, perVendorToggles: true },
    scripts: [
      { id: 'ga4', name: 'GA4', value: 'https://x/ga.js', category: 'analytics' },
      { id: 'meta', name: 'Meta', value: 'https://x/meta.js', category: 'marketing' },
    ],
  });
  const api = recordingApi();
  const ctrl = mountBanner(config, { api: api as never });

  const ga4 = ctrl.root.querySelector('#cc-vendor-ga4') as HTMLInputElement;
  const meta = ctrl.root.querySelector('#cc-vendor-meta') as HTMLInputElement;
  assert.ok(ga4 && meta, 'both vendor switches render');
  assert.equal(ga4.checked, true, 'vendors start allowed');

  // Turn ga4 off; leave meta on. analytics is default-on, marketing default-off.
  ga4.checked = false;
  const save = Array.from(ctrl.root.querySelectorAll('button')).find((b) => b.textContent === 'Save choices');
  assert.ok(save, 'a save button exists');
  save!.click();

  assert.equal(api.calls.length, 1);
  const call = api.calls[0]!;
  assert.equal(call.method, 'custom');
  assert.deepEqual(call.vendors, { ga4: false, meta: true }, 'vendor choices recorded');
});

test('a vendor switch is disabled while its category toggle is off', () => {
  const config = mergeConfig({
    preferenceCenter: { showVendors: true, perVendorToggles: true },
    // marketing is default-off, so its vendor switch should start disabled.
    scripts: [{ id: 'meta', name: 'Meta', value: 'https://x/meta.js', category: 'marketing' }],
  });
  const ctrl = mountBanner(config, { api: recordingApi() as never });
  const meta = ctrl.root.querySelector('#cc-vendor-meta') as HTMLInputElement;
  const marketingCat = ctrl.root.querySelector('#cc-cat-marketing') as HTMLInputElement;
  assert.equal(meta.disabled, true, 'vendor disabled while its category is off');

  // Turning the category on enables the vendor switch.
  marketingCat.checked = true;
  marketingCat.dispatchEvent(new dom.window.Event('change'));
  assert.equal(meta.disabled, false, 'enabling the category enables its vendor switch');
});

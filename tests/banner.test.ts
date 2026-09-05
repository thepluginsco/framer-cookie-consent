/**
 * Unit tests for the visible banner UI (jsdom).
 *
 * Runs under Vitest with a real DOM provided by jsdom, so focus movement,
 * `activeElement`, and event dispatch behave like a browser.
 * Run with `vitest run`.
 *
 * Required coverage:
 * - the preferences modal traps Tab / Shift+Tab focus;
 * - the `necessary` category toggle is checked and disabled;
 * - the banner renders exactly the buttons its config asks for;
 * - clicking "Accept all" writes consent with every category granted.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { mergeConfig } from '@framer-cookie-consent/shared';
import { writeConsent } from '../runtime/src/consent-state.ts';
import { mountBanner } from '../runtime/src/banner.ts';

/* ------------------------------ jsdom harness ----------------------------- */

/**
 * Install a fresh jsdom document as the ambient globals the runtime touches.
 * Crucially, the DOM constructor globals (`HTMLAnchorElement`, …) must come from
 * the SAME window the elements are created in, or `instanceof` checks fail.
 */
function setupDom(): JSDOM {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://example.com/',
  });
  const w = dom.window;
  const g = globalThis as Record<string, unknown>;
  g.window = w;
  g.document = w.document;
  g.localStorage = w.localStorage;
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
  ]) {
    g[name] = (w as unknown as Record<string, unknown>)[name];
  }
  return dom;
}

/** A recording stand-in for the consent API; `acceptAll`/`accept` go through the real `writeConsent`. */
function recordingApi(config: ReturnType<typeof mergeConfig>) {
  const calls: Array<{ method: string; state?: ReturnType<typeof writeConsent> }> = [];
  const grantMap = (granted: readonly string[]) =>
    Object.fromEntries(config.categories.map((c) => [c.id, granted.includes(c.id)]));
  return {
    calls,
    getState: () => null,
    accept: (cats: string[]) => calls.push({ method: 'accept', state: writeConsent(config, grantMap(cats)) }),
    acceptAll: () =>
      calls.push({ method: 'acceptAll', state: writeConsent(config, grantMap(config.categories.map((c) => c.id))) }),
    rejectAll: () => calls.push({ method: 'rejectAll', state: writeConsent(config, grantMap([])) }),
    openPreferences: () => calls.push({ method: 'openPreferences' }),
    withdraw: () => calls.push({ method: 'withdraw' }),
  };
}

/* --------------------------------- tests ---------------------------------- */

test('preferences modal traps Tab focus (cycles at both ends)', () => {
  const dom = setupDom();
  const config = mergeConfig();
  const ctrl = mountBanner(config, { api: recordingApi(config) });
  ctrl.openPreferences();

  const modal = ctrl.root.querySelector('.cc-modal') as HTMLElement;
  const focusable = Array.from(
    modal.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ),
  );
  assert.ok(focusable.length >= 2, 'modal should have multiple focusable controls');
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;

  // Tab off the last control wraps to the first.
  last.focus();
  assert.equal(dom.window.document.activeElement, last);
  last.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.equal(dom.window.document.activeElement, first, 'Tab at end should cycle to first');

  // Shift+Tab off the first control wraps to the last.
  first.focus();
  first.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
  );
  assert.equal(dom.window.document.activeElement, last, 'Shift+Tab at start should cycle to last');
});

test('opening preferences moves focus into the modal', () => {
  const dom = setupDom();
  const config = mergeConfig();
  const ctrl = mountBanner(config, { api: recordingApi(config) });
  ctrl.openPreferences();
  const modal = ctrl.root.querySelector('.cc-modal') as HTMLElement;
  assert.ok(modal.contains(dom.window.document.activeElement), 'focus should be inside the modal');
});

test('necessary shows an always-on pill; optional toggles reflect defaultEnabled', () => {
  setupDom();
  const config = mergeConfig();
  const ctrl = mountBanner(config, { api: recordingApi(config) });

  // The required `necessary` category renders a static "ON" pill, not a toggle.
  assert.equal(ctrl.root.querySelector('#cc-cat-necessary'), null, 'necessary has no toggle input');
  const onPill = ctrl.root.querySelector('.cc-cat__on');
  assert.ok(onPill, 'necessary should show an always-on pill');
  assert.equal(onPill!.textContent, 'ON');

  // Optional categories are checkboxes pre-set from `defaultEnabled`.
  const analytics = ctrl.root.querySelector('#cc-cat-analytics') as HTMLInputElement;
  assert.ok(analytics, 'analytics toggle should exist');
  assert.equal(analytics.checked, true, 'analytics is default-enabled → starts on');
  const marketing = ctrl.root.querySelector('#cc-cat-marketing') as HTMLInputElement;
  assert.ok(marketing, 'marketing toggle should exist');
  assert.equal(marketing.checked, false, 'marketing is not default-enabled → starts off');
});

test('banner renders Reject / Accept per config flags plus the manage link', () => {
  setupDom();
  const full = mergeConfig({ banner: { showRejectButton: true, showPreferencesButton: true } });
  const c1 = mountBanner(full, { api: recordingApi(full) });
  const labels1 = Array.from(c1.root.querySelectorAll('.cc-banner__actions button')).map((b) => b.textContent);
  assert.deepEqual(labels1, [full.strings.rejectAll, full.strings.acceptAll]);
  const manage = c1.root.querySelector('.cc-banner__manage');
  assert.ok(manage, 'manage-preferences link should render');
  assert.equal(manage!.textContent, full.strings.customize);
  c1.destroy();

  setupDom();
  const minimal = mergeConfig({ banner: { showRejectButton: false, showPreferencesButton: false } });
  const c2 = mountBanner(minimal, { api: recordingApi(minimal) });
  const labels2 = Array.from(c2.root.querySelectorAll('.cc-banner__actions button')).map((b) => b.textContent);
  assert.deepEqual(labels2, [minimal.strings.acceptAll], 'only Accept all when reject disabled');
  assert.equal(c2.root.querySelector('.cc-banner__manage'), null, 'no manage link when preferences disabled');
});

test('clicking Accept all writes consent with every category granted', () => {
  setupDom();
  const config = mergeConfig();
  const api = recordingApi(config);
  const ctrl = mountBanner(config, { api });

  const acceptBtn = ctrl.root.querySelector('.cc-banner__actions .cc-btn--primary') as HTMLButtonElement;
  assert.ok(acceptBtn, 'Accept all button should exist');
  acceptBtn.click();

  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0]!.method, 'acceptAll');
  const cats = api.calls[0]!.state!.categories;
  for (const c of config.categories) {
    assert.equal(cats[c.id], true, `category ${c.id} should be granted`);
  }
});

test('hideAfterChoice honours the setting: default hides, false keeps a non-modal banner up', () => {
  // Default (true): a decision retires the banner.
  const dom = setupDom();
  const hides = mergeConfig({ banner: { layout: 'card' } });
  const c1 = mountBanner(hides, { api: recordingApi(hides), autoShow: true });
  const b1 = c1.root.querySelector('.cc-banner') as HTMLElement;
  assert.equal(b1.hidden, false, 'banner starts visible');
  dom.window.dispatchEvent(new dom.window.CustomEvent('cookieconsent:change'));
  assert.equal(b1.hidden, true, 'hideAfterChoice=true retires the banner after a choice');
  c1.destroy();

  // Off: a non-modal banner stays visible so the visitor can keep adjusting.
  const dom2 = setupDom();
  const stays = mergeConfig({ banner: { layout: 'card' }, behavior: { hideAfterChoice: false } });
  const c2 = mountBanner(stays, { api: recordingApi(stays), autoShow: true });
  const b2 = c2.root.querySelector('.cc-banner') as HTMLElement;
  dom2.window.dispatchEvent(new dom2.window.CustomEvent('cookieconsent:change'));
  assert.equal(b2.hidden, false, 'hideAfterChoice=false keeps a non-modal banner visible');
  c2.destroy();

  // A blocking modal ALWAYS closes on a decision, even with hideAfterChoice off,
  // or the visitor would be trapped (no other dismiss path).
  const dom3 = setupDom();
  const blocking = mergeConfig({ banner: { layout: 'modal' }, behavior: { hideAfterChoice: false } });
  const c3 = mountBanner(blocking, { api: recordingApi(blocking), autoShow: true });
  const b3 = c3.root.querySelector('.cc-banner') as HTMLElement;
  dom3.window.dispatchEvent(new dom3.window.CustomEvent('cookieconsent:change'));
  assert.equal(b3.hidden, true, 'a blocking modal must close on a decision regardless');
  c3.destroy();
});

/**
 * jsdom's `location.reload` is non-configurable and `location` can't be deleted,
 * so we can't stub it in place. Instead, swap the GLOBAL `window` the runtime
 * resolves at call time for a Proxy that overrides only `location.reload`. Call
 * `restore()` when done.
 */
function stubReload(dom: JSDOM): { count: () => number; restore: () => void } {
  let reloads = 0;
  const realWin = dom.window as unknown as Record<string, unknown>;
  const realLoc = realWin.location as { href: string };
  // A plain stand-in (not a Proxy over the real location, whose non-configurable
  // `reload` a Proxy is forbidden to override). The runtime's onChange only reads
  // `location.reload`; keep `href` too in case anything else touches it.
  const stubLoc = { href: realLoc.href, reload: () => { reloads += 1; } };
  const winProxy = new Proxy(realWin, {
    get: (t, p) => {
      if (p === 'location') return stubLoc;
      const v = Reflect.get(t, p);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
  const g = globalThis as Record<string, unknown>;
  g.window = winProxy;
  return { count: () => reloads, restore: () => { g.window = realWin; } };
}

test('reloadOnChange reloads the page exactly once per decision', () => {
  const dom = setupDom();
  const config = mergeConfig({ banner: { layout: 'card' }, behavior: { reloadOnChange: true } });
  const ctrl = mountBanner(config, { api: recordingApi(config), autoShow: true });
  const spy = stubReload(dom);
  dom.window.dispatchEvent(new dom.window.CustomEvent('cookieconsent:change'));
  spy.restore();
  assert.equal(spy.count(), 1, 'a decision triggers exactly one reload');
  ctrl.destroy();

  // With the flag off, no reload happens.
  const dom2 = setupDom();
  const off = mergeConfig({ banner: { layout: 'card' } });
  const c2 = mountBanner(off, { api: recordingApi(off), autoShow: true });
  const spy2 = stubReload(dom2);
  dom2.window.dispatchEvent(new dom2.window.CustomEvent('cookieconsent:change'));
  spy2.restore();
  assert.equal(spy2.count(), 0, 'no reload when reloadOnChange is off');
  c2.destroy();
});

test('blocking modal cannot be dismissed with Esc, but a normal preferences modal can', () => {
  // Non-blocking: Esc closes the preferences modal.
  const dom = setupDom();
  const normal = mergeConfig({ banner: { layout: 'card' } });
  const c1 = mountBanner(normal, { api: recordingApi(normal) });
  c1.openPreferences();
  const modal1 = c1.root.querySelector('.cc-modal') as HTMLElement;
  assert.equal(modal1.hidden, false);
  dom.window.document.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  assert.equal(modal1.hidden, true, 'Esc should close a normal preferences modal');
  c1.destroy();

  // Blocking: Esc is inert (a choice is required). The centered `modal` layout
  // is the blocking one.
  const dom2 = setupDom();
  const blocking = mergeConfig({ banner: { layout: 'modal' } });
  const c2 = mountBanner(blocking, { api: recordingApi(blocking) });
  c2.openPreferences();
  const modal2 = c2.root.querySelector('.cc-modal') as HTMLElement;
  dom2.window.document.dispatchEvent(
    new dom2.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  assert.equal(modal2.hidden, false, 'Esc must not close a blocking modal');
});

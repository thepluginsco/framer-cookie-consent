/**
 * Smoke test for the REAL runtime entry point (`runtime/src/index.ts`).
 *
 * `index.ts` auto-boots on import (`void boot()`), so this sets up the ambient
 * globals and an embedded `window.__CC_CONFIG__` FIRST, then imports the module
 * fresh and asserts the end-to-end wiring the published site depends on:
 * `window.CookieConsent` is installed (with a `boot` handle), Consent Mode
 * defaults are pushed denied, and the banner is mounted into the DOM.
 *
 * Run with `vitest run`.
 */

import { test, beforeEach, afterEach, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';

const g = globalThis as Record<string, unknown>;
let dom: InstanceType<typeof JSDOM>;

function installDom(): void {
  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'dangerously',
    url: 'https://acme.com/',
  });
  const w = dom.window;
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
}

beforeEach(() => installDom());

afterEach(() => {
  dom.window.close();
  for (const k of [
    'window',
    'document',
    'localStorage',
    'MutationObserver',
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
    delete g[k];
  }
});

test('auto-boot installs window.CookieConsent, denies Consent Mode by default, and mounts the banner', async () => {
  // Embedded config the loader would inject; `everywhere` so the banner shows
  // regardless of the (jsdom) time zone.
  (dom.window as unknown as { __CC_CONFIG__: unknown }).__CC_CONFIG__ = {
    behavior: { showMode: 'everywhere' },
  };

  vi.resetModules();
  await import('../runtime/src/index.ts');
  // boot() runs synchronously on import; give any microtasks a tick anyway.
  await Promise.resolve();

  // The imperative API is installed with a boot handle for manual re-init.
  const api = (dom.window as unknown as { CookieConsent?: Record<string, unknown> }).CookieConsent;
  expect(api).toBeTruthy();
  expect(typeof api!.acceptAll).toBe('function');
  expect(typeof api!.boot).toBe('function');

  // Consent Mode defaulted everything denied before any tag could run.
  const dl = (dom.window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
  const def = dl.map((a) => Array.from(a as ArrayLike<unknown>)).find((c) => c[0] === 'consent' && c[1] === 'default');
  expect(def).toBeTruthy();
  const signals = def![2] as Record<string, unknown>;
  expect(signals.ad_storage).toBe('denied');
  expect(signals.analytics_storage).toBe('denied');
  expect(signals.security_storage).toBe('granted');

  // The banner UI was mounted into the page.
  expect(dom.window.document.querySelector('.cc-root .cc-banner')).toBeTruthy();
});

test('auto-boot is resilient: an invalid embedded config still boots (falls back to defaults)', async () => {
  (dom.window as unknown as { __CC_CONFIG__: unknown }).__CC_CONFIG__ = '{ this is : not json';

  vi.resetModules();
  await import('../runtime/src/index.ts');
  await Promise.resolve();

  // parse() swallows the bad JSON and returns a default config, so the API and
  // Consent Mode wiring still come up rather than the page breaking.
  expect((dom.window as unknown as { CookieConsent?: unknown }).CookieConsent).toBeTruthy();
  const dl = (dom.window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
  expect(dl.length).toBeGreaterThan(0);
});

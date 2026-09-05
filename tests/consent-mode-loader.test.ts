/**
 * DOM-dependent Consent Mode tests: the optional blocked-`gtag.js` loader
 * injection, the gating-category picker, and `initConsentMode` wiring.
 *
 * These need a real DOM (the loader creates `<script>` nodes) and a pristine
 * module per test (Consent Mode's `defaultsSet` guard is module-level), so each
 * test resets the module registry and re-imports against a fresh jsdom.
 *
 * Run with `vitest run`.
 */

import { test, describe, beforeEach, afterEach, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import { mergeConfig, type CookieConsentConfig } from '@framer-cookie-consent/shared';

let dom: InstanceType<typeof JSDOM>;
const g = globalThis as Record<string, unknown>;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://example.com/' });
  g.window = dom.window;
  g.document = dom.window.document;
  g.localStorage = dom.window.localStorage;
});

afterEach(() => {
  dom.window.close();
  delete g.window;
  delete g.document;
  delete g.localStorage;
});

/** Fresh consent-mode + consent-state (resets the `defaultsSet` singleton). */
async function loadConsentMode() {
  vi.resetModules();
  const consentMode = await import('../runtime/src/consent-mode.ts');
  const consentState = await import('../runtime/src/consent-state.ts');
  return { consentMode, consentState };
}

/* --------------------------- blocked gtag loader -------------------------- */

describe('blocked gtag.js loader (advanced.googleTagId)', () => {
  test('injects an INERT gtag loader + init gated by the analytics category', async () => {
    const { consentMode } = await loadConsentMode();
    consentMode.bootstrapConsentDefaults(mergeConfig({ advanced: { googleTagId: 'G-ABC123' } }));

    const tagged = dom.window.document.querySelectorAll('script[data-cc-gtag]');
    expect(tagged.length).toBe(2);

    // The external loader is inert (text/plain) with a deferred src and the
    // analytics category as its gate — never executable until consent.
    const loader = dom.window.document.querySelector('script[data-cc-src]') as HTMLScriptElement;
    expect(loader.getAttribute('type')).toBe('text/plain');
    expect(loader.getAttribute('data-cc-category')).toBe('analytics');
    expect(loader.getAttribute('data-cc-src')).toContain('googletagmanager.com/gtag/js?id=G-ABC123');
    for (const s of Array.from(tagged)) {
      expect((s as HTMLScriptElement).type).toBe('text/plain');
    }
  });

  test('does not double-inject when a gtag.js loader is already present', async () => {
    // Pre-existing real gtag.js loader on the page.
    const pre = dom.window.document.createElement('script');
    pre.src = 'https://www.googletagmanager.com/gtag/js?id=G-EXISTING';
    dom.window.document.head.appendChild(pre);

    const { consentMode } = await loadConsentMode();
    consentMode.bootstrapConsentDefaults(mergeConfig({ advanced: { googleTagId: 'G-ABC123' } }));

    // Our inert loader is NOT added on top of the existing one.
    expect(dom.window.document.querySelectorAll('script[data-cc-gtag]').length).toBe(0);
  });

  test('gating category falls back to an ads category when no analytics signal exists', async () => {
    const { consentMode } = await loadConsentMode();
    const cfg: CookieConsentConfig = mergeConfig({
      categories: [
        { id: 'necessary', label: 'N', description: '', required: true, defaultEnabled: true, signals: ['security_storage'] },
        { id: 'ads', label: 'Ads', description: '', required: false, defaultEnabled: false, signals: ['ad_storage'] },
      ],
      advanced: { googleTagId: 'AW-999' },
    });
    consentMode.bootstrapConsentDefaults(cfg);
    const loader = dom.window.document.querySelector('script[data-cc-src]') as HTMLScriptElement;
    expect(loader.getAttribute('data-cc-category')).toBe('ads');
  });

  test('gating category falls back to any optional category when neither analytics nor ads exist', async () => {
    const { consentMode } = await loadConsentMode();
    const cfg: CookieConsentConfig = mergeConfig({
      categories: [
        { id: 'necessary', label: 'N', description: '', required: true, defaultEnabled: true, signals: ['security_storage'] },
        { id: 'prefs', label: 'Prefs', description: '', required: false, defaultEnabled: false, signals: ['functionality_storage'] },
      ],
      advanced: { googleTagId: 'G-XYZ' },
    });
    consentMode.bootstrapConsentDefaults(cfg);
    const loader = dom.window.document.querySelector('script[data-cc-src]') as HTMLScriptElement;
    expect(loader.getAttribute('data-cc-category')).toBe('prefs');
  });
});

/* ------------------------------ initConsentMode --------------------------- */

describe('initConsentMode', () => {
  test('pushes defaults, emits an update on consent change, and unsubscribe stops future updates', async () => {
    const { consentMode, consentState } = await loadConsentMode();
    const config = mergeConfig();

    const unsubscribe = consentMode.initConsentMode(config);

    const calls = () =>
      ((g.window as { dataLayer?: unknown[] }).dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>));
    expect(calls().some((c) => c[0] === 'consent' && c[1] === 'default')).toBe(true);

    // A consent change flows through to a Consent Mode update.
    consentState.emitConsentChange({ version: '1', timestamp: 1, categories: { necessary: true, analytics: true } });
    const update = calls().find((c) => c[0] === 'consent' && c[1] === 'update');
    expect(update).toBeTruthy();
    expect((update![2] as Record<string, unknown>).analytics_storage).toBe('granted');

    // After unsubscribe, further changes do not push a new update.
    unsubscribe();
    const before = calls().length;
    consentState.emitConsentChange({ version: '1', timestamp: 2, categories: { necessary: true, marketing: true } });
    expect(calls().length).toBe(before);
  });

  test('Consent Mode disabled → no default is pushed', async () => {
    const { consentMode } = await loadConsentMode();
    consentMode.bootstrapConsentDefaults(mergeConfig({ consentMode: { enableConsentMode: false } }));
    const dl = (g.window as { dataLayer?: unknown[] }).dataLayer ?? [];
    expect(dl.length).toBe(0);
  });
});

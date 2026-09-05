/**
 * Additional script-blocker coverage for the activation edge cases the core
 * suite doesn't hit: `data-cc-type` real-type restoration, external `src` config
 * scripts, async preservation, and the `activateCategory` positive path.
 *
 * Run with `vitest run`.
 */

import { test, beforeEach, afterEach, expect } from 'vitest';
import { JSDOM } from 'jsdom';

import { mergeConfig } from '@framer-cookie-consent/shared';
import type { ConsentState } from '../runtime/src/consent-state.ts';
import {
  createScriptBlocker,
  INERT_SCRIPT_TYPE,
  ACTIVATED_ATTR,
} from '../runtime/src/script-blocker.ts';

const g = globalThis as Record<string, unknown>;
let dom: InstanceType<typeof JSDOM>;

beforeEach(() => {
  dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    runScripts: 'dangerously',
    url: 'https://example.com/',
  });
  const w = dom.window;
  (w as unknown as Record<string, unknown>).__ran = {};
  g.window = w;
  g.document = w.document;
  g.MutationObserver = w.MutationObserver;
  g.Node = w.Node;
  g.localStorage = w.localStorage;
});

afterEach(() => {
  dom.window.close();
  for (const k of ['window', 'document', 'MutationObserver', 'Node', 'localStorage']) delete g[k];
});

const config = mergeConfig();

function stateGranting(...ids: string[]): ConsentState {
  const categories: Record<string, boolean> = {};
  for (const c of config.categories) categories[c.id] = ids.includes(c.id);
  return { version: config.behavior.reconsentVersion, timestamp: 1, categories };
}

/* ---------------------------- real-type restore --------------------------- */

test('data-cc-type restores the intended executable type (e.g. module) on activation', () => {
  const d = dom.window.document;
  const s = d.createElement('script');
  s.type = INERT_SCRIPT_TYPE;
  s.setAttribute('data-cc-category', 'analytics');
  s.setAttribute('data-cc-type', 'module');
  s.setAttribute('data-cc-src', 'https://cdn.example.com/m.js');
  d.body.appendChild(s);

  const blocker = createScriptBlocker(config);
  blocker.applyConsent(stateGranting('analytics'));

  const real = d.querySelector(`script[${ACTIVATED_ATTR}]`) as HTMLScriptElement;
  expect(real.getAttribute('type')).toBe('module');
  expect(real.getAttribute('src')).toBe('https://cdn.example.com/m.js');
  blocker.disconnect();
});

test('an async placeholder keeps async on activation (dependent order not forced)', () => {
  const d = dom.window.document;
  const s = d.createElement('script');
  s.type = INERT_SCRIPT_TYPE;
  s.setAttribute('data-cc-category', 'analytics');
  s.setAttribute('data-cc-src', 'https://cdn.example.com/a.js');
  s.setAttribute('async', '');
  d.body.appendChild(s);

  const blocker = createScriptBlocker(config);
  blocker.applyConsent(stateGranting('analytics'));
  const real = d.querySelector(`script[${ACTIVATED_ATTR}]`) as HTMLScriptElement;
  // The async attribute is preserved (so the browser keeps it async) — the
  // in-order force only applies when NEITHER async nor defer was authored.
  expect(real.hasAttribute('async')).toBe(true);
  blocker.disconnect();
});

/* --------------------------- external config script ----------------------- */

test('a config script of type "src" injects as an external script tag', () => {
  const cfg = mergeConfig({
    scripts: [{ id: 'ext', category: 'analytics', type: 'src', value: 'https://cdn.example.com/ext.js', async: true }],
  });
  const blocker = createScriptBlocker(cfg);
  blocker.applyConsent(stateGranting('analytics'));

  const injected = dom.window.document.querySelector('script[data-cc-script-id="ext"]') as HTMLScriptElement;
  expect(injected).toBeTruthy();
  expect(injected.getAttribute('src')).toBe('https://cdn.example.com/ext.js');
  expect(injected.async).toBe(true);
  blocker.disconnect();
});

/* ---------------------------- activateCategory ---------------------------- */

test('activateCategory activates a granted category’s placeholder and returns the count', () => {
  const d = dom.window.document;
  const blocker = createScriptBlocker(config);
  blocker.applyConsent(stateGranting('analytics'));

  // Add a placeholder AFTER apply, then activate it explicitly (not via observer).
  const s = d.createElement('script');
  s.type = INERT_SCRIPT_TYPE;
  s.setAttribute('data-cc-category', 'analytics');
  s.text = 'window.__ran.explicit = true;';
  d.body.appendChild(s);

  const count = blocker.activateCategory('analytics');
  expect(count).toBeGreaterThanOrEqual(1);
  expect((dom.window as unknown as { __ran: Record<string, boolean> }).__ran.explicit).toBe(true);
  blocker.disconnect();
});

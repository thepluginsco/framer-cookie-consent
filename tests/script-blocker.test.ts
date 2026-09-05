/**
 * Behavioural tests for the script-blocking engine, run against a real DOM
 * provided by jsdom (with `runScripts: 'dangerously'` so inline scripts truly
 * execute — that is how we prove blocking works rather than merely inspecting
 * markup).
 *
 * Run with `vitest run`.
 *
 * Coverage:
 * - `type="text/plain"` scripts do NOT run before consent.
 * - Granting a category converts ONLY that category's scripts to executable.
 * - A mutation-added tagged script is gated the same way.
 * - The pure `classify` split, config-script injection, and idempotency.
 */

import { test, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { mergeConfig } from '@framer-cookie-consent/shared';
import { emitConsentChange, type ConsentState } from '../runtime/src/consent-state.ts';
import {
  classify,
  createScriptBlocker,
  INERT_SCRIPT_TYPE,
  ACTIVATED_ATTR,
} from '../runtime/src/script-blocker.ts';

const g = globalThis as Record<string, unknown>;
let dom: InstanceType<typeof JSDOM>;

/** Install a fresh jsdom document (and the globals the runtime reads) per test. */
beforeEach(() => {
  dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    runScripts: 'dangerously',
    url: 'https://example.com/',
  });
  const w = dom.window;
  // Trackers report execution by flipping flags on window; start clean.
  (w as unknown as Record<string, unknown>).__ran = {};
  g.window = w;
  g.document = w.document;
  g.MutationObserver = w.MutationObserver;
  g.CustomEvent = w.CustomEvent;
  g.Node = w.Node;
  g.localStorage = w.localStorage;
});

afterEach(() => {
  dom.window.close();
  delete g.window;
  delete g.document;
  delete g.MutationObserver;
  delete g.CustomEvent;
  delete g.Node;
  delete g.localStorage;
});

const config = mergeConfig({});

/** A consent state granting exactly `ids` (everything else denied). */
function stateGranting(...ids: string[]): ConsentState {
  const categories: Record<string, boolean> = {};
  for (const c of config.categories) categories[c.id] = ids.includes(c.id);
  return { version: config.behavior.reconsentVersion, timestamp: 1, categories };
}

/** Insert an inert placeholder that flips `window.__ran[flag]` when it runs. */
function addInlinePlaceholder(category: string, flag: string): HTMLScriptElement {
  const s = dom.window.document.createElement('script');
  s.type = INERT_SCRIPT_TYPE;
  s.setAttribute('data-cc-category', category);
  s.text = `window.__ran[${JSON.stringify(flag)}] = true;`;
  dom.window.document.body.appendChild(s);
  return s;
}

/** Read a tracker's "did it execute" flag. */
function ran(flag: string): boolean {
  return (dom.window as unknown as { __ran: Record<string, boolean> }).__ran[flag] === true;
}

/** Let jsdom's MutationObserver microtask/callback flush. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/* ------------------------------ pure classify ----------------------------- */

test('classify: splits granted and denied category ids', () => {
  const { granted, denied } = classify(stateGranting('analytics'));
  assert.ok(granted.includes('analytics'));
  assert.ok(!granted.includes('marketing'));
  assert.ok(denied.includes('marketing'));
  assert.ok(denied.includes('preferences'));
});

/* --------------------------- blocking before consent ---------------------- */

test('text/plain scripts do NOT run before consent', () => {
  addInlinePlaceholder('analytics', 'analytics');
  addInlinePlaceholder('marketing', 'marketing');

  // Engine created but no consent applied yet.
  createScriptBlocker(config);

  assert.equal(ran('analytics'), false);
  assert.equal(ran('marketing'), false);
  // Still inert in the DOM.
  assert.equal(
    dom.window.document.querySelectorAll(`script[type="${INERT_SCRIPT_TYPE}"]`).length,
    2,
  );
});

test('applying a state that grants nothing activates nothing', () => {
  addInlinePlaceholder('analytics', 'analytics');
  const blocker = createScriptBlocker(config);
  blocker.applyConsent(stateGranting()); // reject-all
  assert.equal(ran('analytics'), false);
  blocker.disconnect();
});

/* -------------------------- granting a category --------------------------- */

test('granting a category converts ONLY that category’s scripts to executable', () => {
  addInlinePlaceholder('analytics', 'analytics');
  addInlinePlaceholder('marketing', 'marketing');

  const blocker = createScriptBlocker(config);
  blocker.applyConsent(stateGranting('analytics'));

  // Analytics ran; marketing did not.
  assert.equal(ran('analytics'), true);
  assert.equal(ran('marketing'), false);

  // Exactly the analytics placeholder was upgraded; marketing stays inert.
  const activated = dom.window.document.querySelectorAll(`script[${ACTIVATED_ATTR}]`);
  assert.equal(activated.length, 1);
  assert.equal(activated[0].getAttribute('data-cc-category'), 'analytics');
  assert.equal(activated[0].getAttribute('type'), null); // executable, not text/plain

  const stillInert = dom.window.document.querySelectorAll(`script[type="${INERT_SCRIPT_TYPE}"]`);
  assert.equal(stillInert.length, 1);
  assert.equal(stillInert[0].getAttribute('data-cc-category'), 'marketing');

  blocker.disconnect();
});

test('external (data-cc-src) placeholder becomes a real src script', () => {
  const s = dom.window.document.createElement('script');
  s.type = INERT_SCRIPT_TYPE;
  s.setAttribute('data-cc-category', 'analytics');
  s.setAttribute('data-cc-src', 'https://cdn.example.com/a.js');
  dom.window.document.body.appendChild(s);

  const blocker = createScriptBlocker(config);
  blocker.applyConsent(stateGranting('analytics'));

  const real = dom.window.document.querySelector(`script[${ACTIVATED_ATTR}]`) as HTMLScriptElement;
  assert.ok(real);
  assert.equal(real.getAttribute('type'), null);
  assert.equal(real.getAttribute('src'), 'https://cdn.example.com/a.js');
  assert.equal(real.hasAttribute('data-cc-src'), false);
  // No async/defer on the source → forced ordered execution.
  assert.equal(real.async, false);

  blocker.disconnect();
});

/* --------------------------- config.scripts channel ----------------------- */

test('config.scripts inject on grant and never double-inject', () => {
  const cfg = mergeConfig({
    scripts: [
      { id: 'ga', category: 'analytics', type: 'inline', value: 'window.__ran.cfgGa = true;', async: false },
      { id: 'fb', category: 'marketing', type: 'inline', value: 'window.__ran.cfgFb = true;', async: false },
    ],
  });

  const blocker = createScriptBlocker(cfg);
  blocker.applyConsent(stateGranting('analytics'));

  assert.equal(ran('cfgGa'), true);
  assert.equal(ran('cfgFb'), false);

  // Idempotent: re-applying the same state must not inject a second copy.
  blocker.applyConsent(stateGranting('analytics'));
  assert.equal(dom.window.document.querySelectorAll('script[data-cc-script-id="ga"]').length, 1);

  blocker.disconnect();
});

/* ------------------------ mutation-added late embeds ---------------------- */

test('a mutation-added tagged script gets gated (activated when granted)', async () => {
  const blocker = createScriptBlocker(config);
  blocker.applyConsent(stateGranting('analytics'));

  // Late-injected embed for an already-granted category.
  addInlinePlaceholder('analytics', 'lateAnalytics');
  // Late-injected embed for a denied category.
  addInlinePlaceholder('marketing', 'lateMarketing');

  await flush();

  assert.equal(ran('lateAnalytics'), true);
  assert.equal(ran('lateMarketing'), false);

  blocker.disconnect();
});

test('after disconnect, mutation-added scripts are no longer gated', async () => {
  const blocker = createScriptBlocker(config);
  blocker.applyConsent(stateGranting('analytics'));
  blocker.disconnect();

  addInlinePlaceholder('analytics', 'postDisconnect');
  await flush();

  assert.equal(ran('postDisconnect'), false);
});

/* ------------------------ reacts to consent changes ----------------------- */

test('newly-granted category activates immediately via onConsentChange', () => {
  addInlinePlaceholder('marketing', 'marketing');

  const blocker = createScriptBlocker(config);
  blocker.applyConsent(stateGranting()); // nothing granted yet
  assert.equal(ran('marketing'), false);

  // Visitor updates preferences to allow marketing.
  emitConsentChange(stateGranting('marketing'));
  assert.equal(ran('marketing'), true);

  blocker.disconnect();
});

test('activateCategory refuses a category that is not currently granted', () => {
  addInlinePlaceholder('analytics', 'analytics');
  const blocker = createScriptBlocker(config);
  blocker.applyConsent(stateGranting()); // analytics denied

  assert.equal(blocker.activateCategory('analytics'), 0);
  assert.equal(ran('analytics'), false);

  blocker.disconnect();
});

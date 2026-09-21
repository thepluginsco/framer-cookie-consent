/**
 * Unit tests for the runtime A/B variant resolver (Phase 4.1 impure half).
 *
 * `resolveActiveVariant` owns stickiness + randomness. We install a fake
 * `localStorage` to drive the sticky path deterministically (pre-seed a valid
 * assignment and assert it's reused; corrupt/stale it and assert a re-pick), and
 * assert the inert case is a cheap no-op that never touches storage. Run with
 * `vitest run`.
 */

import { test, beforeEach } from 'vitest';
import assert from 'node:assert/strict';

import { mergeConfig, abTestSignature, type CookieConsentConfig } from '@framer-cookie-consent/shared';
import { resolveActiveVariant, VARIANT_STORAGE_KEY } from '../runtime/src/variant.ts';

/* A minimal in-memory localStorage installed on the global for each test. */
class FakeStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  get size(): number {
    return this.map.size;
  }
}

let store: FakeStorage;
beforeEach(() => {
  store = new FakeStorage();
  (globalThis as { localStorage?: unknown }).localStorage = store as unknown as Storage;
});

function abConfig(): CookieConsentConfig {
  return mergeConfig({
    strings: { title: 'Base' },
    abTest: {
      enabled: true,
      variants: [
        { id: 'A', label: 'A', weight: 1, strings: { title: 'Copy A' } },
        { id: 'B', label: 'B', weight: 1, strings: { title: 'Copy B' } },
      ],
    },
  });
}

test('no active test → base config, null id, storage untouched', () => {
  const base = mergeConfig({ strings: { title: 'Base' } });
  const out = resolveActiveVariant(base);
  assert.equal(out.variantId, null);
  assert.equal(out.config, base);
  assert.equal(store.size, 0);
});

test('a single-variant "test" is inert (no bucketing)', () => {
  const cfg = mergeConfig({ abTest: { enabled: true, variants: [{ id: 'A', weight: 1 }] } });
  const out = resolveActiveVariant(cfg);
  assert.equal(out.variantId, null);
  assert.equal(store.size, 0);
});

test('fresh visitor → picks a valid variant, persists it, applies its copy', () => {
  const cfg = abConfig();
  const out = resolveActiveVariant(cfg);
  assert.ok(out.variantId === 'A' || out.variantId === 'B');
  // The chosen variant's presentation is applied.
  assert.equal(out.config.strings.title, out.variantId === 'A' ? 'Copy A' : 'Copy B');
  // It was persisted with the current signature.
  const raw = store.getItem(VARIANT_STORAGE_KEY);
  assert.ok(raw);
  const saved = JSON.parse(raw as string);
  assert.equal(saved.id, out.variantId);
  assert.equal(saved.sig, abTestSignature(cfg.abTest));
});

test('sticky: a valid stored assignment is reused verbatim', () => {
  const cfg = abConfig();
  store.setItem(VARIANT_STORAGE_KEY, JSON.stringify({ sig: abTestSignature(cfg.abTest), id: 'B' }));
  const out = resolveActiveVariant(cfg);
  assert.equal(out.variantId, 'B');
  assert.equal(out.config.strings.title, 'Copy B');
});

test('stale signature → re-picks and overwrites (self-invalidates on edit)', () => {
  const cfg = abConfig();
  store.setItem(VARIANT_STORAGE_KEY, JSON.stringify({ sig: 'OLD:1|SIG:1', id: 'B' }));
  const out = resolveActiveVariant(cfg);
  assert.ok(out.variantId === 'A' || out.variantId === 'B');
  assert.equal(JSON.parse(store.getItem(VARIANT_STORAGE_KEY) as string).sig, abTestSignature(cfg.abTest));
});

test('stored id no longer exists → re-picks a current variant', () => {
  const cfg = abConfig();
  store.setItem(VARIANT_STORAGE_KEY, JSON.stringify({ sig: abTestSignature(cfg.abTest), id: 'Z' }));
  const out = resolveActiveVariant(cfg);
  assert.ok(out.variantId === 'A' || out.variantId === 'B');
});

test('malformed stored JSON is ignored (falls back to a fresh pick)', () => {
  const cfg = abConfig();
  store.setItem(VARIANT_STORAGE_KEY, '{not json');
  const out = resolveActiveVariant(cfg);
  assert.ok(out.variantId === 'A' || out.variantId === 'B');
});

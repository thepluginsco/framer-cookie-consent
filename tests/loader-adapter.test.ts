/**
 * Unit tests for the platform-neutral ADAPTER SEAM extracted into the core in
 * Phase 2.1 (`@framer-cookie-consent/shared`): `installLoader` / `removeLoader`
 * driving an arbitrary {@link PlatformAdapter}.
 *
 * These prove the orchestration is host-agnostic — a ~20-line in-memory adapter
 * (the shape every Phase 3 platform fills in) is enough to install, idempotently
 * re-install, and remove the loader while preserving unrelated custom code.
 *
 * Run with `vitest run`.
 */

import { test, expect } from 'vitest';
import assert from 'node:assert/strict';

import {
  mergeConfig,
  installLoader,
  removeLoader,
  hasBlock,
  MARKER_START,
  MARKER_END,
  runtimeScriptUrl,
  RUNTIME_VERSION,
  type PlatformAdapter,
} from '@framer-cookie-consent/shared';

/** A minimal in-memory adapter: the region is just a string cell. */
function memoryAdapter(initial = '') {
  const state = { region: initial as string | null, writes: 0 };
  const adapter: PlatformAdapter = {
    async readLoaderRegion() {
      return state.region ?? '';
    },
    async writeLoaderRegion(html) {
      state.region = html;
      state.writes += 1;
    },
  };
  return { adapter, state };
}

test('installLoader: writes a marker-wrapped block into an empty region', async () => {
  const { adapter, state } = memoryAdapter();
  const wrote = await installLoader(adapter, mergeConfig());
  assert.equal(wrote, true);
  assert.equal(state.writes, 1);
  assert.ok(typeof state.region === 'string' && state.region.includes(MARKER_START));
  assert.ok(state.region!.trimEnd().endsWith(MARKER_END));
  assert.ok(hasBlock(state.region!));
});

test('installLoader: preserves unrelated custom code already in the region', async () => {
  const other = '<meta name="other-plugin" content="x">';
  const { adapter, state } = memoryAdapter(other);
  await installLoader(adapter, mergeConfig());
  assert.ok(state.region!.includes(other));
  assert.ok(hasBlock(state.region!));
});

test('installLoader: re-installing an identical config is a churn-free no-op', async () => {
  const { adapter, state } = memoryAdapter();
  await installLoader(adapter, mergeConfig());
  assert.equal(state.writes, 1);
  const wrote = await installLoader(adapter, mergeConfig());
  assert.equal(wrote, false);
  assert.equal(state.writes, 1); // no second write
});

test('installLoader: honours a runtimeUrl override', async () => {
  const { adapter, state } = memoryAdapter();
  await installLoader(adapter, mergeConfig(), { runtimeUrl: 'https://cdn.example.test/x.js' });
  assert.ok(state.region!.includes('<script src="https://cdn.example.test/x.js" defer></script>'));
});

test('removeLoader: strips only our block and keeps the rest', async () => {
  const other = '<meta name="other" content="y">';
  const { adapter, state } = memoryAdapter(other);
  await installLoader(adapter, mergeConfig());
  const wrote = await removeLoader(adapter);
  assert.equal(wrote, true);
  assert.equal(state.region, other);
  assert.equal(hasBlock(state.region ?? ''), false);
});

test('removeLoader: clears the region to null when nothing else remains', async () => {
  const { adapter, state } = memoryAdapter();
  await installLoader(adapter, mergeConfig());
  await removeLoader(adapter);
  assert.equal(state.region, null);
});

test('removeLoader: no-op (no write) when our block is absent', async () => {
  const { adapter, state } = memoryAdapter('<meta name="other" content="z">');
  const wrote = await removeLoader(adapter);
  assert.equal(wrote, false);
  assert.equal(state.writes, 0);
});

test('runtime CDN URL is version-pinned to the current tag', () => {
  expect(runtimeScriptUrl()).toContain(`@${RUNTIME_VERSION}/`);
  expect(runtimeScriptUrl()).toContain('cdn.jsdelivr.net/gh/');
});

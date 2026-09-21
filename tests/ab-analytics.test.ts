/**
 * Unit tests for the A/B / region dimensions on the analytics event (Phase 4.1).
 *
 * `buildConsentEvent` must attach `variant`/`region` ONLY when supplied (so a
 * non-tested site keeps emitting its exact prior payload), and `regionBucket`
 * must collapse a RegionInfo to the small, privacy-safe label set the worker and
 * dashboard agree on. Run with `vitest run`.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { mergeConfig } from '@framer-cookie-consent/shared';
import { buildConsentEvent } from '../runtime/src/analytics.ts';
import type { ConsentState } from '../runtime/src/consent-state.ts';
import { regionBucket, type RegionInfo } from '../runtime/src/geo.ts';

const config = mergeConfig();

function state(categories: Record<string, boolean>): ConsentState {
  return { version: config.behavior.reconsentVersion, timestamp: Date.now(), categories };
}

/* --------------------------- event dimensions ----------------------------- */

test('buildConsentEvent: no context → no variant/region keys (payload unchanged)', () => {
  const e = buildConsentEvent(config, state({ necessary: true, analytics: true }));
  assert.equal('variant' in e, false);
  assert.equal('region' in e, false);
});

test('buildConsentEvent: attaches variant + region when provided', () => {
  const e = buildConsentEvent(config, state({ necessary: true, analytics: true }), { variant: 'B', region: 'EU' });
  assert.equal(e.variant, 'B');
  assert.equal(e.region, 'EU');
});

test('buildConsentEvent: empty-string context values are omitted', () => {
  const e = buildConsentEvent(config, state({ necessary: true }), { variant: '', region: '' });
  assert.equal('variant' in e, false);
  assert.equal('region' in e, false);
});

test('buildConsentEvent: one dimension without the other', () => {
  const e = buildConsentEvent(config, state({ necessary: true }), { variant: 'A' });
  assert.equal(e.variant, 'A');
  assert.equal('region' in e, false);
});

/* ------------------------------ regionBucket ------------------------------ */

function region(over: Partial<RegionInfo>): RegionInfo {
  return { region: 'OTHER', isEU: false, isUK: false, isCalifornia: false, certain: true, ...over };
}

test('regionBucket: maps each regulatory zone to a coarse label', () => {
  assert.equal(regionBucket(region({ region: 'US-CA', isCalifornia: true })), 'US-CA');
  assert.equal(regionBucket(region({ region: 'GB', isUK: true })), 'UK');
  assert.equal(regionBucket(region({ region: 'CH' })), 'CH');
  assert.equal(regionBucket(region({ region: 'DE', isEU: true })), 'EU');
  assert.equal(regionBucket(region({ region: 'UNKNOWN', certain: false })), 'UNKNOWN');
  assert.equal(regionBucket(region({ region: 'US' })), 'OTHER');
});

test('regionBucket: California precedence over a US read', () => {
  assert.equal(regionBucket(region({ region: 'US-CA', isCalifornia: true })), 'US-CA');
});

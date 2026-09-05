/**
 * Unit tests for the client-side Lemon Squeezy license logic.
 *
 * Two pure surfaces plus the client are exercised with NO real network:
 * - `resolveTierFrom` — maps a license `meta` (store/product/variant) to a tier,
 *   rejecting keys from another store or an unknown product.
 * - `entitlementsFor` / `hasFeature` — derive unlocked features from a tier.
 * - `createLicenseClient` — with an injected `fetch` returning canned responses,
 *   so validate/activate mapping and error handling are verified deterministically.
 *
 * Run with `vitest run`.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  entitlementsFor,
  hasFeature,
} from '../plugin/src/lib/entitlements.ts';
import {
  createLicenseClient,
  resolveTierFrom,
  LicenseNetworkError,
  LicenseRateLimitError,
  type LicenseMeta,
} from '../plugin/src/lib/license.ts';
import type { ProductRef, PaidTier } from '../plugin/src/lib/licenseConfig.ts';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/** A test store id, distinct from the placeholder so the test is hermetic. */
const STORE = 55555;

/** A test product/variant table (one per paid tier). */
const PRODUCTS: Readonly<Record<PaidTier, ProductRef>> = {
  lifetime: { productId: 100, variantId: 1001 },
  pro: { productId: 200, variantId: 2001 },
  agency: { productId: 300, variantId: 3001 },
};

/** Build a full `meta` block for the given store/product/variant. */
function meta(partial: Partial<LicenseMeta>): LicenseMeta {
  return {
    store_id: STORE,
    order_id: 1,
    order_item_id: 1,
    product_id: 200,
    product_name: 'Consentful Pro',
    variant_id: 2001,
    variant_name: 'Pro',
    customer_id: 1,
    customer_name: 'Ada',
    customer_email: 'ada@example.com',
    ...partial,
  };
}

/** A minimal Lemon Squeezy `license_key` block. */
function licenseKey(status = 'active') {
  return {
    id: 1,
    status,
    key: 'KEY',
    activation_limit: 3,
    activation_usage: 1,
    created_at: '2026-01-01',
    expires_at: null,
  };
}

/** An injectable `fetch` that returns one canned JSON response. */
function mockFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

/** An injectable `fetch` that fails at the transport layer (offline). */
const offlineFetch: typeof fetch = (async () => {
  throw new Error('network down');
}) as unknown as typeof fetch;

/* -------------------------------------------------------------------------- */
/* resolveTierFrom — tier mapping                                              */
/* -------------------------------------------------------------------------- */

test('resolveTierFrom: variant id resolves the tier', () => {
  assert.equal(resolveTierFrom(meta({ variant_id: 2001, product_id: 200 }), STORE, PRODUCTS), 'pro');
  assert.equal(resolveTierFrom(meta({ variant_id: 1001, product_id: 100 }), STORE, PRODUCTS), 'lifetime');
  assert.equal(resolveTierFrom(meta({ variant_id: 3001, product_id: 300 }), STORE, PRODUCTS), 'agency');
});

test('resolveTierFrom: falls back to product id when the variant is unknown', () => {
  // Variant 9999 matches nothing, but product 300 is agency.
  assert.equal(resolveTierFrom(meta({ variant_id: 9999, product_id: 300 }), STORE, PRODUCTS), 'agency');
});

test('resolveTierFrom: variant match wins over a different product match', () => {
  // Variant says pro, product says agency → the more specific variant wins.
  assert.equal(resolveTierFrom(meta({ variant_id: 2001, product_id: 300 }), STORE, PRODUCTS), 'pro');
});

test('resolveTierFrom: rejects a key from a different store', () => {
  assert.equal(resolveTierFrom(meta({ store_id: 99999 }), STORE, PRODUCTS), null);
});

test('resolveTierFrom: rejects an unknown product/variant', () => {
  assert.equal(resolveTierFrom(meta({ variant_id: 8, product_id: 9 }), STORE, PRODUCTS), null);
});

test('resolveTierFrom: compares ids loosely (string vs number)', () => {
  const asStrings = meta({
    store_id: String(STORE) as unknown as number,
    variant_id: '2001' as unknown as number,
    product_id: '200' as unknown as number,
  });
  assert.equal(resolveTierFrom(asStrings, STORE, PRODUCTS), 'pro');
});

/* -------------------------------------------------------------------------- */
/* entitlementsFor — tier → features                                           */
/* -------------------------------------------------------------------------- */

test('entitlementsFor: trial unlocks nothing', () => {
  const e = entitlementsFor('trial');
  assert.equal(e.whiteLabel, false);
  assert.equal(e.multiSite, false);
  assert.equal(e.accurateGeo, false);
  assert.equal(e.maxSites, 0);
});

test('entitlementsFor: pro unlocks white-label but not multi-site', () => {
  const e = entitlementsFor('pro');
  assert.equal(e.whiteLabel, true);
  assert.equal(e.accurateGeo, true);
  assert.equal(e.multiSite, false);
  assert.equal(e.maxSites, 1);
});

test('entitlementsFor: lifetime matches pro entitlements (single site, white-label)', () => {
  const e = entitlementsFor('lifetime');
  assert.equal(e.whiteLabel, true);
  assert.equal(e.multiSite, false);
  assert.equal(e.maxSites, 1);
});

test('entitlementsFor: agency unlocks multi-site + unlimited sites', () => {
  const e = entitlementsFor('agency');
  assert.equal(e.whiteLabel, true);
  assert.equal(e.multiSite, true);
  assert.equal(e.maxSites, Infinity);
});

test('hasFeature: reflects the tier table', () => {
  assert.equal(hasFeature('trial', 'whiteLabel'), false);
  assert.equal(hasFeature('pro', 'whiteLabel'), true);
  assert.equal(hasFeature('pro', 'multiSite'), false);
  assert.equal(hasFeature('agency', 'multiSite'), true);
  // maxSites (a number) is truthy when > 0.
  assert.equal(hasFeature('pro', 'maxSites'), true);
  assert.equal(hasFeature('trial', 'maxSites'), false);
});

/* -------------------------------------------------------------------------- */
/* createLicenseClient — validate/activate with mocked responses               */
/* -------------------------------------------------------------------------- */

test('validateKey: a valid key from our store maps to its tier + entitlements', async () => {
  const client = createLicenseClient({
    fetchFn: mockFetch(200, {
      valid: true,
      error: null,
      license_key: licenseKey('active'),
      instance: { id: 'inst_9', name: 'site', created_at: '2026' },
      meta: meta({ variant_id: 2001, product_id: 200 }),
    }),
    storeId: STORE,
    products: PRODUCTS,
  });

  const v = await client.validateKey('KEY');
  assert.equal(v.valid, true);
  assert.equal(v.tier, 'pro');
  assert.equal(v.status, 'active');
  assert.equal(v.whiteLabel, true);
  assert.equal(v.instanceId, 'inst_9');
});

test('validateKey: a key from another store is rejected (valid: false, tier: null)', async () => {
  const client = createLicenseClient({
    fetchFn: mockFetch(200, {
      valid: true,
      error: null,
      license_key: licenseKey('active'),
      instance: null,
      meta: meta({ store_id: 99999 }),
    }),
    storeId: STORE,
    products: PRODUCTS,
  });

  const v = await client.validateKey('KEY');
  assert.equal(v.valid, false);
  assert.equal(v.tier, null);
  assert.equal(v.whiteLabel, false);
});

test('validateKey: an expired key surfaces status but is not valid', async () => {
  const client = createLicenseClient({
    fetchFn: mockFetch(200, {
      valid: false,
      error: 'license_key expired',
      license_key: licenseKey('expired'),
      instance: null,
      meta: meta({ variant_id: 2001 }),
    }),
    storeId: STORE,
    products: PRODUCTS,
  });

  const v = await client.validateKey('KEY');
  assert.equal(v.valid, false);
  assert.equal(v.status, 'expired');
  assert.equal(v.tier, null);
});

test('validateKey: a not-found key (404) resolves invalid without throwing', async () => {
  const client = createLicenseClient({
    fetchFn: mockFetch(404, {
      valid: false,
      error: 'license_key not found',
      license_key: null,
      instance: null,
      meta: null,
    }),
    storeId: STORE,
    products: PRODUCTS,
  });

  const v = await client.validateKey('NOPE');
  assert.equal(v.valid, false);
  assert.equal(v.tier, null);
  assert.equal(v.status, 'unknown');
  assert.equal(v.meta, null);
});

test('validateKey: HTTP 429 throws a rate-limit error (caller falls back to cache)', async () => {
  const client = createLicenseClient({
    fetchFn: mockFetch(429, {}),
    storeId: STORE,
    products: PRODUCTS,
  });

  await assert.rejects(() => client.validateKey('KEY'), (err: unknown) => {
    assert.ok(err instanceof LicenseRateLimitError);
    assert.ok(err instanceof LicenseNetworkError);
    assert.equal((err as LicenseNetworkError).httpStatus, 429);
    return true;
  });
});

test('validateKey: a transport failure throws LicenseNetworkError with status 0', async () => {
  const client = createLicenseClient({ fetchFn: offlineFetch, storeId: STORE, products: PRODUCTS });

  await assert.rejects(() => client.validateKey('KEY'), (err: unknown) => {
    assert.ok(err instanceof LicenseNetworkError);
    assert.equal((err as LicenseNetworkError).httpStatus, 0);
    return true;
  });
});

test('validateKey: a 5xx throws LicenseNetworkError (transient, not "invalid")', async () => {
  const client = createLicenseClient({ fetchFn: mockFetch(503, {}), storeId: STORE, products: PRODUCTS });
  await assert.rejects(() => client.validateKey('KEY'), LicenseNetworkError);
});

test('activateKey: maps `activated` onto `valid` and returns the new instance id', async () => {
  const client = createLicenseClient({
    fetchFn: mockFetch(200, {
      activated: true,
      error: null,
      license_key: licenseKey('active'),
      instance: { id: 'inst_new', name: 'proj_123', created_at: '2026' },
      meta: meta({ variant_id: 3001, product_id: 300 }),
    }),
    storeId: STORE,
    products: PRODUCTS,
  });

  const v = await client.activateKey('KEY', 'proj_123');
  assert.equal(v.valid, true);
  assert.equal(v.tier, 'agency');
  assert.equal(v.instanceId, 'inst_new');
  assert.equal(v.whiteLabel, true);
});

test('deactivateKey: returns true when the instance is released', async () => {
  const client = createLicenseClient({
    fetchFn: mockFetch(200, { deactivated: true, error: null }),
    storeId: STORE,
    products: PRODUCTS,
  });
  assert.equal(await client.deactivateKey('KEY', 'inst_9'), true);
});

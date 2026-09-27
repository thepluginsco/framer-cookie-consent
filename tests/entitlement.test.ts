/**
 * Unit tests for the runtime's boot-time entitlement resolver
 * (`runtime/src/entitlement.ts`).
 *
 * Exercises the whole fetch → verify → cache path against a MOCK licensing API:
 * a fake `fetch` serves a `/public/site-entitlement` response and a
 * `/.well-known/jwks.json`, and real ES256 tokens are minted with Node's
 * WebCrypto (as in `license-token.test.ts`) so verification runs end-to-end.
 *
 * Every failure mode must fail CLOSED (→ `null` → free tier): a dev/unlicensed
 * host (no token), an expired or wrong-domain token, an unreachable API, and a
 * malformed response. A valid token yields the entitlement, and a cached token
 * is reused without hitting the entitlement endpoint again.
 *
 * Run with `vitest run`.
 */

import { test, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';

import { resolveEntitlement, resolveSiteStatus } from '../runtime/src/entitlement.ts';
import type { Jwk } from '../runtime/src/license-token.ts';

const subtle = globalThis.crypto.subtle;
const API = 'https://api.test';
const KEY = 'pk_test';

/* ------------------------------ token minting ----------------------------- */

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlJson(obj: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function makeKey(): Promise<{ priv: CryptoKey; jwk: Jwk }> {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = (await subtle.exportKey('jwk', pair.publicKey)) as Jwk;
  jwk.kid = 'kid-1';
  jwk.alg = 'ES256';
  return { priv: pair.privateKey, jwk };
}

const nowSec = () => Math.floor(Date.now() / 1000);

async function signToken(priv: CryptoKey, over: Record<string, unknown> = {}): Promise<string> {
  const header = { alg: 'ES256', kid: 'kid-1', typ: 'JWT' };
  const payload = {
    sub: 'lic_1',
    aud: 'acme.com',
    status: 'active',
    type: 'monthly',
    plan: { slug: 'pro', name: 'Pro' },
    features: { white_label: { kind: 'flag', value: true } },
    iat: nowSec(),
    exp: nowSec() + 3600,
    ...over,
  };
  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = new Uint8Array(
    await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, new TextEncoder().encode(signingInput)),
  );
  return `${signingInput}.${b64url(sig)}`;
}

/* ------------------------------- fetch mock ------------------------------- */

type Calls = { entitlement: number; jwks: number };

/**
 * A `fetch` that serves the entitlement endpoint (POST) with the given `token`
 * (or a builder receiving the posted domain) and the JWKS (GET) with `keys`.
 * Records how often each endpoint was hit. `fail` makes every call reject.
 */
function mockFetch(opts: {
  token?: string | null | ((domain: string) => string | null);
  keys?: Jwk[];
  fail?: boolean;
  badJson?: boolean;
  /** Raw body override for the entitlement endpoint (activation-status tests). */
  body?: Record<string, unknown>;
}): { fetch: typeof fetch; calls: Calls } {
  const calls: Calls = { entitlement: 0, jwks: 0 };
  const fn = (async (url: string, init?: RequestInit) => {
    if (opts.fail) throw new Error('network down');
    const u = String(url);
    if (u.endsWith('/.well-known/jwks.json')) {
      calls.jwks++;
      return new Response(JSON.stringify({ keys: opts.keys ?? [] }), { status: 200 });
    }
    if (u.endsWith('/public/site-entitlement')) {
      calls.entitlement++;
      if (opts.badJson) return new Response('not json', { status: 200 });
      if (opts.body) return new Response(JSON.stringify(opts.body), { status: 200 });
      const body = JSON.parse(String(init?.body ?? '{}')) as { domain?: string };
      const token = typeof opts.token === 'function' ? opts.token(body.domain ?? '') : opts.token ?? null;
      return new Response(JSON.stringify({ status: token ? 'active' : 'dev', licensed: !!token, token }), {
        status: 200,
      });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

/* ---------------------------- localStorage stub --------------------------- */

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
});
afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
});

/* --------------------------------- tests ---------------------------------- */

test('a valid domain token resolves to its verified entitlement', async () => {
  const { priv, jwk } = await makeKey();
  const token = await signToken(priv);
  const { fetch, calls } = mockFetch({ token, keys: [jwk] });

  const ent = await resolveEntitlement('acme.com', { apiBase: API, publishableKey: KEY, fetchFn: fetch });
  assert.ok(ent, 'entitlement resolved');
  assert.equal(ent!.domain, 'acme.com');
  assert.equal(ent!.plan.slug, 'pro');
  assert.equal(calls.entitlement, 1);
  assert.equal(calls.jwks, 1, 'JWKS fetched to verify the fresh token');
});

test('with a cached JWKS, no key fetch happens at all', async () => {
  const { priv, jwk } = await makeKey();
  const token = await signToken(priv);
  localStorage.setItem('cc:ent:jwks', JSON.stringify({ keys: [jwk] }));
  const { fetch, calls } = mockFetch({ token, keys: [jwk] });
  const ent = await resolveEntitlement('acme.com', { apiBase: API, publishableKey: KEY, fetchFn: fetch });
  assert.ok(ent);
  assert.equal(calls.jwks, 0);
});

test('a dev / unlicensed host (no token) fails closed to null', async () => {
  const { fetch, calls } = mockFetch({ token: null });
  const ent = await resolveEntitlement('acme.com', { apiBase: API, publishableKey: KEY, fetchFn: fetch });
  assert.equal(ent, null);
  assert.equal(calls.entitlement, 1);
  // First visit: the JWKS is prefetched in parallel with the token (at most once).
  assert.ok(calls.jwks <= 1, 'JWKS fetched at most once');
});

test('a token minted for another domain is rejected (fails closed)', async () => {
  const { priv, jwk } = await makeKey();
  const token = await signToken(priv, { aud: 'acme.com' });
  const { fetch } = mockFetch({ token, keys: [jwk] });
  const ent = await resolveEntitlement('attacker.net', { apiBase: API, publishableKey: KEY, fetchFn: fetch });
  assert.equal(ent, null, 'the domain-locked token cannot unlock another host');
});

test('an expired token fails closed', async () => {
  const { priv, jwk } = await makeKey();
  // Well past the verifier's 60s clock-skew tolerance.
  const token = await signToken(priv, { exp: nowSec() - 3600, iat: nowSec() - 7200 });
  const { fetch } = mockFetch({ token, keys: [jwk] });
  const ent = await resolveEntitlement('acme.com', { apiBase: API, publishableKey: KEY, fetchFn: fetch });
  assert.equal(ent, null);
});

test('an unreachable API fails closed', async () => {
  const { fetch } = mockFetch({ fail: true });
  const ent = await resolveEntitlement('acme.com', { apiBase: API, publishableKey: KEY, fetchFn: fetch });
  assert.equal(ent, null);
});

test('a malformed entitlement response fails closed', async () => {
  const { fetch } = mockFetch({ badJson: true });
  const ent = await resolveEntitlement('acme.com', { apiBase: API, publishableKey: KEY, fetchFn: fetch });
  assert.equal(ent, null);
});

test('a cached token is reused on the next visit without re-hitting the entitlement endpoint', async () => {
  const { priv, jwk } = await makeKey();
  const token = await signToken(priv);
  const { fetch, calls } = mockFetch({ token, keys: [jwk] });

  const first = await resolveEntitlement('acme.com', { apiBase: API, publishableKey: KEY, fetchFn: fetch });
  assert.ok(first);
  assert.equal(calls.entitlement, 1);

  // Second call: the token + JWKS are cached in localStorage, so it verifies
  // offline and never calls the entitlement endpoint again.
  const second = await resolveEntitlement('acme.com', { apiBase: API, publishableKey: KEY, fetchFn: fetch });
  assert.ok(second, 'still licensed from cache');
  assert.equal(calls.entitlement, 1, 'entitlement endpoint not hit again');
});

/* --------------------------- activation status ---------------------------- */

const opts = (fetchFn: typeof fetch) => ({ apiBase: API, publishableKey: KEY, fetchFn });

test('a FREE-activated domain (no token) is activated → basic banner', async () => {
  const { fetch } = mockFetch({ body: { status: 'free', licensed: false, activated: true, token: null } });
  const s = await resolveSiteStatus('acme.com', opts(fetch));
  assert.equal(s.entitlement, null);
  assert.equal(s.activated, true);
});

test('an explicitly NOT-activated domain reports activated:false → no banner', async () => {
  const { fetch } = mockFetch({ body: { status: 'unlicensed', licensed: false, activated: false, token: null } });
  const s = await resolveSiteStatus('acme.com', opts(fetch));
  assert.equal(s.activated, false);
});

test('a portal "dev" verdict never hides the banner', async () => {
  const { fetch } = mockFetch({ body: { status: 'dev', licensed: false, activated: false, token: null } });
  assert.equal((await resolveSiteStatus('acme.com', opts(fetch))).activated, null);
});

test('an older API without `activated` is unknown (never hides the banner)', async () => {
  const { fetch } = mockFetch({ body: { status: 'unlicensed', licensed: false, token: null } });
  assert.equal((await resolveSiteStatus('acme.com', opts(fetch))).activated, null);
});

test('offline / malformed responses are unknown, not "not activated"', async () => {
  assert.equal((await resolveSiteStatus('acme.com', opts(mockFetch({ fail: true }).fetch))).activated, null);
  assert.equal((await resolveSiteStatus('acme.com', opts(mockFetch({ badJson: true }).fetch))).activated, null);
});

test('a paid token counts as activated', async () => {
  const { priv, jwk } = await makeKey();
  const { fetch } = mockFetch({ token: await signToken(priv), keys: [jwk] });
  const s = await resolveSiteStatus('acme.com', opts(fetch));
  assert.ok(s.entitlement);
  assert.equal(s.activated, true);
});

test('a free activation is cached per host, so repeat visits skip the API', async () => {
  const { fetch, calls } = mockFetch({ body: { status: 'free', licensed: false, activated: true, token: null } });
  await resolveSiteStatus('acme.com', opts(fetch));
  const again = await resolveSiteStatus('acme.com', opts(fetch));
  assert.equal(again.activated, true);
  assert.equal(calls.entitlement, 1);
  // A different host never reuses it.
  await resolveSiteStatus('other.com', opts(fetch));
  assert.equal(calls.entitlement, 2);
});

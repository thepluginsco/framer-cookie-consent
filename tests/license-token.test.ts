/**
 * Unit tests for the runtime's entitlement-token verifier (`license-token.ts`).
 *
 * Uses Node's WebCrypto (`globalThis.crypto.subtle`) to mint a throwaway ES256
 * key pair and sign real tokens, so the verifier is exercised end-to-end without
 * the live portal. Covers: a valid token, subdomain coverage, wrong-domain
 * rejection, expiry, a tampered signature, an unknown `kid`, and a non-ES256 alg.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { verifyToken, hostMatchesAudience, decodeJwt, type Jwk } from '../runtime/src/license-token.ts';

const subtle = globalThis.crypto.subtle;

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
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const jwk = (await subtle.exportKey('jwk', pair.publicKey)) as Jwk;
  jwk.kid = 'test-kid-1';
  jwk.alg = 'ES256';
  return { priv: pair.privateKey, jwk };
}

/** Sign a JWT (ES256, raw r||s signature) with the given claims + header. */
async function signToken(
  priv: CryptoKey,
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'ES256', kid: 'test-kid-1', typ: 'JWT' },
): Promise<string> {
  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = new Uint8Array(
    await subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      priv,
      new TextEncoder().encode(signingInput),
    ),
  );
  return `${signingInput}.${b64url(sig)}`;
}

/** A resolver that always returns the given key (mimics seeded JWKS). */
const keyResolver = (jwk: Jwk) => async () => jwk;

const nowSec = () => Math.floor(Date.now() / 1000);
const baseClaims = (over: Record<string, unknown> = {}) => ({
  sub: 'lic_123',
  aud: 'example.com',
  status: 'active',
  type: 'monthly',
  plan: { slug: 'studio', name: 'Studio' },
  features: { white_label: { kind: 'flag', value: true } },
  iat: nowSec(),
  exp: nowSec() + 3600,
  ...over,
});

/* --------------------------------- tests ---------------------------------- */

test('hostMatchesAudience covers the registrable domain, its subdomains, and aliases', () => {
  assert.equal(hostMatchesAudience('example.com', 'example.com', []), true);
  assert.equal(hostMatchesAudience('shop.example.com', 'example.com', []), true);
  assert.equal(hostMatchesAudience('EXAMPLE.com.', 'example.com', []), true, 'case + trailing dot');
  assert.equal(hostMatchesAudience('evil.com', 'example.com', []), false);
  assert.equal(hostMatchesAudience('notexample.com', 'example.com', []), false, 'suffix must be dot-bounded');
  assert.equal(hostMatchesAudience('staging.acme.dev', 'example.com', ['staging.acme.dev']), true, 'alias');
});

test('a well-formed, signed token verifies and yields the entitlement', async () => {
  const { priv, jwk } = await makeKey();
  const token = await signToken(priv, baseClaims());
  const res = await verifyToken(token, { host: 'example.com', resolveKey: keyResolver(jwk) });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.entitlement.domain, 'example.com');
    assert.equal(res.entitlement.plan.slug, 'studio');
    assert.deepEqual(res.entitlement.features['white_label'], { kind: 'flag', value: true });
  }
});

test('a subdomain of the audience is entitled by the same token', async () => {
  const { priv, jwk } = await makeKey();
  const token = await signToken(priv, baseClaims());
  const res = await verifyToken(token, { host: 'blog.example.com', resolveKey: keyResolver(jwk) });
  assert.equal(res.ok, true);
});

test('a token minted for another domain is rejected (cannot be copied across sites)', async () => {
  const { priv, jwk } = await makeKey();
  const token = await signToken(priv, baseClaims({ aud: 'example.com' }));
  const res = await verifyToken(token, { host: 'attacker.net', resolveKey: keyResolver(jwk) });
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.reason, /not valid for host/);
});

test('an expired token fails closed', async () => {
  const { priv, jwk } = await makeKey();
  const token = await signToken(priv, baseClaims({ exp: nowSec() - 3600, iat: nowSec() - 7200 }));
  const res = await verifyToken(token, { host: 'example.com', resolveKey: keyResolver(jwk) });
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.reason, /expired/);
});

test('a token signed by a different key is rejected (invalid signature)', async () => {
  const { priv } = await makeKey();
  const other = await makeKey(); // verify against the WRONG public key
  const token = await signToken(priv, baseClaims());
  const res = await verifyToken(token, { host: 'example.com', resolveKey: keyResolver(other.jwk) });
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.reason, /Invalid signature/);
});

test('an unknown kid (no key resolved) is rejected', async () => {
  const { priv } = await makeKey();
  const token = await signToken(priv, baseClaims());
  const res = await verifyToken(token, { host: 'example.com', resolveKey: async () => null });
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.reason, /No public key/);
});

test('a non-ES256 alg is rejected before any crypto', async () => {
  const { priv, jwk } = await makeKey();
  const token = await signToken(priv, baseClaims(), { alg: 'HS256', kid: 'test-kid-1', typ: 'JWT' });
  const res = await verifyToken(token, { host: 'example.com', resolveKey: keyResolver(jwk) });
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.reason, /Unsupported alg/);
});

test('a malformed token decodes to null / rejects', async () => {
  assert.equal(decodeJwt('not-a-jwt'), null);
  const { jwk } = await makeKey();
  const res = await verifyToken('a.b', { host: 'example.com', resolveKey: keyResolver(jwk) });
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.reason, /Malformed/);
});

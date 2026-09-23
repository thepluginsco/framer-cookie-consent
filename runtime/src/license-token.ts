/**
 * Entitlement-token verification for the runtime — tamper-proof, offline-capable
 * feature gating.
 *
 * Verifies an ES256 (ECDSA P-256 + SHA-256) JWT against the portal's PUBLIC
 * JWK(s). This is the runtime-side port of the portal SDK's verifier
 * (`consentful-portal/packages/plugin-sdk/src/verify.ts`) — kept as a small,
 * dependency-free copy rather than an npm import so the runtime stays a
 * self-contained IIFE with zero external deps. The two must stay behaviourally
 * identical; if the portal verifier changes shape, mirror it here.
 *
 * The signature is verified once; `exp` and `aud` (the time- and host-sensitive
 * parts) are re-checked on every read, so a cached-but-expired token, or one
 * copied to another domain, fails closed. See the portal's
 * docs/SPEC-site-licensing.md §5 + §8.
 *
 * WHY this exists (vs. the legacy {@link module:license-gate}): the old gate
 * trusts a verdict baked into the injected `config.license`, which a visitor can
 * read and forge by copying a licensed site's published config. A domain-locked
 * signed token cannot be forged or moved between domains, so the runtime — not
 * the injected config — becomes authoritative about entitlement.
 */

/* -------------------------------------------------------------------------- */
/* Types (mirrored from the portal SDK; kept local to stay dependency-free)   */
/* -------------------------------------------------------------------------- */

/** A typed feature entitlement, mirrored from the portal's feature engine. */
export type FeatureValue =
  | { kind: 'flag'; value: boolean }
  | { kind: 'quota'; value: number | 'unlimited' }
  | { kind: 'tier'; value: string };

/** Feature flag/quota/tier map, keyed by feature id. */
export type FeatureSet = Record<string, FeatureValue>;

/** A JSON Web Key (public half). */
export type Jwk = Record<string, unknown> & { kid?: string; alg?: string };

/** The decoded (but not yet verified) parts of a JWT. */
export type JwtParts = {
  header: { alg?: string; kid?: string; typ?: string };
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Uint8Array;
};

/** The verified claims of an entitlement token. */
export type VerifiedEntitlement = {
  /** License id (`sub`). */
  licenseId: string;
  /** Registrable domain the token is valid for (`aud`). */
  domain: string;
  status: string;
  type: string;
  plan: { slug: string; name: string };
  features: FeatureSet;
  /** Expiry (epoch seconds). */
  exp: number;
  /** Issued-at (epoch seconds). */
  iat: number;
};

/* -------------------------------------------------------------------------- */
/* base64url                                                                  */
/* -------------------------------------------------------------------------- */

function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToString(b64url: string): string {
  return new TextDecoder().decode(b64urlToBytes(b64url));
}

/* -------------------------------------------------------------------------- */
/* JWT decode (no verification)                                               */
/* -------------------------------------------------------------------------- */

/**
 * Split and JSON-decode a JWT's header + payload WITHOUT verifying its signature.
 *
 * @param token - A compact-serialized JWT (`header.payload.signature`).
 * @returns The decoded parts, or `null` if the token is malformed.
 */
export function decodeJwt(token: string): JwtParts | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(b64urlToString(parts[0]!)) as JwtParts['header'];
    const payload = JSON.parse(b64urlToString(parts[1]!)) as Record<string, unknown>;
    return {
      header,
      payload,
      signingInput: `${parts[0]}.${parts[1]}`,
      signature: b64urlToBytes(parts[2]!),
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Signature verification                                                     */
/* -------------------------------------------------------------------------- */

function subtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error('WebCrypto (crypto.subtle) is unavailable in this runtime');
  }
  return c.subtle;
}

/**
 * Verify the ES256 signature of a decoded JWT against a public JWK.
 *
 * @param jwt - The decoded token parts (from {@link decodeJwt}).
 * @param jwk - The public JWK to verify against.
 * @returns `true` when the signature is valid for the signing input.
 */
export async function verifySignature(jwt: JwtParts, jwk: Jwk): Promise<boolean> {
  const key = await subtle().importKey(
    'jwk',
    jwk as JsonWebKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const data = new TextEncoder().encode(jwt.signingInput);
  // JOSE ES256 signatures are the raw r||s (64 bytes) WebCrypto expects.
  return subtle().verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    jwt.signature as BufferSource,
    data as BufferSource,
  );
}

/* -------------------------------------------------------------------------- */
/* Host / audience matching                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Whether `host` is covered by the token's `aud` (registrable domain) or one of
 * its `aud_aliases`. The registrable domain itself and any subdomain of it are
 * covered, so `shop.example.com` matches an `aud` of `example.com`.
 *
 * @param host - The current hostname (typically `location.hostname`).
 * @param aud - The token audience (a registrable domain).
 * @param aliases - Additional exact-match hostnames allowed by the token.
 * @returns `true` when the host is entitled by this audience.
 */
export function hostMatchesAudience(host: string, aud: string, aliases: string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  const a = aud.toLowerCase();
  if (h === a || h.endsWith(`.${a}`)) return true;
  return aliases.some((x) => h === x.toLowerCase());
}

/* -------------------------------------------------------------------------- */
/* Full verification                                                          */
/* -------------------------------------------------------------------------- */

/** Options controlling a full {@link verifyToken} pass. */
export type VerifyOptions = {
  /** Current host to match against the token's audience. */
  host: string;
  /** Expected issuer (`iss`). Optional. */
  issuer?: string;
  /** Resolve a public JWK by `kid` (seeded, cached, or fetched). */
  resolveKey: (kid: string | undefined) => Promise<Jwk | null>;
  /** Clock skew tolerance in seconds (default 60). */
  clockToleranceSec?: number;
};

/** Result of a full token verification. */
export type VerifyResult =
  | { ok: true; entitlement: VerifiedEntitlement }
  | { ok: false; reason: string };

/**
 * Verify a token fully: signature → issuer → expiry → audience → claims. Any
 * failure returns `{ ok: false, reason }` (fail-closed); the caller then treats
 * the site as free-tier.
 *
 * @param token - The compact JWT to verify.
 * @param opts - Host, key resolver, and optional issuer/skew (see {@link VerifyOptions}).
 * @returns The verified entitlement, or a reason for rejection.
 */
export async function verifyToken(token: string, opts: VerifyOptions): Promise<VerifyResult> {
  const jwt = decodeJwt(token);
  if (!jwt) return { ok: false, reason: 'Malformed token' };
  if (jwt.header.alg !== 'ES256') return { ok: false, reason: `Unsupported alg ${jwt.header.alg}` };

  const jwk = await opts.resolveKey(jwt.header.kid);
  if (!jwk) return { ok: false, reason: `No public key for kid ${jwt.header.kid ?? '(none)'}` };

  let valid = false;
  try {
    valid = await verifySignature(jwt, jwk);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Signature check failed' };
  }
  if (!valid) return { ok: false, reason: 'Invalid signature' };

  const p = jwt.payload;
  const skew = opts.clockToleranceSec ?? 60;
  const now = Math.floor(Date.now() / 1000);

  if (opts.issuer && p['iss'] !== opts.issuer) {
    return { ok: false, reason: 'Issuer mismatch' };
  }
  const exp = typeof p['exp'] === 'number' ? p['exp'] : 0;
  if (exp && now > exp + skew) return { ok: false, reason: 'Token expired' };

  const aud = typeof p['aud'] === 'string' ? p['aud'] : '';
  const aliases = Array.isArray(p['aud_aliases']) ? (p['aud_aliases'] as string[]) : [];
  if (!aud || !hostMatchesAudience(opts.host, aud, aliases)) {
    return { ok: false, reason: `Token not valid for host ${opts.host}` };
  }

  const plan = (p['plan'] as { slug?: string; name?: string } | undefined) ?? {};
  return {
    ok: true,
    entitlement: {
      licenseId: typeof p['sub'] === 'string' ? p['sub'] : '',
      domain: aud,
      status: typeof p['status'] === 'string' ? p['status'] : 'unknown',
      type: typeof p['type'] === 'string' ? p['type'] : 'unknown',
      plan: { slug: plan.slug ?? '', name: plan.name ?? '' },
      features: (p['features'] as FeatureSet) ?? {},
      exp,
      iat: typeof p['iat'] === 'number' ? p['iat'] : 0,
    },
  };
}

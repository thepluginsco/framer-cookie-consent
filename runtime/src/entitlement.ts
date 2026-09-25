/**
 * Entitlement resolution — the runtime's boot-time licensing check.
 *
 * At boot the runtime asks the Consentful licensing API, by the visitor's
 * hostname, whether this site holds an active license. The API returns a
 * short-lived, domain-scoped ES256 token; the runtime verifies it OFFLINE
 * against the portal JWKS ({@link module:license-token}) and derives entitlement
 * from the verified claims. Nothing about the verdict is trusted from the
 * injected config — a domain-locked signed token cannot be forged or copied to
 * another site (unlike the legacy config-baked verdict).
 *
 * Everything here FAILS CLOSED: any network error, timeout, malformed response,
 * `dev`/unlicensed status, or verification failure resolves to `null`, and the
 * caller renders the free-tier (basic) banner. Compliance (Consent Mode denials
 * + script blocking) runs regardless of this verdict, so failing closed never
 * makes a site *less* safe — it only degrades the banner presentation.
 *
 * Two caches (both `localStorage`, both best-effort) keep the common path fast
 * and offline-capable:
 * - the JWKS (public keys), so token verification needs no network on a repeat
 *   visit; and
 * - the last token, so a returning visitor unlocks instantly. The verifier
 *   re-checks `exp` + `aud` on every read, so a cached-but-expired token — or one
 *   copied to another domain — still fails closed.
 */

import {
  verifyToken,
  type Jwk,
  type VerifiedEntitlement,
} from './license-token.ts';
import {
  PORTAL_API_BASE,
  PORTAL_PUBLISHABLE_KEY,
  ENTITLEMENT_PATH,
  JWKS_PATH,
} from '@framer-cookie-consent/shared';

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

/** Inputs to {@link resolveEntitlement} (all optional; sensible defaults). */
export type EntitlementOptions = {
  /** Licensing-API origin (no trailing slash). Defaults to {@link PORTAL_API_BASE}. */
  apiBase?: string;
  /** Publishable `x-api-key`. Defaults to {@link PORTAL_PUBLISHABLE_KEY}. */
  publishableKey?: string;
  /** Network timeout per request in ms (default 3000 — a cold API + DB lookup can take ~2s). */
  timeoutMs?: number;
  /** Injectable `fetch` (defaults to the global) — for tests. */
  fetchFn?: typeof fetch;
  /** Expected token issuer (`iss`), if the portal sets one. */
  issuer?: string;
};

/* -------------------------------------------------------------------------- */
/* localStorage caches (best-effort)                                          */
/* -------------------------------------------------------------------------- */

const TOKEN_KEY = 'cc:ent:token';
const JWKS_KEY = 'cc:ent:jwks';

/** Read + JSON-parse a storage key, or `null` on any failure. */
function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Best-effort write; silently ignores quota / unavailable storage. */
function writeCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable / full — the network path still works */
  }
}

/* -------------------------------------------------------------------------- */
/* Fetch helper                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `fetch` with a hard timeout so a slow/hanging API never withholds the banner
 * beyond `timeoutMs`. Returns `null` on any transport/timeout failure. Mirrors
 * the abort pattern used by the geo endpoint resolver.
 */
async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response | null> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetchFn(url, {
      credentials: 'omit',
      cache: 'no-store',
      ...init,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* JWKS resolution (cached)                                                   */
/* -------------------------------------------------------------------------- */

/** Pick the JWK matching `kid` (or the first key when no kid is present). */
function selectKey(keys: Jwk[], kid: string | undefined): Jwk | null {
  if (!Array.isArray(keys) || keys.length === 0) return null;
  if (!kid) return keys[0] ?? null;
  return keys.find((k) => k.kid === kid) ?? null;
}

/**
 * Build a key resolver over the portal JWKS, backed by a `localStorage` cache.
 * The cache is consulted first (offline-friendly); a miss (unknown `kid`, or no
 * cache) triggers a single bounded fetch that is then cached. Returns `null`
 * when the key cannot be resolved, which makes verification fail closed.
 */
function makeKeyResolver(
  fetchFn: typeof fetch,
  apiBase: string,
  publishableKey: string,
  timeoutMs: number,
): { resolve: (kid: string | undefined) => Promise<Jwk | null>; prefetch: () => void } {
  // The live JWKS is fetched at most once per resolve pass (memoized promise),
  // so it can be started early — in parallel with the token fetch.
  let live: Promise<Jwk[] | null> | null = null;
  const loadLive = (): Promise<Jwk[] | null> => {
    if (!live) {
      live = (async () => {
        const res = await fetchWithTimeout(
          fetchFn,
          apiBase + JWKS_PATH,
          { method: 'GET', headers: { 'x-api-key': publishableKey, Accept: 'application/json' } },
          timeoutMs,
        );
        if (!res || !res.ok) return null;
        let body: { keys?: Jwk[] };
        try {
          body = (await res.json()) as { keys?: Jwk[] };
        } catch {
          return null;
        }
        const keys = Array.isArray(body.keys) ? body.keys : [];
        if (keys.length === 0) return null;
        writeCache(JWKS_KEY, { keys });
        return keys;
      })();
    }
    return live;
  };
  return {
    resolve: async (kid) => {
      const cached = readCache<{ keys: Jwk[] }>(JWKS_KEY);
      const hit = cached ? selectKey(cached.keys, kid) : null;
      if (hit) return hit;
      const keys = await loadLive();
      return keys ? selectKey(keys, kid) : null;
    },
    prefetch: () => {
      if (!readCache<{ keys: Jwk[] }>(JWKS_KEY)) void loadLive();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Entitlement resolution                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Verify a raw token for `host` and return its entitlement, or `null` if it is
 * invalid/expired/for-another-domain. Shared by the cache path and the fresh
 * fetch path so both fail closed identically.
 */
async function verify(
  token: string,
  host: string,
  resolveKey: (kid: string | undefined) => Promise<Jwk | null>,
  issuer: string | undefined,
): Promise<VerifiedEntitlement | null> {
  const result = await verifyToken(token, {
    host,
    resolveKey,
    ...(issuer ? { issuer } : {}),
  });
  return result.ok ? result.entitlement : null;
}

/**
 * Resolve this site's entitlement for `host`. Tries the cached token first (an
 * instant, offline verify), then a bounded live fetch of a fresh token. Returns
 * the verified entitlement, or `null` (free tier) on ANY failure.
 *
 * @param host - The current hostname (typically `location.hostname`).
 * @param opts - API base / key / timeout / fetch overrides (see {@link EntitlementOptions}).
 * @returns The verified entitlement, or `null` when the site is unlicensed here.
 */
export async function resolveEntitlement(
  host: string,
  opts: EntitlementOptions = {},
): Promise<VerifiedEntitlement | null> {
  const apiBase = (opts.apiBase ?? PORTAL_API_BASE).replace(/\/+$/, '');
  const publishableKey = opts.publishableKey ?? PORTAL_PUBLISHABLE_KEY;
  const timeoutMs = opts.timeoutMs ?? 3000;
  const fetchFn = opts.fetchFn ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetchFn) return null;

  const keys = makeKeyResolver(fetchFn, apiBase, publishableKey, timeoutMs);
  const resolveKey = keys.resolve;

  // 1. Cached token — a returning visitor unlocks with no network round-trip.
  //    The verifier re-checks exp + aud, so a stale/expired/copied token still
  //    fails closed here.
  const cached = readCache<{ token: string; host: string }>(TOKEN_KEY);
  if (cached && cached.host === host && typeof cached.token === 'string') {
    const ent = await verify(cached.token, host, resolveKey, opts.issuer);
    if (ent) return ent;
  }

  // 2. Fresh token from the licensing API (bounded). Domains without a seat get
  //    `{ licensed: false, token: null }` (HTTP 200) — not an error. A first-time
  //    visitor has no cached JWKS either, so fetch it in parallel.
  keys.prefetch();
  const res = await fetchWithTimeout(
    fetchFn,
    apiBase + ENTITLEMENT_PATH,
    {
      method: 'POST',
      headers: {
        'x-api-key': publishableKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ domain: host }),
    },
    timeoutMs,
  );
  if (!res || !res.ok) return null;

  let body: { token?: string | null };
  try {
    body = (await res.json()) as { token?: string | null };
  } catch {
    return null;
  }
  const token = typeof body.token === 'string' ? body.token : null;
  if (!token) return null; // dev/unlicensed host → free tier.

  const ent = await verify(token, host, resolveKey, opts.issuer);
  if (ent) writeCache(TOKEN_KEY, { token, host });
  return ent;
}

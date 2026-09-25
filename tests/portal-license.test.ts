/**
 * Unit tests for the plugin's portal activation client
 * (`shared-ui/src/license/portal-client.ts`).
 *
 * The client POSTs `{ licenseKey, domain }` to the portal's activation endpoint
 * and normalizes the verdict. A genuine rejection (`ok: false`) is returned as
 * data; transient failures (offline / 429 / 5xx) throw {@link PortalNetworkError}
 * so the caller can keep the last status instead of falsely relocking a paying
 * user. `fetch` is injected so no real network call is made.
 *
 * Run with `vitest run`.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { createPortalClient, PortalNetworkError } from '../shared-ui/src/license/portal-client';

const BASE = 'https://api.test';
const KEY = 'pk_test';

/** A fetch stub returning a JSON body + status; records the last request. */
function stub(status: number, body: unknown) {
  let lastUrl = '';
  let lastInit: RequestInit | undefined;
  const fetchFn = (async (url: string, init?: RequestInit) => {
    lastUrl = String(url);
    lastInit = init;
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetchFn, seen: () => ({ url: lastUrl, init: lastInit }) };
}

test('activate: an accepted key resolves to an active paid verdict', async () => {
  const { fetchFn, seen } = stub(200, {
    ok: true,
    tier: 'pro',
    whiteLabel: true,
    plan: { slug: 'pro', name: 'Pro' },
    reason: null,
  });
  const client = createPortalClient({ fetchFn, apiBase: BASE, publishableKey: KEY });
  const res = await client.activate('  KEY-123  ', 'acme.com');

  assert.equal(res.ok, true);
  assert.equal(res.tier, 'pro');
  assert.equal(res.whiteLabel, true);
  assert.deepEqual(res.plan, { slug: 'pro', name: 'Pro' });

  // Sends the publishable key + a trimmed key and the domain to the right path.
  const { url, init } = seen();
  assert.match(url, /\/public\/site-activate$/);
  assert.equal((init!.headers as Record<string, string>)['x-api-key'], KEY);
  assert.deepEqual(JSON.parse(String(init!.body)), { licenseKey: 'KEY-123', domain: 'acme.com' });
});

test('activate: a rejected key is returned as data (not thrown), relocked to trial', async () => {
  const { fetchFn } = stub(200, { ok: false, reason: 'This key has reached its site limit.' });
  const client = createPortalClient({ fetchFn, apiBase: BASE, publishableKey: KEY });
  const res = await client.activate('KEY-123', 'acme.com');

  assert.equal(res.ok, false);
  assert.equal(res.tier, 'trial');
  assert.equal(res.whiteLabel, false);
  assert.equal(res.plan, null);
  assert.match(res.reason!, /site limit/);
});

test('activate: a 5xx throws PortalNetworkError (transient — keep last status)', async () => {
  const { fetchFn } = stub(503, { error: 'down' });
  const client = createPortalClient({ fetchFn, apiBase: BASE, publishableKey: KEY });
  await assert.rejects(() => client.activate('KEY-123', 'acme.com'), (e) => {
    assert.ok(e instanceof PortalNetworkError);
    assert.equal((e as PortalNetworkError).httpStatus, 503);
    return true;
  });
});

test('activate: a 429 throws PortalNetworkError', async () => {
  const { fetchFn } = stub(429, {});
  const client = createPortalClient({ fetchFn, apiBase: BASE, publishableKey: KEY });
  await assert.rejects(() => client.activate('KEY-123', 'acme.com'), PortalNetworkError);
});

test('activate: a transport failure throws PortalNetworkError with status 0', async () => {
  const fetchFn = (async () => {
    throw new Error('offline');
  }) as unknown as typeof fetch;
  const client = createPortalClient({ fetchFn, apiBase: BASE, publishableKey: KEY });
  await assert.rejects(() => client.activate('KEY-123', 'acme.com'), (e) => {
    assert.ok(e instanceof PortalNetworkError);
    assert.equal((e as PortalNetworkError).httpStatus, 0);
    return true;
  });
});

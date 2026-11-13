/**
 * Reproducible backend-auth check for the Webflow Data Client Worker.
 *
 *   node scripts/webflow-auth-check.mjs [workerBase] [siteId]
 *
 * Sends every unauthenticated / forged / expired request a reviewer would try
 * against the LIVE Worker and prints a Markdown table of the results, exiting 1
 * if any response differs from the expected status. Needs no secrets: every
 * request here must be refused. The valid-token, cross-site-token and
 * expired-ID-token cases need a real Designer ID token, so they are covered by
 * tests/webflow-worker.test.ts (run: npx vitest run tests/webflow-worker.test.ts).
 */
const base = (process.argv[2] ?? 'https://consentful-connect.thepluginsco.workers.dev').replace(/\/$/, '');
const siteId = process.argv[3] ?? '6abf6ede0040b4e05bfeb4f3';

// A JWT-shaped token Webflow never issued, and one whose exp is in the past.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const forged = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ siteId, exp: 4102444800 })}.forged-signature`;
const expired = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ siteId, exp: 1 })}.expired-signature`;
// OAuth states in signState's format (v1.<base64url site>.<expiry s>.<HMAC>):
// one with a future expiry but a signature we did not make, and one expired.
const siteB64 = Buffer.from(siteId).toString('base64url');
const forgedState = `v1.${siteB64}.4102444800.${Buffer.from('not-our-hmac').toString('base64url')}`;
const expiredState = `v1.${siteB64}.1.${Buffer.from('not-our-hmac').toString('base64url')}`;

const q = `site=${siteId}`;
const body = JSON.stringify({ siteId, config: {} });
const cases = [
  ['GET /api/status, no token', 'GET', `/api/status?${q}`, {}, null, 401],
  ['GET /api/status, forged token', 'GET', `/api/status?${q}`, { authorization: `Bearer ${forged}` }, null, 403],
  ['GET /api/status, expired token', 'GET', `/api/status?${q}`, { authorization: `Bearer ${expired}` }, null, 403],
  ['GET /api/config, no token', 'GET', `/api/config?${q}`, {}, null, 401],
  ['GET /api/config, forged token', 'GET', `/api/config?${q}`, { authorization: `Bearer ${forged}` }, null, 403],
  ['GET /api/config, expired token', 'GET', `/api/config?${q}`, { authorization: `Bearer ${expired}` }, null, 403],
  ['POST /api/install, no token', 'POST', '/api/install', {}, body, 401],
  ['POST /api/install, non-Bearer header', 'POST', '/api/install', { authorization: `Basic ${forged}` }, body, 401],
  ['POST /api/install, forged token', 'POST', '/api/install', { authorization: `Bearer ${forged}` }, body, 403],
  ['POST /api/install, expired token', 'POST', '/api/install', { authorization: `Bearer ${expired}` }, body, 403],
  ['POST /api/remove, no token', 'POST', '/api/remove', {}, body, 401],
  ['POST /api/remove, forged token', 'POST', '/api/remove', { authorization: `Bearer ${forged}` }, body, 403],
  ['POST /api/remove, expired token', 'POST', '/api/remove', { authorization: `Bearer ${expired}` }, body, 403],
  ['GET /callback, forged state', 'GET', `/callback?code=x&state=${forgedState}`, {}, null, 400],
  ['GET /callback, expired state', 'GET', `/callback?code=x&state=${expiredState}`, {}, null, 400],
  ['GET /callback, forged code, no state', 'GET', '/callback?code=forged', {}, null, 400],
  ['GET /callback, no code', 'GET', `/callback?state=${forgedState}`, {}, null, 400],
  ['GET /authorize', 'GET', `/authorize?${q}`, {}, null, 302],
];

const rows = [];
let failed = 0;
for (const [label, method, path, headers, payload, expected] of cases) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(payload ? { 'content-type': 'application/json' } : {}), ...headers },
    body: payload ?? undefined,
    redirect: 'manual',
  });
  let detail = '';
  if (res.status === 302) {
    const loc = new URL(res.headers.get('location') ?? '', base);
    const state = loc.searchParams.get('state') ?? '';
    detail = `→ ${loc.origin}${loc.pathname}, redirect_uri=${loc.searchParams.get('redirect_uri')}, state ${/^v1\.[\w-]*\.\d+\.[\w-]+$/.test(state) ? 'HMAC-signed with expiry' : 'UNEXPECTED SHAPE'}`;
  } else {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      detail = j.error ?? j.code ?? '';
    } catch {
      detail = text.slice(0, 60).replace(/\s+/g, ' ');
    }
  }
  const ok = res.status === expected;
  if (!ok) failed++;
  rows.push(`| ${label} | ${expected} | ${res.status} ${detail ? `\`${detail}\`` : ''} | ${ok ? 'PASS' : 'FAIL'} |`);
}

console.log(`Worker: ${base} · site: ${siteId} · ${new Date().toISOString()}\n`);
console.log('| Request | Expected | Got | |');
console.log('|---|---|---|---|');
console.log(rows.join('\n'));
console.log(`\n${cases.length - failed}/${cases.length} as expected.`);
process.exit(failed ? 1 : 0);

# Consentful — Deployment & Launch Checklist

Living checklist for taking Consentful to a paid production launch. Tick items as
you go. Anything marked **[you]** needs your platform credentials / dashboards and
cannot be run from the repo alone.

Runtime is served from jsDelivr pinned to the tag in
`shared/src/runtime-cdn.ts` (`RUNTIME_VERSION`). The tag is baked into each site's
embed **at publish time**, so a new runtime only reaches a live site when that
surface is **re-published**.

Current shipped runtime: **v0.1.10** (live on jsDelivr).

---

## 0. 🚨 Launch blocker — licensing is currently OFF (final flip pending)

Two testing overrides remain, unlocking the Pro **editor UI** for free:

- `plugin/src/lib/customCode.ts` → `LICENSING_DISABLED = true` (+ `withTestingLicense` stamp)
- `shared-ui/src/model.ts` → forced `plan: "pro"`

⚠️ As of Phase 2, the **runtime no longer trusts the injected `config.license`** —
it fetches + verifies a domain-scoped token at boot (section 1). So the testing
stamp NO LONGER unlocks the published banner once the new runtime ships; it now
only affects the editor's Pro controls. Reverting these two overrides
(**Phase 2 step C**, below) is the final flip that re-gates the editor. It is the
one remaining code change before licensing is live end-to-end — held for a
go-ahead so nothing ships half-wired.

## 1. Wire the Dodo/Neon portal licensing into the plugin  **[decision: portal is authoritative — 2026-09-22]**

The sibling `../consentful-portal` holds the live licensing engine (Neon DB,
ES256/JWKS entitlement tokens) and a `plugin-sdk` verifier. **This repo does not
import it yet.**

**Architecture decided (2026-09-23): fetch-at-boot by hostname.** The runtime
fetches a domain-scoped signed token at load, verifies it via WebCrypto against
the portal JWKS, caches it (fail-closed on expiry), and derives entitlement.
Chosen because tokens are short-lived (24h) and self-service domain changes must
propagate without re-publishing.

Progress:
- [x] **Phase 1 — runtime verifier** ported into `runtime/src/license-token.ts`
      (dependency-free ES256/JWKS, mirrors the portal verifier) + 9 unit tests.
      Not yet imported by boot, so the shipped bundle is unchanged. Inlining it
      later adds ~2 KB → **bump the runtime bundle budget 60 → 64 KB** in
      `runtime/build.mjs` when wiring.
- [x] **PORTAL ENDPOINT BUILT** in `../consentful-portal` (on disk; that repo is
      not version-controlled here — **you must commit + deploy it**). Contract now
      pinned for Phase 2:
      - `POST /public/site-entitlement`, header `x-api-key: <publishable>`,
        body `{ "domain": "<hostname>" }`.
      - Response `{ status, licensed: boolean, plan: {slug,name}|null,
        featureSet|null, token: string|null, reason: string|null }`.
      - Dev/preview host → `{ status: "dev", licensed: false, token: null }`;
        unlicensed/expired domain → `{ licensed: false, token: null }` (HTTP 200,
        not an error); active seat → `licensed: true` + domain-scoped ES256 token.
      - Impl: `licenses.findActiveByRegistrableDomain` (new repo method, no
        migration — column/index already existed) + `resolveSiteEntitlement`
        service fn (6 unit tests). Needs `SIGNING_PRIVATE_KEY` / `SIGNING_KEY_ID`
        env on the deployed API for the token to be non-null.
- [x] **Phase 2A — runtime wired (DONE):** `runtime/src/entitlement.ts` fetches a
      domain token at boot (parallel with geo, bounded timeout, **fail-closed**),
      verifies it offline via `license-token.ts` + a `localStorage` JWKS/token
      cache, and `license-gate.ts` now shapes the banner from the *verified
      entitlement* (not `config.license`). Boot awaits it, then mounts ONCE.
      Bundle budget bumped 60 → **64 KB** (`runtime/build.mjs`; now ~63 KB). New
      optional `config.license.portalApiBaseUrl` override (empty = baked default).
      Tests: `entitlement.test.ts` + rewritten `license-gate.test.ts` / e2e.
- [x] **Phase 2B — plugin activation (DONE):** LS files deleted
      (`license.ts`, `licenseConfig.ts`, `licenseCache.ts`, `license.test.ts`,
      `VITE_LS_*`). New `plugin/src/lib/portalLicense.ts` activation client +
      rewritten `useLicense.ts` (key + published domain → activate) + updated
      `FramerLicensePanel.tsx` (activation UI + "Manage your license" →
      dashboard). `entitlements.ts` kept. Tests: `portal-license.test.ts`.
- [ ] **Phase 2C — flip the gate on (final code change):** set
      `LICENSING_DISABLED = false` + drop `withTestingLicense` in
      `plugin/src/lib/customCode.ts`; restore `plan: tier==="trial"?"free":"pro"`
      in `shared-ui/src/model.ts`. Then **re-tag the runtime + bump
      `RUNTIME_VERSION`** in `shared/src/runtime-cdn.ts` so live sites pick up the
      new gate on re-publish.

**Pinned contracts (portal side — build the matching endpoints in
`../consentful-portal`; shared constants live in `shared/src/portal.ts`):**
- **Publishable key + API base:** set `PORTAL_PUBLISHABLE_KEY` (currently the
  `PUBLISHABLE_KEY_PLACEHOLDER`) in `shared/src/portal.ts`. `PORTAL_API_BASE` =
  `https://consentful-api.onrender.com` (Render); `PORTAL_DASHBOARD_URL` =
  `https://consentful.theplugins.co` (Vercel). **[you]**
- **`GET /.well-known/jwks.json`** — public JWKS (`{ keys: Jwk[] }`), each key
  with a `kid`, ES256/P-256. The runtime caches it and verifies tokens offline.
- **`POST /public/site-activate`** — header `x-api-key: <publishable>`, body
  `{ "licenseKey": "<key>", "domain": "<hostname>" }` → `{ ok: boolean,
  tier: "lifetime"|"pro"|"agency"|"trial", whiteLabel: boolean,
  plan: {slug,name}|null, reason: string|null }`. Registers/renews a site seat.
  A rejected key returns `{ ok:false, reason }` (HTTP 200); 429/5xx are transient.
- **White-label feature id:** the entitlement token's `features` must carry
  `white_label` as `{ kind:"flag", value:true }` for the runtime to allow hiding
  the credit (see `license-gate.ts` `WHITE_LABEL_FEATURE`).
- [ ] **Phase 3 — E2E [you]:** deploy the portal API (Render) + the new endpoints;
      verify on a real domain; create Dodo products, fill `DODO_PRODUCT_*`, wire
      billing-webhook → site-license issuance, finish the pricing annual toggle.

---

## 2. Deploy the surfaces (make v0.1.10 reach live sites)

### 2a. Framer  **[you]**
- [ ] Submit `plugin/plugin.zip` at https://www.framer.com/marketplace/dashboard/plugins/
- [ ] In each Framer project: open the plugin → Publish → then **republish the site**.

### 2b. WordPress  **[you]**
- [ ] Verify the PHP in a real WP install (never lint-checked locally).
- [ ] Zip `apps/wordpress-plugin/plugin/consentful/` → upload as a plugin update.

### 2c. embed-config (universal snippet)  **[you]**
- [ ] Deploy `apps/embed-config/dist` to a static host (Cloudflare Pages / Netlify / Vercel).
- [ ] Sites using the universal snippet then re-copy it.

### 2d. consent-geo Worker (accurate geo, Pro) — easy  **[you]**
- [ ] `cd runtime/cloudflare-worker && npx wrangler deploy` (no secrets, no KV).
- [ ] Put the deployed Worker URL into the geo-endpoint field of site configs.

### 2e. Shopify  **[you]**
- [ ] `cd apps/shopify-app && npm run deploy` (Shopify CLI). Needs a Shopify Partner
      account + app API key/secret. Confirm `api_version` in
      `extension/shopify.extension.toml` matches your CLI version.

### 2f. Webflow Worker  **[you]** — `apps/webflow-app/wrangler.toml` has placeholders
- [ ] Create a Webflow App (developers.webflow.com) → get client id + secret.
- [ ] Fill `WEBFLOW_CLIENT_ID`, `WEBFLOW_REDIRECT_URI` (`https://<worker-host>/callback`),
      `APP_ORIGIN`.
- [ ] `wrangler kv namespace create TOKENS` → paste id (replaces `REPLACE_WITH_KV_NAMESPACE_ID`).
- [ ] `wrangler kv namespace create CONFIGS` → paste id (replaces `REPLACE_WITH_CONFIGS_KV_NAMESPACE_ID`).
- [ ] `cd apps/webflow-app && npx wrangler secret put WEBFLOW_CLIENT_SECRET`
- [ ] `npm run deploy:worker`, then publish the Designer Extension.

### 2g. Wix Worker  **[you]** — `apps/wix-app/wrangler.toml` has placeholders
- [ ] Create a Wix App (dev.wix.com) → app id + secret.
- [ ] Fill `WIX_APP_ID`, `WIX_REDIRECT_URL`, `APP_ORIGIN`.
- [ ] Create `TOKENS` + `CONFIGS` KV namespaces → paste ids.
- [ ] `npx wrangler secret put WIX_APP_SECRET`, then `npm run deploy:worker`.
- [ ] **DNS:** the published-site bootstrap fetches config from
      `https://consentful.theplugins.co/api/wix/config/<siteId>` (hardcoded in
      `shared/src/wix.ts`). Point that host/route at this Worker.

---

## 3. Quality follow-ups (in this repo, no credentials)
- [x] fab + modal-credit tests added (`tests/banner.test.ts`).
- [x] plugin toggle copy refreshed ("Floating preferences button").
- [ ] (optional) further test coverage as features land.

---

## Recommended order
1. Section 1 (licensing wiring + portal billing) — the launch blocker.
2. Framer (2a) — fastest end-to-end proof of v0.1.10.
3. consent-geo, Shopify, WordPress, embed-config (2d, 2e, 2b, 2c).
4. Webflow + Wix Workers (2f, 2g) — most setup (KV + OAuth + DNS).

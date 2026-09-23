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

## 0. 🚨 Launch blocker — licensing is currently OFF

Two testing overrides make every published site unlock **all Pro features for
free** and bypass validation entirely:

- `plugin/src/lib/customCode.ts` → `LICENSING_DISABLED = true`
- `shared-ui/src/model.ts` → forced `plan: "pro"`

**Do not flip these in isolation** — the plugin's only current paid gate is the
legacy LemonSqueezy code, which we are removing. They can only be reverted once
the portal gate is wired (section 1).

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
- [ ] **PORTAL GAP (blocker for fetch-at-boot):** the portal's public API
      (`/public/validate`, `/public/entitlements`) is **key-authenticated** — for
      the plugin software, not an anonymous visitor page. There is **no keyless
      domain-only endpoint.** Build one in `../consentful-portal`, e.g.
      `GET /public/site-entitlement?domain=<host>` (publishable `x-api-key`, rate
      limited): look up the license whose `licensed_domains` ⊇ registrable(host),
      issue a short-lived domain-scoped token; no match → free-tier / 404.
- [ ] **Phase 2 — wire boot + remove legacy:** add a JWKS-cache + entitlement
      fetch/cache module; render free-tier immediately then upgrade on a verified
      token; add a portal-base-URL config field; bump the bundle budget; delete
      the plugin's LemonSqueezy files (`plugin/src/lib/license.ts`,
      `licenseConfig.ts`, `licenseCache.ts`, LS vars in `.env.example`); revert
      the two overrides in section 0.
- [ ] **Phase 3 — E2E [you]:** deploy the portal API + the new endpoint; verify on
      a real domain; create Dodo products, fill `DODO_PRODUCT_*`, wire
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

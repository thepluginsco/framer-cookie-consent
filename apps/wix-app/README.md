# Consentful for Wix — App shell (Phase 3.5)

The Wix front-end for the shared consent engine. Wix is the one long-tail
platform worth a native app — and the **only adapter that is not ∅-infra** (its
Embedded Scripts parameters are alphanumeric-only, so config can't be inlined).
Three halves:

- **Dashboard page** (`src/main.ts` → `src/dashboard/`) — a framework-free
  authoring panel that runs as a Wix dashboard app. Author the banner, preview
  the real runtime, and install it on the current site. It holds no credentials;
  it calls the Worker.
- **Data Client Worker** (`src/worker.ts`) — a Cloudflare Worker that owns the
  OAuth `client_secret` + app-instance tokens **and the per-site config store**.
  It runs the shared `installWixLoader` / `removeWixLoader` engine against the
  live Wix REST APIs, and serves each site's config to the published-site
  bootstrap at `GET /api/wix/config/<siteId>`.
- **Consent bridge** (`src/consent-bridge.ts`, bundled to
  `dist/consentful-wix-bridge.js`) — a tiny published-site asset that relays each
  banner decision into Wix's Consent Policy via the shared `mapToWixConsent`, so
  Wix's own analytics/marketing/third-party tags honour the visitor's choice.

Everything consent-related is the **shared core**
(`@framer-cookie-consent/shared`): the loader a Wix site boots is byte-identical
in behaviour to what Framer, the universal embed, Webflow, WordPress and Shopify
emit. Because the runtime already reads an object off `window.__CC_CONFIG__`, the
runtime itself needs **no Wix-specific code** — the bootstrap fetches the config
and assigns it.

## How it maps to the core

| Core seam (`shared/src/wix.ts`) | Implemented here |
|---|---|
| `WixClient` (Embedded Scripts + consent policy) | `src/wix-api-client.ts` (`WixApiClient`) |
| OAuth (the credential holder) | `src/oauth.ts` + `src/worker.ts` |
| per-site config store (Wix is not ∅-infra) | `CONFIGS` KV in `src/worker.ts`, served at `/api/wix/config/<id>` |
| `buildWixBootstrapScript` (the embedded-script component) | declared in the Wix app config; `bridgeUrl` → the bundled bridge |
| `installWixLoader` / `removeWixLoader` | called by `src/worker.ts` |
| `mapToWixConsent` (five-bucket bridge) | `src/consent-bridge.ts` (published-site relay) |
| config authoring UI | `src/dashboard/` (pure map in `config-form.ts`) |

## Deploy (needs your Wix app + Cloudflare account)

1. Create a Wix App. Add a **dashboard page** (this `dist/`) and declare an
   **embedded-script component** whose body is the output of
   `buildWixBootstrapScript({ bridgeUrl })` — one dynamic parameter, `siteId`
   (alphanumeric). Note the **app id** and **app secret**.
2. Build + host the consent bridge, and set its URL as the bootstrap's `bridgeUrl`:
   ```bash
   cd apps/wix-app
   npm run build:bridge     # → dist/consentful-wix-bridge.js  (host on your CDN)
   ```
3. Configure the Worker:
   ```bash
   wrangler kv namespace create TOKENS    # paste the id into wrangler.toml
   wrangler kv namespace create CONFIGS   # paste the id into wrangler.toml
   wrangler secret put WIX_APP_SECRET     # your app secret
   # set WIX_APP_ID / WIX_REDIRECT_URL / APP_ORIGIN in wrangler.toml [vars]
   npm run deploy:worker
   ```
   The `/callback` URL (`https://<worker-host>/callback`) must be registered as a
   redirect URL on the Wix app, and `WIX_CONFIG_BASE_URL` in the core must point
   at the Worker origin (that's where the bootstrap fetches config).
4. Build the dashboard page, baking in the Worker URL:
   ```bash
   VITE_WORKER_BASE=https://<worker-host> npm run build
   ```

## Two operational gotchas (Wix "Consent Apps" program)

1. **One consent app per site.** Wix allows only one installed at a time; the
   dashboard tells users to turn off Wix's built-in banner first. `installWixLoader`
   sets the site's default Consent Policy to reject-all-but-essential (proper
   opt-in) on the first install only.
2. **Manual uninstall registration.** Because the app changes the default consent
   policy, share the app id with the Wix team (support chatbot) so Wix auto-resets
   the default on uninstall — otherwise uninstalling leaves sites stuck on
   reject-all. `removeWixLoader` deliberately does **not** reset the policy itself.
   One-time human step before launch.

## Security note

`/api/install`, `/api/config` and `/api/remove` currently trust a token looked up
by `siteId`. A production deploy should additionally verify the dashboard's signed
Wix instance token and assert it resolves to that site before writing. This guard
is marked as a `TODO(prod)` in `src/worker.ts` — left explicit rather than faked.

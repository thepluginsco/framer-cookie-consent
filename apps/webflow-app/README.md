# Consentful for Webflow — App shell (Phase 3.2)

The Webflow front-end for the shared consent engine. Two halves:

- **Designer Extension** (`src/main.ts` → `src/designer/`) — a framework-free
  authoring panel that runs inside the Webflow Designer. Author the banner,
  preview the real runtime, and publish it to the current site. It holds no
  credentials; it calls the Worker.
- **Data Client Worker** (`src/worker.ts`) — a Cloudflare Worker that owns the
  OAuth `client_secret` and the per-site access token, and runs the shared
  `installWebflowLoader` / `removeWebflowLoader` engine against the live Webflow
  v2 Data API.

Everything consent-related is the **shared core** (`@framer-cookie-consent/shared`):
the loader written to a Webflow site is byte-identical to what Framer, the
universal embed, WordPress and Shopify emit.

## How it maps to the core

| Core seam (`shared/src/webflow.ts`) | Implemented here |
|---|---|
| `WebflowClient` (HTTP + SRI + publish) | `src/webflow-api-client.ts` (`WebflowApiClient`) |
| OAuth (the credential holder) | `src/oauth.ts` + `src/worker.ts` |
| `installWebflowLoader` / `removeWebflowLoader` | called by `src/worker.ts` |
| config authoring UI | `src/designer/` (pure map in `config-form.ts`) |

## Deploy (needs your Webflow app + Cloudflare account)

1. Create a Webflow App (Designer Extension + Data Client). Register the scopes
   in `webflow.json`. Note the **client id** and **client secret**.
2. Configure the Worker:
   ```bash
   cd apps/webflow-app
   wrangler kv namespace create TOKENS        # paste the id into wrangler.toml
   wrangler kv namespace create CONFIGS       # paste the id into wrangler.toml (load-on-mount)
   wrangler secret put WEBFLOW_CLIENT_SECRET  # your app secret
   # set WEBFLOW_CLIENT_ID / WEBFLOW_REDIRECT_URI / APP_ORIGIN in wrangler.toml [vars]
   npm run deploy:worker
   ```
   The `/callback` URL (`https://<worker-host>/callback`) must be registered as a
   redirect URI on the Webflow app.
3. Build the Designer Extension, baking in the Worker URL. Vite reads it from a
   `.env` file (auto-loaded on every OS by both `dev` and `build`), so copy the
   template and set your Worker host once:
   ```bash
   cp .env.example .env      # then edit VITE_WORKER_BASE=https://<worker-host>
   npm run build             # or `npm run dev` for local dev testing
   ```
   Without `.env` (or the equivalent env var), `VITE_WORKER_BASE` is empty and the
   panel calls `/api/status` on its own origin — the Publish pill then shows
   "Worker unreachable". The inline form `VITE_WORKER_BASE=… npm run build` works
   in bash but NOT in Windows PowerShell/cmd; prefer the `.env` file.
   Upload `dist/` as the extension bundle (Webflow CLI / App settings).

## Security note

`/api/install` and `/api/remove` currently trust a token looked up by `siteId`.
A production deploy should additionally verify the Designer Extension's
short-lived id token (`window.webflow.getIdToken()` → Webflow's `/token/resolve`)
and assert the resolved site matches, before writing. This guard is marked as a
`TODO(prod)` in `src/worker.ts` — left explicit rather than faked.

## Runtime inline-size caveat

`buildWebflowRegistrations` throws if the config inline script exceeds Webflow's
inline `sourceCode` limit (`WEBFLOW_INLINE_MAX_CHARS` in the core). Confirm the
current cap against the live Webflow docs before launch — Webflow has documented
both 2 000 and 10 000 char limits in different places.

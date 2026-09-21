# Consentful for Shopify — App shell (Phase 3.4)

The Shopify front-end for the shared consent engine. Unlike Webflow/WordPress
(where an app writes the loader into a live host), Shopify bakes the config into a
deployable **theme app extension** and the merchant deploys it with the Shopify
CLI — so this shell has three parts:

- **Authoring UI** (`src/main.ts` → `src/app.ts`) — a framework-free, ∅-infra
  static page. Author the banner, preview the real runtime, then copy/download
  the generated `blocks/consentful.liquid` app-embed block. The analogue of the
  universal embed page.
- **Theme app extension** (`extension/`) — the deployable artifact: the app-embed
  block (`blocks/consentful.liquid`, `target: "head"`) that renders the loader,
  plus the consent bridge asset.
- **Consent bridge** (`src/consent-bridge.ts` → `extension/assets/consentful-consent-bridge.js`)
  — the storefront runtime hook that relays each decision into Shopify's Customer
  Privacy API.

Everything consent-related is the **shared core** (`@framer-cookie-consent/shared`):
the loader in the app-embed block is byte-identical to what Framer, the universal
embed, Webflow and WordPress emit.

## How it maps to the core

| Core seam (`shared/src/shopify.ts`) | Implemented here |
|---|---|
| `buildShopifyAppEmbedBlock` (the loader block) | wrapped by `src/extension.ts` (`buildConsentfulBlock` — adds the bridge tag) |
| `mapToShopifyConsent` (grants → Shopify's 4 buckets) | called by `src/consent-bridge.ts` on every decision |
| config authoring UI | `src/app.ts` (pure map in `src/config-form.ts`) |

## Why a bridge is required

Shopify's own checkout, Web Pixels and first-party pixel read consent from
`window.Shopify.customerPrivacy`, not from our banner. The bridge subscribes to
the runtime's `cookieconsent:change` event, maps the granted categories to
Shopify's four buckets via the shared `mapToShopifyConsent`, and calls
`Shopify.customerPrivacy.setTrackingConsent(...)`. Without it, Shopify keeps its
tags gated independently of the visitor's choice.

## Build & deploy (needs your Shopify Partner account)

```bash
cd apps/shopify-app
npm run build            # build:bridge (esbuild → extension/assets/) + vite (authoring UI)
```

Put the generated block at `extension/blocks/consentful.liquid` (copy/download it
from the authoring page), then from the Shopify app root:

```bash
shopify app deploy       # publishes the theme app extension
```

In the store's **Theme editor → App embeds**, turn on *Consentful cookie consent*.

`npm run dev` runs the authoring UI standalone (preview + copy the block).

## Liquid safety

The loader (config JSON + runtime tag) is wrapped in `{% raw %}…{% endraw %}` by
the core so the config's `{`/`}` can never be parsed as Liquid. The `{% schema %}`
block and the bridge's `{{ '…' | asset_url }}` tag are the only Liquid, and they
sit OUTSIDE the raw wrapper — `src/extension.ts` splices the bridge tag into that
Liquid gap without touching the loader bytes (so the one-engine guarantee holds).

## Follow-ons (not required to ship)

- **Confirm the extension TOML** (`api_version`, keys) against the Shopify CLI
  version you deploy with — the theme-app-extension schema has changed across CLI
  releases. Left explicit rather than guessed.
- **Persist the authored config** so the page reopens on last-deployed values
  (today it seeds from defaults, like the other shells).
- **Portal licensing (2.2)** — parked to be done last; the runtime already gates
  banner presentation regardless of licensing, so the shell works without it.

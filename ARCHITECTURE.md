# Architecture

This document describes how the Framer Cookie Consent project is structured, how
data flows from the designer's configuration to a visitor's browser, and how the
client-side licensing model works.

## 1. The two-halves model

The product is deliberately split into two independently-shipped artifacts that
share one schema. They run in completely different environments and must never
be coupled beyond the config format.

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│           plugin/            │        │           runtime/           │
│  React + TypeScript + Vite   │        │  Vanilla TS → consent.min.js │
│                              │        │                              │
│  Runs in the Framer editor   │        │  Runs on the PUBLISHED site  │
│  iframe. The designer        │        │  in the visitor's browser.   │
│  configures the banner.      │        │  Renders banner, stores      │
│                              │        │  consent, blocks scripts,    │
│                              │        │  emits Consent Mode signals. │
└───────────────┬──────────────┘        └───────────────▲──────────────┘
                │                                        │
                │        both import the schema          │
                │                                        │
                └──────────────►  shared/  ◄─────────────┘
                          config-schema.ts
                     (single source of truth)
```

### Why two halves?

- The **plugin** is a design-time tool. It can be as large as it needs to be —
  it never ships to visitors. It uses React for a good authoring UI and the
  Framer Plugin API to read/write the site's custom code.
- The **runtime** ships to *every visitor of every published site*. It must be
  small (budget **≤ 44 KB minified ≈ 12 KB gzipped**), dependency-free, and
  framework-free. It is vanilla TypeScript compiled to a single `consent.min.js`.

Keeping them separate means the heavy authoring UI never bloats the thing on the
critical path of the live site.

## 2. Data flow

The full path from configuration to a rendered, compliant banner:

```
 1. DESIGNER configures the banner
        │  (colours, copy, categories, license key…)
        ▼
 2. PLUGIN serializes the config against shared/config-schema.ts
        │
        ▼
 3. PLUGIN writes a small LOADER snippet into the site's custom code
        │  via the Framer Plugin API. The loader contains the serialized
        │  config and a <script> tag pointing at jsDelivr.
        ▼
 4. Site is PUBLISHED by Framer. The loader is now in the live page <head>.
        │
        ▼
 5. On page load, the LOADER fetches consent.min.js from jsDelivr (CDN).
        │  https://cdn.jsdelivr.net/gh/<org>/<repo>@<tag>/consent.min.js
        ▼
 6. RUNTIME boots and, in order:
        │
        ├─ a. Sets Google Consent Mode v2 defaults to "denied" for all four
        │     signals (ad_storage, analytics_storage, ad_user_data,
        │     ad_personalization) — BEFORE any tag can fire.
        │
        ├─ b. Blocks/neutralizes tracking scripts so they cannot run until the
        │     visitor consents (real blocking, not a cosmetic overlay).
        │
        ├─ c. Reads any prior decision from localStorage + first-party cookie.
        │     If a valid decision exists, applies it and skips the banner.
        │
        └─ d. Otherwise renders the accessible banner (focus-trapped, ARIA,
              keyboard-navigable, WCAG AA contrast).
        ▼
 7. VISITOR accepts / rejects / customizes.
        │
        ▼
 8. RUNTIME persists the decision (localStorage + cookie), unblocks the
    scripts for granted categories, and updates Consent Mode signals to
    "granted" for the accepted categories.
```

### Consent Mode v2 contract

- **Default:** all four signals — `ad_storage`, `analytics_storage`,
  `ad_user_data`, `ad_personalization` — are set to `denied` before any tag
  runs.
- **On acceptance:** the granted categories flip their corresponding signals to
  `granted`. Rejected categories stay `denied`.
- The default MUST be emitted as early as possible in page load, ahead of Google
  tags, or the "denied by default" guarantee is meaningless.

### Storage

Consent is stored **only** client-side, in two places for resilience:

- `localStorage` — primary record of the decision + timestamp + schema version.
- A **first-party cookie** — so server-side / same-site reads and expiry work
  predictably.

There is no backend and no database. Nothing about the visitor leaves the
browser.

## 3. Licensing model

Licensing is validated **client-side** using Lemon Squeezy license keys. There
is no license server of our own — zero paid infrastructure. The same rules apply
to **every origin** (Framer preview domains, `localhost`, and custom domains
alike) — there is no "free on staging" special case.

```
   Does the injected config.license have a paid tier
   (lifetime/pro/agency) AND a present, well-formed key?
                    │
          ┌─────────┴─────────┐
         YES                  NO
          │                    │
          ▼                    ▼
    Full banner.        DEGRADE: basic branded
    White-label         fallback bar (see below) —
    iff pro/agency.     NOT nothing.
```

### Where validation actually happens (two-stage, by design)

- **Editor (heavyweight, once):** the plugin calls Lemon Squeezy at
  purchase / activation time, resolves the tier from the store/product/variant,
  checks activation status, and **bakes the verdict into the injected config**.
- **Runtime (lightweight, every load):** `runtime/src/license-gate.ts` performs
  only a **presence / format check** on `config.license` (paid tier + a
  non-trivial key). It makes **no network calls**. This is a deliberate
  decision: contacting an API on every visitor's page load would add
  infrastructure cost and latency for negligible benefit over the editor-time
  validation. The client-side check is a deterrent + licensing mechanism, not a
  DRM fortress — an intentional, honest trade-off for a zero-infrastructure
  product.

- **The verdict is domain-independent.** A site is licensed by its key, not by
  where it runs, so previews and production behave identically. To test paid
  features, enter a valid license key in the plugin.

### Graceful degradation on an unlicensed site (decision)

When a site has no valid license we **degrade to a basic branded banner rather
than rendering nothing**. Two alternatives were considered and rejected:

1. *Render nothing* — leaves visitors on an unpaid site unprotected and can
   silently break the owner's GDPR compliance. Rejected: we must never make an
   unlicensed site *less* safe.
2. *Owner-only nag* — dishonest and fiddly (we can't reliably tell "the owner"
   from a visitor client-side).

The chosen behaviour, implemented by `resolveBannerConfig` / `basicBannerConfig`:

- **Compliance always runs**, licensed or not: Consent Mode defaults are set to
  `denied` and tracking scripts are blocked on the *original* config. The gate
  only ever changes the *banner presentation*.
- The fallback banner keeps all compliance content (categories, copy, gated
  scripts) but **strips premium presentation**: forced to an unobtrusive bottom
  `bar`, neutral default theme, no custom CSS, no floating button.
- **White-label is forced OFF** and the small "powered by" credit is forced ON.

This keeps visitors compliant while nudging the owner to license for the full
styled + white-label banner.

### White-label entitlement

The "powered by" credit is hidden **only** when the tier is **pro or agency AND
the site is licensed** (`hasWhiteLabel`). The runtime is authoritative: it
re-derives this rather than trusting the injected `config.license.whiteLabel`
flag. `lifetime` and `trial` always show the credit at runtime.

### Optional periodic revalidation (seam, disabled)

`license-gate.ts` exposes a stubbed `revalidateLicense` hook + a
`REVALIDATION_ENABLED = false` flag. A future Pro feature *could* phone home to a
Cloudflare Worker on a long interval to catch refunded/deactivated keys. It is
intentionally **off and non-networking** to preserve the $0-infra / zero-latency
guarantee; the seam exists only so the capability can be added without reworking
the boot path.

## 4. Folder responsibilities

| Folder | Responsibility |
| ------ | -------------- |
| `plugin/`  | The Framer editor plugin (React + TypeScript + Vite). Owns the configuration UI and all interaction with the Framer Plugin API, including writing the loader into the site's custom code. Never ships to visitors. |
| `runtime/` | The consent runtime (vanilla TypeScript, no framework). Owns banner rendering, consent storage, script-blocking, and Consent Mode v2 signalling. Compiled to a single tiny `consent.min.js` and served from jsDelivr. Must stay dependency-free and ≤ 44 KB minified (≈12 KB gzipped). |
| `shared/`  | The **single source of truth** for the config schema (`config-schema.ts`). Imported by both the plugin and the runtime so the produced config and the consumed config can never drift. Contains types, defaults, and (de)serialization — no runtime/UI logic. |
| `tests/`   | Cross-package integration tests spanning the plugin ⇄ shared ⇄ runtime boundary (schema round-trips, consent-state transitions, script-blocking behaviour, Consent Mode signal emission). |

## 5. Build & type-checking

- **`tsconfig.base.json`** at the root holds the strict TypeScript settings.
  Every package extends it and only overrides environment specifics (e.g. the
  runtime and plugin add DOM libs; the shared package emits declarations).
- **npm workspaces** wire the three packages together. `shared` is a workspace
  dependency of both `runtime` and `plugin`, resolved locally.
- **Build order:** `runtime` then `plugin` (`npm run build`). The runtime bundle
  is what the plugin's loader ultimately points at.
- **Strictness is non-negotiable:** `strict` plus `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`, and friends are on for all
  packages. `any` is disallowed unless truly unavoidable and commented.

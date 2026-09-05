# Consentful — Framer Cookie Consent

A Cookie Consent / GDPR + EAA banner plugin for [Framer](https://www.framer.com/),
branded **Consentful**.
It helps you implement GDPR-compliant consent on Framer-published sites: real
script-blocking before consent, [Google Consent Mode v2](https://developers.google.com/tag-platform/security/guides/consent)
signals, and an accessible, keyboard-navigable banner.

> **Honest scope:** this plugin _helps you implement_ GDPR-compliant consent. It
> does not and cannot _guarantee_ legal compliance — that depends on how you
> configure it and on your own legal obligations.

## Two halves

This is a small monorepo with two shipping artifacts plus the code they share:

| Folder      | What it is | Runs where |
| ----------- | ---------- | ---------- |
| **`plugin/`**  | React + TypeScript + Vite plugin (the **Consentful** editor: a three-column shell with a tab rail, live preview, onboarding and a publish flow). The designer configures the banner and it writes a tiny loader into the site's custom code via the Framer Plugin API. | Framer editor iframe |
| **`runtime/`** | Vanilla TypeScript, no framework, compiled to a single tiny `consent.min.js` (~31 KB min, ~10 KB gzipped). Renders the banner (card / bar / modal, light / dark / auto), stores consent, blocks tracking scripts until consent, and emits Consent Mode v2 signals. | The published website |
| **`shared/`**  | The consent **config schema** — the single source of truth imported by both halves so they can never drift. | Build-time (both) |
| **`tests/`**   | Cross-package integration tests. | CI / local |

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the data flow, the licensing
model, and how everything fits together.

## Requirements & constraints

- **Fully client-side.** No backend, no database. Consent lives in the
  visitor's `localStorage` + a first-party cookie only.
- **Zero paid infrastructure.** The runtime is served from
  [jsDelivr](https://www.jsdelivr.com/) (free). Licensing uses
  [Lemon Squeezy](https://www.lemonsqueezy.com/) license keys validated
  client-side.
- **Consent Mode v2:** all four signals (`ad_storage`, `analytics_storage`,
  `ad_user_data`, `ad_personalization`) default to `denied` and flip to
  `granted` only on acceptance.
- **Real script-blocking** before consent — not a cosmetic overlay.
- **One license, everywhere:** the full styled + white-label banner unlocks with
  a valid license key, on every domain (previews and production alike). Without a
  key, sites run a basic branded fallback banner — still fully compliant.
- **Accessible:** focus-trapped modal, keyboard navigation, WCAG AA contrast,
  proper ARIA roles.

## Repository layout

```
framer-cookie-consent/
├── plugin/     # Framer editor plugin (React + Vite)
├── runtime/    # CDN-hosted consent runtime (vanilla TS → consent.min.js)
├── shared/     # Config schema — single source of truth
├── tests/      # Cross-package integration tests
├── ARCHITECTURE.md
├── package.json          # npm workspaces root
└── tsconfig.base.json    # strict TS config that sub-packages extend
```

## Getting started

```bash
npm install          # installs all workspaces
npm run build        # builds the runtime, then the plugin
npm test             # runs the cross-package test suite (Vitest + jsdom)
npm run test:coverage  # + coverage report (compliance-critical modules gated)
```

### Root scripts

| Script | Does |
| ------ | ---- |
| `npm run build`         | Build the runtime, then the plugin. |
| `npm run build:runtime` | Build only the runtime bundle. |
| `npm run build:plugin`  | Build only the editor plugin. |
| `npm run build:shared`  | Compile the shared schema package. |
| `npm test`              | Run the full test suite once (Vitest). |
| `npm run test:watch`    | Run the suite in watch mode. |
| `npm run test:coverage` | Run with coverage; fails if the compliance-critical runtime modules regress. |

### Testing & QA

The cross-package suite lives in [`tests/`](tests/) and runs under **Vitest +
jsdom**. DOM-dependent suites drive a real jsdom document (with
`runScripts: 'dangerously'`) so tagged trackers genuinely execute or don't — the
only honest way to prove a compliance tool. Coverage is weighted toward the
compliance-critical runtime modules (`consent-mode`, `script-blocker`,
`consent-state`), which carry enforced per-file thresholds.

Automated tests can't prove the on-the-wire bits (real Consent Mode `gcs`/`gcd`
params, real network gating, cross-browser, config injection/removal in Framer).
Those live as a human checklist in [`tests/manual-QA.md`](tests/manual-QA.md) —
run it against a real published site before every release.

**Error visibility.** The runtime ships an optional, **network-free** error hook
that is OFF by default (see [`runtime/src/error-logger.ts`](runtime/src/error-logger.ts));
set `window.__CC_DEBUG__` or provide `window.__CC_ON_ERROR__` to surface errors.
The plugin editor can optionally report to Sentry's free tier behind the
`VITE_SENTRY_DSN` env flag — off and non-required by default; see
[`plugin/src/lib/errorReporting.ts`](plugin/src/lib/errorReporting.ts) and
[`plugin/.env.example`](plugin/.env.example).

### Previewing the plugin UI locally

The plugin only renders inside the Framer editor (the `@framer/plugin` API is
live there, and the vite dev root shows a `vite-plugin-framer` splash). To render
the Consentful UI standalone for visual work, a mock-backed harness is provided:

```bash
npm run preview:standalone --workspace plugin   # http://localhost:5273/preview/index.html
```

It aliases `@framer/plugin` to `plugin/preview/framer-mock.ts` and mounts the real
`App`, so every panel, the live preview, onboarding and the publish flow work
without a Framer host.

> **Licensing note:** client-side Lemon Squeezy key validation is still stubbed
> ([`runtime/src/license-gate.ts`](runtime/src/license-gate.ts),
> [`plugin/src/lib/license.ts`](plugin/src/lib/license.ts)); the License tab
> currently activates optimistically on any non-empty key.

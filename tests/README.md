# Tests

Cross-package tests spanning the plugin ⇄ shared ⇄ runtime boundary. They run
under **Vitest** with **jsdom** (each DOM-dependent suite installs its own jsdom
instance so it controls the document lifecycle, storage, and the DOM-constructor
globals `instanceof` needs). Vitest transforms the workspace TypeScript — including
the `@framer-cookie-consent/shared` package — on the fly, so there is no build step
before running.

## Running

```bash
npm test                 # run everything once (vitest run)
npm run test:watch       # watch mode
npm run test:coverage    # run + coverage report (text + html in ./coverage)
```

## Layout

Module / unit suites:

- `config` round-trips live in the shared package's own checks; here we cover the
  runtime modules:
- `consent-state.test.ts` / `consent-state-extra.test.ts` — persistence, expiry,
  version invalidation, cookie/localStorage mirroring, withdraw, `Secure` flag.
- `consent-mode.test.ts` / `consent-mode-loader.test.ts` — signal mapping, the
  `default`/`update` dataLayer emissions, the blocked `gtag.js` loader, and
  `initConsentMode` wiring.
- `script-blocker.test.ts` / `script-blocker-extra.test.ts` — real
  block-until-consent behaviour under jsdom (`runScripts: 'dangerously'`), the
  `MutationObserver`, config-script injection, and activation edge cases.
- `geo.test.ts` — region classification + banner-show decisions.
- `banner.test.ts` — the visible UI: focus trap, `Esc`, required-category pill,
  button rendering, accept/save wiring.
- `license.test.ts` / `license-gate.test.ts` — plugin-side tier resolution and the
  runtime license gate + graceful degradation.
- `error-logger.test.ts` — the runtime's optional, network-free error hook.

End-to-end-ish + entry:

- `e2e-runtime.test.ts` — the whole runtime wired the way `index.ts` boots it,
  driven through real scenarios (EU no-consent, accept/reject/analytics-only,
  re-consent, late-injected scripts, license variants, accessibility).
- `index-boot.test.ts` — the real `runtime/src/index.ts` auto-boot entry point.

Human checklist:

- `manual-QA.md` — pre-release verification steps that can only be done on a REAL
  published Framer site (Consent Mode `gcs`/`gcd` on the wire, real network gating,
  cross-browser, EU/non-EU, config re-injection/removal).

## Coverage focus

Coverage is weighted toward the **compliance-critical** runtime modules —
`consent-mode`, `script-blocker`, `consent-state` — which carry enforced per-file
thresholds in `vitest.config.ts`. A change that drops their coverage fails
`npm run test:coverage`.

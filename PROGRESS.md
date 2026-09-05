# Consentful — Readiness Tracker

Status legend: ✅ done · 🔧 in progress · ⏳ deferred · 🚫 blocked (needs a deploy action only you can do).

## Code status — everything non-licensing is complete

All application code is implemented, wired end-to-end, and verified:

- **173 tests pass**, all three workspaces typecheck, both artifacts build.
- **Runtime bundle:** 35.5 KB raw / 11.6 KB gzip (budget 44 KB) — includes the three
  Pro features (accurate geo, multi-language, consent analytics) and the DNT
  reject-by-default behaviour.
- **Plugin:** full Framer integration (loader injection, permission handling),
  the complete Consentful UI (Style / Text / Categories / Behavior / Scripts /
  Consent Mode / Insights), live preview, and error boundary + opt-in reporting.

There are **no mock/stub implementations** standing in for real logic in any
shipping path. The remaining items below are **deploy / config actions**, not code.

### Partial features closed in this pass

A deeper schema→runtime→UI audit found five capabilities that existed in only
some layers. All are now complete end-to-end (verified in the live plugin preview,
+2 runtime tests):

- **`hideAfterChoice`** — the toggle existed but the runtime always hid the banner.
  The banner now honours it (a blocking modal still always closes so visitors are
  never trapped).
- **`reloadOnChange`** — the toggle did nothing; the runtime now reloads the page
  on a post-mount decision (can't loop, as it's wired after boot reconciliation).
- **Floating reopen button** (`floatingButton` + position) — fully built in the
  runtime but had no control; added a toggle + corner picker in Behavior (GDPR
  withdraw-consent affordance).
- **Custom CSS** (Pro) — runtime appended it but nothing could set it; added a
  Pro-gated editor in Style.
- **Google tag id** — runtime could self-load gtag.js (blocked until consent) but
  had no field; added under Consent Mode → Advanced.

## Runtime release — re-tag so Pro features reach live sites

The published-site loader is pinned to an immutable jsDelivr tag. The Pro features
and DNT fix live in the runtime bundle, so they only reach live sites once a new
tag is cut.

| Step | Status | Notes |
|------|--------|-------|
| Rebuild runtime with Pro features | ✅ done | `runtime/dist/consent.min.js` rebuilt (has `sendBeacon` + `translations`). |
| Bump `RUNTIME_VERSION` → `v0.1.1` | ✅ done | `plugin/src/lib/runtimeCdn.ts`. |
| Commit `runtime/dist` + push tag `v0.1.1` | 🚫 you | Immutable tag on the commit that carries the new bundle (see commands below). |

## Pro Worker infra — deploy the two free Cloudflare Workers

Both Worker sources are complete and deploy-ready in `runtime/cloudflare-worker/`.
Until deployed, each feature is a safe no-op: geo falls back to the offline
time-zone heuristic; analytics simply records nothing and the Insights tab shows
its empty state.

| # | Item | Status | What's needed |
|---|------|--------|---------------|
| 1 | Accurate geo Worker | 🚫 you | `wrangler deploy` `geo-worker.js` (+ `wrangler.toml`). Paste the URL into Behavior → Accurate geo endpoint. |
| 2 | Analytics Worker | 🚫 you | `wrangler kv namespace create CONSENT_STATS`, set the id in `wrangler.analytics.toml`, deploy `analytics-worker.js`. Paste the URL into Insights. |

## Licensing — DEFERRED to the portal approach (do last)

Direct client-side Lemon Squeezy validation is fully coded and working
(`plugin/src/lib/license.ts`, `useLicense.ts`), but licensing will instead move to
the **shared portal model** used by LingoLens and MediaGrabber Pro. Left untouched
for now on purpose.

| # | Item | Status | Notes |
|---|------|--------|-------|
| L | Portal-based licensing | ⏳ deferred | To be wired the same way as the other products. The current LS path stays in place and runs trial-only (`STORE_ID` unset) until the portal integration replaces it. |

## Release commands (yours to run)

```bash
git add -A
git commit -m "Ship Pro features + DNT fix; bump runtime to v0.1.1"
git push origin main
git tag v0.1.1
git push origin v0.1.1
```

Then deploy the two Workers and paste their URLs into the plugin.

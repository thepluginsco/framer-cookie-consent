# Consentful — Expansion Plan

_2026-09-13. The execution roadmap. Distils [STRATEGY.md](STRATEGY.md) (why) and
[DEEP-DIVE.md](DEEP-DIVE.md) (how, mapped to code) into a phased, sequenced plan with
dependencies, effort, and success criteria._

---

## Guiding principles (don't violate these)

1. **Protect the moat.** No account, no phone-home, self-hosted ~11 KB runtime, config baked into
   the loader. Every feature is ∅-infra by default; anything needing a server is an *optional*
   Cloudflare Worker (our existing pattern), never a hard dependency.
2. **Compliance always runs, licensed or not.** Consent Mode defaults + script blocking are never
   gated; only banner presentation degrades. (Already true — keep it true.)
3. **One engine, many front-ends.** One schema, one runtime, one compliance core. Platforms are
   thin adapters. Consistency is the product.
4. **Ship credibility before breadth.** Close the "are you a real CMP" gap on Framer *first*, then
   expand to new platforms — so every new platform launches already-competitive.

---

## The four phases at a glance

| Phase | Theme | Outcome | Rough effort |
|---|---|---|---|
| **1** | Credibility features (Framer) | Demonstrably more advanced than ConsentBit/CookieGuard | ~2–3 wks |
| **2** | Core extraction + portal licensing | One engine + one license ready for many platforms | ~2–3 wks |
| **3** | Platform expansion | Framer → Embed → Webflow → WordPress → Shopify | ~6–8 wks |
| **4** | Depth & monetisation | A/B, pref center, legal-docs, dashboard | ongoing |

Phases 1 and 2 can partly overlap (2 is a refactor; 1 is feature work on the same files — do 1
first or coordinate the merge). Phase 3 depends on both.

---

## Phase 1 — Credibility features on the current Framer product

**Goal:** make Consentful *provably* more advanced than the two serious Framer rivals, using only
∅-infra features. Order chosen so each ships independently.

| # | Feature | Effort | Infra | Primary files (insertion points) |
|---|---|---|---|---|
| 1.1 ✅ | **GPC + visible "Opt-Out Honored" badge** — _done 2026-09-13_ | ~1 day | ∅ | `runtime/src/geo.ts` (`isGpcEnabled()`, `isSaleCategory()`, `gpcGrantedCategories()`), `runtime/src/index.ts` boot step (d.6), `shared/src/config-schema.ts` `BehaviorConfig` (`respectGpc`, `gpcShowBadge`), `runtime/src/banner.ts` + `styles.ts` (badge), plugin Behavior panel toggles |
| 1.2 ✅ | **Consent receipts (client-side) + `exportReceipt()`** — _done 2026-09-17_ | ~1.5 days | ∅ | `runtime/consent-state.ts` (extend `ConsentState`, stamp in `writeConsent`, add API method), `shared/config-schema.ts` |
| 1.2b | **Optional central receipt log** | ~0.5 day | +worker | `runtime/analytics.ts` pattern → `receipt-worker.js`; `config.receipts.endpoint` |
| 1.3 ✅ | **Design-time tracker scanning** — _done 2026-09-18_ | ~2 days | plugin-only | `shared/src/tracker-scan.ts` (catalog + pure `detectTrackers`), `plugin/src/lib/scanSite.ts` (fetch live URL), `model.ts` (`applyDetectedTrackers`), `modals.tsx` (`ScanTrackersModal`), Scripts panel scan button |
| 1.4 ✅ | **Region-aware auto-mode** — _done 2026-09-18_ | ~2 days | ∅ | `shared/config-schema.ts` (`ConsentModel` `opt-in`/`opt-out`/`auto`), `runtime/geo.ts` (`resolveConsentModel`, `impliedConsentGrants`, `shouldApplyImpliedConsent`), `runtime/index.ts` boot step e.5, `runtime/consent-state.ts` (`'implied'` method), plugin Behavior panel |

**Key nuance (1.1):** GPC is an opt-out of *sale/sharing*, not a blanket reject — deny only
ad/marketing signals (`ad_storage`/`ad_user_data`/`ad_personalization`), don't reuse `rejectAll()`.

**Exit criteria:** GPC honoured + confirmation shown; every decision produces an exportable
timestamped receipt; plugin can auto-detect GA/GTM/Meta/etc.; one banner behaves correctly in
opt-in vs opt-out regions. Tests green, runtime still under budget, new runtime tag cut.

---

## Phase 2 — Core extraction + portal licensing (the platform prerequisites)

**Goal:** make the codebase and the business model ready for many platforms. Neither is
user-visible, but Phase 3 multiplies pain without them.

### 2.1 Extract `core/` (~1 wk, low risk)
Promote the already-separated pieces into a platform-neutral core:
```
core/  = schema (shared/config-schema.ts) + runtime (runtime/) + loader (buildLoaderHtml/
         upsertBlock/stripBlock + runtimeCdn — all already pure string fns)
adapters/framer/  = today's plugin, re-pointed at core/loader; keeps only framer.ts get/setCustomCode
```
The **only** Framer-coupled code is `getCustomCode/setCustomCode` in `framer.ts` — that's the whole
adapter seam. Adapter contract: *read custom-code region → `upsertBlock(buildLoaderHtml(config))` →
write back.*

### 2.2 Portal licensing (~1–2 wks)
One license key entitling a user across all platforms, managed in one portal (the
LingoLens/MediaGrabber pattern — **duplicate the user module from the complete license portal as
a sister directory** of this repo). Payments run on **Dodo Payments** (already wired in the
template's user module — same as LingoLens/MediaGrabber; not Lemon Squeezy). Every new adapter
otherwise re-implements licensing. Also: **revert the temporary testing overrides**
(`LICENSING_DISABLED = true` in `customCode.ts`, forced `plan:"pro"` in `model.ts`) before any
public multi-platform launch.

#### Licensing model (decided 2026-09-19)

**Unit = registrable domain (eTLD+1), platform-agnostic.** A license buys N *sites*, and a "site" is
a **root domain and all its subdomains, on any platform** — not a full hostname, and not a platform.
This matches the runtime's real enforcement point (the CDN loader is bound per-domain) and the
category norm (Cookiebot/iubenda/CookieYes all license per-domain), but resolves the multi-platform
case cleanly:

- `example.com` on Framer + `shop.example.com` on Shopify + `blog.example.com` on WordPress =
  **one slot** (all `example.com`). Platform never enters the count; the same brand doesn't pay
  three times for spreading across three tools.
- Two *different* root domains (`mybrand.com` + `myshop.io`) = **two slots** — the honest boundary,
  and what agencies expect (one slot per client brand).

We do **not** license per-platform: it's one shared core with thin adapters, so charging twice for
the same product on two platforms would contradict our own "one consent layer everywhere" pitch.

**Feature gating is flat, not per-feature.** Every paid tier unlocks *all* Pro features (geo, i18n,
A/B, preference center, analytics, legal-doc generator, a11y badge). **Site count is the only lever
between paid tiers** — this keeps the Worker validation matrix trivial. Free = banner-only + forced
"powered by" credit → `consentful.theplugins.co` (the cross-platform acquisition engine).

**Pricing** (monthly + yearly both; yearly ≈ 2–3 months free):

| Tier | Sites | Monthly | Yearly | Features |
|---|---|---|---|---|
| **Free** | 1 | $0 | $0 | Banner only + powered-by credit |
| **Solo** | 1 | $12/mo | **$99/yr** | All Pro ✓ |
| **Studio** | 5 | $24/mo | **$199/yr** | All Pro ✓ |
| **Agency** | 25 | $49/mo | **$399/yr** | All Pro ✓ |
| **Lifetime** (limited) | 3 | — | **$299 one-time** | All *current* Pro + updates ✓ |

**Limited lifetime deal — liability-capped:**
- **250 codes total**, then closed. The scarcity counter is the marketing.
- **3 sites per LTD license** (not unlimited — unlimited-lifetime is how LTDs bankrupt a product
  with recurring compliance/server cost).
- **"Lifetime = lifetime of the product"** — state in terms.
- Includes all *current* Pro + updates; reserve the right to gate *future net-new premium modules*
  (state up front). ~3× the Studio annual, so it recoups fast.

#### License schema (the only product-specific additions to the duplicated user module)
```
license {
  type: "monthly" | "yearly" | "lifetime"   // lifetime = no expiry
  max_sites: 1 | 5 | 25 | 3                  // 3 = LTD
  licensed_domains: string[]                 // <= max_sites, self-service add/remove
  expires_at: timestamp | null               // null for lifetime; renewal-driven otherwise
  features: "pro"                            // flat — no per-feature gating
}
```
- **Validation** (Worker), on the request's live hostname:
  1. **Normalize** → lowercase, strip `www.`, strip port. Then reduce to the **registrable domain**
     (eTLD+1) via a compact known-suffix list (covers `.co.uk`/`.com.au`/… — ship a small curated
     list, not the full Public Suffix List; fall back to last-two-labels when unknown).
  2. **Staging whitelist — never counted, always allowed:** if the hostname ends in a known platform
     preview suffix (`.framer.website`, `.framer.app`, `.webflow.io`, `.myshopify.com`, and
     `localhost`/`127.0.0.1`/`*.local` for dev), the banner runs in full without consuming a slot and
     without a `licensed_domains` match. So a customer can build on staging before their real domain
     is live, and a Shopify store works pre-custom-domain.
  3. Otherwise entitle iff `registrable(hostname) ∈ licensed_domains && (expires_at == null || now <
     expires_at)`. The stored `licensed_domains` are themselves registrable domains, so any subdomain
     on any platform matches its root's slot.
- **Self-service domain slots**: customer adds/removes **root domains** up to `max_sites` in the
  portal (subdomains are covered automatically), with a swap cooldown (e.g. one swap per slot per
  30 days) to stop abuse. The portal normalizes input to eTLD+1 and rejects the staging suffixes
  (no point spending a slot on a free preview domain).
- **Dodo products**: monthly + yearly recurring variants per tier, plus a one-time LTD variant that
  mints `type: lifetime, max_sites: 3, expires_at: null`. No new infra vs. the recurring variants.
- **Plugin license card** needs a new "manage sites" view (list domains, slots used, add/remove) —
  richer than the LingoLens/MediaGrabber card; plan for it in every adapter's UI.

**Exit criteria:** user module duplicated as a sister directory on Dodo Payments; Framer plugin runs
on `core/` with all tests green; a single license validates against the portal per-domain and gates
entitlements identically across all four platforms; the "manage sites" card works; testing overrides
removed.

---

## Phase 3 — Platform expansion

**Goal:** same engine, new front-ends, in cheapest-first order.

| Order | Platform | Effort | Injection | Why this slot |
|---|---|---|---|---|
| 3.1 ✅ | **Universal `<script>` embed** — _snippet builder done 2026-09-18_ | ~2–3 days | Hosted config page → copy-paste snippet (`window.__CC_CONFIG__` + jsDelivr `<script defer>`). Runtime works **as-is** (it already reads `__CC_CONFIG__` and the `data-cc-config` attribute). Core `buildEmbedSnippet` shipped in `shared/src/embed.ts`; the hosted config page is the remaining (∅-infra, static) follow-on. | Near-free; unlocks Wix/Squarespace/Ghost/Carrd/hand-coded; doubles as public demo + funnel |
| 3.2 ✅ | **Webflow** — _adapter core done 2026-09-18_ | ~1 wk | Embed snippet in Custom Code (works now via 3.1) → native App writing site custom code: core `installWebflowLoader`/`removeWebflowLoader` in `shared/src/webflow.ts` (register→apply→publish over an injected `WebflowClient`; the OAuth/HTTP/SRI App shell shipped 2026-09-18 in `apps/webflow-app/` — Designer Extension + Data Client Worker; only deploy-time infra remains). | Same design-led buyer as Framer; strong App Marketplace; reuse ~all the React UI |
| 3.3 ✅ | **WordPress** — _adapter core done 2026-09-18_ | ~1.5–2 wks | PHP plugin: settings screen + loader printed into `wp_head`; auto-detect installed tracker plugins → pre-fill scripts. Core `wordpressAdapter`/`installWordPressLoader`/`removeWordPressLoader` in `shared/src/wordpress.ts` reuse the head-blob `PlatformAdapter` (WordPress, unlike Webflow, has a free-form head region — a stored option PHP echoes on `wp_head`), and `detectWordPressTrackers(activePlugins)` is the plugin-list analogue of the HTML tracker scan. The PHP plugin shell (settings screen, REST/option store, `wp_head` printer, reading `active_plugins`) is the remaining credential-holding follow-on. | Biggest market; win on flat price + no external account |
| 3.4 ✅ | **Shopify** — _adapter core + App shell done 2026-09-18_ | ~2 wks | Theme app extension app-embed block (`target: "head"`), not a head-blob adapter: core `buildShopifyAppEmbedBlock` in `shared/src/shopify.ts` bakes the byte-identical loader into a deployable `blocks/consentful.liquid` (Liquid `{% raw %}`-wrapped so config JSON can't be read as Liquid). The Customer Privacy / Consent Tracking API bridge `mapToShopifyConsent` maps our category grants → Shopify's four buckets (`analytics`/`marketing`/`preferences`/`sale_of_data`) via Consent Mode signals, so Shopify checkout + Web Pixels honour our banner. The App shell shipped 2026-09-18 in `apps/shopify-app/` — a static authoring UI, the deployable `extension/` (app-embed block + built consent-bridge asset), and the `Shopify.customerPrivacy.setTrackingConsent` runtime hook; only Shopify-CLI deploy-time infra remains. | Lucrative, compliance-sensitive; do last of the four |
| 3.5 ✅ | **Wix** — _adapter core + App shell done 2026-09-21_ | ~1 wk (Worker-backed, like 3.2) | Native App: config authored in a dashboard page → loader injected via the **Embedded Scripts API** (app-authenticated, injects a `<script>` into `<head>` on install). Core `installWixLoader`/`removeWixLoader` + the `buildWixBootstrapScript` per-site bootstrap + `mapToWixConsent` + `WIX_REJECT_ALL_POLICY` live in `shared/src/wix.ts` (over an injected `WixClient`; 23 tests). Because Wix is **not ∅-infra**, the bootstrap fetches config from the per-site store (`wixConfigUrl`, keyed by `normalizeWixSiteId`) and loads the SAME pinned runtime — so the runtime is **unchanged** (it already reads an object on `window.__CC_CONFIG__`). Consent bridge is best-in-class: frontend `consentPolicy.setConsentPolicy()` (`@wix/site-window`) relays each decision into Wix's 5 buckets (`essential`/`functional`/`analytics`/`advertising`/`dataToThirdParty`) → `mapToWixConsent` (analogue of `mapToShopifyConsent`); backend `updateConsentPolicy()` (Site Properties REST) sets the site **default** policy to reject-all-but-essential on install (proper opt-in, better than Shopify). The App shell shipped 2026-09-21 in `apps/wix-app/` — a dashboard authoring page, the Data Client Worker (`WixApiClient` on the real Wix REST APIs + OAuth + KV `TOKENS`/`CONFIGS`, serving config to the bootstrap at `GET /api/wix/config/<id>`), and the published-site consent-bridge asset (`consent-bridge.ts` → bundled `consentful-wix-bridge.js`, ≈11 KB) that calls `window.consentPolicyManager.setConsentPolicy(mapToWixConsent(...))`; only Wix-app-registration + Cloudflare deploy-time infra remains. **Not ∅-infra** — see subsection below. | Only long-tail platform that can graduate out of embed-only; strongest consent integration of any adapter |

**Exit criteria per platform:** config authored → loader injected → published site boots the shared
runtime → banner + blocking + Consent Mode verified live; license enforced via the portal.

### Phase 3.5 — Wix (adapter core + App shell done 2026-09-21)

Verified against live Wix docs on 2026-09-20 (sources below). Wix is the **only** one of the
long-tail platforms (Wix / Squarespace / Ghost / Carrd) worth a native app — the other three stay
embed-only (Squarespace and Carrd have **no** header-write API; Ghost's Admin API `codeinjection_head`
is a write seam but there's no marketplace/OAuth, so it's an API-key connector at best, build only on
demand). Wix graduates out because it has **both** seams.

**Architecture consequence — Wix is NOT ∅-infra (this is the key finding).** The Embedded Scripts API
only accepts **dynamic parameters that are strings, alphanumeric-only, no special chars/spaces**, and
the script tag must be **pre-declared as an embedded-script component** in the app config. Our loader's
inline `window.__CC_CONFIG__ = {…JSON…}` block will NOT fit through an alphanumeric param. So the Wix
pattern must be:

- Embedded script = our CDN runtime tag carrying a `{{siteId}}` param (alphanumeric — legal).
- Config is **fetched at runtime from our backend, keyed by siteId** — not baked into the page.

This means Wix needs a **site-keyed config store + OAuth app backend** (to hold the token and call the
install/consent APIs). It is therefore closer to **Webflow (Worker-backed)** than to the static ∅-infra
shells. Good news: **reuse the Phase 2.2 licensing Worker + Neon DB** as that per-site config store —
incremental, not net-new infra.

**Two operational gotchas (from Wix's "Consent Apps" program — don't rediscover these):**

1. **One consent app per site.** Wix explicitly allows only one installed at a time; the app must tell
   users. It cannot co-exist with Wix's own banner or a competitor's.
2. **Manual uninstall registration.** Apps that change the default consent policy must share their app
   ID with the Wix team (via Wix support chatbot) so Wix auto-resets the default policy on uninstall —
   otherwise uninstalling leaves sites stuck on reject-all. One-time human step before launch.

**Proposed shape:** `shared/src/wix.ts` (`installWixLoader` / `removeWixLoader` over an injected Wix
client + `mapToWixConsent`) + `apps/wix-app/` (dashboard authoring page + OAuth Worker reusing the
licensing DB for per-site config). Effort ≈ Webflow.

**Sources (verified 2026-09-20):**
[Embedded Scripts API](https://dev.wix.com/docs/rest/app-management/embedded-scripts/introduction) ·
[About Consent Apps](https://dev.wix.com/docs/build-apps/launch-your-app/legal-and-security/about-consent-apps) ·
[Consent Policy (frontend SDK)](https://dev.wix.com/docs/sdk/frontend-modules/window/consent-policy/introduction) ·
[Site Properties updateConsentPolicy (REST)](https://dev.wix.com/docs/rest/business-management/site-properties/properties/update-consent-policy)

---

## Phase 4 — Depth & monetisation (ongoing, after breadth exists)

- **4.1 ✅ A/B consent-rate testing + analytics dashboard** (+worker) — _done 2026-09-19_ —
  variant in the analytics event; Insights shows accept/reject/customise by variant & region.
  Engine in `shared/src/ab-test.ts` (pure pick/apply/signature), runtime sticky assignment in
  `runtime/src/variant.ts`, region bucketing in `runtime/src/geo.ts`, worker aggregation in
  `runtime/cloudflare-worker/analytics-worker.js`, authoring UI in the plugin Behavior panel +
  the variant/region breakdown on the Insights tab. Variants override presentation ONLY
  (copy/banner/theme) — compliance is invariant across variants. Data flows once the analytics
  Worker is deployed (your infra).
- **4.2 ✅ Full preference center + per-vendor toggles** (∅) — _done 2026-09-19_ —
  the preferences modal can list each category's vendors (name + purpose) and
  give each its own switch; a vendor a visitor turns off is held back by the
  script blocker even while its category is granted. Both flags default off.
  Schema `preferenceCenter` + `ManagedScript.purpose` + localizable
  `vendorsHeading`; per-vendor grants persist on the consent record + receipt;
  authored in the plugin's Scripts panel.
- **4.3 ✅ Bundled legal-doc generator** (cookie/privacy policy) — _done 2026-09-19_ —
  Termly's wedge, ∅-infra. Pure `shared/src/legal-docs.ts` derives a Cookie Policy
  and a cookie-focused Privacy Policy from the SAME config the banner runs on
  (categories, services, consent model, GPC/DNT/expiry/receipts), so a policy can
  never drift from the banner. Authored in the plugin's Publish tab (`LegalDocsCard`)
  with copy + download. Candidate sibling product sharing the portal account.
- **4.4 ✅ Accessibility badge + audit report** (∅) — _done 2026-09-19_ —
  markets the focus-trap/ARIA/WCAG-AA machinery the runtime already ships. Pure
  `shared/src/accessibility.ts`: `auditAccessibility(config)` returns a
  pass/warn/fail/info scorecard (8 always-on guarantees grounded in
  `runtime/src/banner.ts`+`styles.ts`, plus config-derived checks — the
  author-controlled accent contrast is MEASURED against WCAG AA 4.5:1, not
  assumed); `generateAccessibilityReport` emits a Markdown audit; and
  `buildAccessibilityBadge` emits a self-contained inline-SVG "WCAG 2.1 AA" badge
  (no image host). Authored in the plugin's Publish tab (`AccessibilityCard`).
  Runtime bundle unchanged (pure + plugin-only → tree-shaken); 444 tests.

---

## Explicitly deferred

- **Google-certified CMP / IAB TCF v2.3.** Breaks the zero-infra moat (weekly GVL sync, IAB fees,
  decertification risk) and serves ad publishers, not our design-led buyer — who are already
  covered by our correct Consent Mode v2. **Revisit only** as an isolated, opt-in "Publisher
  Edition" carrying its own infra, and only on repeated real ad-publisher demand. (Full reasoning:
  [DEEP-DIVE.md](DEEP-DIVE.md) Part 0.)

---

## Critical dependencies (the order that actually matters)

```
Phase 1 (features)         ─┐
                            ├─► can ship on Framer independently
Phase 2.1 (core extract) ──┤
Phase 2.2 (portal license) ─┴─► REQUIRED before Phase 3 public launch
                                        │
                                        ▼
Phase 3 (embed → webflow → wordpress → shopify)
                                        │
                                        ▼
Phase 4 (depth, per platform as traction warrants)
```

**The one thing not to get wrong:** don't start Phase 3 platform launches before portal licensing
(2.2) exists, or you'll re-implement (and later have to unify) licensing N times.

---

## Immediate next actions (this week)

1. ~~Build **1.1 GPC + badge**~~ ✅ done (2026-09-13).
2. ~~Build **1.2 consent receipts**~~ ✅ done (2026-09-17). ~~Surface a "Download receipt" button in the banner preferences view~~ ✅ done (2026-09-18).
3. ~~Build **1.3 design-time tracker scanning**~~ ✅ done (2026-09-18).
4. ~~Build **1.4 region-aware auto-mode**~~ ✅ done (2026-09-18) — **Phase 1 complete.**
5. ~~Spike **2.1 core extraction** as a branch to de-risk the refactor.~~ ✅ done
   (2026-09-18) on `phase-2.1-core-extraction` — loader + adapter seam extracted
   into core, Framer reduced to an adapter, 225 tests green. ← next: **2.2 portal
   licensing** (duplicate the user module as a sister directory on **Dodo
   Payments**; needs your hosted portal + Workers), then revert the testing
   overrides; then Phase 3 platform expansion can begin.
6. ~~Build **3.1 embed snippet builder**~~ ✅ (2026-09-18), ~~**3.2 Webflow
   adapter core**~~ ✅ (2026-09-18, `shared/src/webflow.ts`), ~~**3.3 WordPress
   adapter core**~~ ✅ (2026-09-18, `shared/src/wordpress.ts`) and ~~**3.4 Shopify
   adapter core**~~ ✅ (2026-09-18, `shared/src/shopify.ts`, 272 tests green) —
   **all four Phase 3 platform adapter cores complete** — and now **all four App
   shells** too (3.1 `apps/embed-config`, 3.2 `apps/webflow-app`, 3.3
   `apps/wordpress-plugin`, 3.4 `apps/shopify-app`). The only remaining Phase-3
   work is deploy-time infra you own (host the embed page; create the Webflow app
   + Cloudflare Worker; zip/install the WordPress PHP plugin; `shopify app deploy`
   the theme app extension) and, finally, **2.2 portal licensing** + reverting the
   testing overrides (the parked "do last" item, needs your portal + Lemon
   Squeezy ids + Workers).
7. ~~Confirm the two open items from earlier: real `POWERED_BY_URL` and a light-logo
   variant for dark banners.~~ ✅ done (2026-09-19). `POWERED_BY_URL` set to
   `https://consentful.theplugins.co`; the powered-by logo now swaps by theme mode
   (dark banners + `auto`-under-system-dark use `logo-light.png` via a `<picture>`).
   **Asset pending from you:** drop `logo-light.png` next to `logo.png` at
   `plugin/public/logo-light.png` and re-tag — until then dark banners fall back to
   the "Powered by Consentful" alt text (graceful). (The WordPress plugin's
   `Plugin URI` header still reads `thepluginsco.com` — left as-is; that's the
   plugin homepage field, not the banner credit.)

---

## Progress log

### 2026-09-19 — Phase 2.2 licensing model DECIDED (pre-build spec) 📋
- **Decision only — no code yet.** Locks the licensing/pricing model before
  duplicating the user module, because the *unit* drives the whole schema (Worker
  validation, receipt fields, plugin license card). Full spec now lives in
  **§2.2 Portal licensing** above.
- **Unit = registrable domain (eTLD+1), platform-agnostic.** A "site" = a root
  domain + ALL its subdomains, on ANY platform — so `example.com` (Framer) +
  `shop.example.com` (Shopify) + `blog.example.com` (WP) = ONE slot. Platform
  never enters the count; two different root domains = two slots. Rejects
  per-platform (one shared core → charging twice contradicts "one consent layer
  everywhere").
- **Staging domains never count.** Known preview suffixes (`.framer.website`,
  `.framer.app`, `.webflow.io`, `.myshopify.com`, localhost/dev) run in full
  without consuming a slot, so customers can build before their real domain / a
  Shopify custom domain is live.
- **Flat feature gating.** All paid tiers unlock all Pro features; **site count is
  the only lever** between tiers → trivial validation matrix. Free = banner-only +
  powered-by credit.
- **Pricing (monthly + yearly both).** Solo 1 site $12/mo · $99/yr; Studio 5 sites
  $24/mo · $199/yr; Agency 25 sites $49/mo · $399/yr. Yearly ≈ 2–3 months free.
- **Limited LTD.** $299 one-time, **3 sites**, **250 codes** then closed, "lifetime
  of the product," current Pro + updates (future net-new premium modules may gate).
  Liability-capped by design.
- **Payments = Dodo Payments** (already wired in the template's user module — same
  as LingoLens/MediaGrabber; corrects the earlier "Lemon Squeezy" note). Build =
  **duplicate the user module as a sister directory** of this repo.
- **New schema fields** on the license: `type` (monthly/yearly/lifetime),
  `max_sites`, `licensed_domains[]`, `expires_at`, flat `features:"pro"`.
  Plugin needs a new **"manage sites"** card (list/add/remove domains, slots used).
- **Next:** duplicate the user module → wire the Dodo products → add the manage-sites
  card in the Framer adapter → validation Worker → revert testing overrides.

### 2026-09-19 — Polish: real powered-by URL + light-logo variant for dark banners ✅
- **Closes the last two open non-licensing action items (#7).** No new phase —
  the roadmap through Phase 4.4 was already complete; this clears the two brand
  polish items that were parked pending a decision + an asset. Licensing (2.2)
  stays parked LAST per the standing decision.
- **Powered-by URL.** `POWERED_BY_URL` in `runtime/src/banner.ts` moved off the
  placeholder to the real `https://consentful.theplugins.co` (confirmed by the
  user). It's the credit link published on every customer's live banner.
- **Light-logo variant.** The "Powered by Consentful" wordmark now follows the
  banner's `theme.mode` so it stays legible on dark surfaces:
  - `brand-mark.ts` gains `brandLightLogoUrl()` — the mirror of `brandLogoUrl()`
    resolving `/plugin/public/logo-light.png` from the served tag (same
    self-referential jsDelivr trick + a pinned fallback).
  - `banner.ts` gains `poweredByLogo(mode)`: `light` → the dark-ink `logo.png`;
    `dark` → `logo-light.png`; `auto` → a `<picture>` defaulting to `logo.png`
    with a `<source media="(prefers-color-scheme:dark)" srcset=logo-light.png>`,
    mirroring exactly how the `auto` palette flips in `styles.ts`.
  - `styles.ts`: `.cc-powered__pic{display:contents}` so the `<picture>` adds no
    box and the existing `.cc-powered__logo` sizing still applies.
- **Asset dependency (honest).** `logo-light.png` does not yet exist at the served
  tag; until the user drops it at `plugin/public/logo-light.png` and re-tags, dark
  banners degrade to the "Powered by Consentful" alt text (the same graceful
  fallback the main logo already documents). The credit's "Powered by" span keeps
  the wording legible regardless.
- **License-gate interaction (verified).** The dark/auto logo path only renders on
  a **licensed** banner — an unlicensed site gets `basicBannerConfig`'s neutral
  light theme, so the light logo is a paid-tier nicety, never shown on the free
  fallback bar.
- **Tests**: +2 (`tests/banner.test.ts`) — the credit links to
  `https://consentful.theplugins.co`, and the logo swaps variant by theme mode
  (light→`logo.png` plain img, dark→`logo-light.png` plain img, auto→`<picture>`
  with the dark-preference `<source>` = light logo + default img = dark-ink logo).
  Full suite **446 pass**; runtime typechecks; runtime builds at **49.41/52 KB**
  (+0.5 KB for the picture/variant logic, in budget).
- **Verified live in-browser** — the real built `consent.min.js` booted from a
  harness: with a paid (non-white-label `lifetime`) license, a `dark` config
  rendered the dark palette (`rgb(22,24,29)`) with the credit visible, href
  `https://consentful.theplugins.co`, and `logo-light.png`; an `auto` config
  rendered the `<picture>` with `media="(prefers-color-scheme:dark)"` srcset
  `logo-light.png` and default img `logo.png`. An unlicensed boot correctly showed
  the neutral light fallback bar (dark path not taken), confirming the gate.
- **Remaining**: only the `logo-light.png` asset (yours) + a re-tag; then the
  standing deploy-infra and the parked 2.2 portal licensing.

### 2026-09-19 — Phase 4.4 accessibility badge + audit report ✅
- **Fourth Phase-4 (depth) feature; licensing (2.2) still parked LAST.** Purely
  ∅-infra — pure string/data functions in the shared core, no Worker, no account,
  no network. It MARKETS accessibility work that already ships: rather than add
  behaviour, it audits and documents the focus trap, ARIA roles, `Esc`-to-close,
  focus restoration, `:focus-visible` outlines, reduced-motion honouring and WCAG
  AA contrast that `runtime/src/banner.ts` + `runtime/src/styles.ts` already
  implement.
- **The capability.** New pure `shared/src/accessibility.ts` exposes three things
  built from the SAME `CookieConsentConfig` the banner runs on:
  1. `auditAccessibility(config)` → a structured `A11yAuditResult` — a
     pass/warn/fail/info scorecard. Eight always-on **guarantees**
     (`A11Y_GUARANTEES`, each carrying its real WCAG success criterion, e.g. SC
     2.1.1 Keyboard / 2.1.2 No Keyboard Trap / 2.4.7 Focus Visible / 4.1.2
     Name-Role-Value / 4.1.3 Status Messages / 2.3.3 Reduced Motion) plus
     config-derived checks.
  2. `generateAccessibilityReport(config, input)` → a Markdown audit report
     (title/filename/disclaimer/verdict/checks table), date passed in for purity.
  3. `buildAccessibilityBadge(opts)` → a **self-contained inline-SVG** "WCAG 2.1
     AA" badge (role=img + `<title>`, optional `<a>` wrap) — ∅-infra, no image
     host, no request.
- **Measures, does not assume.** The one genuinely author-controllable WCAG pair —
  the accept button's white label on the author's accent colour — is MEASURED with
  the WCAG relative-luminance maths (`parseColor`/`relativeLuminance`/
  `contrastRatio`, mirroring `runtime/src/styles.ts`, duplicated because `shared/`
  must not depend on `runtime/`). A ratio ≥ 4.5:1 passes; below fails and
  **withholds the AA badge** (`badge:'attention'`); an unparseable accent
  (`var(--brand)`) is flagged `info` for manual review, never falsely failed.
  Reject-button parity → warn (not fail) when off; floating reopen button → info;
  custom CSS → info (can't statically verify overrides). Warnings don't block the
  badge; a single fail does.
- **Plugin** (`panels.tsx`): an "Accessibility" card on the Publish tab
  (`AccessibilityCard`) reads the LIVE config from settings context (same pattern
  as `LegalDocsCard`/`EmbedSnippetCard`), renders the coloured scorecard + a
  headline verdict, a website-name input, Copy/Download for the report, and — only
  when the audit passes — a live badge preview + "Copy badge HTML". No new engine;
  the plugin only calls the shared functions (re-exported via `plugin/src/types.ts`
  `export * from shared`).
- **Bundle**: **runtime bundle unchanged** (48.91/52 KB) — `accessibility.ts` is
  pure and referenced only by the plugin, so it tree-shakes out of the runtime.
  Only the plugin bundle grows (authoring surface).
- **Tests**: +21 (`tests/accessibility.test.ts`) — contrast maths
  (parse/ratio/luminance, null on unparseable), every guarantee reported as pass +
  a stable/unique guarantee set, default accent passes → wcag-aa badge, low-
  contrast accent fails → attention badge, unparseable accent → info-not-fail,
  reject on/off (pass/warn, warn doesn't block badge), floating button (pass/info),
  custom CSS (info only when present, whitespace = absent), count invariant, purity
  (no mutation of config or `DEFAULT_CONFIG`), report (title/filename/disclaimer/
  date threading/placeholders/AA-vs-fix verdict/every-check-listed/determinism),
  badge (self-contained accessible SVG, `<a>` wrap on href, accent fallback,
  XML-escaping). Full suite **444 pass**; shared + plugin typecheck; plugin builds;
  runtime builds unchanged.
- **Verified live in-browser** — the standalone plugin preview: the "Accessibility"
  card renders on the Publish tab, the verdict shows **"Meets WCAG 2.1 AA — 10
  checks passed"**, every guarantee row lists its real WCAG SC, the contrast row
  shows the LIVE-measured **"white on the #2F6FED accent … 4.55:1"**, and the
  self-contained SVG badge + "Copy badge HTML" render (present only because the
  audit passed). The contrast-fail flip (verdict → fix count, badge withheld) is
  deterministic and covered by the unit tests.
- **Remaining for 4.4**: none essential — ∅-infra and live. **All four Phase-4
  depth features (4.1–4.4) are now complete.** The only remaining roadmap work is
  deploy-time infra you own + the parked 2.2 portal licensing (do LAST).

### 2026-09-19 — Phase 4.3 bundled legal-doc generator ✅
- **Third Phase-4 (depth) feature; licensing (2.2) still parked LAST.** Purely
  ∅-infra — pure string functions in the shared core, no Worker, no account, no
  network. The banner config is already the source of truth for what the site
  does with cookies, so the policy is DERIVED from it and can never drift from
  the actual banner.
- **The capability.** A new pure `shared/src/legal-docs.ts` turns a
  `CookieConsentConfig` into two Markdown documents:
  `generateCookiePolicy(config, input)` and `generatePrivacyPolicy(config, input)`
  (plus `generateLegalDocs` returning both). Every document carries a review
  disclaimer ("generated template, not legal advice"), and site facts the config
  can't supply (site name, legal entity, contact email, effective date) are
  PASSED IN — a missing one renders a clearly-bracketed placeholder (`[Your
  Company]`, `[Effective date]`), never a fabricated value.
- **Derives, does not fabricate.** Category names/descriptions come from the
  config's own `strings.categories` overrides (falling back to the category
  label/description), the services table is built from the author's
  `ManagedScript` rows (name + tagId + provider + purpose, grouped by category),
  and the "how we ask for consent" prose is read off the real `BehaviorConfig` —
  opt-in vs opt-out vs auto wording, the floating-button-vs-reopen control,
  `consentExpiryDays`, and GPC / Do-Not-Track / receipts sentences that appear
  ONLY when those flags are on. So the policy always matches how the banner
  actually behaves.
- **Vendor enrichment.** A recognised service is linked to the vendor's canonical
  privacy policy via a small `VENDOR_POLICY_URLS` map keyed by the tracker
  catalog's `vendor` (matched by provider host, then by name). Unknown providers
  get the author-entered host and NO guessed link. Table cells escape `|` so
  vendor/purpose text can't break a Markdown row.
- **Privacy policy is an honest scaffold.** It covers only the tracking/cookies
  dimension the banner governs in full and marks the wider sections
  ("Information we collect", "Sharing", "Your rights") as `_[to complete]_` for
  the author — a starting structure, explicitly not a substitute for a full
  privacy policy.
- **Plugin** (`panels.tsx`): a "Legal documents" card on the Publish tab
  (`LegalDocsCard`) reads the LIVE config from the settings context (same pattern
  as `EmbedSnippetCard`), offers a Cookie/Privacy toggle + site-name / entity /
  contact-email inputs, renders the generated Markdown live, and Copy / Download
  (`.md`) it. Effective date defaults to today. No new engine — the plugin only
  calls the shared generators.
- **Bundle**: **runtime bundle unchanged** — `legal-docs.ts` is pure and
  referenced only by the plugin, so it is tree-shaken out of the runtime. Only
  the plugin bundle grows (authoring surface).
- **Tests**: +19 (`tests/legal-docs.test.ts`) — cookie-policy structure
  (title/filename/effective-date/disclaimer/trailing newline), input threading +
  entity→site fallback, missing-input placeholders, category list from config
  string overrides + required flag, services table + tag ids, recognised-vendor
  policy link, unknown-provider no-link, `|` escaping, empty-scripts honest
  statement, opt-in/opt-out/auto mechanics, GPC+DNT+receipts on/off, floating
  button vs banner + expiry days, privacy-policy scaffold, `generateLegalDocs`
  both, purity (no mutation of config or `DEFAULT_CONFIG`), determinism. Full
  suite **423 pass**; shared builds; plugin typechecks + builds; runtime
  typechecks (bundle untouched).
- **Verified live in-browser** — the standalone plugin preview: the "Legal
  documents" card renders on the Publish tab, the output textarea shows the
  generated Cookie Policy stamped with today's effective date + the disclaimer,
  typing a website name propagates into the document live, and switching to
  Privacy Policy renders the cookie section + the `_[to complete]_` scaffold with
  a "Your rights" section.
- **Remaining for 4.3**: none essential — ∅-infra and live. Next Phase-4 depth
  item per your call (4.4 accessibility badge + audit report).

### 2026-09-19 — Phase 4.2 full preference center + per-vendor toggles ✅
- **Second Phase-4 (depth) feature; licensing (2.2) still parked LAST.** Purely
  ∅-infra — everything lives client-side on the existing consent record, no
  Worker, no account. Both new flags default OFF, so the preferences modal keeps
  its exact prior per-category shape unless the author opts in.
- **The capability.** The preferences modal grows two optional layers:
  (1) `showVendors` lists the individual services (config
  {@link ManagedScript}s) grouped under each category — name + one-line
  `purpose` — for real transparency about *what* a category unblocks;
  (2) `perVendorToggles` additionally gives each listed vendor its own on/off
  switch. A vendor a visitor turns off is **held back by the script blocker even
  while its category is granted** — genuine per-vendor consent, not cosmetic.
- **Compliance boundary (honest).** Per-vendor control applies to config scripts
  (they carry stable ids); markup `type="text/plain"` placeholders have no
  vendor id and stay category-gated — proven by a test. Consent Mode signals
  remain category-granularity (they inherently are), so per-vendor toggles are a
  finer *script-blocking* layer on top, never a change to the legal basis.
- **Schema** (`shared/src/config-schema.ts`): new root `preferenceCenter`
  (`showVendors`/`perVendorToggles`, both default false, merged/coerced); new
  `ManagedScript.purpose` (default `''`, falls back to the provider host);
  new localizable `strings.vendorsHeading` (default `"Services"`, wired through
  `LocaleStrings`/`LOCALE_STRING_KEYS`/`mergeStrings` + the runtime's i18n
  overlay). Backward-compatible — old embeds merge forward untouched.
- **Runtime — consent record** (`runtime/src/consent-state.ts`): `ConsentState`
  and `ConsentReceipt` gain an OPTIONAL `vendors` map (script id → granted),
  present only when the visitor made vendor-level choices; `writeConsent`/
  `accept` take an optional vendors arg, filtered to real script ids (junk
  dropped), and the receipt fingerprint appends vendors ONLY when present — so a
  category-only receipt hashes and verifies byte-for-byte as before (existing
  receipt tests unchanged).
- **Runtime — blocker** (`runtime/src/script-blocker.ts`): pure
  `deniedVendorsOf(state)` + a second gate in `injectConfigScripts` — a denied
  vendor is skipped and NOT marked injected, so re-enabling it later still
  activates it (no reload needed to grant; denying an already-run tag needs a
  reload, same honest limit as category-level today).
- **Runtime — banner** (`runtime/src/banner.ts` + `styles.ts`): each category
  row is wrapped in a `.cc-cat-block` that also holds its vendor list; per-vendor
  switches mirror the category switch (disabled while the category is off, so the
  UI can't imply a vendor will run when its category is denied); `savePreferences`
  collects the vendor map and passes it to `api.accept(granted, 'custom', vendors)`.
  Compact `.cc-switch--sm` variant + vendor-list styles added.
- **Plugin** (`model.ts`/`panels.tsx`/`modals.tsx`): flat `showVendors`/
  `perVendorToggles` on `Cfg` (+ scalar setters), a "Preference center" card in
  the Scripts panel (list-services toggle → reveals the per-vendor-switches
  toggle), and an optional "Purpose" field in the Add-managed-script modal. The
  four App shells' config-forms carry `purpose: ""` (Framer is the purpose
  authoring surface; `mergeConfig` fills it identically, so one-engine holds).
- **Bundle**: preference-center code added ~3.2 KB raw / **~0.9 KB gzipped**
  (14.7→15.6 KB gz). Raw budget raised 48→52 KB with an honest comment (wire cost
  — the ~15.6 KB gzip — is what matters; still tiny; headroom kept). Runtime
  builds at 48.91/52 KB.
- **Tests**: +16 (`preference-center.test.ts` ×9: schema defaults/coercion +
  purpose + vendorsHeading round-trip; consent-state vendor persist/round-trip,
  unknown-id filtering, category-only back-compat, vendored receipt verify+tamper,
  api threading, `deniedVendorsOf`; `preference-center-runtime.test.ts` ×7 under
  jsdom: denied vendor blocked while sibling runs, re-enable activates, markup
  placeholder untouched, vendor list renders name+purpose, off-by-default hides
  the list, per-vendor save records the map, category-off disables the switch).
  Full suite **404 pass**; all workspaces typecheck; plugin + runtime build.
- **Verified live in-browser** — a harness booting the real `consent.min.js`
  with `showVendors`+`perVendorToggles` on and three vendors: the modal rendered
  the two "Services" lists (name + purpose per vendor), the marketing vendor's
  switch was disabled because its category was off, and after unchecking the GA4
  vendor and saving, the stored decision carried
  `vendors:{ga4:false,clarity:true,meta:true}` (on the record AND its receipt) —
  and on both a clean reload and a clean interactive save, **only `clarity`
  ran** (denied vendor `ga4` and denied-category `meta` held back).
- **Remaining for 4.2**: none essential — the feature is ∅-infra and live.
  Next Phase-4 depth item per your call (4.3 legal-doc generator, 4.4
  accessibility badge).

### 2026-09-19 — Phase 4.1 A/B consent-rate testing + dashboard ✅
- **First Phase-4 (depth) feature.** Licensing (2.2) remains parked; the runtime
  gates presentation regardless, so no licensing wiring was needed.
- **One engine, one invariant.** New pure core `shared/src/ab-test.ts`:
  `isAbTestActive` / `chooseVariantId` (weighted, injected-random →
  deterministic) / `findVariant` / `applyVariant` / `abTestSignature`. The
  load-bearing rule is enforced by `applyVariant`: a variant may override ONLY
  presentation (`strings` + `banner` + `theme`); every compliance section
  (categories, scripts, consentMode, behavior) is carried from the base
  unchanged, so **every visitor is protected identically no matter the variant**.
  New schema `AbTestConfig`/`AbVariant` (root `abTest`, default off/empty) with a
  bounded, sparse-override merge (`mergeAbTest`/`normalizeVariant` drop empty/
  invalid fields, default ids `V1…`, floor weights).
- **Runtime — impure half only** (`runtime/src/variant.ts`): `resolveActiveVariant`
  does sticky (localStorage `cc_ab`, keyed by `abTestSignature` so it
  self-invalidates on edit) + weighted random assignment, then returns the
  variant-applied config. Guarded for private-mode/no-crypto (degrades to a fresh
  draw). Boot (`index.ts`) resolves the variant FIRST and renders it.
- **Analytics dimensions** (`runtime/src/analytics.ts`): `ConsentEvent` gains
  optional `variant` + `region`; `AnalyticsContext` is a LIVE object the boot
  fills (variant at boot, `region` once geo resolves via new
  `geo.regionBucket` → `EU`/`UK`/`CH`/`US-CA`/`OTHER`/`UNKNOWN`), read at report
  time so the visitor's real click carries both. A non-tested site emits the
  exact prior payload (keys omitted when absent).
- **Worker** (`analytics-worker.js`): per-day `variants{}` + `regions{}`
  accept/reject/custom sub-counts, sanitised slugs, back-compat healing of
  pre-4.1 day buckets. Still counters only — no IP/cookie/id.
- **Plugin**: flat `abTestEnabled`/`abVariants` on `Cfg` (+`applyAbTest`/`toCfg`),
  an "A/B testing" authoring card in Behavior (enable + per-variant label/weight/
  copy+layout overrides, inherit-when-empty, seeds two starters), and a ranked
  "Accept rate by variant" + "by region" breakdown on Insights (winner badge at
  ≥30 samples).
- **Bundle**: importing the new shared value-exports tipped esbuild out of
  aggressive tree-shaking (tracker-scan leaked into the runtime, +4.7 KB); fixed
  by marking the (pure) shared package `"sideEffects": false`. Net honest feature
  cost ~3.4 KB raw / **~1 KB gzipped** (13.9→14.7 KB gz). Runtime raw budget
  raised 44→48 KB with an honest comment (wire cost is what matters; still tiny).
- **Tests**: +33 (`ab-test.test.ts` ×16 engine+schema, `variant-runtime.test.ts`
  ×7 stickiness/inert/malformed, `ab-analytics.test.ts` ×6 event dims +
  regionBucket, `ab-model.test.ts` ×4 plugin mappers + one-engine identity). Full
  suite **388 pass**; all workspaces typecheck; plugin builds; runtime builds at
  45.71/48 KB.
- **Verified live in-browser** — a harness booting the real `consent.min.js` with
  a 2-variant test + a forced sticky `cc_ab={id:B}`: the banner rendered
  **variant B's** copy ("VARIANT B TITLE" / "Accept B"), and the analytics POST
  captured on Accept was
  `{"type":"accept","categories":{…},"version":"1","variant":"B","region":"OTHER"}`
  — variant + region tagged, base payload unchanged. The worker aggregation +
  dashboard against a real deployed Worker is **not** verified live (your infra);
  covered by unit tests + the faithful worker model.
- **Remaining for 4.1**: deploy-time only — the same analytics Worker deploy
  already pending in PROGRESS.md; per-variant numbers appear in Insights once it's
  live. Next Phase-4 depth item per your call (4.2 pref center, 4.3 legal-docs,
  4.4 accessibility badge).

### 2026-09-18 — Phase 3.4 Shopify App shell ✅ (theme app extension + consent bridge) — all four App shells complete
- **Sequencing note** — the LAST of the Phase-3 App shells (built one by one per
  the user decision); licensing (2.2) stays parked LAST. The runtime gates
  presentation regardless of licensing, so no licensing wiring is needed.
- **New workspace — `apps/shopify-app/`** — the Shopify front-end for the shared
  engine, in three parts split along Shopify's deploy model (bake + CLI-deploy an
  extension, not write into a live host — so it is the embed page's shape, not
  Webflow's Worker):
  - **Authoring UI** (`src/main.ts` → `src/app.ts`) — a framework-free, ∅-infra
    static page (vanilla TS + Vite, 24.8 KB / 8.5 KB gz). Author the banner,
    live-preview the real runtime, then **copy/download** the generated
    `blocks/consentful.liquid` app-embed block. No network at all.
  - **Theme app extension** (`extension/`) — the deployable artifact:
    `shopify.extension.toml`, the generated `blocks/consentful.liquid`
    (`target: "head"`), and the built consent-bridge asset.
  - **Consent bridge** (`src/consent-bridge.ts` → esbuild →
    `extension/assets/consentful-consent-bridge.js`, 13.79 KB) — the storefront
    runtime hook the core deliberately left to the shell.
- **The shell-owned block composer — `buildConsentfulBlock`** (`src/extension.ts`):
  wraps the shared `buildShopifyAppEmbedBlock` and adds the ONE Shopify-specific
  runtime piece — a deferred `<script src="{{ '…' | asset_url }}">` for the
  bridge. It splices that tag into the Liquid gap the core already leaves between
  `{%- endraw -%}` and `{% schema %}`, so it never touches the loader bytes inside
  `{% raw %}` (one-engine holds) nor the schema block.
- **The runtime hook — the Customer Privacy bridge** (`src/consent-bridge.ts`):
  reads the config the loader put on `window.__CC_CONFIG__` (through the shared
  `mergeConfig`, so categories carry their signals), then on boot and on every
  `cookieconsent:change` calls
  `Shopify.customerPrivacy.setTrackingConsent(mapToShopifyConsent(config, granted))`
  — the SAME pure mapper the core ships, so Shopify's checkout / Web Pixels honour
  our banner and can't drift. `whenCustomerPrivacyReady` bounded-polls for a
  late-loading `customerPrivacy` (Shopify exposes no cross-surface ready promise).
- **One engine.** The page's `configFromForm` (`src/config-form.ts`, pure +
  tested) runs the flat form through the shared `mergeConfig`; a test asserts the
  deployed block bakes the byte-identical `configScriptBody(config)` the Framer
  loader, embed, Webflow and WordPress emit. `defaultFormState` seeds from
  `DEFAULT_CONFIG`.
- **Tests**: +21 (`tests/shopify-config-form.test.ts` ×7: default seeding,
  necessary always-on, drop disabled category, opt-out default, drop empty
  script, one-engine block identity, fresh-object; `tests/shopify-extension.test.ts`
  ×6: same filename, core block verbatim, bridge tag via asset_url, bridge OUTSIDE
  `{% raw %}`, schema intact + head-targeted, runtimeUrl passthrough;
  `tests/shopify-consent-bridge.test.ts` ×8: grantedCategoryIds, resolveConfig
  signals, relayConsent payload + deny-by-default, whenCustomerPrivacyReady
  immediate + poll, startConsentBridge boot-state + change subscription). Full
  suite **355 pass**; the shopify-app workspace typechecks clean; the bridge
  builds (13.79 KB) and the authoring UI builds; **runtime bundle unchanged**
  (separate static + esbuild targets).
- **Verified live in-browser** — the authoring page renders (brand chrome,
  defaults-seeded form); its preview iframe boots the real `consent.min.js`
  (`window.CookieConsent` installed, banner mounted); the generated block shows
  the `{%- raw -%}` wrapper, the `asset_url` bridge tag and `"target": "head"`;
  and a live title edit propagates to BOTH the block and the preview. The
  `setTrackingConsent` relay against a real store is **not** verified live (needs
  a deployed extension + a storefront with `Shopify.customerPrivacy` — your
  infra); covered by the unit tests + the faithful Customer Privacy API model.
- **Remaining for 3.4**: deploy-time only — `npm run build` then
  `shopify app deploy` the `extension/`, and toggle it on in the store's Theme
  editor → App embeds. Confirm `shopify.extension.toml` (`api_version`, keys)
  against your Shopify CLI version. See `apps/shopify-app/README.md`. **All Phase
  3 App shells are now complete**; the only Phase-3 work left is your per-platform
  deploy infra, then 2.2 portal licensing (parked LAST).

### 2026-09-18 — Phase 3.3 WordPress App shell ✅ (PHP plugin + admin bundle)
- **Sequencing note** — still building the Phase-3 platform **App shells** one by
  one (user decision); licensing (2.2) stays parked LAST. This is the third
  shell after 3.1 and 3.2. The runtime gates presentation regardless of
  licensing, so no licensing wiring is needed for the shell to work.
- **New workspace — `apps/wordpress-plugin/`** — the WordPress front-end for the
  shared engine, split exactly along WordPress's credential boundary:
  - **Admin bundle** (`src/` → built to `plugin/consentful/assets/`) — a
    framework-free (vanilla TS + Vite) authoring panel that runs inside wp-admin:
    author the banner, live-preview the real runtime, pre-fill trackers from the
    site's active plugins, and Publish/Remove on the current site. Holds no
    secret; calls the site's REST API. Built to STABLE filenames straight into
    the shippable PHP plugin (29.5 KB / 9.8 KB gz).
  - **PHP plugin** (`plugin/consentful/`) — the credential-holding shell. It
    persists ONE autoloaded option holding our loader block, echoes it verbatim
    on `wp_head` at priority 1 (a **dumb printer** — it never builds or
    re-escapes the loader; the shared engine does), and exposes the option +
    `active_plugins` over a capability-gated REST namespace. Files:
    `consentful.php` (bootstrap), `includes/class-consentful-head.php` (the
    `wp_head` printer), `includes/class-consentful-rest.php` (the store), 
    `includes/class-consentful-admin.php` (Settings screen + enqueue +
    `wp_localize_script` bootstrap), `uninstall.php`.
- **The core deliverable the plan named — `WordPressRestStore`**
  (`src/rest-store.ts`): the concrete `WordPressLoaderStore` (the seam
  `shared/src/wordpress.ts` left behind) wired to the WordPress REST API —
  `GET/POST /consentful/v1/head` and `GET /consentful/v1/active-plugins`, with
  the `X-WP-Nonce` header. `detectTrackers()` routes `active_plugins` through the
  shared `detectWordPressTrackers`. Injected `fetch`, so every request shape is
  unit-tested; the pure `installWordPressLoader`/`removeWordPressLoader` is run
  end-to-end against an in-memory fake of the PHP controller (byte-identical
  block, churn-free re-install, foreign-head preservation, strip-to-clear).
- **One engine.** The admin's `configFromForm` (`src/config-form.ts`, pure +
  tested) runs the flat form through the shared `mergeConfig`; a test asserts the
  published block equals `buildLoaderHtml(config)` and contains
  `configScriptBody(config)` — the exact bytes the Framer loader, embed and
  Webflow emit. WordPress reuses the SAME `installLoader`/`removeLoader` head-blob
  core Framer uses (no sibling installer). `mergeDetectedScripts` idempotently
  pre-fills detected trackers as script rows.
- **Security model (honest).** Every REST route checks
  `current_user_can('manage_options')`; writes carry the REST nonce. The stored
  block is printed **unescaped** on purpose — it is our own generated `<script>`
  loader, writable only through the gated route (same trust model as
  Framer/Webflow custom code) — documented in the head-printer docblock + README.
- **Tests**: +21 (`tests/wordpress-rest-store.test.ts` ×12: request shapes +
  nonce, unset→'', clear-to-null, error path, install byte-identity, churn-free,
  foreign-head preservation, remove-strips/clears, remove no-op, detect wiring +
  empty; `tests/wordpress-config-form.test.ts` ×9: default seeding, necessary
  always present, drop disabled category + empty scripts, opt-out default,
  one-engine loader identity, `mergeDetectedScripts` append/dedupe/no-mutate/empty).
  Full suite **334 pass**; the wordpress-plugin workspace typechecks clean; the
  admin bundle builds; **runtime bundle unchanged** (separate static target).
- **Verified live in-browser** — the admin panel renders (brand chrome,
  defaults-seeded form) and its preview iframe boots the real
  `consent.min.js` from the pinned CDN (`@v0.1.6`) with `window.CookieConsent`
  installed, the banner mounted (Accept all + "Powered by Consentful"). Publish
  is correctly disabled in the standalone dev harness (no WordPress REST). The
  REST install/remove against a real site is **not** verified live (needs a
  WordPress install with the plugin activated — your infra); covered by the unit
  tests + the faithful `wp_head`/`active_plugins` model.
- **Remaining for 3.3**: deploy-time only — `npm run build` then zip
  `plugin/consentful/` and install it. Optional follow-on: persist the authored
  config (not just the emitted loader) so the screen reopens on last-published
  values. See `apps/wordpress-plugin/README.md`. Next App shell (one by one):
  **3.4 Shopify** (theme app extension deploy + the runtime hook calling
  `Shopify.customerPrivacy.setTrackingConsent`).

### 2026-09-18 — Phase 3.2 Webflow App shell ✅ (Designer Extension + Data Client Worker)
- **Sequencing note** — still building the Phase-3 platform **App shells** one by
  one (user decision); licensing (2.2) stays parked LAST. This is the second
  shell after 3.1. The runtime gates presentation regardless of licensing, so no
  licensing wiring is needed for the shell to work.
- **New workspace — `apps/webflow-app/`** — the Webflow front-end for the shared
  engine, in two halves that split exactly along the credential boundary:
  - **Designer Extension** (`src/main.ts` → `src/designer/`) — a framework-free
    (vanilla TS + Vite) authoring panel that runs inside the Webflow Designer:
    author the banner, live-preview the real runtime, Publish/Remove on the
    current site. Holds no credentials; calls the Worker. Mirrors the embed
    page's shape (25 KB / 8.6 KB gz).
  - **Data Client Worker** (`src/worker.ts`) — a Cloudflare Worker (our "+worker"
    pattern) that owns the OAuth `client_secret` and the per-site access token
    (KV), and runs the SHARED `installWebflowLoader`/`removeWebflowLoader` engine
    against the live Webflow v2 API. Routes: `/authorize`, `/callback`,
    `/api/install`, `/api/remove`, `/api/status`.
- **The core deliverable the plan named — `WebflowApiClient`** (`src/webflow-api-client.ts`):
  the concrete `WebflowClient` (the seam `shared/src/webflow.ts` left behind) wired
  to the real Webflow v2 Data API, verified against the live docs 2026-09-18:
  `GET/POST …/registered_scripts[/inline|/hosted]`, `GET/PUT …/custom_code`,
  `POST …/publish`; `runtimeIntegrityHash` fetches the bundle and computes a real
  `sha384-…` SRI via Web Crypto. Every method takes an injected `fetch`, so the
  verb/path/body/headers are fully unit-tested; the pure `installWebflowLoader`
  is run end-to-end against a recorded fake fetch (register → apply header →
  publish, then a churn-free no-op re-install).
- **OAuth** (`src/oauth.ts`): pure `buildAuthorizeUrl` (→ `https://webflow.com/oauth/authorize`,
  `response_type=code`, `WEBFLOW_SCOPES` = `sites:read/write` + `custom_code:read/write`
  + `authorized_user:read`) and `exchangeCodeForToken` (→ `POST …/oauth/access_token`,
  `grant_type=authorization_code`). Injected fetch; request shape + error path
  tested.
- **One engine.** The Designer's `configFromForm` (`src/designer/config-form.ts`,
  pure + tested) runs the flat form through the shared `mergeConfig`; a test
  asserts the registered config inline body is byte-identical to
  `configScriptBody(config)` — the exact string the Framer loader and the embed
  emit. The panel's live preview boots the real runtime via `buildEmbedSnippet`.
- **Security note (honest, not faked).** `/api/*` currently trusts a token looked
  up by `siteId`. Production must additionally verify the Designer idToken
  (`getIdToken()` → `/token/resolve`) and assert the site matches — left as an
  explicit `TODO(prod)` in `src/worker.ts`, not stubbed.
- **⚠️ Inline-limit discrepancy to confirm before launch** — the core's
  `WEBFLOW_INLINE_MAX_CHARS` is 10 000, but Webflow's register-inline doc page
  now reads "max 2000 characters" in one place while the list page is silent.
  Left the core constant unchanged (the reading is via a summariser and may be
  wrong); flagged in the app README. Verify against the live docs before public
  launch.
- **Tests**: +30 (`tests/webflow-oauth.test.ts` ×5, `webflow-api-client.test.ts`
  ×8, `webflow-config-form.test.ts` ×5, `webflow-data-client.test.ts` ×6,
  `webflow-worker.test.ts` ×6). Full suite **313 pass**; the webflow-app
  workspace typechecks clean; the Designer extension builds (Vite, 25 KB); the
  **runtime bundle is unchanged** (the app is a separate static + Worker target).
- **Verified live in-browser** — the Designer panel renders (header, connection
  bar showing "No site selected" in dev, defaults-seeded form) and its live
  preview iframe boots the real `consent.min.js` with the banner + "Powered by
  Consentful". The OAuth/register/apply/publish flow itself is **not** verified
  live (needs a real Webflow app + OAuth token — your infra); it is covered by
  the unit tests and the faithful v2 API model above.
- **Remaining for 3.2**: deploy-time only — create the Webflow app, set the
  Worker secrets/KV + `VITE_WORKER_BASE`, add the idToken guard. See
  `apps/webflow-app/README.md`. Next App shell (one by one): **3.3 WordPress PHP
  plugin** or **3.4 Shopify** per your call.

### 2026-09-18 — Phase 3.1 App shell ✅ (hosted embed page + plugin copy-snippet)
- **Sequencing note** — building the Phase-3 platform **App shells** one by one
  (user decision), licensing (2.2) still parked LAST. 3.1's shell is the only
  fully ∅-infra one, so it lands first and complete — no external infra needed.
- **New workspace — `apps/embed-config/`** — a static, framework-free (vanilla
  TS + Vite) authoring page: the universal embed's front-end for hosts with no
  custom-code API (Wix, Squarespace, Ghost, Carrd, hand-coded). The user fills a
  form, sees a **live preview running the real jsDelivr runtime**, and copies the
  paste-ready `<script>` snippet. Output is plain static files (26 KB JS / 4 KB
  CSS gzipped ~9/1.3 KB) deployable to any host with zero server.
- **One engine.** The page's only real logic — `configFromForm(state)` in
  `apps/embed-config/src/config-from-form.ts` — builds a `DeepPartial` and runs
  it through the shared `mergeConfig`, then hands the result to the shared
  `buildEmbedSnippet`. So the page can't emit a config the runtime can't read,
  and its snippet is byte-identical to what the Framer loader / Webflow / embed
  emit. `defaultFormState()` seeds from `DEFAULT_CONFIG` (no duplicated defaults).
  `previewConfig()` forces `showMode:'everywhere'` + `consentModel:'opt-in'` for
  the preview iframe ONLY (the copied config is untouched) so the banner always
  demonstrates.
- **Plugin affordance** — `EmbedSnippetCard` in `plugin/src/consentful/panels.tsx`
  (Publish tab): a Framer user can reuse the exact same banner on a non-Framer
  site. Reads the live `config` from settings context, calls the same
  `buildEmbedSnippet`, offers an Inline-config/Single-tag (`window`/`attribute`)
  toggle + copy. No new engine — same shared builder.
- **Tests**: +11 (`tests/embed-config.test.ts`) — `defaultFormState` seeding,
  `configFromForm` (valid/current schema, drop disabled category, opt-out
  default-on, content/appearance/behavior threading, filled-vs-empty script,
  unnamed-script naming, serialize→parse round-trip), preview overrides
  (authored config untouched; preview forces show+prompt; document embeds the
  runtime), and one-engine identity (page snippet === `buildEmbedSnippet`). Full
  suite **283 pass**; all four workspaces typecheck clean; plugin + app build
  clean; **runtime bundle unchanged** (the new app is a separate static target,
  nothing added to the runtime).
- **Verified live in-browser** — the hosted page: real runtime boots in the
  preview iframe (banner + "Powered by Consentful"), live edits propagate to both
  the snippet and the preview, static prod build succeeds. The plugin: the
  "Embed on another site" card renders on the Publish tab, and the Single-tag
  toggle correctly swaps to the `data-cc-config` attribute form (no
  `window.__CC_CONFIG__`).
- **Remaining for 3.1**: none essential — the hosted page is deployable as-is.
  (Optional: host it under your domain + wire a real `POWERED_BY_URL`.) Next App
  shell (one by one): **3.3 WordPress PHP plugin** (or 3.2/3.4 per your call).

### 2026-09-18 — Phase 3.4 Shopify ✅ (adapter core) — Phase 3 platform cores complete
- **Sequencing note** — still under the "platforms first, licensing (2.2)
  LAST" decision. The runtime gates presentation regardless of licensing, so
  the Shopify adapter needs no licensing wiring to work.
- **Key finding — Shopify does NOT fit the head-blob `PlatformAdapter`** (like
  Webflow, unlike WordPress). The theme-update-safe, Shopify-recommended way to
  inject `<head>` code is a **theme app extension app-embed block** — a
  `blocks/*.liquid` file shipped in the app and toggled by the merchant in the
  theme editor — not a programmatic write into a free-form head region. So
  Shopify gets a *sibling builder*, and it is the Shopify analogue of the
  universal embed: it bakes the config into a deployable artifact rather than
  writing into a live host.
- **Still one engine.** `buildShopifyAppEmbedBlock(config, opts?)` emits the
  byte-identical loader — `configScriptBody` + `buildConsentDefaultSnippet`
  (Consent Mode default, only when enabled) + the version-pinned deferred
  `runtimeScriptUrl()` — so a Shopify store and a Framer site publish identical
  consent behaviour. The loader is wrapped in a Liquid `{% raw %}…{% endraw %}`
  block so the config JSON's `{`/`}` can never be parsed as Liquid tags; the
  `{% schema %}` (`target: "head"`) stays OUTSIDE raw because Shopify parses it
  specially. Returns `{ filename: "blocks/consentful.liquid", liquid }`.
- **The novel piece — `mapToShopifyConsent(config, grantedIds)`** — the bridge
  to Shopify's **Customer Privacy / Consent Tracking API**. Shopify's own
  checkout, Web Pixels and first-party pixel read consent from
  `window.Shopify.customerPrivacy`, so a banner on a Shopify store MUST relay
  each decision there or Shopify keeps its tags gated independently of ours. The
  mapper is pure and goes through the platform-neutral Consent Mode signals every
  category already carries (so it stays correct for custom categories):
  `analytics` ← `analytics_storage`; `marketing` ← any ad signal
  (`ad_storage`/`ad_user_data`/`ad_personalization`); `preferences` ←
  `functionality_storage`/`personalization_storage`; `sale_of_data` ← the ad
  signals again (CCPA sale/sharing, mirroring our GPC sale logic). Its output is
  the exact payload for `Shopify.customerPrivacy.setTrackingConsent(...)`.
- **Core** (`shared/src/shopify.ts`): `buildShopifyAppEmbedBlock`,
  `mapToShopifyConsent`, `SHOPIFY_BLOCK_HANDLE`/`SHOPIFY_BLOCK_FILENAME`/
  `SHOPIFY_APP_EMBED_NAME`, `ShopifyVisitorConsent`/`ShopifyConsentCategory`.
  All exported from `shared/src/index.ts`. Fully pure + testable with no Shopify
  SDK.
- **Impure surface behind the seam.** Deploying the extension (Shopify CLI /
  Admin API) and the browser call to `setTrackingConsent` live in the deferred
  Shopify App shell + a small runtime hook — the analogue of the Webflow App
  shell and the WordPress PHP plugin.
- **Tests**: +12 (`tests/shopify.test.ts`) — block builder (one-engine body
  identity, pinned runtime, valid head-targeted `{% schema %}` parsed back,
  `{% raw %}`-wraps-loader-not-schema, consent-off omits default, `comment:false`
  + `runtimeUrl` override) and the consent bridge (analytics-only, marketing →
  marketing+sale_of_data, preferences, none-denied, full-granted, a custom
  ad-signal category, and unknown ids ignored). Full suite **272 pass**; all
  three workspaces typecheck clean; plugin builds clean; **runtime bundle
  unchanged** (the Shopify core is pure + unreferenced by the runtime →
  tree-shaken out).
- **Not verified live** (needs a real Shopify store + deployed theme app
  extension — your infra); logic is covered by the unit tests and the faithful
  app-embed-block / Customer Privacy API model above.

### 2026-09-18 — Phase 3.3 WordPress ✅ (adapter core)
- **Sequencing note** — still under the "platforms first, licensing (2.2)
  LAST" decision. The runtime gates presentation regardless of licensing, so
  the WordPress adapter needs no licensing wiring to work.
- **Key finding — WordPress DOES fit the head-blob `PlatformAdapter`** (unlike
  Webflow). A PHP plugin can persist one option and echo it verbatim on the
  `wp_head` action, so the loader region is simply "that option's value". So
  WordPress reuses the SAME `installLoader`/`removeLoader` core Framer uses —
  no sibling installer. The only WordPress-specific injection code is
  `wordpressAdapter(store)`, a ~10-line wrapper over an injected
  `WordPressLoaderStore` (`readHeadOption`/`writeHeadOption`) — the analogue of
  Framer's `getCustomCode`/`setCustomCode`.
- **Still one engine.** The block stored is the byte-identical `buildLoaderHtml`
  output (test asserts `store.option === buildLoaderHtml(config)`), so a
  WordPress site and a Framer site publish the exact same loader. PHP stays a
  dumb printer that never re-implements the config escaping or the Consent Mode
  default. Runtime is the same version-pinned jsDelivr bundle.
- **The novel piece — `detectWordPressTrackers(activePlugins)`** — the
  plugin-list analogue of the design-time HTML `detectTrackers`. Where the HTML
  scan reads a *published* page, WordPress can pre-fill trackers *before*
  publish by mapping the site's `active_plugins` (`folder/main.php`) to known
  vendors via a conservative `WORDPRESS_TRACKER_PLUGINS` catalog (Site Kit,
  MonsterInsights, GTM4WP, PixelYourSite, Meta Pixel, Facebook for WooCommerce,
  Pinterest, TikTok, Clarity, Hotjar, LinkedIn Insight, Intercom). It reuses the
  same `TRACKER_CATALOG` + `TRACKER_CATEGORY_SIGNALS` and emits the identical
  `DetectedTracker` shape, so proposals flow through the exact same "add
  detected trackers" path the Framer plugin already uses. Since the plugin list
  carries no measurement id, each proposal uses the catalog's canonical loader
  URL as a clean, blockable placeholder `src` (`tagId: ''`); mappings are
  restricted to catalog entries that HAVE a loader so no empty payloads result.
  `normalizePluginSlug` collapses `folder/main.php` (or a single-file `x.php`)
  to a lowercased slug; results dedupe to one per tracker (first plugin wins).
- **Core** (`shared/src/wordpress.ts`): `wordpressAdapter`,
  `installWordPressLoader`/`removeWordPressLoader` (thin wrappers over the core
  seam), `detectWordPressTrackers`, `normalizePluginSlug`,
  `WORDPRESS_TRACKER_PLUGINS`, `WordPressLoaderStore`. All exported from
  `shared/src/index.ts`. Fully pure + testable with an in-memory store.
- **Impure surface behind the seam.** The WP REST/option calls, reading
  `active_plugins`, and the `wp_head` print all live in the deferred WordPress
  PHP plugin shell that supplies the `WordPressLoaderStore` and the active-plugin
  list — the analogue of the Webflow App shell and the Framer plugin host.
- **Tests**: +13 (`tests/wordpress.test.ts`) — seam (byte-identical block,
  foreign-head preservation, churn-free re-install, `runtimeUrl` override,
  strip-only-ours, clear-to-null, absent-block no-op, unset-option → `""`),
  `normalizePluginSlug`, and detection (multi-plugin map + shape/signals/loader
  URL, dedupe, empty/unknown/non-array → `[]`, and a catalog invariant that
  every mapping resolves to a catalog tracker WITH a loader). Full suite
  **260 pass**; all three workspaces typecheck clean; plugin builds clean;
  **runtime bundle unchanged** (the WordPress core is pure + unreferenced by the
  runtime → tree-shaken out).
- **Not verified live** (needs a real WordPress install with the PHP plugin
  shell — your infra); logic is covered by the unit tests and the faithful
  `active_plugins`/`wp_head` model above.

### 2026-09-18 — Phase 3.2 Webflow ✅ (adapter core)
- **Sequencing note** — still under the "platforms first, licensing (2.2)
  LAST" decision. Webflow's runtime gates presentation regardless of
  licensing, so the adapter needs no licensing wiring to work.
- **Key finding — Webflow does NOT fit the head-blob `PlatformAdapter`.**
  Verified against the live v2 Data API docs: Webflow has **no** editable
  free-form head/footer HTML region. Custom code is a two-step
  **registered → applied scripts** model — register each script on the site
  (an *inline* script's JS `sourceCode`, ≤ **10 000** chars, no `<script>`
  tags — Webflow wraps it; or a *hosted* script's URL + SRI `integrityHash`),
  each registration **immutable** and keyed by `displayName`+semver `version`;
  then **apply** a full `{id,location,version}` list to `header`/`footer` (a
  complete upsert — you must re-send everything you want kept); and changes
  only go live after a **publish**. So Webflow is the first platform to get a
  *sibling installer* rather than a `PlatformAdapter`.
- **Still one engine.** `shared/src/webflow.ts` reuses the byte-identical
  config + Consent Mode default script BODIES the Framer loader and the embed
  emit — factored out of `loader.ts` as new exported `configScriptBody` /
  `consentDefaultScriptBody` (loader + embed now wrap them in `<script>`;
  Webflow hands them raw to its inline-script API, which supplies the wrapper).
  `buildLoaderHtml`/`buildConsentDefaultSnippet` are unchanged output. Runtime
  is the same version-pinned jsDelivr bundle. A Framer site and a Webflow site
  therefore publish identical consent behaviour.
- **Immutability handled deterministically.** Inline registrations carry a
  **content-addressed** version (`contentVersion` = `0.0.<fnv1a32(sourceCode)>`),
  so every distinct config body gets its own immutable version with no
  server-side counter or stored state — identical content re-derives the same
  version, making re-registration a safe no-op; the runtime is pinned to
  `RUNTIME_VERSION` as bare semver. We recognise our own scripts by the
  `consentful` `displayName` prefix, so install/remove never touch a user's
  other scripts.
- **Core** (`shared/src/webflow.ts`): pure `buildWebflowRegistrations(config,
  integrityHash, opts?)` (throws `RangeError` if the config body exceeds the
  10 000-char inline cap) + orchestration `installWebflowLoader` /
  `removeWebflowLoader` over an injected `WebflowClient` (get/apply/list/register
  ×2/runtimeIntegrityHash/publish). Install applies OUR scripts to `header` in
  run order (Consent Mode default → config → deferred runtime LAST), preserves
  foreign scripts, reuses existing registrations, and is churn-free (skips apply
  **and** publish when the resulting list is unchanged — safe on every debounced
  edit). Remove strips only ours, no-op when none applied. All exported from
  `shared/src/index.ts`.
- **Impure surface behind the seam.** HTTP calls, the runtime's SRI hash, OAuth,
  and publishing all live on `WebflowClient`, implemented later by the Webflow
  App shell (which holds the user's Webflow credentials — the analogue of the
  Framer plugin host's `getCustomCode`/`setCustomCode`, and of the licensing
  Workers). Pure core is fully testable with an in-memory client.
- **Tests**: +13 (`tests/webflow.test.ts`) — builder (inline order + one-engine
  body identity + no `<script>` tags + content/pinned versions + runtimeUrl
  override + consent-off + over-limit throw), `fnv1a32`/`contentVersion`
  determinism, `isConsentfulScript`, and the installer driven by an in-memory
  `WebflowClient`: register+apply+publish header-order, foreign-script
  preservation, churn-free no-op re-install, config-edit version swap (no
  stale/duplicate left), `publishOnChange:false`, remove-strips-ours, and
  remove no-op. Full suite **247 pass**; all three workspaces typecheck clean;
  plugin builds clean; **runtime bundle unchanged at 42.27 / 44 KB** (the Webflow
  core is pure + unreferenced by the runtime → tree-shaken out).
- **Remaining for 3.2**: the Webflow **App shell** — a Designer/Data-Client App
  that implements `WebflowClient` against the real v2 API (OAuth with
  `custom_code:write`+`sites:write` scopes, an SRI source for the runtime, and a
  publish call) and reuses the existing React config UI. That needs your Webflow
  app credentials/infra; the pure engine every surface will call is done.
- **Not verified live** (the register→apply→publish flow needs a real Webflow
  site + OAuth token — your infra); logic is covered by the unit tests and the
  faithful API model above.

### 2026-09-18 — Phase 3.1 universal `<script>` embed ✅ (snippet builder)
- **Sequencing note** — **Phase 2.2 portal licensing is parked to be done LAST**
  (user decision). Platform expansion proceeds first; licensing gets unified at
  the end. The runtime already gates presentation regardless of licensing, so
  the embed needs no licensing wiring to work.
- **Core** (`shared/src/embed.ts`): pure `buildEmbedSnippet(config, options?)` —
  the universal front-end. Where Framer/Webflow/WordPress adapters *write* the
  loader into a host custom-code region, the embed has no host API: the user
  copy-pastes a snippet into their own `<head>`. Same engine — it reuses
  `escapeForScript` + `buildConsentDefaultSnippet` (now exported from `loader.ts`)
  verbatim, so embed and Framer loader can never drift — but formatted for a
  human paste target: a friendly leading comment, **no** internal splice markers,
  and two shapes the runtime already understands (`readEmbeddedConfig`):
  - `"window"` (default): inline `<script>window.__CC_CONFIG__={…}</script>` +
    deferred runtime tag;
  - `"attribute"`: a single runtime `<script src … data-cc-config="{…}" defer>`
    for hosts that allow only one tag / forbid inline bodies.
  Both inline the Consent Mode default (when enabled) so tags are denied the
  instant the head parses. New `escapeForAttribute` HTML-escapes the JSON for the
  double-quoted attribute (`&`,`"`,`<`,`>`), reversible by the browser before
  `parse`. Exported from `shared/src/index.ts`.
- **Loader** (`shared/src/loader.ts`): `escapeForScript` and
  `buildConsentDefaultSnippet` promoted from private to exported (one engine,
  reused by the embed) — no behaviour change; `buildLoaderHtml` still emits the
  identical marker-wrapped block.
- **Tests**: +9 (`tests/embed.test.ts`) — window form (comment, inline config,
  consent default, pinned deferred runtime, no markers), **one-engine identity**
  (the embed's config `<script>` is byte-identical to the Framer loader's),
  consent-default omitted when Consent Mode off, `comment:false`, `runtimeUrl`
  override, attribute form (single tag, no window global, consent default),
  attribute round-trip (`data-cc-config` decodes back to the exact config), and
  `escapeForAttribute` (ordering + a `"></script>` break-out that can't escape).
  Full suite **234 pass**; all three workspaces typecheck clean; plugin builds
  clean; **runtime bundle untouched** (embed is pure + unreferenced by the
  runtime → tree-shaken out).
- **Verified live in-browser** (real `consent.min.js`, `showMode:'everywhere'`):
  both snippet forms served over HTTP boot the shared runtime — `window.CookieConsent`
  installed, banner mounted, Consent Mode `default` all-`denied`
  (`security_storage:granted`). The `"attribute"` page has **no** `window.__CC_CONFIG__`
  yet still boots from the `data-cc-config` attribute alone.
- **Remaining for 3.1**: the hosted config page (a static, ∅-infra
  authoring UI that calls `buildEmbedSnippet` and offers copy) — plus, optionally,
  a "Copy embed snippet" affordance inside the Framer plugin. The pure engine is
  done and is what every one of those surfaces will call.

### 2026-09-18 — Phase 2.1 core extraction ✅ (loader + adapter seam)
- **Approach** — done on branch `phase-2.1-core-extraction` (de-risked, per the
  plan's spike note). Rather than a high-churn physical directory rename
  (`shared/`→`core/`, `plugin/`→`adapters/framer/`) that touches every import,
  workspace name, tsconfig and test for ~zero functional gain, the extraction
  **promotes the platform-neutral pieces into the existing `shared` package**
  (which already IS the de-facto core — schema + tracker-scan, consumed by both
  runtime and plugin) and **formalises the adapter seam** there. The Framer
  plugin is reduced to an adapter. The literal directory rename is an optional,
  purely-cosmetic follow-up.
- **Core / loader** (`shared/src/loader.ts`): the pure loader — `MARKER_START`/
  `MARKER_END`, `escapeForScript`, `buildConsentDefaultSnippet`,
  `buildLoaderHtml`, `upsertBlock`/`stripBlock`, new `hasBlock` — moved verbatim
  out of the plugin's `customCode.ts`. Zero platform coupling (no Framer, DOM or
  network); all pure strings.
- **Core / runtime CDN** (`shared/src/runtime-cdn.ts`): `RUNTIME_VERSION` and
  `runtimeScriptUrl()` (+ user/repo/path) moved from `plugin/src/lib/runtimeCdn.ts`
  so every adapter points at the identical version-pinned bundle. Bump the tag
  here now. The plugin's `runtimeCdn.ts` is a thin re-export shim (keeps
  `../lib/runtimeCdn` imports in ConsentfulShell/modals/panels valid).
- **Core / adapter seam** (`shared/src/adapter.ts`): the whole Phase-3 payoff —
  a `PlatformAdapter` interface (`readLoaderRegion()`/`writeLoaderRegion(html|null)`)
  plus platform-neutral `installLoader(adapter, config, opts?)` and
  `removeLoader(adapter)` that own the build + marker-scoped splice + churn-free
  skip. A new platform is now a ~20-line adapter, not a re-implementation.
  Exported from `shared/src/index.ts`.
- **Framer adapter** (`plugin/src/lib/customCode.ts`): rewritten to the seam —
  owns ONLY `LOADER_LOCATION` (`headStart`, Framer's type) + a `framerAdapter`
  wrapping `getCustomCode`/`setCustomCode`; `injectLoader`/`removeLoader` keep
  their signatures but delegate to the core. Re-exports the loader helpers so
  existing importers + `tests/customcode.test.ts` are untouched. The temporary
  `LICENSING_DISABLED`/`withTestingLicense` shim stays here (a Framer-adapter
  concern) — still to be reverted per 2.2.
- **Tests**: +8 (`tests/loader-adapter.test.ts`) — the core seam driven by an
  in-memory adapter: install into empty/occupied regions, churn-free re-install,
  `runtimeUrl` override, strip-only-our-block, clear-to-null, absent-block no-op,
  version-pinned CDN URL. The existing loader unit tests pass unchanged via the
  re-exports. Full suite **225 pass**; all three workspaces typecheck clean;
  plugin builds clean; **runtime bundle unchanged at 42.27 / 44 KB** (the new
  core modules are pure + unreferenced by the runtime, so esbuild tree-shakes
  them out — proof the extraction added nothing to the shipped bundle).
- **Exit criteria** — Framer plugin runs on the extracted core with all tests
  green ✅. Remaining for Phase 2 before any Phase-3 public launch: **2.2 portal
  licensing** (duplicate the user module as a sister directory on **Dodo
  Payments** — the hosted portal + Workers, your infra) and reverting the testing
  overrides.

### 2026-09-18 — Phase 1.4 region-aware auto-mode ✅ (Phase 1 complete)
- **Schema** (`shared/src/config-schema.ts`): new `ConsentModel` type +
  `behavior.consentModel` field (`'opt-in'` | `'opt-out'` | `'auto'`, default
  `'opt-in'` — GDPR-safe and backward-compatible), with merge/coercion + JSDoc.
  Deliberately **orthogonal to `showMode`**: `showMode` decides *where* the
  banner appears, `consentModel` decides the *default grant state before the
  visitor chooses*. `auto` = opt-in for regulated regions (EU/EEA, UK, CH,
  California) or any uncertain read (fail safe), opt-out elsewhere.
- **Runtime** (`runtime/src/geo.ts`): three pure, testable helpers —
  `resolveConsentModel(config, region)` collapses `auto` to a concrete stance
  at the single `isRegulated`/`certain` boundary; `impliedConsentGrants(config)`
  returns the author's defaults (required + `defaultEnabled`) — and, unlike
  `gpcGrantedCategories`, honours a default-on marketing category verbatim;
  `shouldApplyImpliedConsent(config, state, region)` gates the boot step, sharing
  `needsReconsent` with `shouldShowBanner` so the two decisions can never
  disagree (also re-applies on expiry / version bump).
- **Boot** (`runtime/src/index.ts` step e.5): after region resolution and AFTER
  DNT/GPC (so an expressed signal always wins), an opt-out region with no valid
  decision gets `api.accept(impliedConsentGrants(config), 'implied')` — trackers
  run immediately, no prompt; the persisted decision makes `shouldShowBanner`
  fall through to "already decided" so the banner stays silent, and the floating
  "cookie settings" button remains the opt-out path. Opt-in regions are a no-op
  and prompt as before.
- **Receipts** (`runtime/src/consent-state.ts`): new `'implied'` `ConsentMethod`
  so an implied-consent decision is labelled honestly in its receipt.
- **Plugin** (`model.ts` + `panels.tsx`): `consentModel` added to the flat `Cfg`,
  mapped in `toCfg`, and wired through the scalar setter. Behavior panel gains a
  "Consent model" segmented control (Opt-in / Opt-out / Auto) with a per-choice
  hint explaining the legal model.
- **Tests**: +8 (`geo.test.ts` ×7: resolveConsentModel opt-in/opt-out/auto by
  region + California + uncertain, impliedConsentGrants defaults + default-on
  marketing, shouldApplyImpliedConsent gating + expiry re-apply; `model.test.ts`
  ×1: `toCfg` surfaces the model). Full suite **217 pass**; all three workspaces
  typecheck clean; plugin builds clean; runtime bundle **42.27 / 44 KB**.
- **Verified live in-browser** (real `consent.min.js`, `showMode:'everywhere'`):
  `consentModel:'opt-out'` → decision auto-stamped `method:'implied'`,
  `{necessary, analytics}` granted, **no banner**, Consent Mode `update` emits
  `analytics_storage:granted` (ad_* stay denied — marketing default off);
  `consentModel:'opt-in'` (clean storage) → no decision, **banner shown**,
  Consent Mode all-denied until the visitor chooses.
- **Note**: California is treated as opt-in under `auto` (it's in `isRegulated`),
  which over-complies (banner + GPC) rather than under-complies; kept simple on
  purpose. `auto` needs accurate geo (the Pro endpoint) to be reliable at the
  opt-in/opt-out boundary — the free time-zone heuristic still fails safe toward
  opt-in when unsure.

### 2026-09-18 — Phase 1.3 design-time tracker scanning ✅
- **Engine** (`shared/src/tracker-scan.ts`): a pure, dependency-free,
  DOM-free `detectTrackers(html)` + a `TRACKER_CATALOG` of 15 well-known
  trackers (GA4, GTM, Universal Analytics, Google Ads, Meta Pixel, TikTok,
  LinkedIn, X, Pinterest, Hotjar, Clarity, Segment, Mixpanel, Plausible,
  Intercom). Each signature matches by external `<script src>` host **or** by
  inline/pixel fingerprint (e.g. `fbq('init'…`, `facebook.com/tr?id=`,
  `_linkedin_partner_id`), extracts the vendor tag id, and maps to one of the
  three default categories (`analytics`/`marketing`/`preferences`) with the
  matching Consent Mode signals. Inline-only matches fall back to the vendor's
  canonical loader URL so every proposal is a clean, blockable `src` script.
  Detection prefers a concrete `src` and dedupes to one proposal per vendor.
  Exported from `shared/src/index.ts` (and re-exported through the plugin's
  `types.ts`), so it's ready to move into `core/` in Phase 2.
- **Plugin plumbing** (`plugin/src/lib/scanSite.ts`): `scanSiteForTrackers()`
  resolves the live URL via `getLiveSiteUrl()`, fetches the page, and runs the
  engine — resolving (never rejecting) to a typed `ScanResult` that models the
  real failure modes: `not-published` (publish first) and `fetch-failed`
  (usually the iframe's cross-origin/CORS policy). Honest about the sandbox
  limitation; the user can always fall back to adding tags manually.
- **Model** (`plugin/src/consentful/model.ts`): pure `applyDetectedTrackers`
  creates any missing category (standard label/signals, analytics-on-by-default)
  then appends a gated `ManagedScript` per tracker, skipping duplicates
  (`trackerAlreadyManaged`, matched by URL or tag id) and empty payloads. Wired
  through a new `addDetectedTrackers` action.
- **UI** (`modals.tsx` + `panels.tsx` + `ConsentfulShell.tsx`): a "Scan site
  for trackers" button in the Scripts panel opens `ScanTrackersModal` —
  loading → results with pre-checked new trackers (already-managed ones shown
  disabled), category chips, and evidence text → "Add N scripts". Also handles
  the clean-site and failure states inline.
- **Tests**: +17 (`tests/tracker-scan.test.ts` ×12: src/inline/pixel detection,
  tag-id extraction, category+signal mapping, dedupe, clean/empty, catalog
  invariants; `tests/model.test.ts` ×5: add, category creation, dedupe by
  URL/tag-id, empty-payload skip, `trackerAlreadyManaged`). Full suite
  **209 pass**; all three workspaces typecheck clean; plugin builds clean.
  Runtime bundle **unchanged** (plugin-only feature — nothing added to the
  runtime).
- **Note**: live in-Framer verification not runnable here (the scan needs the
  Framer host's `getPublishInfo`/`fetch` of the published site); logic is
  covered by unit tests and the plugin build.

### 2026-09-18 — Phase 1.2 UI follow-on: receipt download control ✅
- **Schema** (`shared/src/config-schema.ts`): new localizable `strings.downloadReceipt`
  label (default `"Download consent receipt"`) — added to `StringsConfig` +
  `LocaleStrings`, `DEFAULT_CONFIG`, `LOCALE_STRING_KEYS`, and `mergeStrings`.
- **Runtime** (`runtime/src/banner.ts`): the preferences modal now renders a
  muted "↓ Download consent receipt" control (`.cc-modal__receipt`) above the
  footer buttons, wired to `api.downloadReceipt()`. It's revealed only when an
  exportable receipt actually exists — `syncReceiptControl()` runs on every
  `openPreferences()` and on `cookieconsent:change`, so it appears after a
  decision and hides again after a `withdraw()`.
- **i18n** (`runtime/src/i18n.ts`): the label overlays per-locale like every
  other string.
- **Styles** (`runtime/src/styles.ts`): `.cc-modal__receipt` / `.cc-receipt-btn`
  — a hairline-separated, theme-aware muted link with an accent download glyph.
- **Tests**: +1 (`tests/banner.test.ts`) — hidden with no receipt, shown once
  one exists, and `downloadReceipt()` fires on click. Full suite **192 pass**;
  all three workspaces typecheck clean; runtime bundle **41.81 / 44 KB**.
- **Verified live in-browser**: licensed card banner → before any decision the
  control is hidden (`exportReceipt() === null`); after `accept(['analytics'])`
  the "↓ Download consent receipt" line appears and `exportReceipt()` returns a
  full, signed receipt (`analytics_storage` + `security_storage` granted).
- **Note**: no plugin-panel change — the label is author-editable via the shared
  translations path if needed, but ships with a sensible default.

### 2026-09-17 — Phase 1.2 consent receipts + `exportReceipt()` ✅
- **Schema** (`shared/src/config-schema.ts`): new `receipts` section —
  `receipts.enabled` (default `true`) and `receipts.endpoint` (default `''`,
  reserved for the optional central log in 1.2b), with merge/coercion + JSDoc.
- **Runtime** (`runtime/src/consent-state.ts`): new `ConsentMethod` +
  `ConsentReceipt` types; `ConsentState` gains an optional `receipt`.
  `writeConsent` now stamps a fully-populated, self-contained receipt (id,
  ISO timestamp, method, policy/schema version, origin, policy URL, browser
  language, category grants, granted Consent Mode signals) when receipts are
  enabled, and takes a `method` label. Receipt carries a tamper-evident
  **integrity fingerprint** (`proof`, a 64-bit interleaved FNV digest — NOT a
  crypto signature; the zero-server design holds no key). New exported
  `verifyReceipt()` recomputes and compares it.
- **API** (`window.CookieConsent`): `accept/acceptAll/rejectAll` take an optional
  `method`; added `exportReceipt(): ConsentReceipt | null` and
  `downloadReceipt(filename?)` (JSON blob download, safe no-op without a DOM).
  `withdraw()` emits a transient `withdraw` receipt event but persists nothing.
- **Boot** (`runtime/src/index.ts`): DNT auto-reject labels its receipt `dnt`;
  GPC auto-opt-out labels its receipt `gpc`.
- **Tests**: +9 (`tests/consent-receipts.test.ts`) — stamping, signals,
  verify/tamper, storage round-trip, method labels, empty/withdraw → null,
  `enabled:false` opt-out, download no-op. Full suite **191 pass**; all three
  workspaces typecheck clean; runtime bundle **40.85 / 44 KB**.
- **Note**: no plugin-panel change (config default = on). Natural UI follow-on:
  a visible "Download consent receipt" control in the banner preferences view.

### 2026-09-13 — Phase 1.1 GPC + "Opt-Out Honored" badge ✅
- **Schema** (`shared/src/config-schema.ts`): added `behavior.respectGpc` and
  `behavior.gpcShowBadge` (both default `true`), with merge/coercion + JSDoc.
- **Runtime** (`runtime/src/geo.ts`): `isGpcEnabled()` reads
  `navigator.globalPrivacyControl`; `isSaleCategory()` + `gpcGrantedCategories()`
  encode the key nuance — GPC denies ONLY ad/marketing categories
  (`ad_storage`/`ad_user_data`/`ad_personalization`) and keeps every other
  category at the author's default. **Not** `rejectAll()`.
- **Boot** (`runtime/src/index.ts` step d.6): after the DNT check, if `respectGpc`
  + GPC signal + no prior decision → `api.accept(gpcGrantedCategories(config))`
  and flag `gpcHonored`. DNT (blanket reject) still wins when both are present.
- **Badge** (`runtime/src/banner.ts` + `styles.ts`): self-dismissing (6 s)
  `role="status"` pill "Global Privacy Control honored", gated on
  `gpcHonored && gpcShowBadge`.
- **Plugin** (`model.ts` + `panels.tsx`): Behavior → Privacy signals gains a
  "Honor Global Privacy Control" toggle + a conditional "Show opt-out honored
  badge" sub-toggle.
- **Tests**: +5 (geo: `isGpcEnabled`, `isSaleCategory`, `gpcGrantedCategories`;
  banner: badge visibility). Full suite **182 pass**; typecheck clean; runtime
  bundle **38.34 / 44 KB**. Verified live in-browser: with GPC simulated, stored
  consent = `{analytics:true, marketing:false}` and Consent Mode emits
  `ad_*: denied, analytics_storage: granted` — a targeted opt-out, badge shown.

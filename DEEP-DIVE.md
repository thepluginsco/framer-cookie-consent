# Consentful — Deep Dive: Features & Platform Expansion

_2026-09-08. Companion to [STRATEGY.md](STRATEGY.md). This is the technical/execution layer:
every feature and platform below is mapped to the actual files and insertion points in the
current codebase, with effort, infra cost, and whether it preserves our zero-infrastructure
model._

---

## Part 0 — My call on Google/IAB TCF certification

**Decision: DEFER it. Do not chase Google-certified CMP / IAB TCF v2.3 now.** Reasoning:

- **It breaks our one true moat.** TCF certification is a *networked, ongoing obligation*:
  weekly Global Vendor List sync, live TC-string generation, IAB registration + membership
  fees, and automated validators that can *decertify* you. Our entire differentiation
  (STRATEGY §5) is "no account, no phone-home, config baked into an 11 KB self-hosted runtime."
  A TCF CMP is the opposite of that by definition.
- **It serves a segment that isn't our buyer.** TCF only matters to sites running **programmatic
  display/RTB ad inventory in the EEA/UK** (publishers monetising via Google Ad Manager/AdSense
  partners). Our buyers are Framer/Webflow design-led sites — SaaS, agencies, portfolios, local
  business, DTC. The overwhelming majority use GA4 + Google Ads *tags*, which are covered by
  **Consent Mode v2 — which we already do correctly** ([consent-mode.ts], inline bootstrap in
  [customCode.ts:92](plugin/src/lib/customCode.ts)) — not by TCF.
- **The credibility gap is closable more cheaply.** What actually makes ConsentBit look "more
  advanced" is (a) the *word* "Google-certified" and (b) **consent logging/export**. We can neutralise
  (b) with consent receipts (Feature 2 below) — a real, defensible feature — without taking on the
  TCF treadmill for (a).

**What we do instead:** keep Consent Mode v2 best-in-class, ship consent receipts + GPC, and
market "Google Consent Mode v2 certified integration" (the tag-level claim we can honestly make).
**Revisit TCF only** as a separate, clearly-scoped **"Consentful Publisher Edition"** *if* we get
repeated inbound from actual ad publishers — and even then, build it as an opt-in module that
carries its own infra, so the core product stays zero-infra. Documenting this so we don't drift
into it by accident.

---

## Part 1 — Feature deep dives

Legend: **∅-infra** = no new servers/accounts; **+worker** = optional Cloudflare Worker (our
existing free-tier pattern); **plugin-only** = design-time, ships nothing to visitors.

### Feature 1 — GPC (Global Privacy Control) + visible "Opt-Out Honored" confirmation ★

**Why:** Legally *required* in 12+ US states as of 2026, and several now demand a **visible
confirmation** that the opt-out was honoured, not just silent processing (STRATEGY §2). Almost
no Framer competitor advertises GPC. **∅-infra.**

**Key nuance vs. our existing DNT handling:** GPC is **not** a blanket reject like we treat DNT.
GPC is specifically an opt-out of **sale/sharing** → it should deny the *ad/marketing* signals
(`ad_storage`, `ad_user_data`, `ad_personalization`) but may leave `analytics_storage` to the
banner/region logic. So it needs its own path, not a reuse of `rejectAll()`.

**Where it slots in (real code):**
- **`runtime/src/geo.ts`** — add `isGpcEnabled()` right beside [isDoNotTrackEnabled()](runtime/src/geo.ts:339)
  (reads `navigator.globalPrivacyControl`). Same guarded, SSR-safe shape.
- **`runtime/src/index.ts` boot step (d.5)** — currently only DNT persists a reject
  ([index.ts:182](runtime/src/index.ts:182)). Add a GPC branch that, when set and no decision
  exists, persists a decision granting everything *except* ad/marketing categories (derive from
  each category's `signals` — deny any category whose signals intersect the ad signals).
- **`shared/config-schema.ts` `BehaviorConfig`** — add `respectGpc: boolean` (default `true`)
  and `gpcShowBadge: boolean` (default `true`), merged in [mergeBehavior](shared/src/config-schema.ts:665).
- **`runtime/src/banner.ts`** — render a small persistent "✓ Opt-out request honored" badge
  (the legally-required confirmation) when GPC drove the decision. Reuse the floating-button
  corner styling that already exists.
- **Plugin:** a Behavior-panel toggle pair ("Respect GPC signal" / "Show opt-out confirmation").

**Effort:** ~1 day runtime + ~2h plugin + tests. High compliance ROI, tiny surface.

---

### Feature 2 — Verifiable consent receipts / audit records ★

**Why:** This is the concrete thing ConsentBit has that we don't ("securely log consent actions
and export timestamped reports"). Enforcement increasingly asks "show me the record" (STRATEGY §2).
**Default ∅-infra (client-side receipt); optional +worker for a central log.**

**Where it slots in (real code):**
- **`runtime/src/consent-state.ts` `ConsentState`** — today it stores `{version, timestamp,
  categories}` ([consent-state.ts:13](runtime/src/consent-state.ts:13)). Extend the persisted
  record (backward-compatibly — `readConsent` already tolerates extra keys) with a **receipt**:
  `method` ('accept_all' | 'reject_all' | 'custom' | 'gpc' | 'dnt'), `gpc: boolean`,
  `region: string`, `reconsentVersion`, and a short `id` (timestamp + random). This is the
  proof object.
- **`writeConsent`** ([consent-state.ts:128](runtime/src/consent-state.ts:128)) — stamp the
  receipt fields. `installConsentApi`'s `apply()` already funnels every decision through
  `writeConsent`, so all paths (accept/reject/custom/GPC/DNT) get a receipt for free.
- **Export:** add `window.CookieConsent.exportReceipt()` to the API
  ([CookieConsentApi](runtime/src/consent-state.ts:23)) returning the receipt as JSON/downloadable
  — the visitor-facing "here's my consent record" affordance.
- **Optional central log (Pro, +worker):** mirror the analytics pattern exactly. We already have
  `installConsentAnalytics(config)` posting anonymous events to `config.analytics.endpoint`
  ([index.ts:164](runtime/src/index.ts:164)). Add `config.receipts.endpoint` and a
  `receipt-worker.js` (sibling of the analytics worker) that appends receipts to KV/D1. Same
  `sendBeacon`, same "empty endpoint = disabled, nothing sent" contract.
- **Plugin:** an "Audit log" surface in the Insights tab reading the receipt worker back (or, for
  the ∅-infra tier, just document `exportReceipt()`).

**Effort:** ~1.5 days runtime+schema; worker ~0.5 day; plugin surface ~1 day. **This is the single
highest-credibility feature** — it converts "nice banner" into "defensible CMP."

---

### Feature 3 — Design-time tracker scanning (in the plugin, not the cloud) ★

**Why:** CookieGuard and Cookiebot's headline feature is automatic cookie scanning — but they do
it from *their* cloud (adds a dependency + account). We can scan **at author time inside the
plugin** and pre-fill the `scripts[]` list, keeping zero runtime cost and zero visitor data
exfiltration. **plugin-only.**

**Where it slots in (real code):**
- The plugin already models gated tags as `ManagedScript[]`
  ([config-schema.ts:301](shared/src/config-schema.ts:301)) with `provider`, `tagId`, `category`.
- Add a "Scan my site" action in the **Scripts panel** that fetches the site's published URL
  (the plugin knows it via the Framer API) and pattern-matches known trackers (GTM
  `GTM-`, GA4 `G-`, Google Ads `AW-`, Meta Pixel `fbq`, Hotjar, LinkedIn Insight, TikTok pixel,
  Segment, etc.), then proposes `ManagedScript` entries with the right default category.
- **Ships nothing to visitors** — pure authoring convenience. The runtime is untouched.
- Optional stretch: a tiny lookup table mapping detected tag → suggested category + description,
  so the banner copy auto-populates too.

**Effort:** ~2 days (detection table + fetch/parse + UI). Big perceived-value / demo feature.

---

### Feature 4 — Region-aware auto-mode (one banner, correct under every law) ★

**Why:** The law is now a patchwork — **opt-in** (EU/UK/CH/Brazil), **opt-out** (US states w/
GPC), **notice-only** elsewhere. Today `showMode` is `everywhere | eu-only | by-region`
([config-schema.ts:103](shared/src/config-schema.ts:103)) and only decides *whether* to show, not
*which consent model* to apply. We already detect region richly (`isEU`/`isUK`/`isCalifornia` in
[geo.ts](runtime/src/geo.ts:34)). **∅-infra** (uses the free heuristic; sharper with the geo worker).

**Where it slots in (real code):**
- **`shared/config-schema.ts`** — add a `ShowMode` value `'auto'` (or a separate
  `behavior.consentModel: 'opt-in' | 'opt-out' | 'auto'`). In `auto`, the runtime picks:
  - regulated opt-in region → banner defaults all non-necessary categories **off**, requires
    explicit accept (current behaviour);
  - US opt-out region → categories **on** by default + a clear "Do not sell/share" reject +
    honour GPC (Feature 1);
  - elsewhere → notice-only / less intrusive.
- **`runtime/src/geo.ts` `shouldShowBanner`** and the banner's default-enabled computation read
  `region` (already passed into boot at [index.ts:195](runtime/src/index.ts:195)) to select the
  model. The category `defaultEnabled` flags become region-conditional at render time rather than
  static.
- **Plugin:** replace the current show-mode radio with an "auto (recommended)" option and a small
  explainer of what each region gets.

**Effort:** ~2 days. Strong "correct everywhere, zero thinking" marketing line; pairs with GPC.

---

### Feature 5 — Consent-rate A/B testing + richer analytics

**Why:** "Maximise opt-in rate while staying compliant" is a premium, revenue-linked selling
point. We already have the analytics seam. **+worker (the analytics one we already designed).**

**Where it slots in (real code):**
- `installConsentAnalytics(config)` ([analytics.ts], wired at [index.ts:164](runtime/src/index.ts:164))
  already emits anonymous decision events. Add:
  - a `variant` chosen at boot (hash of a stored id → A/B bucket) and included in the event;
  - a couple of test dimensions (button copy, layout, colours) selectable in the plugin.
- The Insights tab (reads the analytics worker) gains accept/reject/customise rate **by variant**
  and by region.

**Effort:** ~2–3 days (needs the analytics worker deployed to be live). Depends on Feature-adjacent
worker infra already scoped in PROGRESS.md.

---

### Feature 6 — Full Preference Center + granular (per-vendor) toggles

**Why:** We have per-category toggles and a floating re-open button
([shouldShowFloatingButton](runtime/src/geo.ts:429)). The next tier is a proper preference center
with per-*purpose* and eventually per-*vendor* granularity — the structure regulators (and any
future TCF module) expect. **∅-infra.**

**Where it slots in:** extend `banner.ts`'s preferences view; the `scripts[]` model already ties a
tag to a category, so grouping vendors under a category is a small data step. This is mostly a
banner-UI and plugin-UI build, no new architecture.

**Effort:** ~3 days. Do after 1–4.

---

### Tier B / later (from STRATEGY §3, unchanged priority)
- **Bundled legal-doc generator** (cookie/privacy policy) — Termly's wedge; high attach-rate;
  could be a sibling Plugins Company product sharing the account/portal.
- **Consent analytics dashboard** — the full Insights build on the analytics worker.
- **Accessibility badge + audit report** — we already do focus-trap/ARIA/WCAG AA; market it.

### Recommended feature order
**1 (GPC) → 2 (Receipts) → 3 (Scanning) → 4 (Region auto-mode) → 5 (A/B) → 6 (Pref center).**
1–4 are mostly ∅-infra, close the compliance-credibility gap, and are the strongest marketing
lines. 5–6 build on infra you're already planning.

---

## Part 2 — Platform expansion deep dive

### The core realisation (confirmed against the code)

The runtime is **already platform-neutral**. `readEmbeddedConfig()`
([index.ts:71](runtime/src/index.ts:71)) resolves config from, in order:
1. `window.__CC_CONFIG__` (string → `parse`, object → `mergeConfig`), then
2. **a `data-cc-config` / `data-config` attribute anywhere in the DOM**
   ([readDataConfigAttr](runtime/src/index.ts:50)), then
3. defaults.

That attribute fallback means **any website that can host a `<script>` tag and a data attribute
can run our runtime today** — no Framer, no plugin. The only Framer-specific code is the
*injection* of the loader, and even that is 90% platform-neutral:

- `buildLoaderHtml` / `upsertBlock` / `stripBlock` in [customCode.ts](plugin/src/lib/customCode.ts)
  are **pure string functions** — they build and idempotently splice a marker-wrapped block
  (`<!-- cookie-consent:start/end -->`). Nothing Framer-specific.
- The **only** Framer-coupled calls are `getCustomCode()` / `setCustomCode()` in
  [framer.ts](plugin/src/lib/framer.ts). That's the entire adapter seam.

### Proposed refactor: extract `core/`, treat each platform as an adapter

```
core/            (new — platform-neutral, promoted from today's shared+runtime+customCode)
  ├─ schema        (today's shared/config-schema.ts, unchanged)
  ├─ runtime       (today's runtime/, unchanged — the consent.min.js engine)
  └─ loader        (buildLoaderHtml/upsert/strip + runtimeCdn — the pure snippet builder)

adapters/
  ├─ framer/       (today's plugin — swap in core/loader; keep framer.ts get/setCustomCode)
  ├─ webflow/      (Designer App or Custom Code injection)
  ├─ wordpress/    (PHP plugin writing to wp_head + a settings screen)
  ├─ shopify/      (theme app extension)
  └─ embed/        (a copy-paste <script> snippet generator — a tiny standalone web app)
```

Each adapter implements exactly one contract: **"read the site's custom-code region → call the
shared `upsertBlock` with `buildLoaderHtml(config)` → write it back."** One schema, one runtime,
one compliance engine behind all of them — which *is* the moat (consistent behaviour + a single
place bugs/laws are fixed).

### Per-platform mechanics, effort, priority

| Platform | Effort | Injection mechanism | Notes |
|---|---|---|---|
| **Universal `<script>` embed** | **Low (~2–3 days)** | A small hosted page that lets a user configure a banner and outputs a copy-paste snippet: `<script>window.__CC_CONFIG__={…}</script><script src="…jsDelivr…" defer>`. Uses the runtime **as-is**. | **Ship first.** Instantly covers Wix, Squarespace, Ghost, Bubble, Carrd, hand-coded sites. Doubles as the public demo + top-of-funnel. No per-platform API to learn. |
| **Webflow** | **Low–Med (~1 wk)** | Either (a) the embed snippet pasted into Webflow's **Custom Code** (works today), or (b) a native **Webflow Designer App** (same shape as our Framer plugin) writing to site custom code via Webflow's API. | **Highest-priority real platform.** Same design-led buyer as Framer; strong App Marketplace distribution. Reuse ~all of the React plugin UI; only the `getCustomCode/setCustomCode` seam changes. |
| **WordPress** | **Med (~1.5–2 wks)** | A thin PHP plugin: a settings page (can embed the same React UI as an admin app, or a simpler form) that stores the config and prints the loader into `wp_head` via a hook. | Biggest market, most crowded (Complianz/CookieYes/Cookiebot). Win on **flat price + speed + no external account**. Bonus: auto-detect installed tracker plugins (GA/Meta/GTM) → pre-fill `scripts[]` (ties to Feature 3). |
| **Shopify** | **Med (~2 wks)** | Shopify **theme app extension** injecting the loader; respects Shopify's Customer Privacy API / checkout constraints. | Lucrative + compliance-sensitive (checkout pixels, marketing consent). Pandectes/Complianz strong; beatable on speed + price. Do after WP. |
| **Wix / Squarespace / Ghost** | Low | Covered by the **universal embed** initially; native apps later only if volume justifies. | Long tail — embed-first. |
| **Framer** (current) | — | Existing plugin, refactored onto `core/loader`. | Stays flagship; every core improvement flows to all adapters. |

### Sequencing recommendation
**1. Universal embed → 2. Webflow → 3. WordPress → 4. Shopify.**
The embed is near-free (runtime already supports it), unlocks the most platforms per unit effort,
and gives you a standalone product + demo surface to sell from. Webflow is the same buyer as
Framer with a great marketplace. WordPress is volume. Shopify is value.

### The one hard dependency: licensing must go multi-platform first
Right now the paid verdict is baked into the Framer loader, and licensing is *temporarily disabled*
for testing (`LICENSING_DISABLED = true` in [customCode.ts:194](plugin/src/lib/customCode.ts),
forced `plan:"pro"` in model.ts). Multi-platform makes the **shared portal licensing model**
(already the planned direction — PROGRESS.md, and the LingoLens/MediaGrabber pattern) a
**prerequisite**, not a "do last": one license key that entitles a user across Framer + Webflow +
WordPress + Shopify, managed in one portal. **Recommendation: promote the portal-licensing work to
run in parallel with the universal-embed build**, because every new adapter otherwise multiplies
the licensing surface. Revisit the temporary `LICENSING_DISABLED` override before any public
multi-platform launch.

---

## Summary — what I'd do next, in order

1. **Ship the ∅-infra credibility features on the current Framer product:** GPC + badge (F1),
   consent receipts (F2), design-time scanning (F3), region auto-mode (F4). These make us
   *demonstrably* more advanced than ConsentBit/CookieGuard without adding infra.
2. **Extract `core/`** (schema + runtime + loader) so adapters are thin. Low-risk refactor of
   code that's already cleanly separated.
3. **Ship the universal `<script>` embed** — new market + demo surface for near-zero cost.
4. **Build the Webflow adapter**, then **WordPress**, then **Shopify.**
5. **Run portal-licensing in parallel** so one license spans every platform.
6. **Hold TCF certification** unless real ad-publisher demand appears — then build it as an
   isolated Publisher Edition that carries its own infra.

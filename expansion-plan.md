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

### 2.2 Portal licensing (~1–2 wks) — **promoted from "do last" to a prerequisite**
One license key entitling a user across all platforms, managed in one portal (the
LingoLens/MediaGrabber pattern). Every new adapter otherwise re-implements licensing. Also:
**revert the temporary testing overrides** (`LICENSING_DISABLED = true` in `customCode.ts`,
forced `plan:"pro"` in `model.ts`) before any public multi-platform launch.

**Exit criteria:** Framer plugin runs on `core/` with all tests green; a single license validates
against the portal and gates entitlements identically across platforms; testing overrides removed.

---

## Phase 3 — Platform expansion

**Goal:** same engine, new front-ends, in cheapest-first order.

| Order | Platform | Effort | Injection | Why this slot |
|---|---|---|---|---|
| 3.1 | **Universal `<script>` embed** | ~2–3 days | Hosted config page → copy-paste snippet (`window.__CC_CONFIG__` + jsDelivr `<script defer>`). Runtime works **as-is** (it already reads `__CC_CONFIG__` and the `data-cc-config` attribute). | Near-free; unlocks Wix/Squarespace/Ghost/Carrd/hand-coded; doubles as public demo + funnel |
| 3.2 | **Webflow** | ~1 wk | Embed snippet in Custom Code (works now) → then native Designer App writing site custom code | Same design-led buyer as Framer; strong App Marketplace; reuse ~all the React UI |
| 3.3 | **WordPress** | ~1.5–2 wks | PHP plugin: settings screen + loader printed into `wp_head`; auto-detect installed tracker plugins → pre-fill scripts | Biggest market; win on flat price + no external account |
| 3.4 | **Shopify** | ~2 wks | Theme app extension; respect Customer Privacy API / checkout | Lucrative, compliance-sensitive; do last of the four |

**Exit criteria per platform:** config authored → loader injected → published site boots the shared
runtime → banner + blocking + Consent Mode verified live; license enforced via the portal.

---

## Phase 4 — Depth & monetisation (ongoing, after breadth exists)

- **4.1 A/B consent-rate testing + analytics dashboard** (+worker) — variant in the analytics
  event; Insights shows accept/reject/customise by variant & region.
- **4.2 Full preference center + per-vendor toggles** (∅) — extend banner preferences view.
- **4.3 Bundled legal-doc generator** (cookie/privacy policy) — Termly's wedge; high attach-rate;
  candidate sibling product sharing the portal account.
- **4.4 Accessibility badge + audit report** — market the focus-trap/ARIA/WCAG AA we already ship.

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
4. ~~Build **1.4 region-aware auto-mode**~~ ✅ done (2026-09-18) — **Phase 1 complete.** ← next: begin **Phase 2.1 core extraction** and **2.2 portal licensing** (the Phase-3 prerequisites).
5. In parallel, spike **2.1 core extraction** as a branch to de-risk the refactor.
5. Confirm the two open items from earlier: real `POWERED_BY_URL` (currently placeholder
   `thepluginsco.com` in `runtime/banner.ts`) and a light-logo variant for dark banners.

---

## Progress log

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

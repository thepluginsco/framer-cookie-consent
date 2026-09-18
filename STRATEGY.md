# Consentful — Expansion & Competitive Strategy

_Research date: 2026-09-08. Sources at the end. This is a strategy/research doc, not a
commitment — treat the roadmap tiers as a menu to prioritise from._

---

## 0. TL;DR — the three big moves

1. **Close the "credibility gap" against the top Framer-native rival (ConsentBit).**
   ConsentBit is a **Google-certified CMP** with **IAB TCF**, **consent logging + exportable
   audit records**, and 8-language translations. We match multi-language and Consent Mode v2,
   but we lack the two things regulators and Google now check for: a **certified TCF signal**
   and a **provable consent record**. These are the table-stakes for "advanced" in 2026.

2. **Turn our zero-infrastructure architecture from a limitation into the headline.**
   Every serious competitor (CookieYes, ConsentBit, CookieGuard, Cookiebot, Osano) is a
   **hosted SaaS with an external account, per-domain/metered billing, and a third-party
   script** on the critical path. We are the opposite: no account, no dashboard login, config
   baked into the loader, an 11 KB self-hosted runtime, nothing leaves the browser. That is a
   genuine **speed + privacy + no-vendor-lock-in** story nobody else in the Framer ecosystem
   can tell. Lead with it.

3. **Go multi-platform on the same shared schema + runtime.** The `shared/` + `runtime/`
   split we already have is the exact architecture you need to ship Webflow, WordPress,
   Shopify, Wix, Squarespace, and a plain `<script>` embed **without rewriting the engine** —
   only the thin "authoring + injection" layer changes per platform.

---

## 1. Competitive landscape (2026)

### 1a. Direct Framer-native competitors (our real battleground)

| Product | Model | Notable features | Pricing signal | Gap vs us |
|---|---|---|---|---|
| **ConsentBit** (Seattle New Media) | Plugin + (likely) hosted logging | **Google-certified CMP**, **IAB TCF v2.2**, real script-blocking by default, **consent logging + timestamped export**, 8-language translations, GDPR/CCPA/CPRA/CPA/VCDPA/CTDPA/UCPA + GPC | 14-day trial, paid | They have certification + audit logs; we don't (yet) |
| **CookieGuard** | **Hosted** (Site ID + Access Key, external dashboard) | Automatic cookie **scanning**, visual editor in _their_ dashboard, 11 regulations, flat $8/mo (no per-domain) | Free plan; paid from **$8/mo flat** | They auto-scan; they pull config from a cloud dashboard (a 3rd-party script + account) |
| **Cookie Consent Pro** (getseo.pro) | Plugin | 9 themes, blur backdrop, GA consent mode, custom cookie expiry, category consent | Paid | Presentation-heavy, compliance-light |
| **Cookie Guard** (getseo, free) / **Cookie Banner** components | Plugin/component | One-click, 4 positions, basic customisation | Free / ~$10 one-off | Cosmetic only — no real blocking |
| **Framer built-in Cookie Banner** | Native component | Basic banner "powered by Google Consent Mode" | Free | The floor; no categories, no real gating |

**Read:** The Framer field splits into (a) **cosmetic banners** (built-in, Cookie Guard, most
components) and (b) **two serious CMPs** — ConsentBit (certification + logs) and CookieGuard
(scanning + hosted). To be "the advanced one," we have to beat the serious two on their own
turf **while** keeping our zero-infra advantage they can't copy.

### 1b. The broader CMP market (what "advanced" looks like industry-wide)

- **Cookiebot / Usercentrics** — deepest automatic scanning, Google-certified, TCF, cross-platform (WP, Shopify, Webflow, Wix, Squarespace…). ~$8–96/domain/mo.
- **CookieYes** — hosted app + thin connector per platform; Google-certified, TCF v2.3, AI scanner that auto-builds banner + policy. Free → ~$10–55/domain/mo.
- **Osano** — consent as part of a bigger privacy program (DSAR, data mapping). Free → $199+ for small teams.
- **Termly / iubenda** — bundle consent **with a legal-doc generator** (privacy policy, cookie policy, ToS). Strong SMB wedge.
- **Complianz** — WordPress/Shopify/Webflow, region-specific banners, very feature-rich.

**Pattern:** the market monetises via **per-domain or metered SaaS**, **automatic scanning**,
**Google/TCF certification**, and increasingly **bundled legal docs**. Our differentiation is
NOT to become another metered SaaS — it's to be the fast, private, flat-priced, developer-grade
option that still ticks the compliance boxes.

---

## 2. The 2026 regulatory reality (drives the roadmap)

- **Google's Feb 28, 2026 deadline:** CMPs serving EEA/UK ads must be **Google-certified and
  TCF v2.3-compliant** (weekly Global Vendor List download, correct Disclosed Vendors bitfield).
  IAB runs **automated validators** — mismatches lose certification. This is a hard,
  standards-based bar; it's the single biggest "are you a real CMP" gate.
- **GPC / Universal Opt-Out is now mandatory in 12+ US states.** As of Jan 1 2026, several
  states require you not just to _honour_ GPC silently but to **show a visible confirmation**
  ("Opt-Out Request Honored" badge). ~20+ states now have active laws; more join in 2026.
- **Dark-pattern bans tightening** — reject must be as easy as accept; no pre-ticked boxes;
  equal-weight buttons. Regulators (CA/CO/CT) run **coordinated automated sweeps**; real fines
  landing (e.g. a $1.35M CCPA penalty cited in 2026 coverage).
- **Consent proof matters.** Enforcement increasingly asks "show me the record." A verifiable,
  timestamped, exportable consent log is becoming table-stakes, not a luxury.

**Implication:** our next features shouldn't be cosmetic. The high-leverage ones are
**GPC + visible confirmation**, **provable consent records**, and a **path to Google/TCF
certification** — because those are exactly what the law and Google now test for.

---

## 3. Feature expansion roadmap

Grouped by how much they fit our zero-infrastructure model. `★` = strong differentiator.

### Tier A — Ship next (high impact, fits zero-infra or near-zero)

1. **★ GPC / Global Privacy Control support + visible "Opt-Out Honored" badge.**
   Detect `navigator.globalPrivacyControl`, auto-apply a reject for sale/share categories, and
   render the now-legally-required confirmation. Pure client-side. This is _required_ in 12+
   states and almost nobody in the Framer field advertises it. Fast win, big compliance story.
2. **★ Verifiable consent records (client-first, optional cloud sink).**
   We already store the decision in localStorage + cookie. Add a **signed, timestamped consent
   receipt** (schema version, categories, method, GPC state, banner version hash) the visitor
   can export, and an **optional** POST to a Cloudflare Worker (same pattern as our analytics
   Worker) for owners who want a central log. Keeps zero-infra as default, offers audit trail
   as a Pro upgrade.
3. **Auto cookie/tracker scanning — design-time, in the plugin.**
   CookieGuard/Cookiebot scan from _their cloud_. We can scan **at author time** inside the
   plugin (fetch the published site, detect common trackers/GTM/pixels, suggest categories &
   pre-fill the scripts list). No runtime cost, no visitor data leaves the browser.
4. **A/B testing of banner copy/layout + conversion analytics.**
   We already have the analytics Worker seam. Add accept-rate / reject-rate / customise-rate by
   variant. "Maximise consent rate while staying compliant" is a premium selling point.
5. **Preference Center / "Manage cookies" re-open + granular per-vendor toggles.**
   We have the floating reopen button; extend to a full preference center with per-purpose and
   (later) per-vendor granularity — the shape TCF will require anyway.
6. **Region-aware banners (auto behaviour by law).** We have geo (offline heuristic + Worker).
   Wire it to **auto-select the correct mode per region**: opt-in (EU/UK/Brazil), opt-out
   (US states), notice-only elsewhere. One banner that's correct everywhere.

### Tier B — Bigger bets (real infra or certification effort)

7. **★ Google-certified CMP + IAB TCF v2.3.** The credibility unlock for EEA/UK ad publishers,
   and the one thing ConsentBit can claim that we can't. Non-trivial: weekly GVL sync, TC-string
   generation, the certification process. Decide if the ad-publisher segment is worth it — it's
   the difference between "nice banner" and "real CMP" for a meaningful buyer group.
8. **Bundled legal-doc generator** (cookie policy / privacy policy) — Termly/iubenda's wedge.
   High attach-rate, high perceived value, template-driven (could be a sibling Plugins Company product).
9. **Consent analytics dashboard** (Insights tab, powered by the analytics Worker) — trends,
   geography, category breakdown, GPC hit rate.
10. **Server-side / Google Tag Manager template + Consent Mode advanced wiring** for power users.

### Tier C — Ecosystem / stickiness

11. **Template gallery / theme marketplace** for banners (ties to Framer's aesthetic buyer).
12. **Team/agency features:** manage many sites from one place, shared brand presets, client hand-off.
13. **Accessibility certificate** — we already do focus-trap/ARIA/WCAG AA; make it a _marketed_ badge with an audit report. Few competitors emphasise this.

---

## 4. Platform expansion

**The core insight:** our `shared/config-schema.ts` + `runtime/consent.min.js` are already
**platform-agnostic**. The runtime is vanilla JS that boots from an injected config on _any_
website. Only the **authoring + injection layer** (currently the Framer plugin) is
platform-specific. So each new platform = a new thin "front end" onto the same engine.

Recommended architecture: introduce a **`core/`** concept (schema + runtime + a headless
"config → loader snippet" serializer) and treat each platform as an adapter:

| Platform | Effort | How config gets in | Notes / priority |
|---|---|---|---|
| **Plain `<script>` / universal embed** | **Low** | Copy-paste snippet with inline config + CDN runtime | Ship first. Instantly covers Wix, Squarespace, Ghost, static sites, custom HTML. Also your demo/sales surface. |
| **Webflow** | Low–Med | Webflow **Designer App** (like our Framer plugin) OR just the universal embed in Custom Code | **Highest-priority real platform.** Same buyer persona as Framer (design-led, no-code). Webflow App marketplace is a strong distribution channel. Enzuzo/Usercentrics already there — beatable on speed/price. |
| **WordPress** | Medium | A thin WP plugin that writes the loader into `wp_head` + a settings screen (reuse the React UI in an admin page) | Biggest market by far, but most crowded (Complianz, CookieYes, Cookiebot). Win on **flat price + speed + no external account**. Auto-detect installed trackers (GA/Meta/GTM plugins). |
| **Shopify** | Medium | Shopify App (theme app extension injects loader) | Lucrative, compliance-sensitive (checkout, marketing pixels). Pandectes/Complianz strong here. |
| **Wix / Squarespace / Ghost** | Low | Covered by the universal embed initially; native apps later | Long tail; embed-first. |
| **Framer** (current) | — | Existing plugin | Keep as flagship; feed improvements back to core. |

**Sequencing recommendation:** (1) **Universal `<script>` embed** (unlocks many platforms for
near-zero cost and gives you a standalone product + demo), (2) **Webflow** (same audience,
strong marketplace), (3) **WordPress** (volume), (4) **Shopify** (value). Keep one schema, one
runtime, one compliance engine behind all of them — that consistency IS the moat.

**Risk to manage:** the licensing model. Right now the license verdict is baked into the Framer
loader. Multi-platform makes the **shared portal licensing model** (already the planned
direction per PROGRESS.md) more important — one license, many platforms, one place to manage it.

---

## 5. Positioning — how we win

**One-liner:** _"The consent platform that doesn't phone home. Certified-grade compliance, an
11 KB self-hosted runtime, no account, no per-domain tax — on Framer, Webflow, WordPress, and
anywhere else."_

Differentiators to hammer (in priority order):

1. **No third-party dependency / privacy by architecture.** Competitors load _their_ script
   from _their_ cloud and require an account. We inject a self-hosted runtime; nothing about the
   visitor leaves the browser. This is both a **performance** and a **privacy** claim — and
   ironic-in-a-good-way for a _privacy_ tool. Nobody in the Framer field can say it.
2. **Speed / size.** 11 KB gzip, denied-by-default before any tag fires. Publish the number.
3. **Flat, honest pricing (no per-domain, no metered surprises).** CookieGuard already uses
   "flat pricing, no per-domain surprises" as a hook — we should own it harder, especially for
   **agencies** who hate metered billing across many client sites.
4. **Correct-everywhere compliance** — GPC + region-aware modes + provable records + (later)
   TCF certification. Match the serious CMPs on substance.
5. **Design-native.** Built for the Framer/Webflow aesthetic crowd — beautiful banners are the
   ante; we pair them with real blocking, which the pretty-but-cosmetic components don't.

**Gaps we must honestly close to claim "more advanced":** consent proof/records (Tier A #2),
GPC (Tier A #1), and a decision on TCF certification (Tier B #7). Those three move us from
"great banner" to "credible CMP."

---

## Sources
- Usercentrics — Best cookie consent tools 2026: https://usercentrics.com/knowledge-hub/cookie-consent-tools/
- Consently — Best cookie consent tools / CookieYes & Cookiebot alternatives: https://consently.net/blog/best-cookie-consent-tools
- Enzuzo — Cookiebot alternatives: https://www.enzuzo.com/blog/best-cookiebot-alternatives
- Osano — CMP comparison: https://www.osano.com/comparison/cookie-consent-management-platform-comparison
- iubenda — Best cookie consent solutions 2026: https://www.iubenda.com/en/blog/best-cookie-consent-solutions/
- Elementor — Cookie consent plugin comparisons: https://elementor.com/blog/10-best-cookie-consent-plugins-compared-2026/
- ConsentBit (Framer marketplace): https://www.framer.com/marketplace/plugins/consentbit/
- CookieGuard (Framer marketplace): https://www.framer.com/marketplace/plugins/cookieguard-cookie-consent/
- Cookie Consent Pro (Framer): https://www.framer.com/community/marketplace/plugins/cookie-consent-pro-by-getseo-pro/
- Secure Privacy — IAB TCF 2.3 guide: https://secureprivacy.ai/blog/iab-tcf-2-3
- Secure Privacy — Global cookie consent trends 2026: https://secureprivacy.ai/blog/global-cookie-consent-trends-2026
- Clym / Seresa — GPC now required in 12 US states: https://www.clym.io/blog/what-is-global-privacy-control-the-opt-out-signal-12-us-states-now-require-you-to-honor
- PrivacyLawMap — US state cookie consent requirements 2026: https://privacylawmap.com/blog/cookie-consent-requirements-us-state-privacy-laws
- Usercentrics — CCPA cookie banner requirements 2026: https://usercentrics.com/us/knowledge-hub/ccpa-cookie-banner/
- Usercentrics — CMP for Webflow: https://usercentrics.com/integrations/webflow/
- Enzuzo — Webflow cookie consent plugin: https://www.enzuzo.com/webflow-cookie-consent-plugin

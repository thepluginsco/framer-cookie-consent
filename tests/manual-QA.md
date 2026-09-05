# Manual pre-release QA — Consentful

The automated suite (`npm test`) proves the runtime logic in jsdom. It **cannot**
prove the parts that only exist on a real, published Framer site: the actual
Google Consent Mode `gcs`/`gcd` params on the wire, real third-party network
requests, real browser storage/ITP behaviour, and Framer's custom-code
injection/removal. **Run this checklist against a REAL published site before every
release.** Do not ship on green unit tests alone — this is a compliance product.

## 0. Setup

- [ ] Publish a test Framer site with the Consentful plugin installed and at least
      one real tracker configured (e.g. GA4 `G-XXXX`, plus one marketing tag such
      as Meta Pixel or Google Ads).
- [ ] Have ready: Chrome + [Google Tag Assistant](https://tagassistant.google.com/),
      GTM Preview (if using GTM), Safari (incl. a Private window), Firefox, and a
      real phone (iOS Safari + Android Chrome).
- [ ] Know how to clear this site's storage fast: DevTools → Application →
      Storage → **Clear site data** (clears `localStorage` + the `cc_consent`
      cookie so the banner re-shows). Do this before each scenario.

---

## 1. Consent Mode signals reflect the visitor's choice (gcs / gcd)

Use **Google Tag Assistant** (or GTM Preview) connected to the live site. The
`gcs` param is the update sent after a choice; `gcd` is the default. Inspect the
outgoing `/g/collect` (GA4) or `/collect` requests in the Network tab and read the
`gcs`/`gcd` query params, and cross-check in Tag Assistant's Consent view.

- [ ] **Before any choice** (fresh visit): the GA4 default reflects Consent Mode
      **denied** — `gcd` present, and Tag Assistant shows `analytics_storage`,
      `ad_storage`, `ad_user_data`, `ad_personalization` = **Denied**,
      `security_storage` = Granted. No `gcs=G1...` "granted" update yet.
- [ ] **Accept all** → an update fires with `gcs=G111` (all granted). Tag
      Assistant Consent view flips all four signals to **Granted**.
- [ ] **Reject all** → signals stay **Denied** (`gcs` reflects denied, e.g.
      `G100`); `security_storage` remains Granted; no analytics/ads storage is set.
- [ ] **Analytics only** (via Manage preferences) → `analytics_storage` Granted,
      all three `ad_*` signals **Denied**. Confirm a GA4 hit is sent but Google
      Ads/marketing tags are still gated.
- [ ] Values **persist on reload** and across pages (SPA navigation in Framer):
      the choice is not re-asked and the signals stay consistent.

## 2. No GA / marketing requests fire before consent

Open DevTools → **Network**, filter to third-party hosts, clear site data, reload.

- [ ] With the banner showing and **no** choice made, there are **zero** requests
      to: `google-analytics.com`, `googletagmanager.com/gtag` execution beacons
      (`/g/collect`), `connect.facebook.net` / `facebook.com/tr`,
      `googleads.g.doubleclick.net`, `analytics.tiktok.com`, LinkedIn `px`, etc.
- [ ] Any `<script type="text/plain" data-cc-category=...>` placeholders in the
      page source are **not** executed (still `type="text/plain"` in the Elements
      panel; no network request from them).
- [ ] After **Accept all**, the corresponding requests now DO fire (proves the
      unblock path works, not just that everything is silently broken).
- [ ] After **Reject all**, reload: still no analytics/marketing requests.

## 3. Cross-browser

Repeat the core flow (fresh visit → banner shows → Accept / Reject / Preferences
→ reload → choice persists) on each:

- [ ] **Chrome** (desktop).
- [ ] **Safari** (macOS) — normal window.
- [ ] **Safari Private window** — `localStorage` can **throw**; confirm the banner
      still appears, a choice can be made, and nothing errors in the console. (The
      cookie fallback should carry consent within the session; a brand-new Private
      window is expected to re-prompt — that is correct.)
- [ ] **Firefox** (desktop) — incl. with Enhanced Tracking Protection on.
- [ ] **Mobile Safari** (iOS) — banner is readable, buttons tappable, layout not
      clipped; modal/bar does not cover the whole screen awkwardly.
- [ ] **Mobile Chrome** (Android) — same.
- [ ] In each: keyboard/VoiceOver/TalkBack can reach and operate the buttons; the
      preferences modal traps focus and `Esc` closes it (non-blocking layouts).

## 4. EU vs non-EU display (`eu-only` mode)

Set the banner to **EU-only** show mode, publish, then test region detection
(which is timezone-based by default). Use a VPN **and/or** change your OS time
zone to force the region.

- [ ] **EU** (e.g. VPN to Germany, or set TZ to `Europe/Berlin`) → banner **shows**.
- [ ] **UK** (`Europe/London`) → banner shows.
- [ ] **California** (`America/Los_Angeles`) → banner shows.
- [ ] **Non-EU, non-regulated** (e.g. TZ `America/Chicago`, no VPN) → banner does
      **not** show, and trackers are auto-allowed per config (verify GA fires).
- [ ] **Ambiguous / VPN mismatch** (e.g. an unusual TZ) → banner **shows** (the
      runtime fails safe toward privacy when detection is uncertain).
- [ ] With **Respect Do Not Track** enabled and DNT set in the browser → banner
      does not show and trackers stay blocked (reject-by-default).

> Note: default geo is an approximate, `$0`, client-side timezone heuristic — a
> VPN that doesn't change the OS timezone will NOT change the detected region.
> This is expected; document it for support.

## 5. Config re-injection does not duplicate the custom-code block

In the Framer editor with the plugin open:

- [ ] Change a config value (e.g. banner title or accent) and re-apply/insert.
- [ ] In **Site Settings → Custom Code** (and in the published page source),
      confirm there is exactly **one** Consentful block / loader — not a second
      appended copy.
- [ ] The published site reflects the new value after re-publish.
- [ ] Repeat 2–3 edits; the block count stays at exactly one and the embedded
      config JSON is the latest.

## 6. Removing the plugin block removes only our code

- [ ] Remove/clear the Consentful custom-code block via the plugin (or Framer's
      custom-code UI).
- [ ] Confirm the published page no longer loads `consent.min.js`, shows no
      banner, and has **no** leftover `data-cc-*` / `__CC_CONFIG__` / `cc-root`
      artifacts.
- [ ] Confirm **other** custom code on the site (analytics snippets the user added
      separately, other plugins' blocks, head/body scripts) is **untouched**.
- [ ] Re-add the plugin → it cleanly re-inserts a single block again.

## 7. Regression sweep

- [ ] No uncaught errors in the console on any of the above (a runtime error must
      never break the host page — the banner degrades to "not shown", it never
      throws into the page).
- [ ] Licensed site: full styled banner, white-label credit hidden if entitled.
- [ ] Unlicensed site: basic branded bar still shows AND still blocks trackers
      (compliance never degrades with licensing).
- [ ] Lighthouse/PageSpeed: the deferred `consent.min.js` doesn't tank
      performance; it loads async and is small.

---

### Optional: enabling error visibility during QA

The runtime ships an **optional, zero-network** error hook (off by default). To
surface suppressed runtime errors while testing, in the browser console **before**
the page boots (or via a snippet in head):

```js
window.__CC_DEBUG__ = true;                 // verbose console.error with stack
window.__CC_ON_ERROR__ = (err, ctx) => {    // optional: route to your own logging
  console.log('[QA] consent runtime error', ctx, err);
};
```

Neither flag makes any external call — `__CC_ON_ERROR__` is YOUR code. Remove both
before release. See `runtime/src/error-logger.ts`.

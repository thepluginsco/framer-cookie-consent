# Launch kit

Everything needed to finish launching Consentful: what's left, and ready-to-paste
listing copy for each marketplace. Keep the copy in sync with
`consentful-portal/packages/config/src/marketing.ts` and
`consentful-portal/apps/web/src/content/platforms.ts`.

## What's left

| # | Item | Owner | Status |
|---|---|---|---|
| 5a | Switch Dodo Payments to live mode (live key, webhook secret and product ids on Render + Vercel; plan rows synced to the live ids) | You + Claude | Done 2026-10-01 |
| 5b | Make one real purchase and confirm a license is issued and billing shows the right plan | You | Open |
| 5c | Google + GitHub sign-in: env vars on Render + Vercel; both start with the right callback URLs | You + Claude | Done 2026-10-01 |
| 5d | Complete one real Google and one GitHub login. Google needs `https://consentful.theplugins.co/api/auth/callback/google` on the shared OAuth client; GitHub needs Consentful's own OAuth app (callback `…/api/auth/callback/github`) | You | Open |
| 6 | Add `https://consentful-api.onrender.com/health` to `PING_URLS` (render-keepalive Netlify site) | You | Open |
| 6a | Set the Pre-Deploy Command on the Render service so migrations run on deploy (until then, run `pnpm --filter @repo/db db:migrate` by hand after each one) | You | Open |
| 6b | Store graphics: 17 real UI captures + 7 image prompts in `marketing/` | Claude | Captured 2026-10-01; final store images still to generate |
| 6c | Add `plugin/public/logo-light.png` (dark-theme banner credit shows a broken image without it) | You (asset) | Open |
| 7 | Framer Marketplace — published 2026-10-01 under The Plugins Company (no review; live immediately). Upload the zip as `Consentful.zip`: Framer takes the listing name from the file name. New versions: plugin page → ⋯ → New Version | Claude + You | **Live** |
| 8 | Submit to Webflow Apps (`apps/webflow-app/bundle.zip`) | You | Copy below |
| 9 | Submit to the Shopify App Store | You | Copy below |
| 10 | Submit to the Wix App Market | You | Copy below |
| 11 | WordPress.org directory (optional — the zip is already downloadable from the site) | You | Copy below |
| — | Register the business, then set the governing law in the Terms (`consentful-portal/apps/web/src/content/legal/en.ts`, "Governing law") | You | Open |
| — | Have a lawyer review the legal pages | You | Recommended |

Notes on the live switch:

- The portal's local `.env` stays on Dodo **test** mode on purpose. Dev and prod
  share one database, so never run `db:sync-products` from local without passing
  the live ids explicitly — it would write the test ids back to production. The
  live ids are in `consentful-portal/DODO_PRODUCTS.md`.
- For the same reason, `make-deploy-env.mjs` output carries test Dodo values —
  don't paste its Dodo lines over Render or Vercel.
- Accounts that bought Lifetime before the 2026-10-01 billing fix still have
  their old subscription running; cancel those by hand.

## Shared listing facts

- **Name:** Consentful
- **Tagline (≤ 60 chars):** Cookie consent with Google Consent Mode v2
- **One-liner:** A GDPR- and CCPA-ready cookie banner that blocks trackers until visitors agree.
- **Category:** Privacy / Compliance / GDPR / Cookie consent
- **Website:** https://consentful.theplugins.co
- **Support email:** support@theplugins.co
- **Docs:** https://consentful.theplugins.co/docs
- **Privacy policy:** https://consentful.theplugins.co/privacy
- **Terms:** https://consentful.theplugins.co/terms
- **Pricing:** Free for one site. Paid plans from $12/month (Solo 1 site, Studio 5, Agency 25) or $299 lifetime (3 sites). Billed on consentful.theplugins.co, not through the marketplace.
- **Keywords:** cookie banner, cookie consent, GDPR, CCPA, Google Consent Mode v2, consent management, script blocking, privacy

### Long description (use everywhere, then add the platform paragraph)

> Consentful adds a cookie consent banner to your site that actually does the job:
> it blocks tracking scripts until visitors agree and tells Google what they chose
> through Consent Mode v2.
>
> **Compliant by default.** Opt-in consent for GDPR, opt-out for CCPA, or Auto to
> switch by region. Reject all sits next to Accept all, nothing is pre-ticked,
> Global Privacy Control and Do Not Track are respected, and every choice gets a
> downloadable receipt.
>
> **Real script blocking.** Google Analytics, Meta Pixel, Hotjar and any other
> tracker stay off until their category is allowed — then start instantly, with no
> page reload.
>
> **Google Consent Mode v2, built in.** Ad and analytics signals are set to denied
> before Google tags load and updated the moment a visitor chooses. Nothing to set
> up in Tag Manager.
>
> **Fast and private.** About 11 KB, loaded deferred. Visitors' choices stay in
> their own browser — Consentful's servers never receive them.
>
> **Pro features:** card, bar and modal layouts with your colors and fonts,
> geo-targeting, a preference center with per-service toggles, multiple languages,
> A/B testing with consent analytics, a cookie- and privacy-policy generator, and a
> WCAG 2.1 AA accessibility check.
>
> Free for one site, forever. One license covers your domain on Framer, Webflow,
> WordPress, Shopify, Wix or any website.

### Screenshots to capture (same set for every store)

1. The banner on a real page (card layout, light).
2. The preference center open.
3. The editor: Categories tab.
4. The editor: Scripts tab with two trackers.
5. The editor: Theme tab with the preview open.
6. The Publish tab showing "Live".

## 7 · Framer Marketplace

- **Upload:** `plugin/plugin.zip` (rebuild with `npm run build --workspace=plugin && (cd plugin && npm run pack)`).
- **Platform paragraph:** *Design your cookie banner inside Framer. Consentful
  writes itself into your site's custom code as you edit — publish your site and
  it's live. Preview addresses on framer.website get the full banner free.*
- **Reviewer notes:** A free license key is created at
  https://consentful.theplugins.co/signup. The plugin needs custom code enabled
  on the site.

## 8 · Webflow Apps

- **Upload:** `apps/webflow-app/bundle.zip` as the Designer Extension bundle. The
  Data Client is the `consentful-webflow` Worker; redirect URI
  `https://consentful-webflow.thepluginsco.workers.dev/callback`.
- **Scopes requested and why:** `sites:read` / `sites:write` (publish the site
  after installing the banner), `custom_code:read` / `custom_code:write` (register
  and apply the banner scripts), `authorized_user:read` (confirm the person
  publishing is an authorized Designer user of that site).
- **Platform paragraph:** *Design your banner in a Webflow Designer app and
  publish it to your site's custom code with one click — no attributes or embeds
  to wire up. webflow.io staging sites are free.*
- **Reviewer notes:** Open the app in the Designer → Publish tab → Connect
  Webflow → activate with a free key → Publish banner → publish the site.

## 9 · Shopify App Store

- **Already released:** version `consentful-2`, hosted on the `consentful-shopify`
  Worker, with the mandatory compliance webhooks.
- **Scopes requested and why:** `read_themes` — read-only, to show whether the
  app embed is switched on in the live theme. Publishing writes only the app's
  own data (app-data metafields); no customer or order data is accessed.
- **Data handling answers:** The app does not collect or store customer personal
  data. Banner settings are stored in the shop's own app-data metafields.
- **Platform paragraph:** *Design your banner inside Shopify admin and publish
  straight to your storefront. Every choice is passed to Shopify's Customer
  Privacy API, so Shopify analytics, checkout and pixels respect it. Turn on the
  app embed once — the app opens the theme editor with it already switched on.*
- **Reviewer notes:** Apps → Consentful → activate with a free key → Publish →
  "Turn on app embed" → Save. The banner appears on the storefront; Accept/Reject
  updates `Shopify.customerPrivacy`.
- **Listing requires:** app icon (1200×1200), at least 3 desktop screenshots
  (1600×900), a demo store URL, and the privacy policy URL above.

## 10 · Wix App Market

- **Before submitting:** rename the app from "My New App-1" to **Consentful**
  (App Profile), and email Wix's consent-apps team the app id
  `8e3924a2-1065-41e3-b69b-b5869300378c` so uninstalling resets a site's default
  consent policy.
- **Permissions requested and why:** *Manage Embedded Scripts* (add the banner
  to the site) and *Manage Consent Policy* (set opt-in as the site default).
- **Platform paragraph:** *Replace Wix's built-in cookie banner with one you
  fully design. Consentful sets your site's consent policy to opt-in and passes
  each visitor's choice to Wix, so Wix analytics and marketing tools respect it.*
- **Reviewer notes:** Turn off Wix's own cookie banner first (one consent app
  per site). Site dashboard → Apps → Consentful → activate → Install banner →
  publish the site. The banner shows on the published site, not in the Editor.

## 11 · WordPress.org (optional)

- **Download today:** https://consentful.theplugins.co/downloads/consentful-wordpress.zip
  (rebuild with `npm run build:wordpress-zip`).
- **For the directory:** needs a `readme.txt` in WordPress format, GPL-compatible
  licensing of everything in the zip, and a review that can take several weeks.
  Note that directory guidelines restrict features locked behind a paid key —
  check this before submitting.
- **Short description (≤ 150 chars):** Lightweight cookie consent banner with
  Google Consent Mode v2 and real script blocking. GDPR and CCPA ready.

## After launch (SEO)

- Submit `https://consentful.theplugins.co/sitemap.xml` in Google Search Console
  and Bing Webmaster Tools.
- Replace the store links in `pluginStoreConfig` (marketing.ts) and
  `platformPages[].install.href` (platforms.ts) with the live listing URLs as
  each marketplace approves.
- Add real customer quotes to `testimonialsConfig` — the section stays hidden
  while it's empty.
- Next content: comparison pages (Cookiebot, CookieYes, Termly, Finsweet) —
  every claim must be checked against the competitor's current public pricing
  and features.
- Run Consentful's own banner on consentful.theplugins.co instead of the
  built-in one (Dashboard → Websites → add the site → paste the snippet).

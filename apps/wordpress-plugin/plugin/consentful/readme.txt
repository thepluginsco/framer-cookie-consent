=== Consentful — Cookie Consent ===
Contributors: thepluginsco
Tags: cookie consent, gdpr, ccpa, cookie banner, consent mode
Requires at least: 6.3
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.4.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Lightweight cookie consent banner with Google Consent Mode v2 and real script blocking. GDPR and CCPA ready.

== Description ==

Consentful adds a cookie consent banner to your WordPress site that blocks tracking scripts until visitors agree and tells Google what they chose through Consent Mode v2.

You design the banner in wp-admin. When you publish, the plugin loads the banner script, which ships inside the plugin, on your site with your settings.

* **Compliant by default.** Opt-in consent for GDPR, opt-out for CCPA, or Auto to switch by visitor region. Reject all sits next to Accept all, nothing is pre-ticked, and Global Privacy Control and Do Not Track are respected.
* **Real script blocking.** Trackers such as Google Analytics, Meta Pixel and Hotjar stay off until their category is allowed, then start with no page reload.
* **Embeds held until consent.** Turn on embed blocking and YouTube, Vimeo, TikTok, Instagram, X, Facebook, Spotify, Google Maps and other embeds show a "Load content" placeholder until the visitor allows their category.
* **Google Consent Mode v2, built in.** Ad and analytics signals are set to denied before Google tags load and updated when a visitor chooses.
* **Tracker detection.** The plugin reads your list of active plugins to suggest which trackers to manage.
* **Private.** Visitors' choices stay in their own browser. They are never sent to Consentful's servers.

= Free and paid plans =

Activate the plugin with a license key from [consentful.theplugins.co](https://consentful.theplugins.co). A free key is available, with no card needed.

* **Free:** GDPR and CCPA consent, Google Consent Mode v2, script and embed blocking by category, and a Consentful-branded bottom bar with the standard English wording and the four standard categories.
* **Paid plans:** every layout and theme, your own wording in 29 languages, custom categories, custom CSS (scoped to the banner; it can't load anything from other sites), geo-targeting (automatic opt-in or opt-out by region), a preference center with per-service toggles, multiple languages, A/B consent-rate testing, consent insights, a cookie- and privacy-policy generator, a WCAG 2.1 AA accessibility check, plus extra sites on any paid plan ($5/month or $49/year each). Every plan shows a small "Powered by Consentful" credit.

Consentful is an independent product of The Plugins Company. It is not affiliated with, endorsed by or sponsored by Google, Meta or Hotjar.

== External services ==

= Consentful licensing service =

The plugin uses Consentful's licensing service at consentful.theplugins.co, operated by The Plugins Company.

* **From wp-admin:** when you activate a key, and again when the settings screen opens to re-check it, the plugin sends your license key and your site's domain. No site content is sent.
* **From your site:** the banner sends your site's domain to check which plan is active, and loads its language packs and images from cdn.jsdelivr.net. Visitors' consent choices are never sent.
* [Terms of Service](https://consentful.theplugins.co/terms), [Privacy Policy](https://consentful.theplugins.co/privacy).

= Google tag (gtag.js), only if you enable it =

If you enter a Google tag ID (for example a GA4 measurement ID) in the plugin's Consent Mode settings, the banner loads Google's tag script for you. It stays blocked until the visitor allows the matching cookie category. With no tag ID set, nothing is loaded from Google.

* **What is sent, and when:** after the visitor allows the category, their browser requests https://www.googletagmanager.com/gtag/js with your tag ID. From then on Google's tag sends what Google Analytics / Google Ads normally collect (page address, IP address, browser details and the consent state).
* **Provider:** Google LLC. [Terms of Service](https://policies.google.com/terms), [Privacy Policy](https://policies.google.com/privacy).

= Scripts you add yourself =

Consentful blocks and unblocks the third-party scripts **you** list in the plugin (for example Google Analytics or Meta Pixel). Those scripts load from their own providers only after a visitor allows their category, and those providers' terms apply. The plugin's list of known trackers only fills in a script address and a privacy-policy link when you pick one. It loads nothing by itself.

== Installation ==

1. Upload the plugin through **Plugins → Add New → Upload Plugin**, or unzip it into `/wp-content/plugins/`, and activate it.
2. Open **Settings → Consentful**.
3. Design your banner, add the scripts you want blocked until consent, and press **Publish**.

== Frequently Asked Questions ==

= Is it free? =

There is a free plan: get a free key on consentful.theplugins.co and activate it in the plugin. Paid plans unlock the extra layouts, themes and features.

= Do I need to set anything up in Google Tag Manager? =

No. Consent Mode v2 defaults and updates are sent by the banner itself.

= Does the banner show a "Powered by Consentful" credit? =

Yes, a small credit on every plan, free and paid.

= Where are visitors' choices stored? =

In the visitor's own browser. Consentful's servers do not receive them.

= What happens when I remove the banner or uninstall the plugin? =

Removing the banner takes it off your site straight away. Uninstalling the plugin deletes the options it stored.

== Source code ==

The admin screen (`assets/consentful-admin.js`) and the banner script (`assets/runtime/consent.min.js`) are compiled bundles. Their source is at https://github.com/thepluginsco/framer-cookie-consent (`apps/wordpress-plugin`, `shared-ui`, `shared`, `runtime`).

Bundled fonts: Plus Jakarta Sans and JetBrains Mono (SIL Open Font License 1.1), Material Symbols (Apache License 2.0).

== Changelog ==

= 0.4.1 =
* New: embed blocking. YouTube, Vimeo, TikTok, Instagram, X, Facebook, Spotify, Google Maps and other embeds can be held behind a "Load content" placeholder until the visitor allows their category (Scripts tab). Included on every plan.

= 0.4.0 =
* License activation, the License tab and paid features are back in the plugin.
* Custom CSS and custom managed scripts are back. Every value is validated before it is published, and custom CSS is scoped to the banner with no external resources.
* Free plan: a Consentful-branded bottom bar in English. Paid plans unlock your own design, wording, languages and categories.
* The "Embed on another site" snippet is back on the Publish tab.
* Licensing now goes through consentful.theplugins.co.

= 0.3.1 =
* No custom CSS or custom JavaScript: managed scripts are chosen from a list of known vendors, and you enter only the tag ID — the plugin builds the tag.
* Custom CSS removed (use Appearance → Customize → Additional CSS instead).

= 0.3.0 =
* No license key or activation: the plugin is free and fully functional, and never contacts a Consentful server.
* Pro features moved to the separate Consentful Pro add-on.

= 0.2.0 =
* The banner script and its images now ship inside the plugin. Nothing is loaded from a CDN.
* Banner settings are stored as JSON and printed with WordPress script APIs.
* Added Settings and Plans links on the Plugins screen.
* The "Powered by Consentful" credit is now off unless you turn it on.

= 0.1.0 =
* First release.

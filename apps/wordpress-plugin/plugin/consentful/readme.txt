=== Consentful — Cookie Consent ===
Contributors: thepluginsco
Tags: cookie consent, gdpr, ccpa, cookie banner, consent mode
Requires at least: 6.3
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.3.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Lightweight cookie consent banner with Google Consent Mode v2 and real script blocking. GDPR and CCPA ready.

== Description ==

Consentful adds a cookie consent banner to your WordPress site that blocks tracking scripts until visitors agree and tells Google what they chose through Consent Mode v2.

You design the banner in wp-admin. When you publish, the plugin loads the banner script, which ships inside the plugin, on your site with your settings.

* **Compliant by default.** Opt-in consent for GDPR, opt-out for CCPA, or Auto to switch by visitor region. Reject all sits next to Accept all, nothing is pre-ticked, and Global Privacy Control and Do Not Track are respected.
* **Real script blocking.** Trackers such as Google Analytics, Meta Pixel and Hotjar stay off until their category is allowed, then start with no page reload.
* **Google Consent Mode v2, built in.** Ad and analytics signals are set to denied before Google tags load and updated when a visitor chooses.
* **Tracker detection.** The plugin reads your list of active plugins to suggest which trackers to manage.
* **Private.** Visitors' choices stay in their own browser. They are never sent to Consentful's servers.

= Free and fully functional =

Everything in this plugin works without an account, a license key or a time limit. There is no activation step, and the plugin never contacts a Consentful server.

* GDPR and CCPA consent, with opt-in and opt-out models.
* Google Consent Mode v2.
* Script blocking by category, with tracker suggestions from your active plugins.
* Bottom-bar banner in the default theme, in English.
* A "Powered by Consentful" credit only if you turn it on.

= Consentful Pro (optional add-on) =

Consentful Pro is a separate add-on plugin, sold and downloaded from [consentful.theplugins.co](https://consentful.theplugins.co/docs/platforms/wordpress#pro). It is not part of this plugin and is not needed to use it. It adds every layout and theme, custom CSS, geo-targeting (automatic opt-in or opt-out by region), a preference center with per-service toggles, multiple languages, A/B consent-rate testing, consent insights, a cookie- and privacy-policy generator and a WCAG 2.1 AA accessibility check.

Consentful is an independent product of The Plugins Company. It is not affiliated with, endorsed by or sponsored by Google, Meta or Hotjar.

== External services ==

This plugin does not connect to any Consentful service. The banner script, its images and its language files are included in the plugin and served from your own site. Nothing is loaded from a CDN.

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

Yes. The plugin is free and fully functional, with no account, license key or time limit. The optional Consentful Pro add-on is sold separately on consentful.theplugins.co.

= Do I need to set anything up in Google Tag Manager? =

No. Consent Mode v2 defaults and updates are sent by the banner itself.

= Does the banner show a "Powered by Consentful" credit? =

Only if you turn it on. The credit is off by default, and every feature works whether it is on or off. You can switch it on or off at any time on the Publish tab.

= Where are visitors' choices stored? =

In the visitor's own browser. Consentful's servers do not receive them.

= What happens when I remove the banner or uninstall the plugin? =

Removing the banner takes it off your site straight away. Uninstalling the plugin deletes the options it stored.

== Source code ==

The admin screen (`assets/consentful-admin.js`) and the banner script (`assets/runtime/consent.min.js`) are compiled bundles. Their source is at https://github.com/thepluginsco/framer-cookie-consent (`apps/wordpress-plugin`, `shared-ui`, `shared`, `runtime`).

Bundled fonts: Plus Jakarta Sans and JetBrains Mono (SIL Open Font License 1.1), Material Symbols (Apache License 2.0).

== Changelog ==

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

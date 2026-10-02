=== Consentful — Cookie Consent ===
Contributors: thepluginsco
Tags: cookie consent, gdpr, ccpa, cookie banner, consent mode
Requires at least: 6.1
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Lightweight cookie consent banner with Google Consent Mode v2 and real script blocking. GDPR and CCPA ready.

== Description ==

Consentful adds a cookie consent banner to your WordPress site that blocks tracking scripts until visitors agree and tells Google what they chose through Consent Mode v2.

You design the banner in wp-admin. When you publish, the plugin prints a small, version-pinned loader into your site's `<head>`.

* **Compliant by default.** Opt-in consent for GDPR, opt-out for CCPA, or Auto to switch by visitor region. Reject all sits next to Accept all, nothing is pre-ticked, and Global Privacy Control and Do Not Track are respected.
* **Real script blocking.** Trackers such as Google Analytics, Meta Pixel and Hotjar stay off until their category is allowed, then start with no page reload.
* **Google Consent Mode v2, built in.** Ad and analytics signals are set to denied before Google tags load and updated when a visitor chooses.
* **Tracker detection.** The plugin reads your list of active plugins to suggest which trackers to manage.
* **Private.** Visitors' choices stay in their own browser. They are never sent to Consentful's servers.

= A Consentful account is required =

The banner only appears on a site that has been activated with a Consentful license key. A free key covers one site and is created at [consentful.theplugins.co](https://consentful.theplugins.co/signup). Paid plans add more sites and the Pro features (extra layouts, geo-targeting, preference center, multiple languages, A/B testing, policy generator, accessibility check) and are billed on consentful.theplugins.co.

Consentful is an independent product of The Plugins Company. It is not affiliated with, endorsed by or sponsored by Google, Meta or Hotjar.

== External services ==

This plugin relies on two external services.

= Consentful license service =

Used to check whether your site's domain has an active license and which features it includes. Without it the banner is not shown.

* **When:** when you activate a key in wp-admin, and on your published site when a visitor's browser loads the banner (the result is cached in that browser).
* **What is sent:** the site's domain name, and the license key when you activate it in wp-admin. No visitor consent choices or personal data are sent.
* **Provider:** The Plugins Company — [Terms](https://consentful.theplugins.co/terms), [Privacy Policy](https://consentful.theplugins.co/privacy).

= jsDelivr CDN =

The banner script (the Consentful runtime) is loaded on your published site from the jsDelivr CDN at a pinned version.

* **When:** on every front-end page view once a banner is published.
* **What is sent:** a standard HTTP request for the script file, which includes the visitor's IP address and browser user agent, as with any CDN request.
* **Provider:** jsDelivr — [Terms](https://www.jsdelivr.com/terms), [Privacy Policy](https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net).

== Installation ==

1. Upload the plugin through **Plugins → Add New → Upload Plugin**, or unzip it into `/wp-content/plugins/`, and activate it.
2. Create a free license key at https://consentful.theplugins.co/signup.
3. Open **Consentful** in wp-admin, paste the key and activate.
4. Design your banner, add the scripts you want blocked until consent, and press **Publish**.

== Frequently Asked Questions ==

= Is it free? =

Yes, for one site. More sites and the Pro features need a paid plan, billed on consentful.theplugins.co.

= Do I need to set anything up in Google Tag Manager? =

No. Consent Mode v2 defaults and updates are sent by the banner itself.

= Where are visitors' choices stored? =

In the visitor's own browser. Consentful's servers do not receive them.

= What happens when I remove the banner or uninstall the plugin? =

Removing the banner clears the loader from your site's `<head>`. Uninstalling the plugin deletes the options it stored.

== Source code ==

The admin screen (`assets/consentful-admin.js`) is a compiled bundle. Its source, and the source of the banner runtime, is at https://github.com/thepluginsco/framer-cookie-consent (`apps/wordpress-plugin`, `shared-ui`, `shared`, `runtime`).

Bundled fonts: Plus Jakarta Sans and JetBrains Mono (SIL Open Font License 1.1), Material Symbols (Apache License 2.0).

== Changelog ==

= 0.1.0 =
* First release.

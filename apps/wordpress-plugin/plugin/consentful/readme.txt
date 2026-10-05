=== Consentful — Cookie Consent ===
Contributors: thepluginsco
Tags: cookie consent, gdpr, ccpa, cookie banner, consent mode
Requires at least: 6.3
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.2.0
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

= A free Consentful license key is required =

The banner only appears on a site that has been activated with a Consentful license key. A free key covers one site, has no time limit and is created at [consentful.theplugins.co/signup](https://consentful.theplugins.co/signup).

= Free plan =

* One site, with no time limit.
* GDPR and CCPA consent, with opt-in and opt-out models.
* Google Consent Mode v2.
* Script blocking by category.
* Bottom-bar banner in the default theme.

= Paid plans and how to upgrade =

Paid plans add more sites and the Pro features: every layout and theme, custom CSS, geo-targeting (automatic opt-in or opt-out by region), a preference center with per-service toggles, multiple languages, A/B consent-rate testing, a cookie- and privacy-policy generator and a WCAG 2.1 AA accessibility check.

To upgrade:

1. Open **Settings → Consentful** in wp-admin and go to the **License** tab, or go straight to [consentful.theplugins.co/pricing](https://consentful.theplugins.co/pricing).
2. Choose a plan. Plans are billed on consentful.theplugins.co, not inside WordPress.
3. Your existing key is upgraded. Reopen the plugin and the Pro features unlock for the sites on your plan. There is nothing new to install.

Plans (USD): Solo, 1 site, $12/month or $99/year. Studio, 5 sites, $24/month or $199/year. Agency, 25 sites, $49/month or $399/year. Lifetime, 3 sites, $299 once.

Consentful is an independent product of The Plugins Company. It is not affiliated with, endorsed by or sponsored by Google, Meta or Hotjar.

== External services ==

The banner script and its images are included in this plugin and served from your own site. Nothing is loaded from a CDN. The plugin connects to the following external services.

= Consentful licensing service (required) =

Consentful is a service: the plugin is the WordPress connector for a Consentful account, and each site has to be activated against a license key (free or paid). The service records which domains are activated on your account and which plan features they include. It is what decides whether the banner is shown, and in which form.

* **What it is used for:** activating a license key for your site in wp-admin, and checking on your published site whether the domain is activated and which plan features apply.
* **What is sent, and when:**
  * When you activate or re-check a key on the plugin's License tab in wp-admin: the license key and your site's domain name.
  * On your published site, when a visitor's browser loads the banner: your site's domain name. The answer is a signed token that is cached in that visitor's browser, so most page views send nothing.
  * No visitor consent choices, cookies or other personal data are sent.
* **Servers:** consentful.theplugins.co and its API host consentful-api.onrender.com.
* **Provider:** The Plugins Company. [Terms of Service](https://consentful.theplugins.co/terms), [Privacy Policy](https://consentful.theplugins.co/privacy).

= Google tag (gtag.js), only if you enable it =

If you enter a Google tag ID (for example a GA4 measurement ID) in the plugin's Consent Mode settings, the banner loads Google's tag script for you. It stays blocked until the visitor allows the matching cookie category. With no tag ID set, nothing is loaded from Google.

* **What is sent, and when:** after the visitor allows the category, their browser requests https://www.googletagmanager.com/gtag/js with your tag ID. From then on Google's tag sends what Google Analytics / Google Ads normally collect (page address, IP address, browser details and the consent state).
* **Provider:** Google LLC. [Terms of Service](https://policies.google.com/terms), [Privacy Policy](https://policies.google.com/privacy).

= Optional endpoints you set up yourself (paid plans, off by default) =

Geo-targeting and consent analytics make no network request unless you enter an endpoint URL in the plugin. The endpoint is a small Cloudflare Worker that you deploy on your own Cloudflare account; it is not operated by Consentful.

* **Geo endpoint:** the visitor's browser asks your endpoint which country it is in, so the banner can apply the right consent model. With no endpoint set, the region is inferred from the browser's time zone and nothing is sent.
* **Analytics endpoint:** the banner sends an anonymous event (the choice made, the banner variant and the region) to your endpoint so you can see consent rates. With no endpoint set, nothing is sent.
* **Provider:** Cloudflare, under your own account. [Terms of Service](https://www.cloudflare.com/terms/), [Privacy Policy](https://www.cloudflare.com/privacypolicy/).

= Scripts you add yourself =

Consentful blocks and unblocks the third-party scripts **you** list in the plugin (for example Google Analytics or Meta Pixel). Those scripts load from their own providers only after a visitor allows their category, and those providers' terms apply. The plugin's list of known trackers only fills in a script address and a privacy-policy link when you pick one. It loads nothing by itself.

== Installation ==

1. Upload the plugin through **Plugins → Add New → Upload Plugin**, or unzip it into `/wp-content/plugins/`, and activate it.
2. Create a free license key at https://consentful.theplugins.co/signup.
3. Open **Consentful** in wp-admin, paste the key and activate.
4. Design your banner, add the scripts you want blocked until consent, and press **Publish**.

== Frequently Asked Questions ==

= Is it free? =

Yes, for one site, with no time limit. You need a free license key to turn the banner on. More sites and the Pro features need a paid plan, billed on consentful.theplugins.co.

= How do I upgrade? =

Open the License tab in Settings → Consentful, or visit https://consentful.theplugins.co/pricing, and choose a plan. Your existing key is upgraded, so there is nothing new to install.

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

= 0.2.0 =
* The banner script and its images now ship inside the plugin. Nothing is loaded from a CDN.
* Banner settings are stored as JSON and printed with WordPress script APIs.
* Added Settings and Plans links on the Plugins screen.
* The "Powered by Consentful" credit is now off unless you turn it on.

= 0.1.0 =
* First release.

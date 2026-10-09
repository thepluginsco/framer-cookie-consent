=== Consentful Pro ===
Contributors: thepluginsco
Requires at least: 6.5
Requires PHP: 7.4
Requires Plugins: consentful
Stable tag: 0.3.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

The Pro add-on for the free Consentful cookie consent plugin.

== Description ==

Consentful Pro extends the free "Consentful — Cookie Consent" plugin from WordPress.org. It adds a License tab to Settings → Consentful. Activate a paid Consentful key there to unlock:

* every banner layout and theme, colours, corner styles and custom CSS,
* geo-targeting (Auto consent model and per-region rules),
* a preference center with per-service toggles,
* banner copy in more languages,
* A/B consent-rate testing and consent insights,
* the cookie- and privacy-policy generator and the accessibility check.

The free plugin keeps serving the banner from your own site. Pro only changes the admin screen.

== Installation ==

1. Install and activate the free "Consentful — Cookie Consent" plugin from Plugins → Add New.
2. Download Consentful Pro from your dashboard at https://consentful.theplugins.co and upload it in Plugins → Add New → Upload Plugin.
3. Open Settings → Consentful → License, paste your license key and activate.

== External services ==

License activation contacts the Consentful licensing service (consentful.theplugins.co, API host consentful-api.onrender.com), operated by The Plugins Company.

* Sent: your license key and your site's domain name.
* When: only when you activate or re-check a key in wp-admin (the License tab also re-checks a saved key when you open the settings screen).
* Never sent: visitor data or consent choices. Your published site does not contact Consentful.

Terms: https://consentful.theplugins.co/terms. Privacy: https://consentful.theplugins.co/privacy.

Optional geo and analytics endpoints (paid features, off by default) are Cloudflare Workers you deploy on your own account. With no endpoint set, nothing is sent.

== Changelog ==

= 0.3.0 =
* First release as a separate add-on. Pro features moved out of the WordPress.org plugin.

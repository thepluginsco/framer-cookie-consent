<?php
/**
 * Plugin Name:       Consentful — Cookie Consent
 * Plugin URI:        https://thepluginsco.com
 * Description:       GDPR / CCPA cookie-consent banner with Google Consent Mode v2. Authors the banner in wp-admin and prints a tiny, version-pinned loader into the site <head>. No external account.
 * Version:           0.1.0
 * Requires at least: 6.1
 * Requires PHP:      7.4
 * Author:            The Plugins Company
 * License:           GPL-2.0-or-later
 * Text Domain:       consentful
 *
 * The credential-holding WordPress App shell (Phase 3.3). It owns three things
 * the shared TypeScript engine cannot do from the browser sandbox alone:
 *   1. persist ONE option holding our loader block, and
 *   2. echo it verbatim on `wp_head` (a dumb printer — it never builds or
 *      re-escapes the loader; the shared engine does that in the admin bundle), and
 *   3. expose the option + the site's `active_plugins` over a capability-gated
 *      REST namespace the admin bundle's {@see WordPressRestStore} calls.
 *
 * Because the stored block is the byte-identical `buildLoaderHtml` output the
 * Framer plugin, the universal embed and the Webflow app all emit, a WordPress
 * site publishes the exact same consent behaviour as every other platform.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

define( 'CONSENTFUL_VERSION', '0.1.0' );
define( 'CONSENTFUL_FILE', __FILE__ );
define( 'CONSENTFUL_DIR', plugin_dir_path( __FILE__ ) );
define( 'CONSENTFUL_URL', plugin_dir_url( __FILE__ ) );

/**
 * Option storing our loader block (the `buildLoaderHtml` output from the admin
 * bundle). Autoloaded so the `wp_head` print costs no extra query on the front end.
 */
define( 'CONSENTFUL_HEAD_OPTION', 'consentful_head_html' );

/**
 * Option storing the authoring CONFIG (serialized JSON) behind the loader block.
 * The `wp_head` printer never reads this — it exists only so the admin screen
 * can reopen on the banner that's actually live (load-on-mount), instead of a
 * fresh default. Not autoloaded: it's read only in wp-admin, never on the front
 * end.
 */
define( 'CONSENTFUL_CONFIG_OPTION', 'consentful_config_json' );

require_once CONSENTFUL_DIR . 'includes/class-consentful-head.php';
require_once CONSENTFUL_DIR . 'includes/class-consentful-rest.php';
require_once CONSENTFUL_DIR . 'includes/class-consentful-admin.php';

/**
 * Boot the three collaborators. Kept dead simple — each registers its own hooks.
 */
function consentful_boot() {
	( new Consentful_Head() )->register();
	( new Consentful_Rest() )->register();
	if ( is_admin() ) {
		( new Consentful_Admin() )->register();
	}
}
add_action( 'plugins_loaded', 'consentful_boot' );

/**
 * On uninstall the option is removed (see uninstall.php). On deactivation we keep
 * the option so re-activating restores the banner; a full removal is the explicit
 * uninstall path.
 */

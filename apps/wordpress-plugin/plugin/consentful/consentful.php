<?php
/**
 * Plugin Name:       Consentful — Cookie Consent
 * Plugin URI:        https://consentful.theplugins.co
 * Description:       GDPR / CCPA cookie consent banner with Google Consent Mode v2 and script blocking. Design the banner in wp-admin and publish it to your site. Requires a free Consentful license key.
 * Version:           0.2.0
 * Requires at least: 6.3
 * Requires PHP:      7.4
 * Author:            The Plugins Company
 * Author URI:        https://theplugins.co
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       consentful
 *
 * The plugin owns three things the admin bundle cannot do from the browser:
 *   1. persist the published banner settings (JSON) in one option,
 *   2. load the bundled banner runtime on the front end with those settings
 *      printed inline before it (see {@see Consentful_Head}), and
 *   3. expose the options + the site's `active_plugins` over a capability-gated
 *      REST namespace the admin bundle's {@see WordPressRestStore} calls.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

define( 'CONSENTFUL_VERSION', '0.2.0' );
define( 'CONSENTFUL_FILE', __FILE__ );
define( 'CONSENTFUL_DIR', plugin_dir_path( __FILE__ ) );
define( 'CONSENTFUL_URL', plugin_dir_url( __FILE__ ) );

/**
 * Option storing the PUBLISHED banner settings (a JSON string). Autoloaded so
 * the front end reads it without an extra query. Empty / missing = no banner.
 */
define( 'CONSENTFUL_PUBLISHED_OPTION', 'consentful_published_config' );

/**
 * Legacy option from 0.1.x, which stored a ready-made HTML block. Read once by
 * {@see consentful_migrate_legacy_head()} and then deleted.
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
 * Move a 0.1.x banner over to the JSON option: pull the settings object out of
 * the stored HTML block, keep it only if it is valid JSON, and drop the block.
 */
function consentful_migrate_legacy_head() {
	$legacy = get_option( CONSENTFUL_HEAD_OPTION, null );
	if ( null === $legacy ) {
		return;
	}
	if ( is_string( $legacy ) && ! get_option( CONSENTFUL_PUBLISHED_OPTION ) ) {
		if ( preg_match( '/window\.__CC_CONFIG__=(\{.*?\});<\/script>/s', $legacy, $match ) ) {
			$decoded = json_decode( $match[1] );
			if ( is_object( $decoded ) ) {
				update_option( CONSENTFUL_PUBLISHED_OPTION, wp_json_encode( $decoded ), true );
			}
		}
	}
	delete_option( CONSENTFUL_HEAD_OPTION );
}

/**
 * Boot the three collaborators. Kept dead simple — each registers its own hooks.
 */
function consentful_boot() {
	consentful_migrate_legacy_head();
	( new Consentful_Head() )->register();
	( new Consentful_Rest() )->register();
	if ( is_admin() ) {
		( new Consentful_Admin() )->register();
	}
}
add_action( 'plugins_loaded', 'consentful_boot' );

/**
 * On uninstall the options are removed (see uninstall.php). On deactivation we
 * keep them so re-activating restores the banner; a full removal is the explicit
 * uninstall path.
 */

<?php
/**
 * Plugin Name:       Consentful — Cookie Consent
 * Plugin URI:        https://consentful.theplugins.co
 * Description:       GDPR / CCPA cookie consent banner with Google Consent Mode v2 and script blocking. Design the banner in wp-admin and publish it to your site.
 * Version:           0.4.0
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

define( 'CONSENTFUL_VERSION', '0.4.0' );
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

/**
 * Option holding the site owner's opt-in to the "Powered by Consentful" credit
 * in the banner ('1' = shown). Missing or anything else = hidden: the credit is
 * never shown on the public site unless the owner turns it on.
 */
define( 'CONSENTFUL_CREDIT_OPTION', 'consentful_show_credit' );

/**
 * Whether the site owner opted in to the "Powered by Consentful" credit.
 *
 * @return bool
 */
function consentful_credit_enabled() {
	return '1' === get_option( CONSENTFUL_CREDIT_OPTION, '0' );
}

/**
 * Whether a managed-script URL is one of the vendor tags the editor generates
 * from an id (mirrors `shared/src/vendor-templates.ts`). Nothing else may be
 * stored: the plugin never saves custom JavaScript, CSS or arbitrary script URLs.
 *
 * @param string $url The managed script's `src` URL.
 * @return bool
 */
function consentful_allowed_script_url( $url ) {
	$patterns = array(
		'#^https://www\.googletagmanager\.com/gtag/js\?id=(G-[A-Z0-9]{4,20}|AW-[0-9]{4,15})$#D',
		'#^https://www\.googletagmanager\.com/gtm\.js\?id=GTM-[A-Z0-9]{4,12}$#D',
		'#^https://connect\.facebook\.net/en_US/fbevents\.js$#D',
		'#^https://analytics\.tiktok\.com/i18n/pixel/events\.js$#D',
		'#^https://snap\.licdn\.com/li\.lms-analytics/insight\.min\.js$#D',
		'#^https://static\.ads-twitter\.com/uwt\.js$#D',
		'#^https://s\.pinimg\.com/ct/core\.js$#D',
		'#^https://static\.hotjar\.com/c/hotjar-[0-9]{4,12}\.js\?sv=6$#D',
		'#^https://www\.clarity\.ms/tag/[a-z0-9]{6,20}$#D',
		'#^https://widget\.intercom\.io/widget/[a-z0-9]{6,20}$#D',
	);
	foreach ( $patterns as $pattern ) {
		if ( 1 === preg_match( $pattern, $url ) ) {
			return true;
		}
	}
	return false;
}

/**
 * Remove anything code-like from decoded banner settings: the custom CSS field
 * is emptied, and only managed scripts that are a generated vendor tag URL are
 * kept (no inline code, no other URLs). Applied when settings are saved and
 * again when they are printed, so older stored settings are covered too.
 *
 * @param object $config Decoded banner settings.
 * @return object
 */
function consentful_strip_custom_code( $config ) {
	// Only the WordPress.org build strips custom code; the full plugin keeps
	// custom CSS and managed scripts (validated in the editor before publishing).
	if ( ! CONSENTFUL_RESTRICTED ) {
		return $config;
	}
	if ( isset( $config->advanced ) && is_object( $config->advanced ) ) {
		$config->advanced->customCss = '';
	}
	if ( isset( $config->scripts ) ) {
		$kept = array();
		if ( is_array( $config->scripts ) ) {
			foreach ( $config->scripts as $script ) {
				if ( is_object( $script )
					&& isset( $script->type, $script->value )
					&& 'src' === $script->type
					&& is_string( $script->value )
					&& consentful_allowed_script_url( $script->value ) ) {
					$kept[] = $script;
				}
			}
		}
		$config->scripts = $kept;
	}
	return $config;
}

// Build mode written by the admin build (vite.config.ts): true only for the
// WordPress.org review build.
if ( file_exists( CONSENTFUL_DIR . 'includes/build-mode.php' ) ) {
	require_once CONSENTFUL_DIR . 'includes/build-mode.php';
}
if ( ! defined( 'CONSENTFUL_RESTRICTED' ) ) {
	define( 'CONSENTFUL_RESTRICTED', false );
}

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

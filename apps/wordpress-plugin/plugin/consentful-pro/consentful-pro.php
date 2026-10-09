<?php
/**
 * Plugin Name:       Consentful Pro
 * Plugin URI:        https://consentful.theplugins.co/docs/platforms/wordpress#pro
 * Description:       Adds the Consentful Pro features to the free Consentful plugin: every banner design, geo-targeting, a preference center with per-service toggles, more languages, A/B testing, consent insights and the policy generator. Needs a paid Consentful license.
 * Version:           0.3.0
 * Requires at least: 6.5
 * Requires PHP:      7.4
 * Requires Plugins:  consentful
 * Author:            The Plugins Company
 * Author URI:        https://theplugins.co
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       consentful-pro
 * Update URI:        https://consentful.theplugins.co/docs/platforms/wordpress
 *
 * An add-on, sold and downloaded from consentful.theplugins.co (never hosted on
 * WordPress.org). It holds no settings of its own: it swaps the free plugin's
 * admin screen for the full editor, which has a License tab. Activating a paid
 * key there unlocks the Pro controls; the free plugin keeps publishing and
 * serving the banner exactly as before.
 *
 * License activation sends the license key and the site's domain to the
 * Consentful licensing API (consentful-api.onrender.com), and only when the
 * site owner activates or re-checks a key in wp-admin. Visitors' browsers never
 * contact Consentful.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'CONSENTFUL_PRO_VERSION', '0.3.0' );
define( 'CONSENTFUL_PRO_DIR', plugin_dir_path( __FILE__ ) );
define( 'CONSENTFUL_PRO_URL', plugin_dir_url( __FILE__ ) );

/**
 * Serve the Pro editor in place of the free plugin's admin bundle.
 *
 * @param array{dir: string, url: string} $assets The free plugin's bundle folder.
 * @return array{dir: string, url: string}
 */
function consentful_pro_admin_assets( $assets ) {
	if ( ! file_exists( CONSENTFUL_PRO_DIR . 'assets/consentful-admin.js' ) ) {
		return $assets;
	}
	return array(
		'dir' => CONSENTFUL_PRO_DIR . 'assets/',
		'url' => CONSENTFUL_PRO_URL . 'assets/',
	);
}
add_filter( 'consentful_admin_assets', 'consentful_pro_admin_assets' );

/**
 * Explain what's missing when the free Consentful plugin isn't active (older
 * WordPress versions ignore the "Requires Plugins" header).
 */
function consentful_pro_missing_core_notice() {
	if ( defined( 'CONSENTFUL_VERSION' ) || ! current_user_can( 'activate_plugins' ) ) {
		return;
	}
	printf(
		'<div class="notice notice-warning"><p>%s</p></div>',
		esc_html__( 'Consentful Pro needs the free Consentful plugin. Install and activate "Consentful — Cookie Consent" from Plugins → Add New.', 'consentful-pro' )
	);
}
add_action( 'admin_notices', 'consentful_pro_missing_core_notice' );

/**
 * "Manage license" link on the Plugins screen.
 *
 * @param string[] $links Existing action links.
 * @return string[]
 */
function consentful_pro_action_links( $links ) {
	$links[] = sprintf(
		'<a href="%s">%s</a>',
		esc_url( admin_url( 'options-general.php?page=consentful' ) ),
		esc_html__( 'License', 'consentful-pro' )
	);
	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'consentful_pro_action_links' );

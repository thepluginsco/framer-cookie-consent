<?php
/**
 * Runs when the plugin is deleted from wp-admin. Removes the options we store
 * (the loader block + the authoring config) so no trace remains. (Deactivation
 * keeps them, so a re-activation restores the banner; deletion is the explicit
 * clean-up.)
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'consentful_head_html' );
delete_option( 'consentful_config_json' );

// Multisite: drop them on every site too.
if ( is_multisite() ) {
	$sites = get_sites( array( 'fields' => 'ids' ) );
	foreach ( $sites as $site_id ) {
		switch_to_blog( $site_id );
		delete_option( 'consentful_head_html' );
		delete_option( 'consentful_config_json' );
		restore_current_blog();
	}
}

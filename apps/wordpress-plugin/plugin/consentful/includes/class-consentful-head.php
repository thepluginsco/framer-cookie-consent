<?php
/**
 * The `wp_head` printer — the "dumb printer" half of the WordPress adapter.
 *
 * It echoes the stored loader block verbatim, as early as possible in `<head>`,
 * so the inline Consent Mode v2 default (baked into the block by the shared
 * engine) sets `denied` BEFORE any analytics/ads tag on the page can fire.
 *
 * It deliberately does NOT build, escape, validate or transform the block. The
 * shared TypeScript engine (`buildLoaderHtml`, run in the admin bundle) is the
 * single source of truth for the loader's bytes; re-processing it here would
 * risk drift from every other platform. The stored value can only have been
 * written through the capability-gated REST route (see {@see Consentful_Rest}),
 * so it is trusted admin-authored output — printed like Framer/Webflow custom code.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Consentful_Head {

	/** Hook the printer at the very top of `wp_head`. */
	public function register() {
		// Priority 1: before Site Kit, GTM, analytics plugins, etc., so the
		// inline consent default lands first.
		add_action( 'wp_head', array( $this, 'print_loader' ), 1 );
	}

	/** Echo the stored loader block verbatim, or nothing when unset. */
	public function print_loader() {
		$block = get_option( CONSENTFUL_HEAD_OPTION, '' );
		if ( ! is_string( $block ) || '' === trim( $block ) ) {
			return;
		}
		// Intentionally unescaped: this is our own generated <script> loader, not
		// user text. WordPress core prints custom head code the same way (e.g.
		// wp_custom_css_cb, header scripts). See class docblock.
		echo "\n" . $block . "\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}
}

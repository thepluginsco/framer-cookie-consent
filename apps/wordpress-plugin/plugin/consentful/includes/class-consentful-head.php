<?php
/**
 * The front-end printer — loads the banner on the published site.
 *
 * The admin screen stores the published banner settings as JSON (see
 * {@see Consentful_Rest}). On every front-end page this class:
 *   1. enqueues the banner runtime that ships INSIDE this plugin
 *      (`assets/runtime/consent.min.js`) — nothing executable is loaded from a
 *      third-party host, and
 *   2. prints the settings and the Google Consent Mode v2 default just before
 *      it, as an inline script built here in PHP from the decoded JSON.
 *
 * No stored HTML or JavaScript is ever echoed: the only stored value is JSON,
 * and it is re-encoded with `wp_json_encode` on the way out.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Consentful_Head {

	/** Script handle of the bundled banner runtime. */
	const HANDLE = 'consentful-runtime';

	/** Hook the enqueue early so the consent default lands before other tags. */
	public function register() {
		// Priority 1: before Site Kit, GTM, analytics plugins, etc. enqueue
		// theirs, so the inline Consent Mode default is printed first.
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue' ), 1 );
	}

	/**
	 * Decode the stored published settings, or null when no banner is published.
	 *
	 * @return object|null
	 */
	public static function published_config() {
		$json = get_option( CONSENTFUL_PUBLISHED_OPTION, '' );
		if ( ! is_string( $json ) || '' === trim( $json ) ) {
			return null;
		}
		// Decoded as objects (not arrays) so empty `{}` maps survive the round trip.
		$config = json_decode( $json );
		return is_object( $config ) ? $config : null;
	}

	/** Enqueue the bundled runtime with its settings inline before it. */
	public function enqueue() {
		$config = self::published_config();
		if ( null === $config ) {
			return;
		}

		wp_enqueue_script(
			self::HANDLE,
			CONSENTFUL_URL . 'assets/runtime/consent.min.js',
			array(),
			CONSENTFUL_VERSION,
			array(
				'strategy'  => 'defer',
				'in_footer' => false,
			)
		);

		// JSON_HEX_* keeps the literal free of <, >, & and quotes, so it cannot
		// close the script element whatever the settings contain.
		$inline = 'window.__CC_CONFIG__=' . wp_json_encode( $config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT ) . ';';

		if ( isset( $config->consentMode ) && is_object( $config->consentMode ) && ! empty( $config->consentMode->enableConsentMode ) ) {
			$wait = isset( $config->consentMode->waitForUpdateMs ) ? absint( $config->consentMode->waitForUpdateMs ) : 500;
			// Google Consent Mode v2: everything denied until the visitor chooses.
			$inline .= '(function(){window.dataLayer=window.dataLayer||[];'
				. 'function gtag(){dataLayer.push(arguments);}window.gtag=window.gtag||gtag;'
				. "gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',"
				. "ad_user_data:'denied',ad_personalization:'denied',security_storage:'granted',"
				. 'wait_for_update:' . $wait . '});})();';
		}

		wp_add_inline_script( self::HANDLE, $inline, 'before' );
	}
}

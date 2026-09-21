<?php
/**
 * The REST controller — the store the admin bundle's {@see WordPressRestStore}
 * (`apps/wordpress-plugin/src/rest-store.ts`) reads and writes.
 *
 * It is the concrete `WordPressLoaderStore` seam the shared core left behind. It
 * exposes exactly what the shared engine needs and nothing more:
 *
 *   GET  /wp-json/consentful/v1/head             → { head: string }
 *   POST /wp-json/consentful/v1/head   { head }  → store the loader block (null clears)
 *   GET  /wp-json/consentful/v1/config           → { config: string|null }
 *   POST /wp-json/consentful/v1/config { config }→ store the authoring config (null clears)
 *   GET  /wp-json/consentful/v1/active-plugins   → { plugins: string[] }
 *
 * Every route requires `manage_options`, and writes are additionally protected by
 * the standard WordPress REST nonce (`X-WP-Nonce`) that the admin bundle carries.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Consentful_Rest {

	const NAMESPACE = 'consentful/v1';

	/** Register the routes on `rest_api_init`. */
	public function register() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/** Only administrators may read or write consent config. */
	public function permission_check() {
		return current_user_can( 'manage_options' );
	}

	public function register_routes() {
		register_rest_route(
			self::NAMESPACE,
			'/head',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_head' ),
					'permission_callback' => array( $this, 'permission_check' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'set_head' ),
					'permission_callback' => array( $this, 'permission_check' ),
					'args'                => array(
						'head' => array(
							'required' => false,
							// Accept a string or null (clear). No sanitize_callback:
							// the value is our own generated loader HTML, validated
							// only for type below — never user free-text.
							'type'     => array( 'string', 'null' ),
						),
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/config',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_config' ),
					'permission_callback' => array( $this, 'permission_check' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'set_config' ),
					'permission_callback' => array( $this, 'permission_check' ),
					'args'                => array(
						'config' => array(
							'required' => false,
							// A serialized config JSON string, or null to clear. No
							// sanitize_callback: it's our own serialize() output stored
							// verbatim and parsed back by the admin bundle, never
							// rendered as HTML, so WP text sanitizers would corrupt it.
							'type'     => array( 'string', 'null' ),
						),
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/active-plugins',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_active_plugins' ),
				'permission_callback' => array( $this, 'permission_check' ),
			)
		);
	}

	/** Return the stored loader block (empty string when unset). */
	public function get_head() {
		$head = get_option( CONSENTFUL_HEAD_OPTION, '' );
		return new WP_REST_Response( array( 'head' => is_string( $head ) ? $head : '' ), 200 );
	}

	/**
	 * Store the loader block. A null / empty `head` deletes the option (so the
	 * `wp_head` printer emits nothing) — this is how "Remove from site" clears it.
	 */
	public function set_head( WP_REST_Request $request ) {
		$head = $request->get_param( 'head' );

		if ( null === $head || ( is_string( $head ) && '' === trim( $head ) ) ) {
			delete_option( CONSENTFUL_HEAD_OPTION );
			return new WP_REST_Response( array( 'ok' => true, 'head' => '' ), 200 );
		}

		if ( ! is_string( $head ) ) {
			return new WP_Error( 'consentful_invalid', 'head must be a string or null', array( 'status' => 400 ) );
		}

		update_option( CONSENTFUL_HEAD_OPTION, $head );
		return new WP_REST_Response( array( 'ok' => true, 'head' => $head ), 200 );
	}

	/** Return the stored authoring config (null when unset). */
	public function get_config() {
		$config = get_option( CONSENTFUL_CONFIG_OPTION, null );
		return new WP_REST_Response( array( 'config' => is_string( $config ) ? $config : null ), 200 );
	}

	/**
	 * Store the authoring config JSON. A null / empty `config` deletes the option
	 * (so a removed banner leaves no stale config for the next open).
	 */
	public function set_config( WP_REST_Request $request ) {
		$config = $request->get_param( 'config' );

		if ( null === $config || ( is_string( $config ) && '' === trim( $config ) ) ) {
			delete_option( CONSENTFUL_CONFIG_OPTION );
			return new WP_REST_Response( array( 'ok' => true, 'config' => null ), 200 );
		}

		if ( ! is_string( $config ) ) {
			return new WP_Error( 'consentful_invalid', 'config must be a string or null', array( 'status' => 400 ) );
		}

		// autoload = false: this is read only in wp-admin, never on the front end.
		update_option( CONSENTFUL_CONFIG_OPTION, $config, false );
		return new WP_REST_Response( array( 'ok' => true, 'config' => $config ), 200 );
	}

	/** Return the site's active plugins, for pre-publish tracker detection. */
	public function get_active_plugins() {
		$active = get_option( 'active_plugins', array() );
		if ( ! is_array( $active ) ) {
			$active = array();
		}
		// Network-activated plugins live in a separate sitewide option on
		// multisite; merge them so detection sees the full set.
		if ( is_multisite() ) {
			$network = get_site_option( 'active_sitewide_plugins', array() );
			if ( is_array( $network ) ) {
				$active = array_merge( $active, array_keys( $network ) );
			}
		}
		return new WP_REST_Response( array( 'plugins' => array_values( $active ) ), 200 );
	}
}

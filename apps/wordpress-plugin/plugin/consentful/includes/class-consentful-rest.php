<?php
/**
 * The REST controller — the store the admin bundle's {@see WordPressRestStore}
 * (`apps/wordpress-plugin/src/rest-store.ts`) reads and writes.
 *
 * It is the concrete `WordPressLoaderStore` seam the shared core left behind. It
 * exposes exactly what the shared engine needs and nothing more:
 *
 *   GET  /wp-json/consentful/v1/published              → { published: string|null }
 *   POST /wp-json/consentful/v1/published { published } → store the published settings JSON (null clears)
 *   GET  /wp-json/consentful/v1/config           → { config: string|null }
 *   POST /wp-json/consentful/v1/config { config }→ store the authoring config (null clears)
 *   GET  /wp-json/consentful/v1/credit             → { enabled: bool }
 *   POST /wp-json/consentful/v1/credit { enabled }  → opt in / out of the "Powered by" credit
 *   GET  /wp-json/consentful/v1/active-plugins   → { plugins: string[] }
 *
 * Every route requires `manage_options`, and writes are additionally protected by
 * the standard WordPress REST nonce (`X-WP-Nonce`) that the admin bundle carries.
 *
 * Both stored values are JSON documents. They are validated and re-encoded by
 * {@see Consentful_Rest::sanitize_json} before they are saved — no HTML or
 * script text is ever stored.
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
			'/published',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_published' ),
					'permission_callback' => array( $this, 'permission_check' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'set_published' ),
					'permission_callback' => array( $this, 'permission_check' ),
					'args'                => array(
						'published' => array(
							'required'          => false,
							// The published banner settings as a JSON string, or null to clear.
							'type'              => array( 'string', 'null' ),
							'validate_callback' => array( $this, 'validate_json' ),
							'sanitize_callback' => array( $this, 'sanitize_json' ),
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
							'required'          => false,
							// The editor settings as a JSON string, or null to clear.
							'type'              => array( 'string', 'null' ),
							'validate_callback' => array( $this, 'validate_json' ),
							'sanitize_callback' => array( $this, 'sanitize_json' ),
						),
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/credit',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_credit' ),
					'permission_callback' => array( $this, 'permission_check' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'set_credit' ),
					'permission_callback' => array( $this, 'permission_check' ),
					'args'                => array(
						'enabled' => array(
							'required' => true,
							'type'     => 'boolean',
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

	/**
	 * A value is acceptable when it is null / empty (clear) or a string holding a
	 * JSON object.
	 *
	 * @param mixed $value The raw request value.
	 * @return bool
	 */
	public function validate_json( $value ) {
		if ( null === $value || '' === $value ) {
			return true;
		}
		return is_string( $value ) && is_object( json_decode( $value ) );
	}

	/**
	 * Normalise a JSON string by decoding and re-encoding it, so only a
	 * well-formed JSON document can reach the database. Returns null for
	 * anything that is not a JSON object.
	 *
	 * @param mixed $value The raw request value.
	 * @return string|null
	 */
	public function sanitize_json( $value ) {
		if ( ! is_string( $value ) || '' === trim( $value ) ) {
			return null;
		}
		$decoded = json_decode( $value );
		if ( ! is_object( $decoded ) ) {
			return null;
		}
		$encoded = wp_json_encode( $decoded );
		return is_string( $encoded ) ? $encoded : null;
	}

	/** Return the published banner settings (null when no banner is published). */
	public function get_published() {
		$published = get_option( CONSENTFUL_PUBLISHED_OPTION, null );
		return new WP_REST_Response( array( 'published' => is_string( $published ) && '' !== $published ? $published : null ), 200 );
	}

	/**
	 * Store the published banner settings. A null / empty value deletes the option
	 * (so the front end prints nothing) — this is how "Remove" takes the banner off.
	 */
	public function set_published( WP_REST_Request $request ) {
		$published = $request->get_param( 'published' );

		if ( null === $published ) {
			delete_option( CONSENTFUL_PUBLISHED_OPTION );
			return new WP_REST_Response( array( 'ok' => true, 'published' => null ), 200 );
		}

		// Autoloaded: read on every front-end page view.
		update_option( CONSENTFUL_PUBLISHED_OPTION, $published, true );
		return new WP_REST_Response( array( 'ok' => true, 'published' => $published ), 200 );
	}

	/** Return the stored editor settings (null when unset). */
	public function get_config() {
		$config = get_option( CONSENTFUL_CONFIG_OPTION, null );
		return new WP_REST_Response( array( 'config' => is_string( $config ) && '' !== $config ? $config : null ), 200 );
	}

	/**
	 * Store the editor settings JSON. A null / empty value deletes the option (so
	 * a removed banner leaves no stale settings for the next open).
	 */
	public function set_config( WP_REST_Request $request ) {
		$config = $request->get_param( 'config' );

		if ( null === $config ) {
			delete_option( CONSENTFUL_CONFIG_OPTION );
			return new WP_REST_Response( array( 'ok' => true, 'config' => null ), 200 );
		}

		// autoload = false: this is read only in wp-admin, never on the front end.
		update_option( CONSENTFUL_CONFIG_OPTION, $config, false );
		return new WP_REST_Response( array( 'ok' => true, 'config' => $config ), 200 );
	}

	/** Return whether the "Powered by Consentful" credit is turned on. */
	public function get_credit() {
		return new WP_REST_Response( array( 'enabled' => consentful_credit_enabled() ), 200 );
	}

	/** Turn the "Powered by Consentful" credit on or off (the owner's explicit choice). */
	public function set_credit( WP_REST_Request $request ) {
		$enabled = (bool) $request->get_param( 'enabled' );
		update_option( CONSENTFUL_CREDIT_OPTION, $enabled ? '1' : '0', true );
		return new WP_REST_Response( array( 'ok' => true, 'enabled' => $enabled ), 200 );
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

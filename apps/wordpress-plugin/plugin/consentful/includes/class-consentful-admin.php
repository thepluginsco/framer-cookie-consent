<?php
/**
 * The wp-admin settings screen — mounts the shared-engine authoring bundle.
 *
 * PHP does the WordPress-native chrome (a Settings submenu page, capability
 * gate, script/style enqueue) and hands the browser bundle the one thing it
 * needs to reach the REST store: a localized bootstrap object
 * (`window.CONSENTFUL_WP`) with the REST base, a nonce, and the active-plugin
 * list. Everything consent-related happens in the bundle (the shared engine).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Consentful_Admin {

	const MENU_SLUG = 'consentful';

	/** Script/style handle for the admin bundle. */
	const HANDLE = 'consentful-admin';

	public function register() {
		add_action( 'admin_menu', array( $this, 'add_menu' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
		// The Vite bundle is an ES module; tag it so the browser treats it as one.
		add_filter( 'script_loader_tag', array( $this, 'as_module' ), 10, 3 );
	}

	/** Add "Consentful" under Settings. */
	public function add_menu() {
		add_options_page(
			__( 'Consentful — Cookie Consent', 'consentful' ),
			__( 'Consentful', 'consentful' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_page' )
		);
	}

	/** The mount point the bundle renders into. */
	public function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		echo '<div class="wrap"><div id="consentful-admin" class="consentful-admin-root"></div></div>';
	}

	/** Enqueue the built bundle ONLY on our settings screen. */
	public function enqueue( $hook_suffix ) {
		if ( 'settings_page_' . self::MENU_SLUG !== $hook_suffix ) {
			return;
		}

		$js  = CONSENTFUL_DIR . 'assets/consentful-admin.js';
		$css = CONSENTFUL_DIR . 'assets/consentful-admin.css';

		$js_ver  = file_exists( $js ) ? (string) filemtime( $js ) : CONSENTFUL_VERSION;
		$css_ver = file_exists( $css ) ? (string) filemtime( $css ) : CONSENTFUL_VERSION;

		wp_enqueue_style(
			self::HANDLE,
			CONSENTFUL_URL . 'assets/consentful-admin.css',
			array(),
			$css_ver
		);

		wp_enqueue_script(
			self::HANDLE,
			CONSENTFUL_URL . 'assets/consentful-admin.js',
			array(),
			$js_ver,
			true // in footer
		);

		// Hand the bundle its REST coordinates + the active-plugin list. This
		// classic inline script runs before the deferred module, so
		// `window.CONSENTFUL_WP` is set by the time the bundle boots.
		$active = get_option( 'active_plugins', array() );
		if ( ! is_array( $active ) ) {
			$active = array();
		}
		wp_localize_script(
			self::HANDLE,
			'CONSENTFUL_WP',
			array(
				'restBase'      => esc_url_raw( rest_url( Consentful_Rest::NAMESPACE ) ),
				'nonce'         => wp_create_nonce( 'wp_rest' ),
				'activePlugins' => array_values( $active ),
			)
		);
	}

	/**
	 * Add `type="module"` to our bundle's tag so the ES module loads correctly.
	 * WordPress prints classic scripts by default; the bundle is ESM.
	 */
	public function as_module( $tag, $handle, $src ) {
		if ( self::HANDLE !== $handle ) {
			return $tag;
		}
		return '<script type="module" src="' . esc_url( $src ) . '"></script>' . "\n"; // phpcs:ignore WordPress.WP.EnqueuedResources
	}
}

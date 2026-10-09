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
		add_filter( 'plugin_action_links_' . plugin_basename( CONSENTFUL_FILE ), array( $this, 'action_links' ) );
	}

	/**
	 * Add "Settings" and (unless the Pro add-on is active) "Get Pro" links to
	 * the plugin's row on the Plugins screen.
	 *
	 * @param string[] $links Existing action links.
	 * @return string[]
	 */
	public function action_links( $links ) {
		$settings = sprintf(
			'<a href="%s">%s</a>',
			esc_url( admin_url( 'options-general.php?page=' . self::MENU_SLUG ) ),
			esc_html__( 'Settings', 'consentful' )
		);
		array_unshift( $links, $settings );
		if ( ! defined( 'CONSENTFUL_PRO_VERSION' ) ) {
			$links[] = sprintf(
				'<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>',
				esc_url( 'https://consentful.theplugins.co/docs/platforms/wordpress#pro' ),
				esc_html__( 'Get Pro', 'consentful' )
			);
		}
		return $links;
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

		/**
		 * Where the admin bundle is loaded from. The separate Consentful Pro
		 * add-on (not hosted on WordPress.org) points this at its own build.
		 *
		 * @param array{dir: string, url: string} $assets Folder path and URL, each with a trailing slash.
		 */
		$assets = apply_filters(
			'consentful_admin_assets',
			array(
				'dir' => CONSENTFUL_DIR . 'assets/',
				'url' => CONSENTFUL_URL . 'assets/',
			)
		);

		$js  = $assets['dir'] . 'consentful-admin.js';
		$css = $assets['dir'] . 'consentful-admin.css';

		// Version by file time so a plugin update never serves a cached bundle.
		$js_ver  = file_exists( $js ) ? (string) filemtime( $js ) : CONSENTFUL_VERSION;
		$css_ver = file_exists( $css ) ? (string) filemtime( $css ) : CONSENTFUL_VERSION;

		wp_enqueue_style(
			self::HANDLE,
			$assets['url'] . 'consentful-admin.css',
			array(),
			$css_ver
		);

		wp_enqueue_script(
			self::HANDLE,
			$assets['url'] . 'consentful-admin.js',
			array(),
			$js_ver,
			true // in footer
		);

		// Hand the bundle its REST coordinates + the active-plugin list. The
		// localized object is printed before the bundle, so
		// `window.CONSENTFUL_WP` is set by the time it boots.
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
				// The public site URL: the editor's header, and the domain the Pro
				// add-on activates its license for.
				'siteUrl'       => esc_url_raw( home_url( '/' ) ),
			)
		);
	}
}

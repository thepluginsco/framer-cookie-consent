/**
 * Ambient types for the WordPress admin bundle.
 *
 * PHP hands the browser bundle everything it needs to reach the REST API through
 * a single localized global (`window.CONSENTFUL_WP`, injected via
 * `wp_localize_script`), so the bundle never hard-codes a URL or nonce.
 */

/** The bootstrap data PHP localizes onto the page for the admin bundle. */
interface ConsentfulWpBootstrap {
  /** REST namespace root, e.g. `https://site.example/wp-json/consentful/v1`. */
  readonly restBase: string;
  /** WordPress REST nonce (`wp_create_nonce('wp_rest')`) for `X-WP-Nonce`. */
  readonly nonce: string;
  /** The site's active plugins (`get_option('active_plugins')`), for detection. */
  readonly activePlugins: readonly string[];
  /** Optional runtime `<script src>` override (self-hosting / staging). */
  readonly runtimeUrl?: string;
}

interface Window {
  CONSENTFUL_WP?: ConsentfulWpBootstrap;
}

/** Vite handles CSS side-effect imports. */
declare module "*.css";

/**
 * Public entry point for the shared package — the platform-neutral CORE.
 *
 * This is the "one engine" behind Phase 2's one-engine/many-front-ends split.
 * It bundles the pieces every platform reuses unchanged:
 *   - the consent config **schema** (single source of truth for the config
 *     shape, imported by BOTH the plugin that writes config and the runtime
 *     that reads it — so the two halves can never drift),
 *   - the design-time **tracker-scan** engine,
 *   - the **runtime CDN** URL (where published sites load the runtime from),
 *   - the platform-neutral **loader** (the HTML block + marker-scoped splice),
 *   - the **adapter** seam (`PlatformAdapter` + `installLoader`/`removeLoader`)
 *     that each front-end — Framer, embed, Webflow, WordPress, Shopify —
 *     implements to reach a live site,
 *   - the universal **embed** builder (the copy-paste `<script>` snippet for
 *     hosts with no custom-code API — Wix, Squarespace, Ghost, Carrd, …),
 *   - the **Webflow** adapter (the registered/applied-scripts installer for the
 *     first platform with no free-form custom-code region),
 *   - the **WordPress** adapter (the `wp_head` head-blob seam + active-plugin
 *     tracker detection),
 *   - the **Shopify** adapter (the theme app-embed block builder + the Customer
 *     Privacy / Consent Tracking API bridge),
 *   - the **Wix** adapter (the Embedded Scripts bootstrap + per-site config store
 *     — Wix is NOT ∅-infra — and the five-bucket Consent Policy bridge),
 *   - the **legal-doc** generator (Cookie Policy + cookie-focused Privacy Policy
 *     derived from the same config the banner runs on — Termly's wedge, ∅-infra).
 */
export * from './config-schema.js';
export * from './ab-test.js';
export * from './tracker-scan.js';
export * from './runtime-cdn.js';
export * from './loader.js';
export * from './adapter.js';
export * from './embed.js';
export * from './webflow.js';
export * from './wordpress.js';
export * from './shopify.js';
export * from './wix.js';
export * from './legal-docs.js';
export * from './accessibility.js';

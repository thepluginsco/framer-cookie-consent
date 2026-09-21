/**
 * Compose the deployable theme app extension **app-embed block**.
 *
 * The shared core ({@link buildShopifyAppEmbedBlock}) already emits the loader
 * block — the byte-identical config + Consent Mode default + pinned runtime that
 * every other front-end emits. This shell adds the ONE Shopify-specific runtime
 * piece the core deliberately left to the App shell: a `<script>` tag that loads
 * the **consent bridge** asset ({@link ./consent-bridge}), which relays each of
 * our banner decisions into Shopify's Customer Privacy API so Shopify's own
 * checkout / Web Pixels honour the visitor's choice.
 *
 * The bridge tag uses a Liquid `asset_url` filter, so it MUST sit OUTSIDE the
 * loader's `{% raw %}` wrapper. We insert it in the Liquid-context gap the core
 * already leaves between `{%- endraw -%}` and `{% schema %}` — never touching the
 * loader bytes inside `{% raw %}` (so the one-engine guarantee holds) and never
 * touching the `{% schema %}` block (which Shopify parses specially).
 *
 * Pure string composition — unit-testable with no Shopify SDK.
 */

import type {
  BuildShopifyBlockOptions,
  CookieConsentConfig,
  ShopifyAppEmbedBlock,
} from "@framer-cookie-consent/shared";
import { buildShopifyAppEmbedBlock } from "@framer-cookie-consent/shared";

/**
 * Basename of the consent-bridge asset shipped in the extension's `assets/`
 * folder and built by `npm run build:bridge`. Referenced from the block via
 * `{{ '<this>' | asset_url }}`.
 */
export const BRIDGE_ASSET_FILE = "consentful-consent-bridge.js";

/** The Liquid marker the core places immediately before the schema block. */
const SCHEMA_MARKER = "\n{% schema %}";

/**
 * Build the complete app-embed block for `config`: the shared loader block plus
 * the deferred consent-bridge `<script>`.
 *
 * @param config - The active configuration to embed.
 * @param options - Passed through to {@link buildShopifyAppEmbedBlock}
 *   (`runtimeUrl` override, `comment` toggle).
 * @returns The block's filename + full Liquid content, ready to write into the
 *   theme app extension and deploy with the Shopify CLI.
 */
export function buildConsentfulBlock(
  config: CookieConsentConfig,
  options: BuildShopifyBlockOptions = {},
): ShopifyAppEmbedBlock {
  const base = buildShopifyAppEmbedBlock(config, options);
  const bridgeTag = `<script src="{{ '${BRIDGE_ASSET_FILE}' | asset_url }}" defer></script>`;

  const at = base.liquid.indexOf(SCHEMA_MARKER);
  const liquid =
    at === -1
      ? // No schema found (shouldn't happen) — append after the loader.
        `${base.liquid}\n${bridgeTag}`
      : // Splice the bridge tag into the Liquid gap before the schema block.
        `${base.liquid.slice(0, at)}\n${bridgeTag}${base.liquid.slice(at)}`;

  return { filename: base.filename, liquid };
}

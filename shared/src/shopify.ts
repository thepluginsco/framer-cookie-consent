/**
 * The SHOPIFY ADAPTER — Phase 3.4's front-end for the shared engine.
 *
 * Like Webflow (Phase 3.2), Shopify does NOT fit the head-HTML-blob
 * {@link PlatformAdapter} seam, and for the same reason: the recommended, theme-
 * update-safe way to inject `<head>` code on Shopify is a **theme app extension
 * app-embed block** — a `blocks/*.liquid` file shipped in the app and toggled by
 * the merchant in the theme editor — not a programmatic write into some free-form
 * head region. So Shopify gets a *sibling builder* rather than a `PlatformAdapter`.
 *
 * That builder ({@link buildShopifyAppEmbedBlock}) is the Shopify analogue of the
 * universal {@link ./embed} snippet: it bakes the config into a deployable Liquid
 * artifact instead of writing it into a live host. It is still the SAME engine —
 * the loader scripts are the byte-identical {@link configScriptBody} /
 * {@link consentDefaultScriptBody} bodies the Framer loader and the embed emit,
 * and the runtime is the same version-pinned jsDelivr bundle
 * ({@link runtimeScriptUrl}) — so a Shopify store and a Framer site publish the
 * exact same consent behaviour.
 *
 * The genuinely NEW, Shopify-specific engine-side piece is
 * {@link mapToShopifyConsent}: the bridge to Shopify's **Customer Privacy /
 * Consent Tracking API**. Shopify's own checkout, Web Pixels and first-party
 * pixel all read consent from `window.Shopify.customerPrivacy`, so a banner on a
 * Shopify store must relay each decision there (via
 * `Shopify.customerPrivacy.setTrackingConsent(...)`) or Shopify will keep its own
 * tags gated independently of ours. This pure mapper translates our category
 * grants — through the platform-neutral Consent Mode signals every category
 * already carries — into Shopify's four consent buckets.
 *
 * Everything here is PURE (Liquid string building + a consent mapping) and
 * testable with no Shopify SDK. The impure surface — deploying the extension via
 * the Shopify CLI/Admin API, and calling `setTrackingConsent` in the browser —
 * lives in the deferred Shopify App shell + a small runtime hook, the analogue of
 * the Webflow App shell and the WordPress PHP plugin.
 */

import type { CookieConsentConfig, ConsentModeSignal } from "./config-schema.js";
import { buildConsentDefaultSnippet, configScriptBody } from "./loader.js";
import { runtimeScriptUrl } from "./runtime-cdn.js";

/* -------------------------------------------------------------------------- */
/* Theme app extension — the app-embed block                                  */
/* -------------------------------------------------------------------------- */

/** Machine handle of our app-embed block (its `.liquid` basename). */
export const SHOPIFY_BLOCK_HANDLE = "consentful";

/**
 * Path the block file must live at inside the theme app extension, relative to
 * the extension root (`extensions/<name>/`). The Shopify CLI deploys everything
 * under `blocks/`.
 */
export const SHOPIFY_BLOCK_FILENAME = `blocks/${SHOPIFY_BLOCK_HANDLE}.liquid`;

/** Merchant-facing name shown in the theme editor's "App embeds" list. */
export const SHOPIFY_APP_EMBED_NAME = "Consentful cookie consent";

/** Options for {@link buildShopifyAppEmbedBlock}. */
export interface BuildShopifyBlockOptions {
  /**
   * Override the runtime `<script src>` URL. Defaults to the version-pinned
   * jsDelivr URL from {@link runtimeScriptUrl}. Handy for local testing or
   * self-hosting the bundle.
   */
  runtimeUrl?: string;
  /** Include the leading explanatory Liquid comment. Defaults to `true`. */
  comment?: boolean;
}

/** A generated theme app extension app-embed block, ready to write + deploy. */
export interface ShopifyAppEmbedBlock {
  /** Where to write it in the extension ({@link SHOPIFY_BLOCK_FILENAME}). */
  filename: string;
  /** The complete Liquid file content. */
  liquid: string;
}

/** The `{% schema %}` object for the app-embed block (serialized into the file). */
interface ShopifyBlockSchema {
  name: string;
  /** App embeds inject into `head` or `body`; ours goes in `head`. */
  target: "head" | "body";
  settings: unknown[];
}

/** Leading comment explaining what the block is and how to update it. */
const BLOCK_COMMENT =
  "Consentful cookie consent — Shopify theme app embed. " +
  "Turn it on in Theme editor → App embeds. Edit your banner in Consentful " +
  "and redeploy the app extension to update it.";

/**
 * Build the theme app extension **app-embed block** for `config`.
 *
 * The returned Liquid file, once deployed with the app and enabled by the
 * merchant, renders into the storefront `<head>`:
 *   1. `window.__CC_CONFIG__` = the serialized config,
 *   2. the inline Consent Mode default (only when Consent Mode is enabled),
 *   3. the version-pinned, `defer`red runtime `<script>`,
 * then declares its `{% schema %}` (`target: "head"`) so Shopify lists it as an
 * app embed.
 *
 * The loader scripts are wrapped in a Liquid `{% raw %}` block so the config
 * JSON's `{`/`}` can never be mistaken for Liquid tags, and they are the SAME
 * bytes as the Framer loader / universal embed ({@link configScriptBody} /
 * {@link buildConsentDefaultSnippet}) — one engine, so Shopify can't drift from
 * the other front-ends. The `{% schema %}` stays OUTSIDE `{% raw %}` because
 * Shopify parses it specially.
 *
 * @param config - The active configuration to embed.
 * @param options - See {@link BuildShopifyBlockOptions}.
 * @returns The block's filename + full Liquid content.
 */
export function buildShopifyAppEmbedBlock(
  config: CookieConsentConfig,
  options: BuildShopifyBlockOptions = {},
): ShopifyAppEmbedBlock {
  const runtimeUrl = options.runtimeUrl ?? runtimeScriptUrl();
  const includeComment = options.comment ?? true;

  const loader = [
    `<script>${configScriptBody(config)}</script>`,
    config.consentMode.enableConsentMode
      ? buildConsentDefaultSnippet(config.consentMode.waitForUpdateMs)
      : "",
    `<script src="${runtimeUrl}" defer></script>`,
  ]
    .filter((part) => part !== "")
    .join("\n");

  const schema: ShopifyBlockSchema = {
    name: SHOPIFY_APP_EMBED_NAME,
    target: "head",
    settings: [],
  };

  const parts = [
    includeComment ? `{%- comment -%} ${BLOCK_COMMENT} {%- endcomment -%}` : "",
    `{%- raw -%}`,
    loader,
    `{%- endraw -%}`,
    `{% schema %}`,
    JSON.stringify(schema, null, 2),
    `{% endschema %}`,
  ].filter((part) => part !== "");

  return { filename: SHOPIFY_BLOCK_FILENAME, liquid: parts.join("\n") };
}

/* -------------------------------------------------------------------------- */
/* Customer Privacy / Consent Tracking API bridge                             */
/* -------------------------------------------------------------------------- */

/**
 * Shopify's four consent categories, exactly as its Customer Privacy API names
 * them in `setTrackingConsent`.
 * @see https://shopify.dev/docs/api/customer-privacy
 */
export type ShopifyConsentCategory =
  | "analytics"
  | "marketing"
  | "preferences"
  | "sale_of_data";

/**
 * A visitor-consent object in Shopify's shape — the payload for
 * `Shopify.customerPrivacy.setTrackingConsent(consent, cb)`. Every field is
 * required (`true` = granted, `false` = denied).
 */
export type ShopifyVisitorConsent = Record<ShopifyConsentCategory, boolean>;

/** The Consent Mode signals that mean "advertising" (Shopify marketing/sale). */
const AD_SIGNALS: readonly ConsentModeSignal[] = [
  "ad_storage",
  "ad_user_data",
  "ad_personalization",
];

/**
 * Map our category grants to Shopify's Customer Privacy consent buckets.
 *
 * The bridge goes through the platform-neutral Consent Mode signals every
 * {@link ConsentCategory} already carries, so it needs no Shopify-specific
 * taxonomy on our side and stays correct for custom categories:
 *   - `analytics`     ← any granted category grants `analytics_storage`;
 *   - `marketing`     ← any granted category grants an ad signal
 *     (`ad_storage` / `ad_user_data` / `ad_personalization`);
 *   - `preferences`   ← any granted category grants `functionality_storage`
 *     or `personalization_storage`;
 *   - `sale_of_data`  ← the ad signals again: under CCPA/CPRA, ad targeting is
 *     the "sale/sharing" Shopify wants gated, mirroring our GPC sale logic.
 *
 * Pure and side-effect-free. The runtime hook calls
 * `Shopify.customerPrivacy.setTrackingConsent(mapToShopifyConsent(config, ids))`
 * on every decision; this function is that hook's whole payload.
 *
 * @param config - The active configuration (source of each category's signals).
 * @param grantedCategoryIds - Ids of the categories the visitor granted.
 * @returns The Shopify visitor-consent object (all four buckets set).
 */
export function mapToShopifyConsent(
  config: CookieConsentConfig,
  grantedCategoryIds: readonly string[],
): ShopifyVisitorConsent {
  const granted = new Set(grantedCategoryIds);

  // Union of the Consent Mode signals across every granted category.
  const signals = new Set<ConsentModeSignal>();
  for (const category of config.categories) {
    if (!granted.has(category.id)) continue;
    for (const signal of category.signals) signals.add(signal);
  }

  const hasAd = AD_SIGNALS.some((signal) => signals.has(signal));

  return {
    analytics: signals.has("analytics_storage"),
    marketing: hasAd,
    preferences:
      signals.has("functionality_storage") || signals.has("personalization_storage"),
    sale_of_data: hasAd,
  };
}

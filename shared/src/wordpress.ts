/**
 * The WORDPRESS ADAPTER — Phase 3.3's front-end for the shared engine.
 *
 * Unlike Webflow (Phase 3.2), WordPress DOES fit the head-HTML-blob
 * {@link PlatformAdapter} seam: a PHP plugin can persist one option and echo it
 * verbatim on the `wp_head` action, so the loader region is just "that option's
 * value". WordPress therefore reuses the SAME {@link installLoader} /
 * {@link removeLoader} core that Framer uses — no sibling installer needed. The
 * only WordPress-specific injection code is {@link wordpressAdapter}, a ~10-line
 * wrapper over an injected {@link WordPressLoaderStore} (the analogue of Framer's
 * `getCustomCode`/`setCustomCode`, implemented by the deferred PHP/REST shell).
 * Because the block it stores is the byte-identical {@link buildLoaderHtml}
 * output, a WordPress site and a Framer site publish the exact same loader — one
 * engine, and PHP stays a dumb printer that never re-implements the escaping or
 * the Consent Mode default.
 *
 * The genuinely NEW, testable engine-side piece for WordPress is
 * {@link detectWordPressTrackers}: the plugin-list analogue of the design-time
 * HTML {@link detectTrackers}. Where the HTML scan reads a *published* page,
 * WordPress can pre-fill trackers *before* publish by mapping the site's active
 * plugins (`get_option('active_plugins')`) to known vendors. It reuses the same
 * {@link TRACKER_CATALOG} and emits the same {@link DetectedTracker} shape, so its
 * proposals flow through the exact same "add detected trackers" path the Framer
 * plugin already uses — again, one engine.
 *
 * Everything here is PURE (slug normalisation + catalog mapping + a thin adapter
 * factory) and testable against an in-memory store. The impure surface — the WP
 * REST/option calls, reading `active_plugins`, and printing into `wp_head` — lives
 * entirely in the WordPress plugin shell that supplies the store.
 */

import type { CookieConsentConfig } from "./config-schema.js";
import {
  installLoader,
  removeLoader,
  type PlatformAdapter,
} from "./adapter.js";
import {
  TRACKER_CATALOG,
  TRACKER_CATEGORY_SIGNALS,
  type DetectedTracker,
  type TrackerSignature,
} from "./tracker-scan.js";

/* -------------------------------------------------------------------------- */
/* The wp_head loader seam                                                    */
/* -------------------------------------------------------------------------- */

/**
 * How the WordPress plugin shell reads and writes the single option that holds
 * our loader block (which PHP echoes verbatim on the `wp_head` action). The
 * option may also contain unrelated head code the user pasted in the settings
 * screen — the marker-scoped splice in {@link installLoader}/{@link removeLoader}
 * preserves it. Both methods map to one WP REST / options call in the shell.
 */
export interface WordPressLoaderStore {
  /** Read the stored head option, or `""` when it is unset/empty. */
  readHeadOption(): Promise<string>;
  /** Persist the head option; `null` clears it entirely. */
  writeHeadOption(html: string | null): Promise<void>;
}

/**
 * Wrap a {@link WordPressLoaderStore} as the platform-neutral
 * {@link PlatformAdapter}. This is the whole WordPress injection coupling — the
 * core does the build + marker splice + churn-free skip. Pass the result to
 * {@link installLoader}/{@link removeLoader} (or the convenience wrappers
 * {@link installWordPressLoader}/{@link removeWordPressLoader}).
 */
export function wordpressAdapter(store: WordPressLoaderStore): PlatformAdapter {
  return {
    async readLoaderRegion(): Promise<string> {
      return (await store.readHeadOption()) ?? "";
    },
    async writeLoaderRegion(html: string | null): Promise<void> {
      await store.writeHeadOption(html);
    },
  };
}

/**
 * Build the loader for `config` and store it via the WordPress `store` so PHP
 * prints it into `wp_head`. Idempotent + churn-free (skips the write when nothing
 * changed). Returns `true` when it wrote. Thin wrapper over {@link installLoader}.
 */
export function installWordPressLoader(
  store: WordPressLoaderStore,
  config: CookieConsentConfig,
  options?: Parameters<typeof installLoader>[2],
): Promise<boolean> {
  return installLoader(wordpressAdapter(store), config, options);
}

/**
 * Remove ONLY our loader block from the WordPress head option, preserving any
 * other head code the user added. Returns `true` when our block was present.
 * Thin wrapper over {@link removeLoader}.
 */
export function removeWordPressLoader(store: WordPressLoaderStore): Promise<boolean> {
  return removeLoader(wordpressAdapter(store));
}

/* -------------------------------------------------------------------------- */
/* Active-plugin → tracker mapping                                            */
/* -------------------------------------------------------------------------- */

/**
 * A well-known WordPress plugin that installs a tracker we already model, so its
 * mere presence lets us pre-fill the consent config before the site is even
 * published.
 */
export interface WordPressTrackerPlugin {
  /**
   * Plugin folder slugs that identify this plugin. Matched against the folder
   * segment of each `active_plugins` entry (`folder/main.php`), case-insensitively.
   * List every historical slug an installed copy might use.
   */
  slugs: string[];
  /** Human plugin name, shown as the detection evidence. */
  pluginName: string;
  /**
   * Catalog {@link TrackerSignature.id}s this plugin definitively installs. Kept
   * to the vendor(s) the plugin is *for* (e.g. Site Kit → GA4) to avoid guessing
   * at optional modules — the published-HTML {@link detectTrackers} catches the rest.
   */
  trackerIds: string[];
}

/**
 * The recognised tracker plugins. Deliberately conservative: every entry maps to
 * a catalog tracker that has a canonical loader URL, so each proposal is a clean,
 * blockable `src` script (with a placeholder id the user swaps for their real one
 * — WordPress never exposes the measurement id in the plugin list).
 */
export const WORDPRESS_TRACKER_PLUGINS: readonly WordPressTrackerPlugin[] = [
  {
    slugs: ["google-site-kit"],
    pluginName: "Site Kit by Google",
    trackerIds: ["ga4"],
  },
  {
    slugs: ["google-analytics-for-wordpress", "google-analytics-premium"],
    pluginName: "MonsterInsights",
    trackerIds: ["ga4"],
  },
  {
    slugs: ["ga-google-analytics"],
    pluginName: "GA Google Analytics",
    trackerIds: ["ga4"],
  },
  {
    slugs: ["woocommerce-google-analytics-integration"],
    pluginName: "WooCommerce Google Analytics",
    trackerIds: ["ga4"],
  },
  {
    slugs: ["duracelltomi-google-tag-manager", "google-tag-manager-for-wordpress"],
    pluginName: "GTM4WP (Google Tag Manager for WordPress)",
    trackerIds: ["gtm"],
  },
  {
    slugs: ["pixelyoursite", "pixelyoursite-pro"],
    pluginName: "PixelYourSite",
    trackerIds: ["meta-pixel"],
  },
  {
    slugs: ["official-facebook-pixel", "facebook-for-wordpress"],
    pluginName: "Meta Pixel for WordPress",
    trackerIds: ["meta-pixel"],
  },
  {
    slugs: ["facebook-for-woocommerce"],
    pluginName: "Facebook for WooCommerce",
    trackerIds: ["meta-pixel"],
  },
  {
    slugs: ["pinterest-for-woocommerce"],
    pluginName: "Pinterest for WooCommerce",
    trackerIds: ["pinterest-tag"],
  },
  {
    slugs: ["tiktok-for-business", "tiktok"],
    pluginName: "TikTok for Business",
    trackerIds: ["tiktok-pixel"],
  },
  {
    slugs: ["microsoft-clarity", "clarity"],
    pluginName: "Microsoft Clarity",
    trackerIds: ["clarity"],
  },
  {
    slugs: ["wp-hotjar", "hotjar"],
    pluginName: "Hotjar",
    trackerIds: ["hotjar"],
  },
  {
    slugs: ["wp-linkedin-insight", "linkedin-insight-tag"],
    pluginName: "LinkedIn Insight Tag",
    trackerIds: ["linkedin-insight"],
  },
  {
    slugs: ["intercom"],
    pluginName: "Intercom",
    trackerIds: ["intercom"],
  },
] as const;

/** Catalog signatures keyed by id, for O(1) lookup during detection. */
const CATALOG_BY_ID: ReadonlyMap<string, TrackerSignature> = new Map(
  TRACKER_CATALOG.map((sig) => [sig.id, sig]),
);

/**
 * Normalise one `active_plugins` entry to its folder slug for matching.
 *
 * WordPress stores active plugins as `folder/main-file.php` (e.g.
 * `google-site-kit/google-site-kit.php`); a single-file plugin is just
 * `hello.php`. We compare on the lowercased folder segment (or the bare filename
 * without `.php` for single-file plugins).
 */
export function normalizePluginSlug(entry: string): string {
  const trimmed = (entry ?? "").trim().toLowerCase();
  if (trimmed === "") return "";
  const slash = trimmed.indexOf("/");
  const slug = slash === -1 ? trimmed : trimmed.slice(0, slash);
  return slug.replace(/\.php$/, "");
}

/**
 * Detect trackers from a WordPress site's active plugins.
 *
 * The plugin-list analogue of the design-time HTML {@link detectTrackers}: given
 * the site's `active_plugins` (each `folder/main.php`), it maps known tracker
 * plugins to catalog vendors and returns one {@link DetectedTracker} per distinct
 * tracker — the SAME shape the HTML scan produces, so the WordPress admin screen
 * feeds them into the exact same "add detected trackers" flow. Because the plugin
 * list carries no measurement id, each proposal uses the catalog's canonical
 * loader URL as a clean, blockable placeholder `src` (`tagId: ''`). Pure and
 * side-effect-free; deduped to one proposal per tracker (first plugin wins).
 *
 * @param activePlugins - Entries from WordPress's `active_plugins` option.
 */
export function detectWordPressTrackers(activePlugins: string[]): DetectedTracker[] {
  if (!Array.isArray(activePlugins) || activePlugins.length === 0) return [];

  const activeSlugs = new Set(activePlugins.map(normalizePluginSlug).filter(Boolean));

  const results: DetectedTracker[] = [];
  const seen = new Set<string>();

  for (const plugin of WORDPRESS_TRACKER_PLUGINS) {
    if (!plugin.slugs.some((slug) => activeSlugs.has(slug.toLowerCase()))) continue;

    for (const trackerId of plugin.trackerIds) {
      if (seen.has(trackerId)) continue;
      const sig = CATALOG_BY_ID.get(trackerId);
      // Only map to catalog entries that produce a concrete, blockable loader
      // URL — a plugin gives us no tag id, so an inline-only tracker would yield
      // an empty payload the config layer skips anyway.
      if (!sig || !sig.loader) continue;
      seen.add(trackerId);

      results.push({
        id: sig.id,
        name: sig.name,
        vendor: sig.vendor,
        provider: sig.provider,
        category: sig.category,
        signals: [...TRACKER_CATEGORY_SIGNALS[sig.category]],
        tagId: "",
        type: "src",
        value: sig.loader(""),
        evidence: `WordPress plugin "${plugin.pluginName}"`,
      });
    }
  }

  return results;
}

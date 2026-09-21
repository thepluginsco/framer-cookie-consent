/**
 * Unit tests for the WORDPRESS adapter (Phase 3.3) in
 * `@framer-cookie-consent/shared`.
 *
 * WordPress fits the head-blob {@link PlatformAdapter} seam, so these prove
 * (a) {@link wordpressAdapter} + the convenience installers reuse the SAME core
 * loader (byte-identical to Framer), driven by an in-memory option store, and
 * (b) {@link detectWordPressTrackers} — the plugin-list analogue of the HTML
 * {@link detectTrackers} — maps active plugins to catalog vendors, emits the same
 * {@link DetectedTracker} shape, dedupes, and stays conservative.
 *
 * Run with `vitest run`.
 */

import { test, expect } from 'vitest';

import {
  mergeConfig,
  buildLoaderHtml,
  hasBlock,
  MARKER_START,
  wordpressAdapter,
  installWordPressLoader,
  removeWordPressLoader,
  detectWordPressTrackers,
  normalizePluginSlug,
  WORDPRESS_TRACKER_PLUGINS,
  TRACKER_CATALOG,
  type WordPressLoaderStore,
} from '@framer-cookie-consent/shared';

/** An in-memory WordPress head option: a single string cell + write counter. */
function memoryStore(initial = '') {
  const state = { option: initial as string | null, writes: 0 };
  const store: WordPressLoaderStore = {
    async readHeadOption() {
      return state.option ?? '';
    },
    async writeHeadOption(html) {
      state.option = html;
      state.writes += 1;
    },
  };
  return { store, state };
}

/* -------------------------------------------------------------------------- */
/* The wp_head loader seam                                                    */
/* -------------------------------------------------------------------------- */

test('installWordPressLoader: stores the byte-identical core loader block', async () => {
  const config = mergeConfig();
  const { store, state } = memoryStore();

  const wrote = await installWordPressLoader(store, config);
  expect(wrote).toBe(true);
  expect(state.writes).toBe(1);
  // One engine: exactly what Framer stores in its custom-code region.
  expect(state.option).toBe(buildLoaderHtml(config));
  expect(hasBlock(state.option!)).toBe(true);
});

test('installWordPressLoader: preserves unrelated head code the user pasted', async () => {
  const other = '<meta name="other-plugin" content="x">';
  const { store, state } = memoryStore(other);
  await installWordPressLoader(store, mergeConfig());
  expect(state.option).toContain(other);
  expect(hasBlock(state.option!)).toBe(true);
});

test('installWordPressLoader: re-installing an identical config is a churn-free no-op', async () => {
  const { store, state } = memoryStore();
  await installWordPressLoader(store, mergeConfig());
  expect(state.writes).toBe(1);
  const wrote = await installWordPressLoader(store, mergeConfig());
  expect(wrote).toBe(false);
  expect(state.writes).toBe(1);
});

test('installWordPressLoader: honours a runtimeUrl override', async () => {
  const { store, state } = memoryStore();
  await installWordPressLoader(store, mergeConfig(), { runtimeUrl: 'https://cdn.example.test/x.js' });
  expect(state.option).toContain('<script src="https://cdn.example.test/x.js" defer></script>');
});

test('removeWordPressLoader: strips only our block, keeps foreign head code', async () => {
  const other = '<meta name="other" content="y">';
  const { store, state } = memoryStore(other);
  await installWordPressLoader(store, mergeConfig());
  const wrote = await removeWordPressLoader(store);
  expect(wrote).toBe(true);
  expect(state.option).toBe(other);
  expect(hasBlock(state.option ?? '')).toBe(false);
});

test('removeWordPressLoader: clears the option to null when nothing else remains', async () => {
  const { store, state } = memoryStore();
  await installWordPressLoader(store, mergeConfig());
  await removeWordPressLoader(store);
  expect(state.option).toBeNull();
});

test('removeWordPressLoader: no-op (no write) when our block is absent', async () => {
  const { store, state } = memoryStore('<meta name="other" content="z">');
  const wrote = await removeWordPressLoader(store);
  expect(wrote).toBe(false);
  expect(state.writes).toBe(0);
});

test('wordpressAdapter: reads "" for an unset option', async () => {
  const store: WordPressLoaderStore = {
    async readHeadOption() {
      return null as unknown as string;
    },
    async writeHeadOption() {},
  };
  await expect(wordpressAdapter(store).readLoaderRegion()).resolves.toBe('');
});

/* -------------------------------------------------------------------------- */
/* normalizePluginSlug                                                        */
/* -------------------------------------------------------------------------- */

test('normalizePluginSlug: folder/main.php → folder, single-file → basename, case-insensitive', () => {
  expect(normalizePluginSlug('google-site-kit/google-site-kit.php')).toBe('google-site-kit');
  expect(normalizePluginSlug('Hello.php')).toBe('hello');
  expect(normalizePluginSlug('  PixelYourSite/facebook-pixel-master.php ')).toBe('pixelyoursite');
  expect(normalizePluginSlug('')).toBe('');
});

/* -------------------------------------------------------------------------- */
/* detectWordPressTrackers                                                    */
/* -------------------------------------------------------------------------- */

test('detectWordPressTrackers: maps active plugins to catalog trackers', () => {
  const found = detectWordPressTrackers([
    'google-site-kit/google-site-kit.php',
    'pixelyoursite/facebook-pixel-master.php',
    'unrelated-cache-plugin/cache.php',
  ]);

  const ids = found.map((t) => t.id);
  expect(ids).toContain('ga4');
  expect(ids).toContain('meta-pixel');
  expect(ids).not.toContain('gtm');

  const ga4 = found.find((t) => t.id === 'ga4')!;
  expect(ga4.type).toBe('src');
  expect(ga4.tagId).toBe('');
  expect(ga4.value).toContain('googletagmanager.com/gtag/js'); // catalog loader URL
  expect(ga4.signals).toEqual(['analytics_storage']);
  expect(ga4.evidence).toContain('Site Kit');
});

test('detectWordPressTrackers: dedupes when two plugins map to the same tracker', () => {
  const found = detectWordPressTrackers([
    'google-site-kit/google-site-kit.php',
    'google-analytics-for-wordpress/googleanalytics.php',
  ]);
  expect(found.filter((t) => t.id === 'ga4')).toHaveLength(1);
});

test('detectWordPressTrackers: empty / no-known-plugins → no proposals', () => {
  expect(detectWordPressTrackers([])).toEqual([]);
  expect(detectWordPressTrackers(['akismet/akismet.php', 'woocommerce/woocommerce.php'])).toEqual([]);
  // Non-array input is tolerated.
  expect(detectWordPressTrackers(undefined as unknown as string[])).toEqual([]);
});

test('every WORDPRESS_TRACKER_PLUGINS entry maps to a catalog tracker with a loader', () => {
  const catalog = new Map(TRACKER_CATALOG.map((s) => [s.id, s] as const));
  for (const plugin of WORDPRESS_TRACKER_PLUGINS) {
    expect(plugin.trackerIds.length).toBeGreaterThan(0);
    for (const id of plugin.trackerIds) {
      const sig = catalog.get(id);
      expect(sig, `catalog missing ${id}`).toBeTruthy();
      // Conservative rule: every mapping yields a concrete, blockable src.
      expect(typeof sig!.loader, `${id} needs a loader`).toBe('function');
    }
    expect(plugin.slugs.length).toBeGreaterThan(0);
  }
});

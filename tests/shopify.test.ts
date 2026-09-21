/**
 * Unit tests for the SHOPIFY adapter (Phase 3.4) in
 * `@framer-cookie-consent/shared`: the theme app-embed block builder and the
 * Customer Privacy / Consent Tracking API bridge.
 *
 * Shopify, like Webflow, has no free-form head-HTML region, so it can't reuse the
 * head-blob `PlatformAdapter`; it ships a deployable Liquid artifact instead.
 * These tests prove the block (a) reuses the SAME loader bodies as Framer/embed
 * (one engine), (b) is valid, Liquid-safe, and correctly targeted, and that the
 * consent bridge (c) maps our category grants to Shopify's four buckets through
 * the platform-neutral Consent Mode signals.
 *
 * Run with `vitest run`.
 */

import { test, expect } from 'vitest';

import {
  mergeConfig,
  configScriptBody,
  consentDefaultScriptBody,
  buildShopifyAppEmbedBlock,
  mapToShopifyConsent,
  runtimeScriptUrl,
  SHOPIFY_BLOCK_FILENAME,
  SHOPIFY_APP_EMBED_NAME,
  type CookieConsentConfig,
} from '@framer-cookie-consent/shared';

/* -------------------------------------------------------------------------- */
/* buildShopifyAppEmbedBlock                                                  */
/* -------------------------------------------------------------------------- */

test('buildShopifyAppEmbedBlock: emits the config, consent default and pinned runtime in the head block', () => {
  const config = mergeConfig();
  const { filename, liquid } = buildShopifyAppEmbedBlock(config);

  expect(filename).toBe(SHOPIFY_BLOCK_FILENAME);

  // One engine: the config + consent-default bodies are byte-identical to Framer/embed.
  expect(liquid).toContain(`<script>${configScriptBody(config)}</script>`);
  expect(liquid).toContain(consentDefaultScriptBody(config.consentMode.waitForUpdateMs));

  // Version-pinned runtime, deferred.
  expect(liquid).toContain(`<script src="${runtimeScriptUrl()}" defer></script>`);
  expect(liquid).toContain('cdn.jsdelivr.net/gh/');
});

test('buildShopifyAppEmbedBlock: declares a valid head-targeted app-embed schema', () => {
  const { liquid } = buildShopifyAppEmbedBlock(mergeConfig());

  // Extract and parse the {% schema %} JSON to prove it is well-formed.
  const match = liquid.match(/\{% schema %\}\s*([\s\S]*?)\s*\{% endschema %\}/);
  expect(match).not.toBeNull();
  const schema = JSON.parse(match![1]!);

  expect(schema).toMatchObject({
    name: SHOPIFY_APP_EMBED_NAME,
    target: 'head',
    settings: [],
  });
});

test('buildShopifyAppEmbedBlock: wraps the loader in {% raw %} but leaves the schema outside it', () => {
  const { liquid } = buildShopifyAppEmbedBlock(mergeConfig());

  const rawStart = liquid.indexOf('{%- raw -%}');
  const rawEnd = liquid.indexOf('{%- endraw -%}');
  const schemaStart = liquid.indexOf('{% schema %}');

  expect(rawStart).toBeGreaterThan(-1);
  expect(rawEnd).toBeGreaterThan(rawStart);
  // The config <script> is inside the raw region; the schema is after endraw.
  expect(liquid.indexOf('window.__CC_CONFIG__')).toBeGreaterThan(rawStart);
  expect(liquid.indexOf('window.__CC_CONFIG__')).toBeLessThan(rawEnd);
  expect(schemaStart).toBeGreaterThan(rawEnd);
});

test('buildShopifyAppEmbedBlock: omits the consent default when Consent Mode is off', () => {
  const config = mergeConfig({ consentMode: { enableConsentMode: false } });
  const { liquid } = buildShopifyAppEmbedBlock(config);
  expect(liquid).not.toContain("gtag('consent','default'");
  // Config + runtime still present.
  expect(liquid).toContain('window.__CC_CONFIG__');
  expect(liquid).toContain('defer></script>');
});

test('buildShopifyAppEmbedBlock: honours comment:false and a runtimeUrl override', () => {
  const { liquid } = buildShopifyAppEmbedBlock(mergeConfig(), {
    comment: false,
    runtimeUrl: 'https://cdn.example.test/consent.js',
  });
  expect(liquid).not.toContain('{%- comment -%}');
  expect(liquid).toContain('<script src="https://cdn.example.test/consent.js" defer></script>');
  expect(liquid).not.toContain('cdn.jsdelivr.net');
});

/* -------------------------------------------------------------------------- */
/* mapToShopifyConsent                                                        */
/* -------------------------------------------------------------------------- */

test('mapToShopifyConsent: analytics-only grant → analytics true, everything else false', () => {
  const config = mergeConfig();
  expect(mapToShopifyConsent(config, ['necessary', 'analytics'])).toEqual({
    analytics: true,
    marketing: false,
    preferences: false,
    sale_of_data: false,
  });
});

test('mapToShopifyConsent: marketing grant → marketing AND sale_of_data true', () => {
  const config = mergeConfig();
  const consent = mapToShopifyConsent(config, ['necessary', 'marketing']);
  expect(consent.marketing).toBe(true);
  expect(consent.sale_of_data).toBe(true);
  expect(consent.analytics).toBe(false);
});

test('mapToShopifyConsent: preferences grant → preferences true (functionality_storage)', () => {
  const config = mergeConfig();
  const consent = mapToShopifyConsent(config, ['necessary', 'preferences']);
  expect(consent.preferences).toBe(true);
  expect(consent.analytics).toBe(false);
  expect(consent.marketing).toBe(false);
});

test('mapToShopifyConsent: no grants (necessary only) → all four denied', () => {
  const config = mergeConfig();
  expect(mapToShopifyConsent(config, ['necessary'])).toEqual({
    analytics: false,
    marketing: false,
    preferences: false,
    sale_of_data: false,
  });
});

test('mapToShopifyConsent: full grant → all four granted', () => {
  const config = mergeConfig();
  const ids = config.categories.map((c) => c.id);
  expect(mapToShopifyConsent(config, ids)).toEqual({
    analytics: true,
    marketing: true,
    preferences: true,
    sale_of_data: true,
  });
});

test('mapToShopifyConsent: a custom category carrying ad signals maps to marketing/sale_of_data', () => {
  const config: CookieConsentConfig = mergeConfig({
    categories: [
      { id: 'necessary', label: 'Necessary', description: '', required: true, defaultEnabled: true, signals: ['security_storage'] },
      { id: 'ads-custom', label: 'Ads', description: '', required: false, defaultEnabled: false, signals: ['ad_storage'] },
    ],
  });
  const consent = mapToShopifyConsent(config, ['ads-custom']);
  expect(consent.marketing).toBe(true);
  expect(consent.sale_of_data).toBe(true);
  expect(consent.analytics).toBe(false);
});

test('mapToShopifyConsent: ignores ids that are not real categories', () => {
  const config = mergeConfig();
  expect(mapToShopifyConsent(config, ['does-not-exist'])).toEqual({
    analytics: false,
    marketing: false,
    preferences: false,
    sale_of_data: false,
  });
});

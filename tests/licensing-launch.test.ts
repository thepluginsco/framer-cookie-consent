/**
 * Licensing launch guarantees (Phase 2C):
 *
 * - the license key NEVER ships in published HTML (loader, embed snippet);
 * - free preview/staging hosts run the full design without a token, but keep
 *   the credit (white-label needs a real seat);
 * - the portal's `remove_powered_by` feature flag grants white-label.
 *
 * Run with `vitest run`.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  buildEmbedSnippet,
  buildLoaderHtml,
  isPreviewHost,
  mergeConfig,
  toPublishedConfig,
} from '@framer-cookie-consent/shared';
import { hasWhiteLabel, resolveBannerConfig } from '../runtime/src/license-gate.ts';
import type { VerifiedEntitlement } from '../runtime/src/license-token.ts';

const KEY = 'CNSNT-SECRET-KEY-1234';
const activated = mergeConfig({
  banner: { layout: 'card' },
  license: { key: KEY, tier: 'pro', whiteLabel: true },
});

test('published loader + embed never contain the license key', () => {
  assert.ok(!buildLoaderHtml(activated).includes(KEY));
  assert.ok(!buildEmbedSnippet(activated).includes(KEY));
  assert.ok(!buildEmbedSnippet(activated, { form: 'attribute' }).includes(KEY));
});

test('toPublishedConfig strips key/tier/white-label, keeps the API override', () => {
  const withOverride = mergeConfig({
    license: { key: KEY, tier: 'agency', whiteLabel: true, portalApiBaseUrl: 'https://staging.example' },
  });
  const pub = toPublishedConfig(withOverride);
  assert.equal(pub.license.key, null);
  assert.equal(pub.license.tier, 'trial');
  assert.equal(pub.license.whiteLabel, false);
  assert.equal(pub.license.portalApiBaseUrl, 'https://staging.example');
  // Pure: the editor copy is untouched.
  assert.equal(withOverride.license.key, KEY);
});

test('isPreviewHost: platform staging + local hosts, not production', () => {
  for (const h of [
    'my-site.framer.website',
    'x.framer.app',
    'demo.webflow.io',
    'store.myshopify.com',
    'me.wixsite.com',
    'localhost',
    'LOCALHOST',
    '127.0.0.1',
    'wp.local',
    'site.test',
    '192.168.1.20',
  ]) {
    assert.equal(isPreviewHost(h), true, h);
  }
  for (const h of ['acme.com', 'www.acme.co.uk', 'shop.acme.com', 'framer.com', 'webflow.com', '']) {
    assert.equal(isPreviewHost(h), false, h);
  }
});

test('preview host → full design (layout/theme kept) but the credit stays on', () => {
  const cfg = mergeConfig({
    banner: { layout: 'card' },
    theme: { accent: '#ff0055' },
    strings: { poweredByHidden: true },
  });
  const out = resolveBannerConfig(cfg, null, { preview: true });
  assert.equal(out.banner.layout, 'card');
  assert.equal(out.theme.accent, '#ff0055');
  assert.equal(out.strings.poweredByHidden, false);
  assert.equal(out.license.whiteLabel, false);
});

test('production host without a token → basic bar', () => {
  const out = resolveBannerConfig(mergeConfig({ banner: { layout: 'card' } }), null, { preview: false });
  assert.equal(out.banner.layout, 'bar');
});

test('portal feature id remove_powered_by grants white-label', () => {
  const ent: VerifiedEntitlement = {
    licenseId: 'lic',
    domain: 'acme.com',
    status: 'active',
    type: 'subscription',
    plan: { slug: 'studio-yearly', name: 'Studio' },
    features: { remove_powered_by: { kind: 'flag', value: true } },
    iat: 0,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  assert.equal(hasWhiteLabel(ent), true);
  assert.equal(hasWhiteLabel({ ...ent, features: { remove_powered_by: { kind: 'flag', value: false } } }), false);
});

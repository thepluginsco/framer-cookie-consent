/**
 * Unit tests for the WIX adapter (Phase 3.5) in `@framer-cookie-consent/shared`:
 * the Embedded Scripts bootstrap + per-site config store, the install/remove
 * orchestration over an injected {@link WixClient}, and the five-bucket Consent
 * Policy bridge.
 *
 * Wix is the only long-tail platform worth a native app and the first adapter
 * that is NOT ∅-infra — its dynamic parameters are alphanumeric-only, so the
 * config is fetched at runtime by site id instead of inlined. These tests prove
 * (a) the bootstrap fetches config and loads the SAME pinned runtime (one
 * engine), (b) the alphanumeric site-id constraint is honoured, (c) install /
 * remove are idempotent and set the opt-in default only on first install, and
 * (d) the consent bridge maps our category grants to Wix's five buckets through
 * the platform-neutral Consent Mode signals.
 *
 * Run with `vitest run`.
 */

import { test, expect } from 'vitest';

import {
  mergeConfig,
  buildWixBootstrapScript,
  normalizeWixSiteId,
  wixConfigUrl,
  installWixLoader,
  removeWixLoader,
  mapToWixConsent,
  runtimeScriptUrl,
  WIX_SITE_PARAM,
  WIX_CONFIG_BASE_URL,
  WIX_CONFIG_PATH,
  WIX_REJECT_ALL_POLICY,
  type WixClient,
  type WixEmbeddedScript,
  type WixConsentPolicy,
  type CookieConsentConfig,
} from '@framer-cookie-consent/shared';

/* -------------------------------------------------------------------------- */
/* In-memory Wix site                                                         */
/* -------------------------------------------------------------------------- */

/** An in-memory installed Wix site: one embedded script + a default policy. */
function fakeSite(seed: WixEmbeddedScript | null = null, opts: { withPolicy?: boolean } = {}) {
  let embedded: WixEmbeddedScript | null = seed ? { ...seed, parameters: { ...seed.parameters } } : null;
  let policy: WixConsentPolicy | null = null;
  const calls = { get: 0, embed: 0, del: 0, policy: 0 };

  const client: WixClient = {
    async getEmbeddedScript() {
      calls.get += 1;
      return embedded ? { ...embedded, parameters: { ...embedded.parameters } } : null;
    },
    async embedScript(value) {
      calls.embed += 1;
      embedded = { ...value, parameters: { ...value.parameters } };
    },
    async deleteEmbeddedScript() {
      calls.del += 1;
      embedded = null;
    },
  };
  if (opts.withPolicy ?? true) {
    client.updateDefaultConsentPolicy = async (p) => {
      calls.policy += 1;
      policy = { ...p };
    };
  }

  return { client, calls, get embedded() { return embedded; }, get policy() { return policy; } };
}

/* -------------------------------------------------------------------------- */
/* Site-id normalization + config URL                                         */
/* -------------------------------------------------------------------------- */

test('normalizeWixSiteId: strips non-alphanumerics from a GUID', () => {
  expect(normalizeWixSiteId('f0e5a1b2-4c3d-4e5f-8a9b-0c1d2e3f4a5b')).toBe(
    'f0e5a1b24c3d4e5f8a9b0c1d2e3f4a5b',
  );
  expect(normalizeWixSiteId('abc123')).toBe('abc123');
});

test('normalizeWixSiteId: throws when nothing alphanumeric remains', () => {
  expect(() => normalizeWixSiteId('---')).toThrow(RangeError);
  expect(() => normalizeWixSiteId('')).toThrow(RangeError);
});

test('wixConfigUrl: builds a per-site store URL under the config base', () => {
  expect(wixConfigUrl('abc123')).toBe(`${WIX_CONFIG_BASE_URL}${WIX_CONFIG_PATH}/abc123`);
  // Honours a base override and trims a trailing slash.
  expect(wixConfigUrl('abc123', 'https://cfg.example.test/')).toBe(
    `https://cfg.example.test${WIX_CONFIG_PATH}/abc123`,
  );
});

/* -------------------------------------------------------------------------- */
/* buildWixBootstrapScript                                                    */
/* -------------------------------------------------------------------------- */

test('buildWixBootstrapScript: template carries the {{siteId}} token, fetch + pinned runtime', () => {
  const script = buildWixBootstrapScript();
  expect(script.startsWith('<script>')).toBe(true);
  expect(script.endsWith('</script>')).toBe(true);
  // The declared template uses the mustache token Wix substitutes per site.
  expect(script).toContain(`"{{${WIX_SITE_PARAM}}}"`);
  // Config-store endpoint prefix + the config assignment + the pinned runtime.
  expect(script).toContain(`${WIX_CONFIG_PATH}/`);
  expect(script).toContain('window.__CC_CONFIG__=cfg;');
  expect(script).toContain(runtimeScriptUrl());
  expect(script).toContain('cdn.jsdelivr.net/gh/');
  expect(script).toContain('.catch(function(){});');
});

test('buildWixBootstrapScript: a resolved siteId is normalized and inlined instead of the token', () => {
  const script = buildWixBootstrapScript({ siteId: 'f0e5-a1b2' });
  expect(script).toContain('"f0e5a1b2"');
  expect(script).not.toContain('{{');
});

test('buildWixBootstrapScript: appends the consent-bridge asset only when bridgeUrl is given', () => {
  const withBridge = buildWixBootstrapScript({ bridgeUrl: 'https://cdn.example.test/wix-bridge.js' });
  expect(withBridge).toContain('https://cdn.example.test/wix-bridge.js');
  // The bridge is loaded from inside the config .then, after the runtime.
  expect(withBridge.indexOf('wix-bridge.js')).toBeGreaterThan(withBridge.indexOf('t.src='));

  const withoutBridge = buildWixBootstrapScript();
  expect(withoutBridge).not.toContain('b.src=');
});

test('buildWixBootstrapScript: honours runtimeUrl + configBaseUrl overrides', () => {
  const script = buildWixBootstrapScript({
    runtimeUrl: 'https://cdn.example.test/consent.js',
    configBaseUrl: 'https://cfg.example.test',
  });
  expect(script).toContain('https://cdn.example.test/consent.js');
  expect(script).toContain(`https://cfg.example.test${WIX_CONFIG_PATH}/`);
  expect(script).not.toContain('cdn.jsdelivr.net');
});

/* -------------------------------------------------------------------------- */
/* installWixLoader                                                           */
/* -------------------------------------------------------------------------- */

test('installWixLoader: first install embeds the script with the normalized siteId + sets the opt-in default', async () => {
  const site = fakeSite();
  const res = await installWixLoader(site.client, 'f0e5-a1b2');

  expect(res).toEqual({ changed: true, defaultPolicySet: true });
  expect(site.embedded).toEqual({ parameters: { [WIX_SITE_PARAM]: 'f0e5a1b2' }, disabled: false });
  expect(site.policy).toEqual(WIX_REJECT_ALL_POLICY);
  expect(site.calls.embed).toBe(1);
  expect(site.calls.policy).toBe(1);
});

test('installWixLoader: idempotent — a second identical install neither re-embeds nor re-clamps the policy', async () => {
  const site = fakeSite();
  await installWixLoader(site.client, 'abc123');
  const res = await installWixLoader(site.client, 'abc123');

  expect(res).toEqual({ changed: false, defaultPolicySet: false });
  expect(site.calls.embed).toBe(1); // still just the first embed
  expect(site.calls.policy).toBe(1); // default set only on first install
});

test('installWixLoader: re-embeds when the siteId parameter changes, but does NOT re-set the default', async () => {
  const site = fakeSite();
  await installWixLoader(site.client, 'abc123');
  const res = await installWixLoader(site.client, 'xyz789');

  expect(res.changed).toBe(true);
  expect(res.defaultPolicySet).toBe(false); // not a first install
  expect(site.embedded!.parameters[WIX_SITE_PARAM]).toBe('xyz789');
  expect(site.calls.policy).toBe(1);
});

test('installWixLoader: setDefaultPolicy:false skips the policy write', async () => {
  const site = fakeSite();
  const res = await installWixLoader(site.client, 'abc123', { setDefaultPolicy: false });
  expect(res).toEqual({ changed: true, defaultPolicySet: false });
  expect(site.calls.policy).toBe(0);
  expect(site.policy).toBeNull();
});

test('installWixLoader: no updateDefaultConsentPolicy wired → installs without a policy write', async () => {
  const site = fakeSite(null, { withPolicy: false });
  const res = await installWixLoader(site.client, 'abc123');
  expect(res).toEqual({ changed: true, defaultPolicySet: false });
  expect(site.embedded).not.toBeNull();
});

test('installWixLoader: re-enables an embedded-but-disabled script', async () => {
  const site = fakeSite({ parameters: { [WIX_SITE_PARAM]: 'abc123' }, disabled: true });
  const res = await installWixLoader(site.client, 'abc123');
  expect(res.changed).toBe(true);
  expect(site.embedded!.disabled).toBe(false);
  // Not a first install (script was present), so the default is left alone.
  expect(res.defaultPolicySet).toBe(false);
});

test('installWixLoader: rejects a site id with no alphanumeric characters', async () => {
  const site = fakeSite();
  await expect(installWixLoader(site.client, '---')).rejects.toThrow(RangeError);
  expect(site.calls.embed).toBe(0);
});

/* -------------------------------------------------------------------------- */
/* removeWixLoader                                                            */
/* -------------------------------------------------------------------------- */

test('removeWixLoader: deletes the embedded script when present', async () => {
  const site = fakeSite({ parameters: { [WIX_SITE_PARAM]: 'abc123' } });
  const res = await removeWixLoader(site.client);
  expect(res).toEqual({ changed: true, defaultPolicySet: false });
  expect(site.embedded).toBeNull();
  expect(site.calls.del).toBe(1);
});

test('removeWixLoader: no-op when nothing is embedded', async () => {
  const site = fakeSite(null);
  const res = await removeWixLoader(site.client);
  expect(res).toEqual({ changed: false, defaultPolicySet: false });
  expect(site.calls.del).toBe(0);
});

test('removeWixLoader: never resets the default consent policy (Wix does that on uninstall)', async () => {
  const site = fakeSite({ parameters: { [WIX_SITE_PARAM]: 'abc123' } });
  await removeWixLoader(site.client);
  expect(site.calls.policy).toBe(0);
  expect(site.policy).toBeNull();
});

/* -------------------------------------------------------------------------- */
/* mapToWixConsent                                                            */
/* -------------------------------------------------------------------------- */

test('mapToWixConsent: essential is always granted, even with no grants', () => {
  const config = mergeConfig();
  expect(mapToWixConsent(config, ['necessary'])).toEqual({
    essential: true,
    functional: false,
    analytics: false,
    advertising: false,
    dataToThirdParty: false,
  });
});

test('mapToWixConsent: analytics grant → analytics only', () => {
  const config = mergeConfig();
  const consent = mapToWixConsent(config, ['necessary', 'analytics']);
  expect(consent.analytics).toBe(true);
  expect(consent.advertising).toBe(false);
  expect(consent.functional).toBe(false);
});

test('mapToWixConsent: marketing grant → advertising AND dataToThirdParty', () => {
  const config = mergeConfig();
  const consent = mapToWixConsent(config, ['necessary', 'marketing']);
  expect(consent.advertising).toBe(true);
  expect(consent.dataToThirdParty).toBe(true);
  expect(consent.analytics).toBe(false);
});

test('mapToWixConsent: preferences grant → functional (functionality_storage)', () => {
  const config = mergeConfig();
  const consent = mapToWixConsent(config, ['necessary', 'preferences']);
  expect(consent.functional).toBe(true);
  expect(consent.analytics).toBe(false);
  expect(consent.advertising).toBe(false);
});

test('mapToWixConsent: full grant → all five buckets granted', () => {
  const config = mergeConfig();
  const ids = config.categories.map((c) => c.id);
  expect(mapToWixConsent(config, ids)).toEqual({
    essential: true,
    functional: true,
    analytics: true,
    advertising: true,
    dataToThirdParty: true,
  });
});

test('mapToWixConsent: a custom category carrying ad signals maps to advertising/dataToThirdParty', () => {
  const config: CookieConsentConfig = mergeConfig({
    categories: [
      { id: 'necessary', label: 'Necessary', description: '', required: true, defaultEnabled: true, signals: ['security_storage'] },
      { id: 'ads-custom', label: 'Ads', description: '', required: false, defaultEnabled: false, signals: ['ad_storage'] },
    ],
  });
  const consent = mapToWixConsent(config, ['ads-custom']);
  expect(consent.advertising).toBe(true);
  expect(consent.dataToThirdParty).toBe(true);
  expect(consent.analytics).toBe(false);
});

test('mapToWixConsent: ignores ids that are not real categories', () => {
  const config = mergeConfig();
  expect(mapToWixConsent(config, ['does-not-exist'])).toEqual({
    essential: true,
    functional: false,
    analytics: false,
    advertising: false,
    dataToThirdParty: false,
  });
});

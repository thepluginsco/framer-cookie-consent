/**
 * Unit tests for the WEBFLOW adapter (Phase 3.2) in
 * `@framer-cookie-consent/shared`: the registered/applied-scripts installer that
 * drives Webflow's v2 custom-code API through an injected {@link WebflowClient}.
 *
 * Webflow is the first platform with NO free-form head-HTML region, so it can't
 * reuse the head-blob `PlatformAdapter`. These tests prove the sibling installer
 * (a) reuses the SAME loader bodies as Framer/embed (one engine), (b) models
 * Webflow's register→apply→publish flow faithfully against an in-memory client,
 * and (c) is idempotent, churn-free, order-correct, and preserves foreign
 * scripts on both install and remove.
 *
 * Run with `vitest run`.
 */

import { test, expect } from 'vitest';

import {
  mergeConfig,
  configScriptBody,
  consentDefaultScriptBody,
  buildWebflowRegistrations,
  contentVersion,
  fnv1a32,
  runtimeRegistrationVersion,
  installWebflowLoader,
  removeWebflowLoader,
  isConsentfulScript,
  WEBFLOW_CONFIG_NAME,
  WEBFLOW_RUNTIME_NAME,
  WEBFLOW_CONSENT_DEFAULT_NAME,
  WEBFLOW_INLINE_MAX_CHARS,
  RUNTIME_VERSION,
  type WebflowClient,
  type WebflowAppliedScript,
  type WebflowRegisteredScript,
  type WebflowInlineRegistration,
  type WebflowHostedRegistration,
} from '@framer-cookie-consent/shared';

const FAKE_SRI = 'sha384-TESTHASH';

/**
 * An in-memory Webflow site: a registered-scripts registry + an applied list,
 * plus call counters, so tests can assert register/apply/publish behaviour.
 */
function fakeSite(seedApplied: WebflowAppliedScript[] = []) {
  const registered: WebflowRegisteredScript[] = [];
  let applied: WebflowAppliedScript[] = [...seedApplied];
  const calls = { registerInline: 0, registerHosted: 0, apply: 0, publish: 0, sri: 0 };
  let nextId = 1;

  const client: WebflowClient = {
    async getAppliedScripts() {
      return applied.map(s => ({ ...s }));
    },
    async applyScripts(scripts) {
      calls.apply += 1;
      applied = scripts.map(s => ({ ...s }));
    },
    async listRegisteredScripts() {
      return registered.map(s => ({ ...s }));
    },
    async registerInlineScript(input: WebflowInlineRegistration) {
      calls.registerInline += 1;
      const rec = { id: `inline_${nextId++}`, displayName: input.displayName, version: input.version };
      registered.push(rec);
      return { ...rec };
    },
    async registerHostedScript(input: WebflowHostedRegistration) {
      calls.registerHosted += 1;
      const rec = { id: `hosted_${nextId++}`, displayName: input.displayName, version: input.version };
      registered.push(rec);
      return { ...rec };
    },
    async runtimeIntegrityHash() {
      calls.sri += 1;
      return FAKE_SRI;
    },
    async publish() {
      calls.publish += 1;
    },
  };

  return { client, calls, get applied() { return applied; }, get registered() { return registered; } };
}

/* -------------------------------------------------------------------------- */
/* Pure builders                                                              */
/* -------------------------------------------------------------------------- */

test('buildWebflowRegistrations: consent-default + config inline (in order) + hosted runtime', () => {
  const config = mergeConfig();
  const { inline, runtime } = buildWebflowRegistrations(config, FAKE_SRI);

  expect(inline.map(s => s.displayName)).toEqual([WEBFLOW_CONSENT_DEFAULT_NAME, WEBFLOW_CONFIG_NAME]);

  // One engine: the inline bodies are byte-identical to the Framer/embed bodies.
  expect(inline[1]!.sourceCode).toBe(configScriptBody(config));
  expect(inline[0]!.sourceCode).toBe(consentDefaultScriptBody(config.consentMode.waitForUpdateMs));

  // No <script> tags — Webflow supplies the wrapper.
  for (const s of inline) expect(s.sourceCode).not.toMatch(/<\/?script/i);

  // Content-addressed inline versions; version-pinned hosted runtime.
  expect(inline[1]!.version).toBe(contentVersion(configScriptBody(config)));
  expect(runtime.displayName).toBe(WEBFLOW_RUNTIME_NAME);
  expect(runtime.integrityHash).toBe(FAKE_SRI);
  expect(runtime.version).toBe(runtimeRegistrationVersion());
  expect(runtimeRegistrationVersion()).toBe(RUNTIME_VERSION.replace(/^v/, ''));
});

test('buildWebflowRegistrations: no consent-default inline when Consent Mode is off', () => {
  const config = mergeConfig({ consentMode: { enableConsentMode: false } });
  const { inline } = buildWebflowRegistrations(config, FAKE_SRI);
  expect(inline.map(s => s.displayName)).toEqual([WEBFLOW_CONFIG_NAME]);
});

test('buildWebflowRegistrations: honours a runtimeUrl override', () => {
  const { runtime } = buildWebflowRegistrations(mergeConfig(), FAKE_SRI, {
    runtimeUrl: 'https://cdn.example.test/x.js',
  });
  expect(runtime.hostedLocation).toBe('https://cdn.example.test/x.js');
});

test('buildWebflowRegistrations: throws when the config inline body exceeds Webflow’s limit', () => {
  const huge = 'x'.repeat(WEBFLOW_INLINE_MAX_CHARS + 1000);
  const config = mergeConfig({ strings: { title: huge } });
  expect(configScriptBody(config).length).toBeGreaterThan(WEBFLOW_INLINE_MAX_CHARS);
  expect(() => buildWebflowRegistrations(config, FAKE_SRI)).toThrow(RangeError);
});

test('contentVersion / fnv1a32 are deterministic and content-sensitive', () => {
  expect(fnv1a32('abc')).toBe(fnv1a32('abc'));
  expect(fnv1a32('abc')).not.toBe(fnv1a32('abd'));
  expect(contentVersion('abc')).toMatch(/^0\.0\.\d+$/);
  expect(contentVersion('abc')).not.toBe(contentVersion('abd'));
});

test('isConsentfulScript recognises only our display names', () => {
  expect(isConsentfulScript(WEBFLOW_CONFIG_NAME)).toBe(true);
  expect(isConsentfulScript('someOtherAppScript')).toBe(false);
  expect(isConsentfulScript(undefined)).toBe(false);
});

/* -------------------------------------------------------------------------- */
/* installWebflowLoader                                                       */
/* -------------------------------------------------------------------------- */

test('installWebflowLoader: registers + applies our scripts header-order, then publishes', async () => {
  const site = fakeSite();
  const res = await installWebflowLoader(site.client, mergeConfig());

  expect(res).toEqual({ changed: true, published: true });
  expect(site.calls.registerInline).toBe(2); // consent-default + config
  expect(site.calls.registerHosted).toBe(1); // runtime
  expect(site.calls.publish).toBe(1);

  // Applied to header, in run order: consent-default, config, runtime LAST.
  const names = site.applied.map(a => site.registered.find(r => r.id === a.id)!.displayName);
  expect(names).toEqual([WEBFLOW_CONSENT_DEFAULT_NAME, WEBFLOW_CONFIG_NAME, WEBFLOW_RUNTIME_NAME]);
  expect(site.applied.every(a => a.location === 'header')).toBe(true);
});

test('installWebflowLoader: preserves a foreign applied script', async () => {
  const foreign: WebflowAppliedScript = { id: 'foreign_1', location: 'footer', version: '1.0.0' };
  const site = fakeSite([foreign]);
  await installWebflowLoader(site.client, mergeConfig());

  expect(site.applied[0]).toEqual(foreign); // foreign kept, first
  expect(site.applied).toHaveLength(4); // foreign + our 3
});

test('installWebflowLoader: re-installing an identical config is a churn-free no-op', async () => {
  const site = fakeSite();
  await installWebflowLoader(site.client, mergeConfig());
  const before = { ...site.calls };

  const res = await installWebflowLoader(site.client, mergeConfig());
  expect(res).toEqual({ changed: false, published: false });
  expect(site.calls.apply).toBe(before.apply); // no second apply
  expect(site.calls.publish).toBe(before.publish); // no second publish
  expect(site.calls.registerInline).toBe(before.registerInline); // reused, not re-registered
});

test('installWebflowLoader: a config edit registers a new version and swaps the stale one', async () => {
  const site = fakeSite();
  await installWebflowLoader(site.client, mergeConfig());
  const firstConfigId = site.applied.find(
    a => site.registered.find(r => r.id === a.id)!.displayName === WEBFLOW_CONFIG_NAME,
  )!.id;

  // Change the config → new content-addressed config version.
  const res = await installWebflowLoader(site.client, mergeConfig({ strings: { title: 'Changed heading' } }));
  expect(res.changed).toBe(true);

  const configApplied = site.applied.filter(
    a => site.registered.find(r => r.id === a.id)?.displayName === WEBFLOW_CONFIG_NAME,
  );
  expect(configApplied).toHaveLength(1); // exactly one config script applied
  expect(configApplied[0]!.id).not.toBe(firstConfigId); // the NEW registration
  // Still 3 of ours applied (no duplicate/stale left behind).
  const ours = site.applied.filter(a => isConsentfulScript(site.registered.find(r => r.id === a.id)?.displayName));
  expect(ours).toHaveLength(3);
});

test('installWebflowLoader: publishOnChange:false applies but does not publish', async () => {
  const site = fakeSite();
  const res = await installWebflowLoader(site.client, mergeConfig(), { publishOnChange: false });
  expect(res).toEqual({ changed: true, published: false });
  expect(site.calls.apply).toBe(1);
  expect(site.calls.publish).toBe(0);
});

/* -------------------------------------------------------------------------- */
/* removeWebflowLoader                                                        */
/* -------------------------------------------------------------------------- */

test('removeWebflowLoader: strips only our scripts, keeps foreign, publishes', async () => {
  const foreign: WebflowAppliedScript = { id: 'foreign_1', location: 'header', version: '2.0.0' };
  const site = fakeSite([foreign]);
  await installWebflowLoader(site.client, mergeConfig());

  const res = await removeWebflowLoader(site.client);
  expect(res).toEqual({ changed: true, published: true });
  expect(site.applied).toEqual([foreign]);
});

test('removeWebflowLoader: no-op (no apply, no publish) when none of ours are applied', async () => {
  const foreign: WebflowAppliedScript = { id: 'foreign_1', location: 'header', version: '2.0.0' };
  const site = fakeSite([foreign]);
  const res = await removeWebflowLoader(site.client);
  expect(res).toEqual({ changed: false, published: false });
  expect(site.calls.apply).toBe(0);
  expect(site.calls.publish).toBe(0);
});

/**
 * Unit tests for the Consentful editor model's pure config mappers.
 *
 * These cover the design-shape ⇄ canonical-config translation that every panel
 * edit flows through — in particular the managed-script mapping, which used to
 * drop the real script URL/inline body and is regression-guarded here.
 *
 * Run with `vitest run`.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { mergeConfig } from '@framer-cookie-consent/shared';
import {
  toCfg,
  applyScripts,
  applyCategories,
  scriptHost,
  type CfgScript,
  type CfgCategory,
} from '../plugin/src/consentful/model.ts';

/* -------------------------------------------------------------------------- */
/* scriptHost                                                                  */
/* -------------------------------------------------------------------------- */

test('scriptHost: extracts the host from a full src URL', () => {
  assert.equal(
    scriptHost({ type: 'src', value: 'https://www.googletagmanager.com/gtag/js?id=G-1' }),
    'www.googletagmanager.com',
  );
});

test('scriptHost: tolerates a bare domain (no scheme/path)', () => {
  assert.equal(scriptHost({ type: 'src', value: 'snap.licdn.com/li.js' }), 'snap.licdn.com');
});

test('scriptHost: returns empty for inline scripts and blanks', () => {
  assert.equal(scriptHost({ type: 'inline', value: 'pixel();' }), '');
  assert.equal(scriptHost({ type: 'src', value: '   ' }), '');
});

/* -------------------------------------------------------------------------- */
/* applyScripts ⇄ toCfg round-trip (the regression the fix addresses)          */
/* -------------------------------------------------------------------------- */

test('applyScripts: a src script keeps its FULL url in config.value (not just the domain)', () => {
  const base = mergeConfig();
  const url = 'https://snap.licdn.com/li.lms-analytics/insight.min.js';
  const scripts: CfgScript[] = [{ name: 'LinkedIn', id: '12345', type: 'src', value: url, cat: 'marketing' }];

  const next = applyScripts(base, scripts);
  const s = next.scripts[0]!;

  // The runtime injects `value` verbatim as the <script src>, so it MUST be the
  // full URL — the old code stored only `https://<domain>`, which never loaded.
  assert.equal(s.value, url);
  assert.equal(s.type, 'src');
  assert.equal(s.tagId, '12345');
  assert.equal(s.category, 'marketing');
  // provider is display-only, derived from the URL host.
  assert.equal(s.provider, 'snap.licdn.com');
  assert.ok(s.id, 'a stable id is assigned');
});

test('applyScripts: an inline script keeps its code body verbatim', () => {
  const base = mergeConfig();
  const code = "!function(){window._foo=1;bar('init');}();";
  const next = applyScripts(base, [{ name: 'Pixel', id: '', type: 'inline', value: code, cat: 'marketing' }]);
  const s = next.scripts[0]!;

  assert.equal(s.type, 'inline');
  assert.equal(s.value, code);
  assert.equal(s.provider, ''); // inline has no host
});

test('toCfg → applyScripts round-trips a script losslessly', () => {
  const original = mergeConfig({
    scripts: [
      {
        id: 'script-abc',
        name: 'GA4',
        provider: 'www.googletagmanager.com',
        tagId: 'G-XYZ',
        category: 'analytics',
        type: 'src',
        value: 'https://www.googletagmanager.com/gtag/js?id=G-XYZ',
        async: true,
      },
    ],
  });

  const cfg = toCfg(original);
  assert.equal(cfg.scripts[0]!.value, 'https://www.googletagmanager.com/gtag/js?id=G-XYZ');
  assert.equal(cfg.scripts[0]!.type, 'src');

  const back = applyScripts(original, cfg.scripts);
  assert.equal(back.scripts[0]!.value, original.scripts[0]!.value);
  assert.equal(back.scripts[0]!.type, original.scripts[0]!.type);
  assert.equal(back.scripts[0]!.category, 'analytics');
});

test('applyScripts: reuses the existing id/async when replacing at the same index', () => {
  const base = mergeConfig({
    scripts: [
      { id: 'keep-me', name: 'X', provider: 'x.com', tagId: '', category: 'analytics', type: 'src', value: 'https://x.com/a.js', async: false },
    ],
  });
  const next = applyScripts(base, [{ name: 'X renamed', id: '', type: 'src', value: 'https://x.com/b.js', cat: 'analytics' }]);
  assert.equal(next.scripts[0]!.id, 'keep-me');
  assert.equal(next.scripts[0]!.async, false);
  assert.equal(next.scripts[0]!.value, 'https://x.com/b.js');
});

/* -------------------------------------------------------------------------- */
/* applyCategories                                                             */
/* -------------------------------------------------------------------------- */

test('applyCategories: a locked category is written as required + always enabled', () => {
  const base = mergeConfig();
  const cats: CfgCategory[] = [
    { id: 'necessary', name: 'Necessary', desc: 'Required.', signals: ['security_storage'], enabled: true, locked: true },
    { id: 'analytics', name: 'Analytics', desc: 'Stats.', signals: ['analytics_storage'], enabled: false, locked: false },
  ];
  const next = applyCategories(base, cats);

  const necessary = next.categories.find((c) => c.id === 'necessary')!;
  assert.equal(necessary.required, true);
  assert.equal(necessary.defaultEnabled, true);

  const analytics = next.categories.find((c) => c.id === 'analytics')!;
  assert.equal(analytics.required, false);
  assert.equal(analytics.defaultEnabled, false);
  // Per-category copy overrides are mirrored into strings.categories.
  assert.equal(next.strings.categories['analytics']!.label, 'Analytics');
});

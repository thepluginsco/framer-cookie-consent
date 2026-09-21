/**
 * Unit tests for the A/B consent-rate testing engine (Phase 4.1) and its schema.
 *
 * The engine (`shared/src/ab-test.ts`) is pure: `chooseVariantId` takes an
 * injected random so selection is deterministic, and `applyVariant` is asserted
 * to change ONLY presentation while carrying every compliance-affecting section
 * through unchanged. The schema half checks defaults, sparse-override
 * normalization, id defaulting and invalid-value rejection. Run with `vitest run`.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  mergeConfig,
  DEFAULT_CONFIG,
  isAbTestActive,
  chooseVariantId,
  findVariant,
  applyVariant,
  abTestSignature,
  type AbTestConfig,
  type AbVariant,
} from '@framer-cookie-consent/shared';

function variant(id: string, weight = 1, overrides: Partial<Omit<AbVariant, 'id' | 'weight'>> = {}): AbVariant {
  return { id, label: overrides.label ?? id, weight, strings: {}, banner: {}, theme: {}, ...overrides };
}

function test2(a: AbVariant, b: AbVariant): AbTestConfig {
  return { enabled: true, variants: [a, b] };
}

/* -------------------------------- defaults -------------------------------- */

test('default config: abTest is disabled with no variants', () => {
  const c = mergeConfig();
  assert.equal(c.abTest.enabled, false);
  assert.deepEqual(c.abTest.variants, []);
});

/* ------------------------------ isAbTestActive ---------------------------- */

test('isAbTestActive: needs enabled + 2 variants + positive weight', () => {
  assert.equal(isAbTestActive({ enabled: false, variants: [variant('A'), variant('B')] }), false);
  assert.equal(isAbTestActive({ enabled: true, variants: [variant('A')] }), false);
  assert.equal(isAbTestActive({ enabled: true, variants: [variant('A', 0), variant('B', 0)] }), false);
  assert.equal(isAbTestActive(test2(variant('A'), variant('B'))), true);
});

/* ----------------------------- chooseVariantId ---------------------------- */

test('chooseVariantId: inert test → null', () => {
  assert.equal(chooseVariantId({ enabled: false, variants: [variant('A'), variant('B')] }, 0.5), null);
});

test('chooseVariantId: equal weights split at the midpoint', () => {
  const t = test2(variant('A'), variant('B'));
  assert.equal(chooseVariantId(t, 0.0), 'A');
  assert.equal(chooseVariantId(t, 0.49), 'A');
  assert.equal(chooseVariantId(t, 0.5), 'B');
  assert.equal(chooseVariantId(t, 0.999), 'B');
});

test('chooseVariantId: weights bias the split (A=3, B=1 → 75/25)', () => {
  const t = test2(variant('A', 3), variant('B', 1));
  assert.equal(chooseVariantId(t, 0.74), 'A');
  assert.equal(chooseVariantId(t, 0.76), 'B');
});

test('chooseVariantId: a zero-weight variant is never chosen', () => {
  const t: AbTestConfig = { enabled: true, variants: [variant('A', 0), variant('B', 1), variant('C', 0)] };
  for (const r of [0, 0.25, 0.5, 0.75, 0.999]) assert.equal(chooseVariantId(t, r), 'B');
});

test('chooseVariantId: out-of-range / NaN rand is clamped, never overshoots', () => {
  const t = test2(variant('A'), variant('B'));
  assert.equal(chooseVariantId(t, 1), 'B'); // clamped below 1 → last bucket
  assert.equal(chooseVariantId(t, -5), 'A');
  assert.equal(chooseVariantId(t, Number.NaN), 'A');
});

/* ------------------------------- findVariant ------------------------------ */

test('findVariant: by id, null for unknown/null', () => {
  const t = test2(variant('A'), variant('B'));
  assert.equal(findVariant(t, 'B')?.id, 'B');
  assert.equal(findVariant(t, 'Z'), null);
  assert.equal(findVariant(t, null), null);
});

/* ------------------------------- applyVariant ----------------------------- */

test('applyVariant: null → base unchanged (same reference)', () => {
  const base = mergeConfig({ strings: { title: 'Base' } });
  assert.equal(applyVariant(base, null), base);
});

test('applyVariant: overrides copy/banner/theme, returns a valid config', () => {
  const base = mergeConfig({ strings: { title: 'Base title', message: 'Base body' }, banner: { layout: 'card' } });
  const v = variant('B', 1, {
    strings: { title: 'Variant title' },
    banner: { layout: 'bar' },
    theme: { accent: '#ff0000' },
  });
  const out = applyVariant(base, v);
  assert.equal(out.strings.title, 'Variant title');
  assert.equal(out.strings.message, 'Base body'); // not overridden → inherited
  assert.equal(out.banner.layout, 'bar');
  assert.equal(out.theme.accent, '#ff0000');
});

test('applyVariant: NEVER changes compliance sections (categories/scripts/consentMode/behavior)', () => {
  const base = mergeConfig({
    categories: [
      { id: 'necessary', required: true, signals: ['security_storage'] },
      { id: 'analytics', signals: ['analytics_storage'] },
    ],
    scripts: [{ id: 's1', name: 'GA', category: 'analytics', type: 'src', value: 'https://x/ga.js' }],
    consentMode: { waitForUpdateMs: 1234 },
    behavior: { consentModel: 'opt-out' },
  });
  // A variant that (illegally) tries to smuggle these through overrides — they
  // aren't in the override shape, so the engine simply can't apply them.
  const out = applyVariant(base, variant('B', 1, { strings: { title: 'x' } }));
  assert.deepEqual(out.categories, base.categories);
  assert.deepEqual(out.scripts, base.scripts);
  assert.equal(out.consentMode.waitForUpdateMs, base.consentMode.waitForUpdateMs);
  assert.equal(out.behavior.consentModel, base.behavior.consentModel);
});

/* ----------------------------- abTestSignature ---------------------------- */

test('abTestSignature: stable across id+weight, changes on edit, empty when off', () => {
  const t = test2(variant('A', 2), variant('B', 1));
  assert.equal(abTestSignature(t), 'A:2|B:1');
  assert.equal(abTestSignature({ ...t, variants: [variant('A', 2), variant('B', 5)] }), 'A:2|B:5');
  assert.equal(abTestSignature({ ...t, enabled: false }), '');
});

/* -------------------------- schema normalization -------------------------- */

test('mergeConfig: normalizes sparse variant overrides + defaults id/weight', () => {
  const c = mergeConfig({
    abTest: {
      enabled: true,
      variants: [
        // no id → defaulted to V1; keeps only the present, valid overrides
        { strings: { title: 'Hi', message: '  ' }, banner: { layout: 'modal', position: 'nope' as never }, theme: { borderRadius: 999 } } as never,
      ],
    },
  });
  const v = c.abTest.variants[0]!;
  assert.equal(v.id, 'V1');
  assert.equal(v.weight, 1);
  assert.equal(v.strings.title, 'Hi');
  assert.equal('message' in v.strings, false); // whitespace-only dropped
  assert.equal(v.banner.layout, 'modal');
  assert.equal('position' in v.banner, false); // invalid enum dropped
  assert.equal(v.theme.borderRadius, 40); // clamped to max
});

test('mergeConfig: negative weight floored to 0, unknown id kept as given', () => {
  const c = mergeConfig({ abTest: { enabled: true, variants: [{ id: 'A', weight: -3 } as never] } });
  assert.equal(c.abTest.variants[0]!.id, 'A');
  assert.equal(c.abTest.variants[0]!.weight, 0);
});

test('serialize → parse round-trips an A/B test', () => {
  const c = mergeConfig({ abTest: { enabled: true, variants: [variant('A'), variant('B', 1, { strings: { title: 'B copy' } })] } });
  const back = mergeConfig(JSON.parse(JSON.stringify(c)));
  assert.equal(back.abTest.enabled, true);
  assert.equal(back.abTest.variants.length, 2);
  assert.equal(back.abTest.variants[1]!.strings.title, 'B copy');
});

test('DEFAULT_CONFIG is not mutated by applyVariant', () => {
  const before = JSON.stringify(DEFAULT_CONFIG.strings);
  applyVariant(mergeConfig(), variant('B', 1, { strings: { title: 'x' } }));
  assert.equal(JSON.stringify(DEFAULT_CONFIG.strings), before);
});

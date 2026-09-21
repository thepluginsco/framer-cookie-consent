/**
 * Unit tests for the plugin's A/B editor mappers (Phase 4.1).
 *
 * `toCfg` must surface the config's variants as the flat, "inherit-when-empty"
 * editor shape, and `applyAbTest` must write them back — dropping empty
 * overrides, defaulting ids, flooring weights — so the round-trip is stable and
 * the emitted config is the exact one-engine shape the runtime reads. Run with
 * `vitest run`.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { mergeConfig, applyVariant, findVariant } from '@framer-cookie-consent/shared';
import { toCfg, applyAbTest, type CfgVariant } from '../shared-ui/src/model.ts';

function cfgVariant(over: Partial<CfgVariant> = {}): CfgVariant {
  return { id: '', label: '', weight: 1, heading: '', body: '', acceptLabel: '', rejectLabel: '', layout: '', ...over };
}

/* --------------------------------- toCfg ---------------------------------- */

test('toCfg: surfaces abTest enabled + variants as the flat editor shape', () => {
  const c = mergeConfig({
    abTest: {
      enabled: true,
      variants: [
        { id: 'A', label: 'Short', weight: 2, strings: { title: 'Hi' }, banner: { layout: 'bar' } },
        { id: 'B', label: 'Long', weight: 1 },
      ],
    },
  });
  const cfg = toCfg(c);
  assert.equal(cfg.abTestEnabled, true);
  assert.equal(cfg.abVariants.length, 2);
  assert.deepEqual(
    { id: cfg.abVariants[0]!.id, heading: cfg.abVariants[0]!.heading, layout: cfg.abVariants[0]!.layout, weight: cfg.abVariants[0]!.weight },
    { id: 'A', heading: 'Hi', layout: 'bar', weight: 2 },
  );
  // Unset overrides surface as empty strings ("inherit").
  assert.equal(cfg.abVariants[1]!.heading, '');
  assert.equal(cfg.abVariants[1]!.layout, '');
});

/* ------------------------------- applyAbTest ------------------------------ */

test('applyAbTest: drops empty overrides, defaults id, floors weight', () => {
  const out = applyAbTest(mergeConfig(), true, [
    cfgVariant({ heading: 'Only heading', weight: -2 }), // no id → V1; weight floored to 0
    cfgVariant({ id: 'B', acceptLabel: 'Yes', layout: 'modal', weight: 3 }),
  ]);
  assert.equal(out.abTest.enabled, true);
  const [a, b] = out.abTest.variants;
  assert.equal(a!.id, 'V1');
  assert.equal(a!.weight, 1); // model floors invalid/negative to 1
  assert.equal(a!.strings.title, 'Only heading');
  assert.equal('message' in a!.strings, false);
  assert.equal('layout' in a!.banner, false);
  assert.equal(b!.id, 'B');
  assert.equal(b!.strings.acceptAll, 'Yes');
  assert.equal(b!.banner.layout, 'modal');
});

test('round-trip: toCfg → applyAbTest preserves the test', () => {
  const original = mergeConfig({
    strings: { title: 'Base' },
    abTest: {
      enabled: true,
      variants: [
        { id: 'A', label: 'A', weight: 1, strings: { title: 'A copy' } },
        { id: 'B', label: 'B', weight: 4, banner: { layout: 'bar' } },
      ],
    },
  });
  const cfg = toCfg(original);
  const rebuilt = applyAbTest(original, cfg.abTestEnabled, cfg.abVariants);
  assert.deepEqual(rebuilt.abTest, original.abTest);
});

test('one engine: an authored variant applies to the same config the runtime resolves', () => {
  const c = applyAbTest(mergeConfig({ strings: { title: 'Base' } }), true, [
    cfgVariant({ id: 'A', heading: '' }),
    cfgVariant({ id: 'B', heading: 'Variant B heading' }),
  ]);
  const applied = applyVariant(c, findVariant(c.abTest, 'B'));
  assert.equal(applied.strings.title, 'Variant B heading');
});

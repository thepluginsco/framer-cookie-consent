/**
 * Regression tests for the generated banner stylesheet (Consentful).
 *
 * These guard CSS contracts that a layout depends on but that a DOM test can't
 * catch — jsdom performs no layout, so a broken flex rule renders "fine" there.
 * Run with `vitest run`.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { mergeConfig } from '@framer-cookie-consent/shared';
import { buildStyleSheet } from '../runtime/src/styles.ts';

/**
 * The bottom-BAR layout lays its inner row out with flexbox AND makes the
 * "Powered by" credit break onto its own line via `flex:1 0 100%`. That basis of
 * 100% only wraps — instead of stealing the whole row and collapsing the text to
 * width 0 (overlapping the buttons) — when the inner container is `flex-wrap:wrap`.
 * This pairing is what the unlicensed basic banner (bar + visible credit) relies
 * on, so assert both halves stay together.
 */
test('bar layout: inner row wraps so the "Powered by" credit does not collapse the text', () => {
  const css = buildStyleSheet(mergeConfig());

  const inner = /\.cc-banner--bar \.cc-banner__inner\{([^}]*)\}/.exec(css);
  assert.ok(inner, 'bar inner rule should exist');
  assert.match(inner![1]!, /display:\s*flex/, 'bar inner must be a flex row');
  assert.match(
    inner![1]!,
    /flex-wrap:\s*wrap/,
    'bar inner MUST wrap, or the full-width "Powered by" credit collapses the text to 0',
  );

  const powered = /\.cc-banner--bar \.cc-powered\{([^}]*)\}/.exec(css);
  assert.ok(powered, 'bar powered rule should exist');
  assert.match(
    powered![1]!,
    /flex:\s*1 0 100%/,
    'the credit uses a 100% basis to occupy its own line (depends on the wrap above)',
  );
});

test('bar text region can shrink (min-width:0) so long copy never overflows the row', () => {
  const css = buildStyleSheet(mergeConfig());
  const text = /\.cc-banner--bar \.cc-banner__text\{([^}]*)\}/.exec(css);
  assert.ok(text, 'bar text rule should exist');
  assert.match(text![1]!, /flex:\s*1/, 'text grows to fill the row');
  assert.match(text![1]!, /min-width:\s*0/, 'text can shrink below its content width');
});

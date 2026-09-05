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
 * The "Powered by" credit is pinned to the banner's upper-right corner
 * (`position:absolute`), so it is OUT of the bar's flex row and can never collapse
 * the text to width 0 the way an in-flow `flex:1 0 100%` credit once did. Guard
 * that it stays absolutely positioned (a jsdom DOM test can't catch this — it does
 * no layout), and that the bar inner remains a flex row.
 */
test('powered-by credit is pinned (absolute), out of the bar flex row', () => {
  const css = buildStyleSheet(mergeConfig());

  const inner = /\.cc-banner--bar \.cc-banner__inner\{([^}]*)\}/.exec(css);
  assert.ok(inner, 'bar inner rule should exist');
  assert.match(inner![1]!, /display:\s*flex/, 'bar inner must be a flex row');

  const powered = /(?<![-\w])\.cc-powered\{([^}]*)\}/.exec(css);
  assert.ok(powered, 'powered rule should exist');
  assert.match(
    powered![1]!,
    /position:\s*absolute/,
    'the credit must be absolutely positioned so it never participates in the flex row',
  );
});

test('bar text region can shrink (min-width:0) so long copy never overflows the row', () => {
  const css = buildStyleSheet(mergeConfig());
  const text = /\.cc-banner--bar \.cc-banner__text\{([^}]*)\}/.exec(css);
  assert.ok(text, 'bar text rule should exist');
  assert.match(text![1]!, /flex:\s*1/, 'text grows to fill the row');
  assert.match(text![1]!, /min-width:\s*0/, 'text can shrink below its content width');
});

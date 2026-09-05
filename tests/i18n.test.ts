/**
 * Unit tests for the runtime multi-language resolver (Pro).
 *
 * `pickLocale` (visitor-language → authored-locale matching) and `localizeStrings`
 * (overlay a translation on the base copy) are pure, so they're exercised with
 * explicit inputs — no browser needed. Run with `vitest run`.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { mergeConfig } from '@framer-cookie-consent/shared';
import { pickLocale, localizeStrings } from '../runtime/src/i18n.ts';

/* -------------------------------- pickLocale ------------------------------- */

test('pickLocale: exact tag beats primary subtag', () => {
  assert.equal(pickLocale(['pt', 'pt-br'], ['pt-BR']), 'pt-br');
});

test('pickLocale: falls back to the primary subtag', () => {
  assert.equal(pickLocale(['de', 'fr'], ['de-AT']), 'de');
});

test('pickLocale: honours visitor preference order', () => {
  assert.equal(pickLocale(['de', 'fr'], ['en-US', 'fr-FR', 'de-DE']), 'fr');
});

test('pickLocale: returns null when nothing matches', () => {
  assert.equal(pickLocale(['de', 'fr'], ['ja-JP']), null);
  assert.equal(pickLocale([], ['de']), null);
});

/* ------------------------------ localizeStrings --------------------------- */

test('localizeStrings: no translations → base copy unchanged', () => {
  const base = mergeConfig().strings;
  assert.equal(localizeStrings(base, ['de-DE']), base);
});

test('localizeStrings: overlays a matching locale, base fills the gaps', () => {
  const strings = mergeConfig({
    strings: {
      title: 'We value your privacy',
      acceptAll: 'Accept all',
      translations: {
        de: { title: 'Wir schätzen Ihre Privatsphäre', acceptAll: 'Alle akzeptieren' },
      },
    },
  }).strings;

  const localized = localizeStrings(strings, ['de-DE']);
  assert.equal(localized.title, 'Wir schätzen Ihre Privatsphäre');
  assert.equal(localized.acceptAll, 'Alle akzeptieren');
  // A field the translation omits falls back to the base copy.
  assert.equal(localized.rejectAll, strings.rejectAll);
});

test('localizeStrings: a non-matching visitor gets the base copy', () => {
  const strings = mergeConfig({
    strings: { translations: { de: { title: 'DE' } } },
  }).strings;
  const localized = localizeStrings(strings, ['en-US']);
  assert.equal(localized.title, strings.title);
});

test('localizeStrings: merges per-category overrides for the locale', () => {
  const strings = mergeConfig({
    strings: {
      translations: {
        fr: { categories: { analytics: { label: 'Analytique', description: 'Statistiques.' } } },
      },
    },
  }).strings;

  const localized = localizeStrings(strings, ['fr']);
  assert.equal(localized.categories['analytics']!.label, 'Analytique');
  // An untranslated category keeps its base copy.
  assert.equal(localized.categories['marketing']!.label, strings.categories['marketing']!.label);
});

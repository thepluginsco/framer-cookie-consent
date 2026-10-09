/**
 * Built-in locale packs + translatable preference-center copy.
 *
 * A pack replaces only copy still at its English default; anything the author
 * typed wins. The runtime picks the pack for the language being shown: the
 * matched translation's, else the declared base-copy language, else the page's
 * `<html lang>`. The DOM tests mount the real banner under jsdom.
 */

import { test, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { applyLocalePack, mergeConfig, packCategory, packText, parse, serialize } from '@framer-cookie-consent/shared';
import { localizeStrings } from '../runtime/src/i18n.ts';
import { mountBanner } from '../runtime/src/banner.ts';
import { applyCategories, toCfg } from '../shared-ui/src/model.ts';

/* ------------------------------- pure packs -------------------------------- */

test('packText swaps an English default for the Swedish wording', () => {
  assert.equal(packText('sv', 'preferencesTitle', 'Privacy preferences'), 'Integritetsinställningar');
  assert.equal(packText('sv-SE', 'alwaysOn', 'Always on'), 'Alltid på');
});

test('packText leaves author copy and unknown languages alone', () => {
  assert.equal(packText('sv', 'preferencesTitle', 'Mina val'), 'Mina val');
  assert.equal(packText('ja', 'preferencesTitle', 'Privacy preferences'), 'Privacy preferences');
  assert.equal(packText('', 'preferencesTitle', 'Privacy preferences'), 'Privacy preferences');
});

test('packCategory translates each default field independently', () => {
  const cs = packCategory('sv', 'analytics', {
    label: 'Analytics',
    description: 'Our own words.',
  });
  assert.deepEqual(cs, { label: 'Analys', description: 'Our own words.' });
  // A custom category id has no pack entry.
  assert.deepEqual(packCategory('sv', 'custom', { label: 'X', description: 'Y' }), { label: 'X', description: 'Y' });
});

test('applyLocalePack localizes the whole default copy', () => {
  const s = applyLocalePack(mergeConfig().strings, 'sv');
  assert.equal(s.preferencesTitle, 'Integritetsinställningar');
  assert.equal(s.preferencesNote, 'Du kan ändra dina inställningar när som helst.');
  assert.equal(s.onLabel, 'PÅ');
  assert.equal(s.closeLabel, 'Stäng');
  assert.equal(s.categories.necessary!.label, 'Nödvändiga');
  assert.equal(s.categories.marketing!.label, 'Marknadsföring');
  assert.equal(s.categories.preferences!.label, 'Preferenser');
});

/* ------------------------------ schema merge ------------------------------- */

test('new copy fields default to English and survive a round trip', () => {
  const c = mergeConfig();
  assert.equal(c.strings.preferencesTitle, 'Privacy preferences');
  assert.equal(c.strings.alwaysOn, 'Always on');
  assert.equal(c.strings.language, '');
  const back = parse(
    serialize(
      mergeConfig({
        strings: { preferencesTitle: 'Dina val', language: ' SV ', translations: { de: { alwaysOn: 'Immer an' } } },
      }),
    ),
  );
  assert.equal(back.strings.preferencesTitle, 'Dina val');
  assert.equal(back.strings.language, 'sv');
  assert.equal(back.strings.translations.de!.alwaysOn, 'Immer an');
});

/* --------------------------- runtime resolution ---------------------------- */

test('localizeStrings: the page language picks the pack when nothing else is set', () => {
  const s = localizeStrings(mergeConfig().strings, ['en-US'], 'sv');
  assert.equal(s.preferencesTitle, 'Integritetsinställningar');
  assert.equal(localizeStrings(mergeConfig().strings, ['sv-SE'], 'en').preferencesTitle, 'Privacy preferences');
});

test('localizeStrings: a declared base language beats the page language', () => {
  const strings = mergeConfig({ strings: { language: 'sv' } }).strings;
  assert.equal(localizeStrings(strings, [], 'en').alwaysOn, 'Alltid på');
});

test('localizeStrings: a matched translation uses its own language pack', () => {
  const strings = mergeConfig({ strings: { translations: { sv: { title: 'Hej' } } } }).strings;
  const sv = localizeStrings(strings, ['sv-SE'], 'en');
  assert.equal(sv.title, 'Hej');
  assert.equal(sv.preferencesTitle, 'Integritetsinställningar');
  // An English visitor on the same site keeps the English base copy.
  assert.equal(localizeStrings(strings, ['en-GB'], 'en').preferencesTitle, 'Privacy preferences');
});

test('localizeStrings: translated preference-center fields override the pack', () => {
  const strings = mergeConfig({
    strings: { translations: { sv: { preferencesTitle: 'Cookieval', categories: { analytics: { label: 'Statistik', description: '' } } } } },
  }).strings;
  const s = localizeStrings(strings, ['sv'], '');
  assert.equal(s.preferencesTitle, 'Cookieval');
  assert.equal(s.categories.analytics!.label, 'Statistik');
  // The untranslated description falls back to the base default, then the pack.
  assert.equal(s.categories.analytics!.description, 'Hjälper oss att förstå hur besökare använder webbplatsen.');
});

/* ------------------------------ banner (DOM) ------------------------------- */

const g = globalThis as Record<string, unknown>;
const GLOBALS = ['Node', 'HTMLElement', 'HTMLAnchorElement', 'HTMLButtonElement', 'HTMLStyleElement', 'MutationObserver', 'HTMLInputElement', 'CustomEvent', 'Event', 'KeyboardEvent', 'MouseEvent'] as const;
let dom: InstanceType<typeof JSDOM> | null = null;

function mountIn(html: string, config = mergeConfig()) {
  dom = new JSDOM(html, { url: 'https://example.com/' });
  const w = dom.window;
  g.window = w;
  g.document = w.document;
  g.localStorage = w.localStorage;
  for (const name of GLOBALS) g[name] = (w as unknown as Record<string, unknown>)[name];
  const api = {
    getState: () => null,
    accept: () => {},
    acceptAll: () => {},
    rejectAll: () => {},
    openPreferences: () => {},
    withdraw: () => {},
    exportReceipt: () => null,
    downloadReceipt: () => false,
  };
  return mountBanner(config, { api: api as never });
}

afterEach(() => {
  dom?.window.close();
  dom = null;
  delete g.window;
  delete g.document;
  delete g.localStorage;
  for (const name of GLOBALS) delete g[name];
});

const text = (root: HTMLElement, sel: string) => root.querySelector(sel)?.textContent;

test('a page with <html lang="sv"> gets a fully Swedish preference center', () => {
  const { root } = mountIn('<!DOCTYPE html><html lang="sv"><body></body></html>');
  assert.equal(text(root, '.cc-modal__title'), 'Integritetsinställningar');
  assert.equal(text(root, '.cc-cat__always'), 'Alltid på');
  assert.equal(text(root, '.cc-cat__on'), 'PÅ');
  assert.equal(text(root, '.cc-modal__note-line'), 'Du kan ändra dina inställningar när som helst.');
  const labels = [...root.querySelectorAll('.cc-cat__label')].map((n) => n.textContent);
  assert.deepEqual(labels, ['Nödvändiga', 'Analys', 'Marknadsföring', 'Preferenser']);
  assert.equal(root.querySelector('.cc-modal__close')!.getAttribute('aria-label'), 'Stäng');
});

test('author copy wins over the Swedish pack; English pages stay English', () => {
  const config = mergeConfig({ strings: { preferencesTitle: 'Dina cookieval' } });
  const sv = mountIn('<!DOCTYPE html><html lang="sv"><body></body></html>', config);
  assert.equal(text(sv.root, '.cc-modal__title'), 'Dina cookieval');
  sv.destroy();
  dom!.window.close();

  const en = mountIn('<!DOCTYPE html><html lang="en"><body></body></html>');
  assert.equal(text(en.root, '.cc-modal__title'), 'Privacy preferences');
  assert.equal(text(en.root, '.cc-cat__always'), 'Always on');
});

/* --------------------------------- editor ---------------------------------- */

test('editor: renaming a default category writes label + strings override', () => {
  const base = mergeConfig();
  const cats = toCfg(base).categories.map((c) => (c.id === 'analytics' ? { ...c, name: 'Statistik' } : c));
  const next = applyCategories(base, cats);
  assert.equal(next.categories.find((c) => c.id === 'analytics')!.label, 'Statistik');
  assert.equal(next.strings.categories.analytics!.label, 'Statistik');
  assert.equal(toCfg(next).categories.find((c) => c.id === 'analytics')!.name, 'Statistik');
});

test('editor: copy language and preference-center fields round-trip through toCfg', () => {
  const cfg = toCfg(mergeConfig({ strings: { language: 'sv', alwaysOn: 'Alltid aktiv' } }));
  assert.equal(cfg.copyLanguage, 'sv');
  assert.equal(cfg.alwaysOnLabel, 'Alltid aktiv');
  assert.equal(cfg.prefsTitle, 'Privacy preferences');
});

/**
 * Built-in locale packs + translatable preference-center copy.
 *
 * A pack replaces only copy still at its English default; anything the author
 * typed wins. The runtime picks the pack for the language being shown: the
 * matched translation's, else the declared base-copy language, else the page's
 * `<html lang>` — and fetches just that one pack. The DOM tests mount the real
 * banner under jsdom with the pack boot would have passed in.
 */

import { test, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  DEFAULT_CONFIG,
  LOCALE_PACK_CODES,
  LOCALE_PACKS,
  applyLocalePack,
  localePack,
  mergeConfig,
  packCategory,
  packLanguage,
  packText,
  parse,
  sanitizeLocalePack,
  serialize,
} from '@framer-cookie-consent/shared';
import { localizeStrings, shownLanguage } from '../runtime/src/i18n.ts';
import { loadLocalePack, localePackUrl } from '../runtime/src/locale-loader.ts';
import { mountBanner } from '../runtime/src/banner.ts';
import { applyCategories, toCfg, COMMON_LANGUAGES } from '../shared-ui/src/model.ts';

/* ------------------------------- pure packs -------------------------------- */

test('packText swaps an English default for the pack wording', () => {
  assert.equal(packText('sv', 'preferencesTitle', 'Privacy preferences'), 'Integritetsinställningar');
  assert.equal(packText('sv-SE', 'alwaysOn', 'Always on'), 'Alltid på');
  assert.equal(packText('de-DE', 'rejectAll', 'Reject all'), 'Alle ablehnen');
});

test('packText leaves author copy and unknown languages alone', () => {
  assert.equal(packText('sv', 'preferencesTitle', 'Mina val'), 'Mina val');
  assert.equal(packText('xx', 'preferencesTitle', 'Privacy preferences'), 'Privacy preferences');
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
  const s = applyLocalePack(mergeConfig().strings, localePack('sv'));
  assert.equal(s.preferencesTitle, 'Integritetsinställningar');
  assert.equal(s.preferencesNote, 'Du kan ändra dina inställningar när som helst.');
  assert.equal(s.onLabel, 'PÅ');
  assert.equal(s.closeLabel, 'Stäng');
  assert.equal(s.categories.necessary!.label, 'Nödvändiga');
  assert.equal(s.categories.marketing!.label, 'Marknadsföring');
  assert.equal(s.categories.preferences!.label, 'Preferenser');
  // URL and language are never touched.
  assert.equal(s.privacyPolicyUrl, DEFAULT_CONFIG.strings.privacyPolicyUrl);
});

/* ------------------------------ pack coverage ------------------------------ */

test('every listed language ships a complete pack, and every pack is listed', () => {
  assert.deepEqual(Object.keys(LOCALE_PACKS).sort(), [...LOCALE_PACK_CODES].sort());
  const keys = Object.keys(DEFAULT_CONFIG.strings).filter(
    (k) =>
      typeof (DEFAULT_CONFIG.strings as unknown as Record<string, unknown>)[k] === 'string' &&
      !['privacyPolicyUrl', 'language'].includes(k),
  );
  for (const code of LOCALE_PACK_CODES) {
    const pack = LOCALE_PACKS[code]!;
    for (const k of keys) assert.ok((pack as Record<string, unknown>)[k], `${code} is missing ${k}`);
    for (const id of ['necessary', 'analytics', 'marketing', 'preferences']) {
      assert.ok(pack.categories?.[id]?.label && pack.categories[id]!.description, `${code} is missing category ${id}`);
    }
  }
});

test('every editor language has a built-in pack', () => {
  for (const [code] of COMMON_LANGUAGES) assert.ok(packLanguage(code), `${code} has no pack`);
});

test('packLanguage maps regional tags to the right pack', () => {
  assert.equal(packLanguage('de-AT'), 'de');
  assert.equal(packLanguage('pt-BR'), 'pt-br');
  assert.equal(packLanguage('pt-PT'), 'pt');
  assert.equal(packLanguage('zh-TW'), 'zh-hant');
  assert.equal(packLanguage('zh-Hant-HK'), 'zh-hant');
  assert.equal(packLanguage('zh-CN'), 'zh');
  assert.equal(packLanguage('nb-NO'), 'no');
  assert.equal(packLanguage('en-US'), '');
  assert.equal(packLanguage(''), '');
});

test('sanitizeLocalePack keeps only plain strings', () => {
  const p = sanitizeLocalePack({
    title: 'Hej',
    evil: 'x',
    acceptAll: 5,
    categories: { a: { label: 'L', description: 'D' }, b: { label: 1 } },
  });
  assert.deepEqual(p, { title: 'Hej', categories: { a: { label: 'L', description: 'D' } } });
  assert.equal(sanitizeLocalePack('nope'), undefined);
  assert.equal(sanitizeLocalePack([1]), undefined);
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

test('shownLanguage: translation, then declared language, then page language', () => {
  assert.equal(shownLanguage(mergeConfig().strings, ['en-US'], 'sv'), 'sv');
  assert.equal(shownLanguage(mergeConfig({ strings: { language: 'de' } }).strings, [], 'sv'), 'de');
  const translated = mergeConfig({ strings: { translations: { fr: { title: 'Salut' } } } }).strings;
  assert.equal(shownLanguage(translated, ['fr-FR'], 'en'), 'fr');
  // A visitor with no matching translation sees the base copy's language.
  assert.equal(shownLanguage(translated, ['ja'], 'en'), 'en');
});

test('localizeStrings applies the given pack to untouched defaults', () => {
  const s = localizeStrings(mergeConfig().strings, ['en-US'], localePack('ja'));
  assert.equal(s.preferencesTitle, 'プライバシー設定');
  assert.equal(localizeStrings(mergeConfig().strings, ['en-US']).preferencesTitle, 'Privacy preferences');
});

test('localizeStrings: translated preference-center fields override the pack', () => {
  const strings = mergeConfig({
    strings: {
      translations: {
        sv: { preferencesTitle: 'Cookieval', categories: { analytics: { label: 'Statistik', description: '' } } },
      },
    },
  }).strings;
  const s = localizeStrings(strings, ['sv'], localePack('sv'));
  assert.equal(s.preferencesTitle, 'Cookieval');
  assert.equal(s.categories.analytics!.label, 'Statistik');
  // The untranslated description falls back to the base default, then the pack.
  assert.equal(s.categories.analytics!.description, 'Hjälper oss att förstå hur besökare använder webbplatsen.');
});

/* --------------------------------- loader ---------------------------------- */

test('localePackUrl follows the jsDelivr tag the runtime came from', () => {
  assert.equal(
    localePackUrl('sv', 'https://cdn.jsdelivr.net/gh/thepluginsco/framer-cookie-consent@v9.9.9/runtime/dist/consent.min.js'),
    'https://cdn.jsdelivr.net/gh/thepluginsco/framer-cookie-consent@v9.9.9/runtime/dist/locales/sv.json',
  );
  // Loaded through a redirect (Wix Worker) → the pinned tag.
  assert.match(localePackUrl('de', 'https://worker.example/runtime.js'), /@v\d+\.\d+\.\d+\/runtime\/dist\/locales\/de\.json$/);
});

test('loadLocalePack resolves the sanitized pack, and undefined on failure', async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ title: 'Hallo', bad: 1 }))) as typeof fetch;
    assert.deepEqual(await loadLocalePack('de'), { title: 'Hallo' });
    globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;
    assert.equal(await loadLocalePack('de'), undefined);
    globalThis.fetch = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    assert.equal(await loadLocalePack('de'), undefined);
    globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;
    assert.equal(await loadLocalePack('de', 20), undefined);
    assert.equal(await loadLocalePack(''), undefined);
  } finally {
    globalThis.fetch = realFetch;
  }
});

/* ------------------------------ banner (DOM) ------------------------------- */

const g = globalThis as Record<string, unknown>;
const GLOBALS = ['Node', 'HTMLElement', 'HTMLAnchorElement', 'HTMLButtonElement', 'HTMLStyleElement', 'MutationObserver', 'HTMLInputElement', 'CustomEvent', 'Event', 'KeyboardEvent', 'MouseEvent'] as const;
let dom: InstanceType<typeof JSDOM> | null = null;

function mountIn(config = mergeConfig(), lang = 'sv') {
  dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://example.com/' });
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
  return mountBanner(config, { api: api as never, localePack: localePack(lang) });
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

test('with the Swedish pack the preference center is fully Swedish', () => {
  const { root } = mountIn();
  assert.equal(text(root, '.cc-modal__title'), 'Integritetsinställningar');
  assert.equal(text(root, '.cc-cat__always'), 'Alltid på');
  assert.equal(text(root, '.cc-cat__on'), 'PÅ');
  assert.equal(text(root, '.cc-modal__note-line'), 'Du kan ändra dina inställningar när som helst.');
  const labels = [...root.querySelectorAll('.cc-cat__label')].map((n) => n.textContent);
  assert.deepEqual(labels, ['Nödvändiga', 'Analys', 'Marknadsföring', 'Preferenser']);
  assert.equal(root.querySelector('.cc-modal__close')!.getAttribute('aria-label'), 'Stäng');
});

test('with the German pack the banner itself is German too', () => {
  const { root } = mountIn(mergeConfig(), 'de');
  assert.equal(text(root, '.cc-banner__title'), 'Wir respektieren Ihre Privatsphäre');
  assert.equal(text(root, '.cc-modal__title'), 'Datenschutzeinstellungen');
});

test('author copy wins over the pack; without a pack copy stays English', () => {
  const sv = mountIn(mergeConfig({ strings: { preferencesTitle: 'Dina cookieval' } }));
  assert.equal(text(sv.root, '.cc-modal__title'), 'Dina cookieval');
  sv.destroy();
  dom!.window.close();

  const en = mountIn(mergeConfig(), 'en');
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

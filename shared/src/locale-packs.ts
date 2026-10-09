/**
 * Built-in translations of the DEFAULT copy.
 *
 * A pack only replaces copy the author never touched: a field whose value is
 * still the shipped English default is swapped for the pack's wording, while
 * anything the author typed is left alone. So a Swedish site gets a Swedish
 * preference center out of the box, and every field stays overridable.
 *
 * Pure and dependency-free apart from the schema defaults it compares against.
 */

import { DEFAULT_CONFIG, type CategoryStrings, type LocaleStrings, type StringsConfig } from './config-schema.js';

/** A built-in pack: the default copy (and default categories) in one language. */
export type LocalePack = Partial<LocaleStrings>;

/** Built-in packs, keyed by lowercase primary language subtag. */
export const LOCALE_PACKS: Record<string, LocalePack> = {
  sv: {
    title: 'Vi värnar om din integritet',
    message:
      'Vi använder cookies för att förbättra din upplevelse, analysera trafik och anpassa innehåll. Välj vilka kategorier du vill tillåta.',
    acceptAll: 'Acceptera alla',
    rejectAll: 'Avvisa alla',
    customize: 'Hantera inställningar',
    savePreferences: 'Spara val',
    downloadReceipt: 'Ladda ner samtyckeskvitto',
    vendorsHeading: 'Tjänster',
    preferencesTitle: 'Integritetsinställningar',
    preferencesSubtitle: 'Välj vilka cookies du vill tillåta. Du kan ändra dina val här när som helst.',
    alwaysOn: 'Alltid på',
    onLabel: 'PÅ',
    preferencesNote: 'Du kan ändra dina inställningar när som helst.',
    closeLabel: 'Stäng',
    privacyPolicyLabel: 'Integritetspolicy',
    categories: {
      necessary: {
        label: 'Nödvändiga',
        description: 'Krävs för att webbplatsen ska fungera. Kan inte stängas av.',
      },
      analytics: {
        label: 'Analys',
        description: 'Hjälper oss att förstå hur besökare använder webbplatsen.',
      },
      marketing: {
        label: 'Marknadsföring',
        description: 'Används för att visa relevanta annonser och mäta kampanjer.',
      },
      preferences: {
        label: 'Preferenser',
        description: 'Kommer ihåg val som språk och region.',
      },
    },
  },
};

/** The primary language subtag of a BCP-47 tag, lowercased (`'sv-SE'` → `'sv'`). */
export function primaryLanguage(tag: string): string {
  return tag.trim().toLowerCase().split('-')[0] ?? '';
}

/** The built-in pack for a language tag, or `undefined` when none ships. */
export function localePack(lang: string): LocalePack | undefined {
  return LOCALE_PACKS[primaryLanguage(lang)];
}

type PackTextKey = Exclude<keyof LocaleStrings, 'categories'>;

/**
 * Localize one copy field: returns the pack's wording when `value` is still the
 * English default and the language has a pack, otherwise `value` unchanged.
 */
export function packText(lang: string, key: PackTextKey, value: string): string {
  const v = localePack(lang)?.[key];
  return v && value === DEFAULT_CONFIG.strings[key] ? v : value;
}

/**
 * Localize one category's copy: each of label/description is swapped for the
 * pack's wording only while it still equals the English default.
 */
export function packCategory(lang: string, id: string, cs: CategoryStrings): CategoryStrings {
  const p = localePack(lang)?.categories?.[id];
  const d = DEFAULT_CONFIG.strings.categories[id];
  if (!p || !d) return cs;
  return {
    label: p.label && cs.label === d.label ? p.label : cs.label,
    description: p.description && cs.description === d.description ? p.description : cs.description,
  };
}

/**
 * Apply a language's built-in pack to the whole copy object. Returns `strings`
 * unchanged when no pack ships for `lang`.
 */
export function applyLocalePack(strings: StringsConfig, lang: string): StringsConfig {
  const pack = localePack(lang);
  if (!pack) return strings;
  const out: StringsConfig = { ...strings, categories: { ...strings.categories } };
  for (const key of Object.keys(pack) as Array<keyof LocalePack>) {
    if (key !== 'categories') out[key] = packText(lang, key, strings[key]);
  }
  for (const [id, cs] of Object.entries(out.categories)) out.categories[id] = packCategory(lang, id, cs);
  return out;
}

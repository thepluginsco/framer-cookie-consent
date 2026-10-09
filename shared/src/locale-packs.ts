/**
 * Built-in translations of the DEFAULT copy — the engine, without the data.
 *
 * A pack only replaces copy the author never touched: a field whose value is
 * still the shipped English default is swapped for the pack's wording, while
 * anything the author typed is left alone. So a Swedish (or German, Japanese, …)
 * site gets a localized banner and preference center out of the box, and every
 * field stays overridable.
 *
 * The packs themselves live in `locale-pack-data.ts`. The runtime never bundles
 * them: it resolves the visitor's language to a code here and fetches that one
 * pack as JSON (built to `runtime/dist/locales/<code>.json`).
 */

import { DEFAULT_CONFIG, type LocaleStrings, type CategoryStrings, type StringsConfig } from './config-schema.js';

/** A built-in pack: the default copy (and default categories) in one language. */
export type LocalePack = Partial<LocaleStrings>;

/** A pack's string-valued keys. */
export type PackTextKey = Exclude<keyof LocaleStrings, 'categories'>;

/** Every language a built-in pack ships for (lowercase pack codes). */
export const LOCALE_PACK_CODES: readonly string[] = [
  'de', 'fr', 'es', 'it', 'pt', 'pt-br', 'nl', 'pl', 'sv', 'da', 'fi', 'no', 'cs', 'sk', 'hu', 'ro',
  'el', 'bg', 'hr', 'sl', 'et', 'lv', 'lt', 'tr', 'uk', 'ja', 'ko', 'zh', 'zh-hant',
];

/** The primary language subtag of a BCP-47 tag, lowercased (`'sv-SE'` → `'sv'`). */
export function primaryLanguage(tag: string): string {
  return tag.trim().toLowerCase().split('-')[0] ?? '';
}

/**
 * Map a BCP-47 tag to the built-in pack that fits it, or `''` when none ships.
 * Handles the variants a primary subtag alone gets wrong: Brazilian Portuguese,
 * Traditional Chinese (Taiwan / Hong Kong / Macau), and Norwegian Bokmål/Nynorsk.
 */
export function packLanguage(tag: string): string {
  const t = tag.trim().toLowerCase().replace(/_/g, '-');
  const primary = primaryLanguage(t);
  let code = primary;
  if (primary === 'pt' && /-br\b/.test(t)) code = 'pt-br';
  else if (primary === 'zh' && /-(hant|tw|hk|mo)\b/.test(t)) code = 'zh-hant';
  else if (primary === 'nb' || primary === 'nn') code = 'no';
  return LOCALE_PACK_CODES.includes(code) ? code : '';
}

/**
 * Localize one copy field: the pack's wording when `value` is still the English
 * default and the pack has it, otherwise `value` unchanged.
 */
export function packTextWith(pack: LocalePack | undefined, key: PackTextKey, value: string): string {
  const v = pack?.[key];
  return typeof v === 'string' && v && value === DEFAULT_CONFIG.strings[key] ? v : value;
}

/**
 * Localize one category's copy: each of label/description is swapped for the
 * pack's wording only while it still equals the English default.
 */
export function packCategoryWith(pack: LocalePack | undefined, id: string, cs: CategoryStrings): CategoryStrings {
  const p = pack?.categories?.[id];
  const d = DEFAULT_CONFIG.strings.categories[id];
  if (!p || !d) return cs;
  return {
    label: p.label && cs.label === d.label ? p.label : cs.label,
    description: p.description && cs.description === d.description ? p.description : cs.description,
  };
}

/** Apply a pack to the whole copy object. Returns `strings` unchanged without one. */
export function applyLocalePack(strings: StringsConfig, pack: LocalePack | undefined): StringsConfig {
  if (!pack) return strings;
  const out: StringsConfig = { ...strings, categories: { ...strings.categories } };
  for (const key of Object.keys(DEFAULT_CONFIG.strings) as Array<keyof StringsConfig>) {
    const v = strings[key];
    if (typeof v === 'string' && key in pack) {
      (out as unknown as Record<string, string>)[key] = packTextWith(pack, key as PackTextKey, v);
    }
  }
  for (const [id, cs] of Object.entries(out.categories)) out.categories[id] = packCategoryWith(pack, id, cs);
  return out;
}

/**
 * Validate a fetched pack: keep only string fields and well-formed categories,
 * so a corrupt or hostile file can never inject anything but plain text.
 */
export function sanitizeLocalePack(input: unknown): LocalePack | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_CONFIG.strings)) {
    if (typeof src[key] === 'string') out[key] = src[key];
  }
  const cats = src.categories;
  if (cats && typeof cats === 'object') {
    const c: Record<string, CategoryStrings> = {};
    for (const [id, v] of Object.entries(cats as Record<string, unknown>)) {
      const cs = v as Record<string, unknown> | null;
      if (cs && typeof cs.label === 'string' && typeof cs.description === 'string') {
        c[id] = { label: cs.label, description: cs.description };
      }
    }
    out.categories = c;
  }
  return out as LocalePack;
}

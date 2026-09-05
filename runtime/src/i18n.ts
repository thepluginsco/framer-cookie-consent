/**
 * Locale resolution for the banner (Pro multi-language).
 *
 * Pure and dependency-free (only erased type imports). The author supplies
 * per-locale copy in `config.strings.translations`; this module picks the entry
 * matching the visitor's browser language and overlays it on the base copy.
 * Visitors with no matching translation get the base copy unchanged — so turning
 * multi-language on can never blank out a banner.
 */

import type { StringsConfig, CategoryStrings, LocaleStrings } from '@framer-cookie-consent/shared';

/** The primary language subtag of a BCP-47 tag, lowercased (`'de-DE'` → `'de'`). */
function primarySubtag(tag: string): string {
  return tag.trim().toLowerCase().split('-')[0] ?? '';
}

/**
 * Choose which authored locale to use for a visitor. Matches the visitor's
 * ordered languages against the available translation keys — first by exact
 * (lowercased) tag, then by primary subtag — and returns the first hit, or
 * `null` when none match (caller should use the base copy).
 *
 * @param available - Authored translation keys (e.g. `['de','fr','pt-br']`).
 * @param languages - Visitor languages, most-preferred first (e.g. `navigator.languages`).
 * @returns The matching available key, or `null`.
 */
export function pickLocale(available: readonly string[], languages: readonly string[]): string | null {
  if (available.length === 0) return null;
  const keys = available.map((a) => a.trim().toLowerCase());
  const has = (code: string): string | null => {
    const i = keys.indexOf(code);
    return i === -1 ? null : (available[i] as string);
  };
  for (const lang of languages) {
    const full = lang.trim().toLowerCase();
    if (!full) continue;
    const exact = has(full);
    if (exact) return exact;
    const primary = has(primarySubtag(lang));
    if (primary) return primary;
  }
  return null;
}

/** Overlay a locale's category overrides onto the base category strings. */
function localizeCategories(
  base: Record<string, CategoryStrings>,
  override: Record<string, CategoryStrings> | undefined,
): Record<string, CategoryStrings> {
  if (!override) return base;
  const out: Record<string, CategoryStrings> = { ...base };
  for (const [id, cs] of Object.entries(override)) {
    const b = out[id];
    out[id] = {
      label: cs.label || b?.label || id,
      description: cs.description || b?.description || '',
    };
  }
  return out;
}

/**
 * Produce a {@link StringsConfig} localized for the given visitor languages. When
 * a matching translation exists, its provided fields override the base copy (and
 * its category overrides are merged in); every missing field falls back to the
 * base. When nothing matches, the base `strings` is returned unchanged.
 *
 * @param strings - The base copy (with its `translations` map).
 * @param languages - Visitor languages, most-preferred first.
 * @returns The effective copy to render.
 */
export function localizeStrings(strings: StringsConfig, languages: readonly string[]): StringsConfig {
  const locale = pickLocale(Object.keys(strings.translations), languages);
  if (!locale) return strings;
  const t: Partial<LocaleStrings> | undefined = strings.translations[locale];
  if (!t) return strings;
  return {
    ...strings,
    title: t.title || strings.title,
    message: t.message || strings.message,
    acceptAll: t.acceptAll || strings.acceptAll,
    rejectAll: t.rejectAll || strings.rejectAll,
    customize: t.customize || strings.customize,
    savePreferences: t.savePreferences || strings.savePreferences,
    privacyPolicyLabel: t.privacyPolicyLabel || strings.privacyPolicyLabel,
    categories: localizeCategories(strings.categories, t.categories),
  };
}

/** Read the visitor's ordered browser languages (SSR-safe, never throws). */
export function detectLanguages(): string[] {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav?.languages && nav.languages.length > 0) return [...nav.languages];
    if (nav?.language) return [nav.language];
  } catch {
    /* navigator unavailable */
  }
  return [];
}

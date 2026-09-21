/**
 * Pure form-state → config mapping for the WordPress admin settings screen.
 *
 * Mirrors the embed page's and the Webflow Designer's `config-form.ts` — a flat,
 * control-friendly projection of the config run through the shared
 * {@link mergeConfig} — so the WordPress admin can never emit a config the runtime
 * can't read, and the loader stored in `wp_head` is byte-identical to every other
 * platform's. Kept DOM-free so the "does the form produce the right config"
 * contract is unit-testable without a browser or WordPress.
 *
 * The one WordPress-specific affordance is {@link mergeDetectedScripts}: the admin
 * screen can pre-fill gated scripts from the site's active plugins (via
 * `detectWordPressTrackers`) before the form is ever touched — the pre-publish
 * analogue of the Framer/embed manual script rows.
 */

import type {
  BannerLayout,
  ConsentModel,
  CookieConsentConfig,
  DeepPartial,
  DetectedTracker,
  ManagedScript,
  ScriptType,
  ShowMode,
  ThemeMode,
} from "@framer-cookie-consent/shared";
import { DEFAULT_CONFIG, mergeConfig } from "@framer-cookie-consent/shared";

/** Optional (non-`necessary`) default categories the admin exposes. */
export type OptionalCategoryId = "analytics" | "marketing" | "preferences";

/** One optional category's inclusion + opt-out default. */
export interface CategoryFormState {
  enabled: boolean;
  defaultOn: boolean;
}

/** One author-added (or auto-detected) gated tracking tag. */
export interface ScriptFormState {
  name: string;
  category: string;
  type: ScriptType;
  value: string;
}

/** The flat state the WordPress admin form binds to. */
export interface WordPressFormState {
  /* Content */
  title: string;
  message: string;
  acceptAll: string;
  rejectAll: string;
  customize: string;
  savePreferences: string;
  privacyPolicyLabel: string;
  privacyPolicyUrl: string;

  /* Categories (necessary is implicit + always on) */
  categories: Record<OptionalCategoryId, CategoryFormState>;

  /* Appearance */
  layout: BannerLayout;
  themeMode: ThemeMode;
  accent: string;

  /* Behavior */
  showMode: ShowMode;
  consentModel: ConsentModel;
  respectGpc: boolean;
  enableConsentMode: boolean;

  /* Gated scripts (author rows + detected trackers) */
  scripts: ScriptFormState[];
}

/** The optional categories the admin exposes, in display order. */
export const OPTIONAL_CATEGORY_IDS: readonly OptionalCategoryId[] = [
  "analytics",
  "marketing",
  "preferences",
];

function defaultCategory(id: string) {
  return DEFAULT_CONFIG.categories.find((c) => c.id === id);
}

/** A form state seeded from {@link DEFAULT_CONFIG}. Deep-cloned per call. */
export function defaultFormState(): WordPressFormState {
  const d = DEFAULT_CONFIG;
  const catState = (id: OptionalCategoryId): CategoryFormState => {
    const base = defaultCategory(id);
    return { enabled: base !== undefined, defaultOn: base?.defaultEnabled ?? false };
  };
  return {
    title: d.strings.title,
    message: d.strings.message,
    acceptAll: d.strings.acceptAll,
    rejectAll: d.strings.rejectAll,
    customize: d.strings.customize,
    savePreferences: d.strings.savePreferences,
    privacyPolicyLabel: d.strings.privacyPolicyLabel,
    privacyPolicyUrl: d.strings.privacyPolicyUrl,
    categories: {
      analytics: catState("analytics"),
      marketing: catState("marketing"),
      preferences: catState("preferences"),
    },
    layout: d.banner.layout,
    themeMode: d.theme.mode,
    accent: d.theme.accent,
    showMode: d.behavior.showMode,
    consentModel: d.behavior.consentModel,
    respectGpc: d.behavior.respectGpc,
    enableConsentMode: d.consentMode.enableConsentMode,
    scripts: [],
  };
}

function categoriesFromForm(state: WordPressFormState): CookieConsentConfig["categories"] {
  const out: CookieConsentConfig["categories"] = [];
  const necessary = defaultCategory("necessary");
  if (necessary) out.push({ ...necessary, signals: [...necessary.signals] });
  for (const id of OPTIONAL_CATEGORY_IDS) {
    const form = state.categories[id];
    if (!form.enabled) continue;
    const base = defaultCategory(id);
    if (!base) continue;
    out.push({ ...base, signals: [...base.signals], defaultEnabled: form.defaultOn });
  }
  return out;
}

function scriptsFromForm(state: WordPressFormState): ManagedScript[] {
  const out: ManagedScript[] = [];
  state.scripts.forEach((s, i) => {
    const value = s.value.trim();
    if (value === "") return;
    out.push({
      id: `script-${i + 1}`,
      name: s.name.trim() || (s.type === "src" ? "External script" : "Inline script"),
      provider: s.type === "src" ? hostOf(value) : "",
      tagId: "",
      purpose: "",
      category: s.category,
      type: s.type,
      value,
      async: true,
    });
  });
  return out;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/**
 * Merge auto-detected trackers (from {@link detectWordPressTrackers}) into a
 * script list, skipping any whose `value` is already present so re-detecting is
 * idempotent. Returns a NEW array (pure) — the admin screen calls this once when
 * the detection panel's "Add" is clicked.
 *
 * @param existing - The current script rows.
 * @param detected - Trackers found from the active-plugin list.
 * @returns The combined script rows.
 */
export function mergeDetectedScripts(
  existing: ScriptFormState[],
  detected: DetectedTracker[],
): ScriptFormState[] {
  const seen = new Set(existing.map((s) => s.value.trim()).filter(Boolean));
  const out = [...existing];
  for (const t of detected) {
    const value = t.value.trim();
    if (value === "" || seen.has(value)) continue;
    seen.add(value);
    out.push({ name: t.name, category: t.category, type: t.type, value });
  }
  return out;
}

/** Map the flat {@link WordPressFormState} to a complete, validated config. */
export function configFromForm(state: WordPressFormState): CookieConsentConfig {
  const partial: DeepPartial<CookieConsentConfig> = {
    categories: categoriesFromForm(state),
    consentMode: { enableConsentMode: state.enableConsentMode },
    behavior: {
      showMode: state.showMode,
      consentModel: state.consentModel,
      respectGpc: state.respectGpc,
    },
    banner: { layout: state.layout },
    theme: { accent: state.accent, mode: state.themeMode },
    strings: {
      title: state.title,
      message: state.message,
      acceptAll: state.acceptAll,
      rejectAll: state.rejectAll,
      customize: state.customize,
      savePreferences: state.savePreferences,
      privacyPolicyLabel: state.privacyPolicyLabel,
      privacyPolicyUrl: state.privacyPolicyUrl,
    },
    scripts: scriptsFromForm(state),
  };
  return mergeConfig(partial);
}

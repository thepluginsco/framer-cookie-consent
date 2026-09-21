/**
 * Pure form-state → config mapping for the Wix dashboard authoring page.
 *
 * Mirrors the other shells' `config-form.ts` in spirit — a flat, control-friendly
 * projection of the config run through the shared {@link mergeConfig} — so the
 * dashboard can never emit a config the runtime can't read, and the config it
 * stores (and the runtime fetches) is byte-identical to every other platform's.
 * Kept DOM-free so this "does the form produce the right config" contract is
 * unit-testable without a browser or the Wix host.
 */

import type {
  BannerLayout,
  ConsentModel,
  CookieConsentConfig,
  DeepPartial,
  ManagedScript,
  ScriptType,
  ShowMode,
  ThemeMode,
} from "@framer-cookie-consent/shared";
import { DEFAULT_CONFIG, mergeConfig } from "@framer-cookie-consent/shared";

/** Optional (non-`necessary`) default categories the dashboard exposes. */
export type OptionalCategoryId = "analytics" | "marketing" | "preferences";

/** One optional category's inclusion + opt-out default. */
export interface CategoryFormState {
  enabled: boolean;
  defaultOn: boolean;
}

/** One author-added gated tracking tag. */
export interface ScriptFormState {
  name: string;
  category: string;
  type: ScriptType;
  value: string;
}

/** The flat state the dashboard form binds to. */
export interface WixFormState {
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

  /* Gated scripts */
  scripts: ScriptFormState[];
}

/** The optional categories the dashboard exposes, in display order. */
export const OPTIONAL_CATEGORY_IDS: readonly OptionalCategoryId[] = [
  "analytics",
  "marketing",
  "preferences",
];

function defaultCategory(id: string) {
  return DEFAULT_CONFIG.categories.find((c) => c.id === id);
}

/** A form state seeded from {@link DEFAULT_CONFIG}. Deep-cloned per call. */
export function defaultFormState(): WixFormState {
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

function categoriesFromForm(state: WixFormState): CookieConsentConfig["categories"] {
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

function scriptsFromForm(state: WixFormState): ManagedScript[] {
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

/** Map the flat {@link WixFormState} to a complete, validated config. */
export function configFromForm(state: WixFormState): CookieConsentConfig {
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

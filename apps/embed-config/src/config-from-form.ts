/**
 * Pure form-state → config mapping for the hosted embed config page (Phase 3.1).
 *
 * The hosted page (`apps/embed-config/`) is the universal embed's authoring UI:
 * a static, ∅-infra tool where a user without a host custom-code API (Wix,
 * Squarespace, Ghost, Carrd, hand-coded, …) authors their banner and copies the
 * `<script>` snippet {@link buildEmbedSnippet} produces.
 *
 * This module owns the ONLY logic worth unit-testing in that page: turning the
 * flat {@link EmbedFormState} the form binds to into a validated
 * {@link CookieConsentConfig}. It is deliberately DOM-free and dependency-free
 * beyond the shared core, so the page's "does the form produce the right config"
 * contract is covered without a browser.
 *
 * One engine: it builds a {@link DeepPartial} and runs it through the shared
 * {@link mergeConfig}, so the page can never emit a config shape the runtime
 * can't read, and inherits every default/coercion/migration for free.
 */

import type {
  BannerLayout,
  BannerPosition,
  ConsentModel,
  CookieConsentConfig,
  DeepPartial,
  ManagedScript,
  ScriptType,
  ShowMode,
  ThemeMode,
} from "@framer-cookie-consent/shared";
import { DEFAULT_CONFIG, mergeConfig } from "@framer-cookie-consent/shared";

/* -------------------------------------------------------------------------- */
/* Form state                                                                 */
/* -------------------------------------------------------------------------- */

/** The optional (non-`necessary`) default categories the page lets you toggle. */
export type OptionalCategoryId = "analytics" | "marketing" | "preferences";

/** One optional category's inclusion + opt-out default. */
export interface CategoryFormState {
  /** Include this category in the banner at all. */
  enabled: boolean;
  /** Whether its toggle starts ON (an opt-out default). */
  defaultOn: boolean;
}

/** One author-added gated tracking tag. */
export interface ScriptFormState {
  /** Human-readable name (e.g. "Google Analytics 4"). */
  name: string;
  /** Category id whose consent unblocks it. */
  category: string;
  /** `src` loads a URL; `inline` runs code. */
  type: ScriptType;
  /** The URL (for `src`) or code body (for `inline`). */
  value: string;
}

/**
 * The flat state the hosted form binds to. Mirrors the Framer plugin's `Cfg`
 * shape in spirit — a denormalized, control-friendly projection of the config —
 * but scoped to the fields that meaningfully change the emitted embed.
 */
export interface EmbedFormState {
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
  position: BannerPosition;
  overlay: boolean;
  themeMode: ThemeMode;
  accent: string;
  borderRadius: number;
  fontFamily: string;

  /* Banner CTAs */
  showRejectButton: boolean;
  showPreferencesButton: boolean;

  /* Behavior */
  showMode: ShowMode;
  consentModel: ConsentModel;
  respectDoNotTrack: boolean;
  respectGpc: boolean;
  hideAfterChoice: boolean;
  floatingButton: boolean;

  /* Consent Mode */
  enableConsentMode: boolean;

  /* Gated scripts */
  scripts: ScriptFormState[];
}

/* -------------------------------------------------------------------------- */
/* Defaults                                                                   */
/* -------------------------------------------------------------------------- */

/** The optional categories the page exposes, in display order. */
export const OPTIONAL_CATEGORY_IDS: readonly OptionalCategoryId[] = [
  "analytics",
  "marketing",
  "preferences",
];

/** Look up a default category (by id) from the shared source of truth. */
function defaultCategory(id: string) {
  return DEFAULT_CONFIG.categories.find((c) => c.id === id);
}

/**
 * A form state seeded from {@link DEFAULT_CONFIG}, so the page opens on the same
 * sensible defaults the plugin and runtime already agree on. Deep-cloned per call
 * so callers can mutate freely.
 */
export function defaultFormState(): EmbedFormState {
  const d = DEFAULT_CONFIG;
  const catState = (id: OptionalCategoryId): CategoryFormState => {
    const base = defaultCategory(id);
    return {
      // Marketing/preferences ship off-by-inclusion? No — all three defaults are
      // present in DEFAULT_CONFIG, so include them all and mirror their opt-out
      // default. The user can drop any of them.
      enabled: base !== undefined,
      defaultOn: base?.defaultEnabled ?? false,
    };
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
    position: d.banner.position,
    overlay: d.banner.overlay,
    themeMode: d.theme.mode,
    accent: d.theme.accent,
    borderRadius: d.theme.borderRadius,
    fontFamily: d.theme.fontFamily,
    showRejectButton: d.banner.showRejectButton,
    showPreferencesButton: d.banner.showPreferencesButton,
    showMode: d.behavior.showMode,
    consentModel: d.behavior.consentModel,
    respectDoNotTrack: d.behavior.respectDoNotTrack,
    respectGpc: d.behavior.respectGpc,
    hideAfterChoice: d.behavior.hideAfterChoice,
    floatingButton: d.advanced.floatingButton,
    enableConsentMode: d.consentMode.enableConsentMode,
    scripts: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Mapping                                                                    */
/* -------------------------------------------------------------------------- */

/** Build the ordered `categories` array from the form's inclusion/opt-out flags. */
function categoriesFromForm(state: EmbedFormState): CookieConsentConfig["categories"] {
  const out: CookieConsentConfig["categories"] = [];
  // `necessary` is always present and always on — take it verbatim from defaults.
  const necessary = defaultCategory("necessary");
  if (necessary) out.push({ ...necessary, signals: [...necessary.signals] });
  for (const id of OPTIONAL_CATEGORY_IDS) {
    const form = state.categories[id];
    if (!form.enabled) continue;
    const base = defaultCategory(id);
    if (!base) continue;
    out.push({
      ...base,
      signals: [...base.signals],
      defaultEnabled: form.defaultOn,
    });
  }
  return out;
}

/** Build the gated-scripts array, dropping entries with no payload. */
function scriptsFromForm(state: EmbedFormState): ManagedScript[] {
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

/** Best-effort host extraction for the `provider` label; never throws. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/**
 * Map the flat {@link EmbedFormState} to a complete, validated config.
 *
 * Builds a {@link DeepPartial} of the fields the page controls and runs it
 * through the shared {@link mergeConfig}, so every untouched field keeps its
 * default and the result is always runtime-valid.
 *
 * @param state - The current form state.
 * @returns A complete {@link CookieConsentConfig} ready for {@link buildEmbedSnippet}.
 */
export function configFromForm(state: EmbedFormState): CookieConsentConfig {
  const partial: DeepPartial<CookieConsentConfig> = {
    categories: categoriesFromForm(state),
    consentMode: { enableConsentMode: state.enableConsentMode },
    behavior: {
      showMode: state.showMode,
      consentModel: state.consentModel,
      respectDoNotTrack: state.respectDoNotTrack,
      respectGpc: state.respectGpc,
      hideAfterChoice: state.hideAfterChoice,
    },
    banner: {
      layout: state.layout,
      position: state.position,
      overlay: state.overlay,
      showRejectButton: state.showRejectButton,
      showPreferencesButton: state.showPreferencesButton,
    },
    theme: {
      accent: state.accent,
      mode: state.themeMode,
      borderRadius: state.borderRadius,
      fontFamily: state.fontFamily,
    },
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
    advanced: {
      floatingButton: state.floatingButton,
    },
  };
  return mergeConfig(partial);
}

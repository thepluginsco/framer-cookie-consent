/**
 * Consent configuration schema — SINGLE SOURCE OF TRUTH.
 *
 * This module defines the complete shape of the banner configuration that the
 * Framer plugin ("Consentful") produces and the runtime consumes. BOTH halves
 * import from here so their expectations can never diverge.
 *
 * Design rules for this file:
 * - No external dependencies. It is imported by a <20KB browser runtime.
 * - Every exported symbol is JSDoc-documented.
 * - {@link mergeConfig}, {@link serialize}, and {@link parse} are PURE: they
 *   never mutate their inputs (including {@link DEFAULT_CONFIG}) and always
 *   return fresh objects, so they are trivially unit-testable.
 */

/* -------------------------------------------------------------------------- */
/* Meta                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Schema version. Bump when the config shape changes in a breaking way so that
 * {@link mergeConfig} can migrate older embedded configs forward.
 */
export const CONFIG_SCHEMA_VERSION = 2 as const;

/* -------------------------------------------------------------------------- */
/* Consent categories & Consent Mode                                          */
/* -------------------------------------------------------------------------- */

/**
 * The Google Consent Mode v2 signals a category can control. The four ad /
 * analytics signals are the ones the runtime broadcasts as `granted`/`denied`;
 * `security_storage` is always granted and `functionality_storage` /
 * `personalization_storage` are surfaced for completeness in the UI.
 * @see https://developers.google.com/tag-platform/security/guides/consent
 */
export type ConsentModeSignal =
  | 'ad_storage'
  | 'analytics_storage'
  | 'ad_user_data'
  | 'ad_personalization'
  | 'functionality_storage'
  | 'personalization_storage'
  | 'security_storage';

/** The four signals the runtime actually flips granted/denied per consent. */
export const GRANTABLE_SIGNALS: readonly ConsentModeSignal[] = [
  'ad_storage',
  'analytics_storage',
  'ad_user_data',
  'ad_personalization',
];

/** Canonical id for a well-known category. Custom category ids are also allowed. */
export type KnownCategoryId = 'necessary' | 'functional' | 'analytics' | 'marketing' | 'preferences';

/**
 * A single consent category the visitor can accept or reject.
 *
 * The `necessary` category is special: it is always `required` and maps to no
 * grantable signals — {@link mergeConfig} enforces this regardless of input.
 */
export interface ConsentCategory {
  /** Stable identifier, referenced by {@link ManagedScript.category}. */
  id: KnownCategoryId | (string & {});
  /** Human-readable name shown in the preferences UI. */
  label: string;
  /** One-line explanation of what this category is used for. */
  description: string;
  /** If true, the category is always on and cannot be toggled off. */
  required: boolean;
  /**
   * Whether the category's toggle starts ON in the preferences dialog (an
   * opt-out default). Ignored for `required` categories, which are always on.
   */
  defaultEnabled: boolean;
  /** Consent Mode v2 signals granted when this category is accepted. */
  signals: ConsentModeSignal[];
}

/** Google Consent Mode v2 wiring. */
export interface ConsentModeConfig {
  /** Master switch for emitting Consent Mode signals at all. */
  enableConsentMode: boolean;
  /** Forward consent state across ad-click redirects via URL params. */
  enableUrlPassthrough: boolean;
  /** Redact ad-click identifiers while `ad_storage` is denied. */
  enableAdsDataRedaction: boolean;
  /** How long tags should wait for an update after the default is set (ms). */
  waitForUpdateMs: number;
}

/* -------------------------------------------------------------------------- */
/* Behavior                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * When the banner is shown to visitors.
 * - `everywhere` — every visitor, worldwide.
 * - `eu-only`    — only visitors detected in the EU / EEA (+ UK / CH / CA).
 * - `by-region`  — a custom region rule (Pro).
 */
export type ShowMode = 'everywhere' | 'eu-only' | 'by-region';

/** Non-visual behavioural policy for the banner. */
export interface BehaviorConfig {
  /** Who sees the banner (see {@link ShowMode}). */
  showMode: ShowMode;
  /** If true, treat a browser Do Not Track signal as a rejection. */
  respectDoNotTrack: boolean;
  /** Remove the banner once the visitor has made a choice. */
  hideAfterChoice: boolean;
  /** Refresh the page when consent changes so tags re-evaluate. */
  reloadOnChange: boolean;
  /**
   * Opaque version tag for the consent copy. Changing it invalidates prior
   * decisions and re-prompts everyone (used for material policy changes).
   */
  reconsentVersion: string;
  /** Days a stored decision remains valid before re-prompting. */
  consentExpiryDays: number;
}

/* -------------------------------------------------------------------------- */
/* Geo (accurate region source — Pro)                                         */
/* -------------------------------------------------------------------------- */

/**
 * Accurate region detection (Pro). The free default infers a coarse region from
 * the browser time zone (see the runtime's `geo` module) — good enough to fail
 * safe, but fooled by VPNs/travel. When {@link GeoConfig.endpoint} is set, the
 * runtime instead asks that endpoint for the visitor's real country (typically a
 * tiny Cloudflare Worker echoing the `cf-ipcountry` request header), and merges
 * the authoritative answer over the heuristic. Empty endpoint = free heuristic.
 */
export interface GeoConfig {
  /**
   * URL of a region endpoint returning the visitor's country. Empty string uses
   * the free client-side heuristic and makes NO network call. The endpoint must
   * return JSON like `{ "country": "DE" }` (an ISO-3166-1 alpha-2 code); a
   * `region` field of `"US-CA"` may be sent to flag California.
   */
  endpoint: string;
}

/* -------------------------------------------------------------------------- */
/* Analytics (consent event collection — Pro)                                 */
/* -------------------------------------------------------------------------- */

/**
 * Consent analytics (Pro). When {@link AnalyticsConfig.endpoint} is set, the
 * runtime sends a tiny, **anonymous** event on each consent decision (the
 * decision type + which categories were granted — NO IP, cookies, or identifiers)
 * to that endpoint, typically a Cloudflare Worker that keeps daily aggregate
 * counts. The plugin's Insights tab reads those aggregates back to show
 * accept/reject rates. Empty endpoint = disabled, and NO event is ever sent.
 */
export interface AnalyticsConfig {
  /** URL of the collection endpoint. Empty disables analytics entirely. */
  endpoint: string;
}

/* -------------------------------------------------------------------------- */
/* Banner layout                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Where the banner is anchored on screen. Only meaningful for the `card`
 * layout; `bar` always spans the bottom edge and `modal` is always centered.
 */
export type BannerPosition =
  | 'bottom-left'
  | 'bottom-right'
  | 'bottom-center'
  | 'center';

/** Visual shape of the banner. */
export type BannerLayout = 'card' | 'bar' | 'modal';

/** Layout / call-to-action configuration for the banner. */
export interface BannerConfig {
  /** `card` floats a compact box; `bar` spans the bottom; `modal` is centered. */
  layout: BannerLayout;
  /** Anchor position on screen (card layout only). */
  position: BannerPosition;
  /** Dim and block the page behind the banner with a backdrop overlay. */
  overlay: boolean;
  /** Show an explicit "Reject all" button (recommended for GDPR). */
  showRejectButton: boolean;
  /** Show a "Manage preferences" control that opens per-category toggles. */
  showPreferencesButton: boolean;
}

/* -------------------------------------------------------------------------- */
/* Styling                                                                    */
/* -------------------------------------------------------------------------- */

/** Which colour scheme the banner renders in. */
export type ThemeMode = 'light' | 'dark' | 'auto';

/**
 * Visual theme. The banner derives its full palette (background, text, borders)
 * from {@link ThemeConfig.mode} and {@link ThemeConfig.accent}; only the accent,
 * mode, corner radius and font are author-controlled — matching the Consentful
 * Style tab exactly.
 */
export interface ThemeConfig {
  /** Accent colour (buttons, links, toggles). Any valid CSS color string. */
  accent: string;
  /** Light, dark, or follow the visitor's system preference. */
  mode: ThemeMode;
  /** Corner radius in pixels. */
  borderRadius: number;
  /** CSS font-family. `inherit` adopts the site's font. */
  fontFamily: string;
}

/* -------------------------------------------------------------------------- */
/* Text / i18n                                                                */
/* -------------------------------------------------------------------------- */

/** Localizable label + description for one category, keyed by category id. */
export interface CategoryStrings {
  /** Overrides {@link ConsentCategory.label} at render time. */
  label: string;
  /** Overrides {@link ConsentCategory.description} at render time. */
  description: string;
}

/**
 * The subset of {@link StringsConfig} that can be translated per-locale. Excludes
 * the privacy-policy URL (a URL, not copy), `poweredByHidden` (a license flag),
 * and `translations` itself (no nesting). Every field is optional in a
 * translation: missing keys fall back to the base {@link StringsConfig}.
 */
export interface LocaleStrings {
  /** Banner heading. */
  title: string;
  /** Banner body copy. */
  message: string;
  /** Accept-all button label. */
  acceptAll: string;
  /** Reject-all button label. */
  rejectAll: string;
  /** Manage-preferences control label. */
  customize: string;
  /** Save-choices button label. */
  savePreferences: string;
  /** Privacy policy link label (the URL stays shared across locales). */
  privacyPolicyLabel: string;
  /** Per-category copy overrides, keyed by category id. */
  categories: Record<string, CategoryStrings>;
}

/**
 * All user-facing copy. `categories` holds per-category label/description
 * overrides keyed by {@link ConsentCategory.id}, kept here (not only on the
 * category) so the whole UI can be localized from one object.
 */
export interface StringsConfig {
  /** Banner heading. */
  title: string;
  /** Banner body copy. */
  message: string;
  /** Accept-all button label. */
  acceptAll: string;
  /** Reject-all button label. */
  rejectAll: string;
  /** Manage-preferences / customize control label. */
  customize: string;
  /** Save-choices button label (in the preferences view). */
  savePreferences: string;
  /** Privacy policy link label. */
  privacyPolicyLabel: string;
  /** Privacy policy URL. */
  privacyPolicyUrl: string;
  /** Per-category copy overrides, keyed by category id. */
  categories: Record<string, CategoryStrings>;
  /** Hide the "Powered by" credit (white-label; gated by license tier). */
  poweredByHidden: boolean;
  /**
   * Per-locale copy overrides (Pro), keyed by a lowercase language subtag
   * (`'de'`, `'fr'`, `'pt'`). The runtime picks the entry matching the visitor's
   * browser language and overlays it on the base copy; unmatched visitors get
   * the base copy. Empty by default.
   */
  translations: Record<string, Partial<LocaleStrings>>;
}

/* -------------------------------------------------------------------------- */
/* Managed (gated) scripts                                                    */
/* -------------------------------------------------------------------------- */

/** How a managed script is delivered. */
export type ScriptType = 'src' | 'inline';

/**
 * A tracking tag the runtime should hold back until the visitor consents to its
 * {@link ManagedScript.category}. The blocker activates it afterwards.
 */
export interface ManagedScript {
  /** Stable identifier for this script entry. */
  id: string;
  /** Human-readable name shown in the plugin (e.g. "Google Analytics 4"). */
  name: string;
  /** Source domain shown in the plugin (e.g. "googletagmanager.com"). */
  provider: string;
  /** Optional vendor tag id shown in the plugin (e.g. "G-4XZ8QP"). */
  tagId: string;
  /** Category id whose consent unblocks this script. */
  category: KnownCategoryId | (string & {});
  /** `src` loads an external URL; `inline` executes inline code. */
  type: ScriptType;
  /** The `src` URL (for `src`) or the code body (for `inline`). */
  value: string;
  /** Whether to load the (`src`) script asynchronously. */
  async: boolean;
}

/* -------------------------------------------------------------------------- */
/* Advanced                                                                   */
/* -------------------------------------------------------------------------- */

/** Where the persistent re-open button floats. */
export type FloatingButtonPosition =
  | 'bottom-left'
  | 'bottom-right'
  | 'top-left'
  | 'top-right';

/** Power-user / convenience options. */
export interface AdvancedConfig {
  /** Extra CSS injected alongside the banner styles. */
  customCss: string;
  /**
   * Optional Google tag id (e.g. `G-XXXX` / `AW-XXXX`). When set, the runtime
   * can bootstrap a minimal `gtag` for Consent Mode convenience.
   */
  googleTagId: string | null;
  /** Show a small persistent "cookie settings" button after consent. */
  floatingButton: boolean;
  /** Corner the floating button sits in. */
  floatingButtonPosition: FloatingButtonPosition;
}

/* -------------------------------------------------------------------------- */
/* License                                                                    */
/* -------------------------------------------------------------------------- */

/** License tier, validated client-side via a Lemon Squeezy key. */
export type LicenseTier = 'trial' | 'lifetime' | 'pro' | 'agency';

/** Licensing state embedded in the config. */
export interface LicenseConfig {
  /** Lemon Squeezy license key, or `null` on the free trial. */
  key: string | null;
  /** Entitlement tier resolved from the key. */
  tier: LicenseTier;
  /** Whether white-labelling (hiding the credit) is entitled. */
  whiteLabel: boolean;
}

/* -------------------------------------------------------------------------- */
/* Root config                                                                */
/* -------------------------------------------------------------------------- */

/** Meta section for forward-migration. */
export interface MetaConfig {
  /** Schema version this config was written against. */
  schemaVersion: number;
}

/**
 * The complete cookie-consent configuration. This is the ONLY contract shared
 * between the plugin (writer) and the runtime (reader).
 */
export interface CookieConsentConfig {
  /** Versioning/migration metadata. */
  meta: MetaConfig;
  /** Ordered list of consent categories. */
  categories: ConsentCategory[];
  /** Google Consent Mode v2 wiring. */
  consentMode: ConsentModeConfig;
  /** Behavioural policy (when/how the banner shows). */
  behavior: BehaviorConfig;
  /** Accurate region source (Pro); empty endpoint uses the free heuristic. */
  geo: GeoConfig;
  /** Anonymous consent analytics (Pro); empty endpoint = disabled. */
  analytics: AnalyticsConfig;
  /** Banner layout and CTAs. */
  banner: BannerConfig;
  /** Visual theme. */
  theme: ThemeConfig;
  /** User-facing copy. */
  strings: StringsConfig;
  /** Tracking scripts to gate behind consent. */
  scripts: ManagedScript[];
  /** Advanced / convenience options. */
  advanced: AdvancedConfig;
  /** Licensing state. */
  license: LicenseConfig;
}

/* -------------------------------------------------------------------------- */
/* Defaults                                                                    */
/* -------------------------------------------------------------------------- */

/** Every recognized Consent Mode signal, for validation. */
const ALL_SIGNALS: readonly ConsentModeSignal[] = [
  'ad_storage',
  'analytics_storage',
  'ad_user_data',
  'ad_personalization',
  'functionality_storage',
  'personalization_storage',
  'security_storage',
];

/**
 * The default consent categories. Kept as a named const so the default
 * per-category strings ({@link defaultCategoryStrings}) can be DERIVED from it
 * instead of duplicating every label/description literal (which also keeps the
 * shipped runtime bundle lean).
 */
const DEFAULT_CATEGORIES: ConsentCategory[] = [
  {
    id: 'necessary',
    label: 'Strictly necessary',
    description: 'Required for the site to function. Cannot be switched off.',
    required: true,
    defaultEnabled: true,
    signals: ['security_storage'],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'Helps us understand how visitors use the site.',
    required: false,
    defaultEnabled: true,
    signals: ['analytics_storage'],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    description: 'Used to deliver relevant ads and measure campaigns.',
    required: false,
    defaultEnabled: false,
    signals: ['ad_storage', 'ad_user_data', 'ad_personalization'],
  },
  {
    id: 'preferences',
    label: 'Preferences',
    description: 'Remembers choices like language and region.',
    required: false,
    defaultEnabled: false,
    signals: ['functionality_storage'],
  },
];

/** Build the default per-category string overrides from {@link DEFAULT_CATEGORIES}. */
function defaultCategoryStrings(): Record<string, CategoryStrings> {
  const out: Record<string, CategoryStrings> = {};
  for (const c of DEFAULT_CATEGORIES) out[c.id] = { label: c.label, description: c.description };
  return out;
}

/**
 * A complete, valid default configuration. Every field is populated; this is
 * the base that {@link mergeConfig} fills partials onto. Treat as immutable —
 * the merge helpers deep-clone before returning, never mutating this object.
 */
export const DEFAULT_CONFIG: CookieConsentConfig = {
  meta: { schemaVersion: CONFIG_SCHEMA_VERSION },
  categories: DEFAULT_CATEGORIES,
  consentMode: {
    enableConsentMode: true,
    enableUrlPassthrough: false,
    enableAdsDataRedaction: true,
    waitForUpdateMs: 500,
  },
  behavior: {
    showMode: 'eu-only',
    respectDoNotTrack: true,
    hideAfterChoice: true,
    reloadOnChange: false,
    reconsentVersion: '1',
    consentExpiryDays: 180,
  },
  geo: {
    endpoint: '',
  },
  analytics: {
    endpoint: '',
  },
  banner: {
    layout: 'card',
    position: 'bottom-right',
    overlay: false,
    showRejectButton: true,
    showPreferencesButton: true,
  },
  theme: {
    accent: '#2F6FED',
    mode: 'light',
    borderRadius: 16,
    fontFamily: 'inherit',
  },
  strings: {
    title: 'We value your privacy',
    message:
      'We use cookies to improve your experience, analyze traffic and personalize content. Choose which categories to allow.',
    acceptAll: 'Accept all',
    rejectAll: 'Reject all',
    customize: 'Manage preferences',
    savePreferences: 'Save choices',
    privacyPolicyLabel: 'Privacy Policy',
    privacyPolicyUrl: 'https://yoursite.com/privacy',
    categories: defaultCategoryStrings(),
    poweredByHidden: false,
    translations: {},
  },
  scripts: [],
  advanced: {
    customCss: '',
    googleTagId: null,
    floatingButton: false,
    floatingButtonPosition: 'bottom-left',
  },
  license: {
    key: null,
    tier: 'trial',
    whiteLabel: false,
  },
};

/* -------------------------------------------------------------------------- */
/* Deep-partial + primitive coercion helpers                                  */
/* -------------------------------------------------------------------------- */

/**
 * Recursively-optional version of a type. Arrays keep their element shape (also
 * made deep-partial); primitives are unchanged. Used as the accepted input to
 * {@link mergeConfig}.
 */
export type DeepPartial<T> = T extends readonly (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** Coerce to a string, falling back when the value is not a string. */
function strOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/** Coerce to `string | null`, falling back when the value is neither. */
function strOrNull(value: unknown, fallback: string | null): string | null {
  if (typeof value === 'string') return value;
  if (value === null) return null;
  return fallback;
}

/** Coerce to a boolean, falling back when the value is not a boolean. */
function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Coerce to a finite number, falling back otherwise, then clamp to [min, max]. */
function numOr(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

/** Return `value` if it is one of `allowed`, otherwise `fallback`. */
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Keep only recognized Consent Mode signals from an arbitrary input array. */
function normalizeSignals(input: unknown): ConsentModeSignal[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const all = ALL_SIGNALS as readonly string[];
  return input.filter((s): s is ConsentModeSignal => typeof s === 'string' && all.includes(s));
}

/* -------------------------------------------------------------------------- */
/* Section mergers (each pure: reads defaults + partial, returns fresh object) */
/* -------------------------------------------------------------------------- */

const SHOW_MODES: readonly ShowMode[] = ['everywhere', 'eu-only', 'by-region'];
const POSITIONS: readonly BannerPosition[] = [
  'bottom-left',
  'bottom-right',
  'bottom-center',
  'center',
];
const LAYOUTS: readonly BannerLayout[] = ['card', 'bar', 'modal'];
const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'auto'];
const SCRIPT_TYPES: readonly ScriptType[] = ['src', 'inline'];
const FLOATING_POSITIONS: readonly FloatingButtonPosition[] = [
  'bottom-left',
  'bottom-right',
  'top-left',
  'top-right',
];
const TIERS: readonly LicenseTier[] = ['trial', 'lifetime', 'pro', 'agency'];

/** Deep-clone one category (so defaults are never shared by reference). */
function cloneCategory(c: ConsentCategory): ConsentCategory {
  return { ...c, signals: [...c.signals] };
}

/** Normalize a single (possibly partial/legacy) category onto known defaults. */
function normalizeCategory(
  input: DeepPartial<ConsentCategory>,
  byId: ReadonlyMap<string, ConsentCategory>,
): ConsentCategory {
  const id = strOr(input.id, 'category');
  const base = byId.get(id);
  const required = boolOr(input.required, base?.required ?? false);
  const category: ConsentCategory = {
    id,
    label: strOr(input.label, base?.label ?? id),
    description: strOr(input.description, base?.description ?? ''),
    required,
    defaultEnabled: boolOr(input.defaultEnabled, base?.defaultEnabled ?? true),
    signals: normalizeSignals(input.signals) ?? (base ? [...base.signals] : []),
  };
  // The `necessary` category is always on (and pre-enabled), never opt-out.
  if (id === 'necessary') {
    category.required = true;
    category.defaultEnabled = true;
  }
  // Required categories are always enabled.
  if (category.required) category.defaultEnabled = true;
  return category;
}

/** Merge the categories array; a provided array is authoritative but normalized. */
function mergeCategories(
  d: ConsentCategory[],
  p: DeepPartial<ConsentCategory>[] | undefined,
): ConsentCategory[] {
  const byId = new Map(d.map((c) => [c.id, c] as const));
  if (!Array.isArray(p)) return d.map(cloneCategory);
  return p.map((pc) => normalizeCategory(pc, byId));
}

/** Merge Consent Mode config. */
function mergeConsentMode(
  d: ConsentModeConfig,
  p: DeepPartial<ConsentModeConfig> | undefined,
): ConsentModeConfig {
  return {
    enableConsentMode: boolOr(p?.enableConsentMode, d.enableConsentMode),
    enableUrlPassthrough: boolOr(p?.enableUrlPassthrough, d.enableUrlPassthrough),
    enableAdsDataRedaction: boolOr(p?.enableAdsDataRedaction, d.enableAdsDataRedaction),
    waitForUpdateMs: numOr(p?.waitForUpdateMs, d.waitForUpdateMs, 0, 10_000),
  };
}

/** Merge behavioural config. */
function mergeBehavior(d: BehaviorConfig, p: DeepPartial<BehaviorConfig> | undefined): BehaviorConfig {
  return {
    showMode: oneOf(p?.showMode, SHOW_MODES, d.showMode),
    respectDoNotTrack: boolOr(p?.respectDoNotTrack, d.respectDoNotTrack),
    hideAfterChoice: boolOr(p?.hideAfterChoice, d.hideAfterChoice),
    reloadOnChange: boolOr(p?.reloadOnChange, d.reloadOnChange),
    reconsentVersion: strOr(p?.reconsentVersion, d.reconsentVersion),
    consentExpiryDays: numOr(p?.consentExpiryDays, d.consentExpiryDays, 0, 3650),
  };
}

/** Merge geo (accurate region source) config. */
function mergeGeo(d: GeoConfig, p: DeepPartial<GeoConfig> | undefined): GeoConfig {
  return {
    endpoint: strOr(p?.endpoint, d.endpoint),
  };
}

/** Merge analytics (consent event collection) config. */
function mergeAnalytics(d: AnalyticsConfig, p: DeepPartial<AnalyticsConfig> | undefined): AnalyticsConfig {
  return {
    endpoint: strOr(p?.endpoint, d.endpoint),
  };
}

/** Merge banner layout config. */
function mergeBanner(d: BannerConfig, p: DeepPartial<BannerConfig> | undefined): BannerConfig {
  return {
    layout: oneOf(p?.layout, LAYOUTS, d.layout),
    position: oneOf(p?.position, POSITIONS, d.position),
    overlay: boolOr(p?.overlay, d.overlay),
    showRejectButton: boolOr(p?.showRejectButton, d.showRejectButton),
    showPreferencesButton: boolOr(p?.showPreferencesButton, d.showPreferencesButton),
  };
}

/** Merge visual theme. */
function mergeTheme(d: ThemeConfig, p: DeepPartial<ThemeConfig> | undefined): ThemeConfig {
  return {
    accent: strOr(p?.accent, d.accent),
    mode: oneOf(p?.mode, THEME_MODES, d.mode),
    borderRadius: numOr(p?.borderRadius, d.borderRadius, 0, 40),
    fontFamily: strOr(p?.fontFamily, d.fontFamily),
  };
}

/** Merge the per-category string overrides record. */
function mergeCategoryStrings(
  d: Record<string, CategoryStrings>,
  p: Record<string, DeepPartial<CategoryStrings> | undefined> | undefined,
): Record<string, CategoryStrings> {
  const out: Record<string, CategoryStrings> = {};
  for (const [k, v] of Object.entries(d)) {
    out[k] = { label: v.label, description: v.description };
  }
  if (p && typeof p === 'object') {
    for (const [k, v] of Object.entries(p)) {
      const base = out[k];
      out[k] = {
        label: strOr(v?.label, base?.label ?? k),
        description: strOr(v?.description, base?.description ?? ''),
      };
    }
  }
  return out;
}

/** Keys of {@link LocaleStrings} that are simple strings (not the categories map). */
const LOCALE_STRING_KEYS: readonly Exclude<keyof LocaleStrings, 'categories'>[] = [
  'title',
  'message',
  'acceptAll',
  'rejectAll',
  'customize',
  'savePreferences',
  'privacyPolicyLabel',
];

/**
 * Normalize one locale's partial overrides: keep only recognized string fields
 * that are actually strings, plus a sanitized `categories` map. Unknown keys and
 * wrong-typed values are dropped, so a corrupt embed can't inject junk.
 */
function normalizeLocale(input: DeepPartial<LocaleStrings> | undefined): Partial<LocaleStrings> {
  const out: Partial<LocaleStrings> = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of LOCALE_STRING_KEYS) {
    const v = (input as Record<string, unknown>)[key];
    if (typeof v === 'string') out[key] = v;
  }
  if (input.categories && typeof input.categories === 'object') {
    const cats: Record<string, CategoryStrings> = {};
    for (const [id, cs] of Object.entries(input.categories)) {
      if (cs && typeof cs === 'object') {
        cats[id] = { label: strOr(cs.label, ''), description: strOr(cs.description, '') };
      }
    }
    if (Object.keys(cats).length > 0) out.categories = cats;
  }
  return out;
}

/** Merge the per-locale translations map (a provided map replaces defaults, sanitized). */
function mergeTranslations(
  d: Record<string, Partial<LocaleStrings>>,
  p: Record<string, DeepPartial<LocaleStrings> | undefined> | undefined,
): Record<string, Partial<LocaleStrings>> {
  const source = p && typeof p === 'object' ? p : d;
  const out: Record<string, Partial<LocaleStrings>> = {};
  for (const [locale, overrides] of Object.entries(source)) {
    const code = locale.trim().toLowerCase();
    if (code) out[code] = normalizeLocale(overrides);
  }
  return out;
}

/** Merge user-facing copy. */
function mergeStrings(d: StringsConfig, p: DeepPartial<StringsConfig> | undefined): StringsConfig {
  return {
    title: strOr(p?.title, d.title),
    message: strOr(p?.message, d.message),
    acceptAll: strOr(p?.acceptAll, d.acceptAll),
    rejectAll: strOr(p?.rejectAll, d.rejectAll),
    customize: strOr(p?.customize, d.customize),
    savePreferences: strOr(p?.savePreferences, d.savePreferences),
    privacyPolicyLabel: strOr(p?.privacyPolicyLabel, d.privacyPolicyLabel),
    privacyPolicyUrl: strOr(p?.privacyPolicyUrl, d.privacyPolicyUrl),
    categories: mergeCategoryStrings(d.categories, p?.categories),
    poweredByHidden: boolOr(p?.poweredByHidden, d.poweredByHidden),
    translations: mergeTranslations(d.translations, p?.translations),
  };
}

/** Normalize a single managed script entry. */
function normalizeScript(input: DeepPartial<ManagedScript>, index: number): ManagedScript {
  return {
    id: strOr(input.id, `script-${index}`),
    name: strOr(input.name, strOr(input.provider, 'Managed script')),
    provider: strOr(input.provider, ''),
    tagId: strOr(input.tagId, ''),
    category: strOr(input.category, 'marketing'),
    type: oneOf(input.type, SCRIPT_TYPES, 'src'),
    value: strOr(input.value, ''),
    async: boolOr(input.async, true),
  };
}

/** Merge the managed scripts array (a provided array replaces defaults). */
function mergeScripts(d: ManagedScript[], p: DeepPartial<ManagedScript>[] | undefined): ManagedScript[] {
  if (!Array.isArray(p)) return d.map((s) => ({ ...s }));
  return p.map(normalizeScript);
}

/** Merge advanced options. */
function mergeAdvanced(d: AdvancedConfig, p: DeepPartial<AdvancedConfig> | undefined): AdvancedConfig {
  return {
    customCss: strOr(p?.customCss, d.customCss),
    googleTagId: strOrNull(p?.googleTagId, d.googleTagId),
    floatingButton: boolOr(p?.floatingButton, d.floatingButton),
    floatingButtonPosition: oneOf(p?.floatingButtonPosition, FLOATING_POSITIONS, d.floatingButtonPosition),
  };
}

/** Merge license state. */
function mergeLicense(d: LicenseConfig, p: DeepPartial<LicenseConfig> | undefined): LicenseConfig {
  return {
    key: strOrNull(p?.key, d.key),
    tier: oneOf(p?.tier, TIERS, d.tier),
    whiteLabel: boolOr(p?.whiteLabel, d.whiteLabel),
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Deep-merge a partial (possibly from an older schema version) onto
 * {@link DEFAULT_CONFIG}, filling every missing or invalid field so an old
 * embedded config never breaks a published site.
 *
 * Guarantees:
 * - PURE: does not mutate `partial` or {@link DEFAULT_CONFIG}; returns a fresh,
 *   fully-populated object every time.
 * - RUNTIME-SAFE: wrong-typed or unknown-enum values fall back to defaults
 *   rather than propagating; the `necessary` category is always required.
 * - MIGRATING: the returned `meta.schemaVersion` is always the current
 *   {@link CONFIG_SCHEMA_VERSION}.
 *
 * @param partial - Any subset of a config (e.g. parsed from embedded code).
 * @returns A complete, valid {@link CookieConsentConfig}.
 */
export function mergeConfig(partial: DeepPartial<CookieConsentConfig> = {}): CookieConsentConfig {
  const d = DEFAULT_CONFIG;
  return {
    meta: { schemaVersion: CONFIG_SCHEMA_VERSION },
    categories: mergeCategories(d.categories, partial.categories),
    consentMode: mergeConsentMode(d.consentMode, partial.consentMode),
    behavior: mergeBehavior(d.behavior, partial.behavior),
    geo: mergeGeo(d.geo, partial.geo),
    analytics: mergeAnalytics(d.analytics, partial.analytics),
    banner: mergeBanner(d.banner, partial.banner),
    theme: mergeTheme(d.theme, partial.theme),
    strings: mergeStrings(d.strings, partial.strings),
    scripts: mergeScripts(d.scripts, partial.scripts),
    advanced: mergeAdvanced(d.advanced, partial.advanced),
    license: mergeLicense(d.license, partial.license),
  };
}

/**
 * Serialize a config to compact JSON for embedding into injected custom code.
 * Pure; does not mutate the input.
 *
 * @param config - The config to serialize.
 * @returns A compact (no-whitespace) JSON string.
 */
export function serialize(config: CookieConsentConfig): string {
  return JSON.stringify(config);
}

/**
 * Parse a serialized config back into a complete, valid {@link CookieConsentConfig}.
 * Runs the result through {@link mergeConfig}, so missing fields are filled and
 * older schemas are migrated. On malformed JSON it returns a fresh default
 * config rather than throwing, so a corrupt embed can never break a live site.
 *
 * @param str - A string previously produced by {@link serialize} (or legacy).
 * @returns A complete, valid config.
 */
export function parse(str: string): CookieConsentConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(str);
  } catch {
    return mergeConfig();
  }
  const partial: DeepPartial<CookieConsentConfig> =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as DeepPartial<CookieConsentConfig>)
      : {};
  return mergeConfig(partial);
}

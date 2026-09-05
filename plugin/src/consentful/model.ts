/**
 * The Consentful editor model.
 *
 * The design mock is authored against a flat `cfg` object; the plugin's real
 * state is the shared {@link CookieConsentConfig}. This module maps between the
 * two (pure {@link toCfg}) and exposes a {@link useConsentful} hook that returns
 * the derived `cfg` plus every action the UI needs — each action translating a
 * design-shaped edit into an immutable {@link CookieConsentConfig} update that
 * flows through the existing settings engine (debounced save + loader re-inject).
 */

import { useCallback, useMemo } from "react"

import { useSettingsContext } from "../state/settings-context"
import type {
  BannerLayout,
  BannerPosition,
  ConsentModeSignal,
  CookieConsentConfig,
  FloatingButtonPosition,
  LocaleStrings,
  ScriptType,
  ThemeMode,
} from "../types"

/* -------------------------------------------------------------------------- */
/* Design-shaped view model                                                   */
/* -------------------------------------------------------------------------- */

/** When the banner shows, in the design's vocabulary. */
export type ShowWhen = "all" | "eea" | "geo"

/** A consent category in the design's shape. */
export interface CfgCategory {
  id: string
  name: string
  desc: string
  signals: string[]
  /** Toggle starts on (opt-out default). */
  enabled: boolean
  /** Required / always-on. */
  locked: boolean
}

/** A managed script in the design's shape. */
export interface CfgScript {
  name: string
  /** Vendor tag id (design calls this `id`). Display-only, optional. */
  id: string
  /** How the script is delivered: an external `src` URL or an `inline` snippet. */
  type: ScriptType
  /**
   * The actual payload the runtime blocks + injects: the full `src` URL for a
   * `src` script, or the inline code body for an `inline` script. This is what
   * the script blocker turns into a real, executable `<script>` after consent.
   */
  value: string
  cat: string
}

/**
 * Best-effort display host for a `src` script (e.g. `googletagmanager.com` from
 * a full URL). Returns the trimmed value unchanged when it isn't a parseable
 * URL, and `""` for inline scripts (which have no host).
 */
export function scriptHost(script: Pick<CfgScript, "type" | "value">): string {
  if (script.type !== "src") return ""
  const v = script.value.trim()
  if (!v) return ""
  try {
    return new URL(v).host
  } catch {
    return v.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  }
}

/** The flat configuration the Consentful UI edits. */
export interface Cfg {
  accent: string
  radius: number
  layout: BannerLayout
  position: BannerPosition
  overlay: boolean
  theme: ThemeMode
  heading: string
  body: string
  acceptLabel: string
  rejectLabel: string
  manageLabel: string
  saveLabel: string
  privacyUrl: string
  showWhen: ShowWhen
  /** Accurate geo endpoint URL (Pro); empty = free time-zone heuristic. */
  geoEndpoint: string
  /** Consent analytics endpoint URL (Pro); empty = disabled. */
  analyticsEndpoint: string
  expiryDays: number
  waitForUpdate: number
  respectDNT: boolean
  hideAfter: boolean
  reloadOnChange: boolean
  /** Show a floating "cookie settings" button so visitors can reopen/withdraw. */
  floatingButton: boolean
  /** Corner the floating button sits in. */
  floatingButtonPos: FloatingButtonPosition
  consentMode: boolean
  urlPassthrough: boolean
  /**
   * Optional Google tag id (e.g. `G-XXXX` / `GT-XXXX`). When set, the runtime
   * loads gtag.js itself — blocked until consent. Empty = don't manage gtag.
   */
  googleTagId: string
  /** Pro: raw CSS appended last so it overrides the generated banner styles. */
  customCss: string
  licenseKey: string
  plan: "free" | "pro"
  categories: CfgCategory[]
  scripts: CfgScript[]
  /** Locale codes that have translation overrides (Pro multi-language). */
  languages: string[]
}

/** Design text-field keys that map to a translatable {@link LocaleStrings} field. */
export type LocalizableFieldKey =
  | "heading"
  | "body"
  | "acceptLabel"
  | "rejectLabel"
  | "manageLabel"
  | "saveLabel"

/** Map a design text-field key to its (string-valued) {@link LocaleStrings} field. */
export const LOCALE_FIELD_MAP: Record<LocalizableFieldKey, Exclude<keyof LocaleStrings, "categories">> = {
  heading: "title",
  body: "message",
  acceptLabel: "acceptAll",
  rejectLabel: "rejectAll",
  manageLabel: "customize",
  saveLabel: "savePreferences",
}

/** Common languages offered in the "add language" picker (code → English name). */
export const COMMON_LANGUAGES: Array<[string, string]> = [
  ["de", "German"],
  ["fr", "French"],
  ["es", "Spanish"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["nl", "Dutch"],
  ["pl", "Polish"],
  ["sv", "Swedish"],
  ["da", "Danish"],
  ["fi", "Finnish"],
  ["no", "Norwegian"],
  ["cs", "Czech"],
]

/** English display name for a locale code, falling back to the upper-cased code. */
export function languageName(code: string): string {
  const hit = COMMON_LANGUAGES.find(([c]) => c === code)
  return hit ? hit[1] : code.toUpperCase()
}

/* -------------------------------------------------------------------------- */
/* Category presentation tables (from the design)                             */
/* -------------------------------------------------------------------------- */

/** Accent colour per well-known category (falls back to a neutral grey). */
export const CAT_COLOR: Record<string, string> = {
  necessary: "#6B7280",
  analytics: "#2F6FED",
  marketing: "#8B5CF6",
  preferences: "#E8973A",
}
/** Short display name per well-known category. */
export const CAT_NAME: Record<string, string> = {
  necessary: "Necessary",
  analytics: "Analytics",
  marketing: "Marketing",
  preferences: "Preferences",
}
/** Icon (Material Symbols ligature) per well-known category. */
export const CAT_ICON: Record<string, string> = {
  necessary: "shield",
  analytics: "monitoring",
  marketing: "ads_click",
  preferences: "settings",
}

export const catColor = (id: string): string => CAT_COLOR[id] ?? "#6B7280"
export const catIcon = (id: string): string => CAT_ICON[id] ?? "category"

/* -------------------------------------------------------------------------- */
/* Mapping: config <-> cfg                                                    */
/* -------------------------------------------------------------------------- */

const SHOW_WHEN_TO_MODE = { all: "everywhere", eea: "eu-only", geo: "by-region" } as const
const MODE_TO_SHOW_WHEN = { everywhere: "all", "eu-only": "eea", "by-region": "geo" } as const

/** Derive the design `cfg` from the canonical config. Pure. */
export function toCfg(c: CookieConsentConfig): Cfg {
  return {
    accent: c.theme.accent,
    radius: c.theme.borderRadius,
    layout: c.banner.layout,
    position: c.banner.position,
    overlay: c.banner.overlay,
    theme: c.theme.mode,
    heading: c.strings.title,
    body: c.strings.message,
    acceptLabel: c.strings.acceptAll,
    rejectLabel: c.strings.rejectAll,
    manageLabel: c.strings.customize,
    saveLabel: c.strings.savePreferences,
    privacyUrl: c.strings.privacyPolicyUrl,
    showWhen: MODE_TO_SHOW_WHEN[c.behavior.showMode],
    geoEndpoint: c.geo.endpoint,
    analyticsEndpoint: c.analytics.endpoint,
    expiryDays: c.behavior.consentExpiryDays,
    waitForUpdate: c.consentMode.waitForUpdateMs,
    respectDNT: c.behavior.respectDoNotTrack,
    hideAfter: c.behavior.hideAfterChoice,
    reloadOnChange: c.behavior.reloadOnChange,
    floatingButton: c.advanced.floatingButton,
    floatingButtonPos: c.advanced.floatingButtonPosition,
    consentMode: c.consentMode.enableConsentMode,
    urlPassthrough: c.consentMode.enableUrlPassthrough,
    googleTagId: c.advanced.googleTagId ?? "",
    customCss: c.advanced.customCss,
    licenseKey: c.license.key ?? "",
    plan: c.license.tier === "trial" ? "free" : "pro",
    categories: c.categories.map((cat) => ({
      id: cat.id,
      name: cat.label,
      desc: cat.description,
      signals: [...cat.signals],
      enabled: cat.required || cat.defaultEnabled,
      locked: cat.required,
    })),
    scripts: c.scripts.map((s) => ({ name: s.name, id: s.tagId, type: s.type, value: s.value, cat: s.category })),
    languages: Object.keys(c.strings.translations),
  }
}

/** Write the design categories back into the canonical config. Pure; exported for tests. */
export function applyCategories(prev: CookieConsentConfig, cats: CfgCategory[]): CookieConsentConfig {
  const strings = { ...prev.strings.categories }
  for (const cat of cats) {
    strings[cat.id] = { label: cat.name, description: cat.desc }
  }
  return {
    ...prev,
    categories: cats.map((cat) => ({
      id: cat.id,
      label: cat.name,
      description: cat.desc,
      required: cat.locked,
      defaultEnabled: cat.locked ? true : cat.enabled,
      signals: cat.signals as ConsentModeSignal[],
    })),
    strings: { ...prev.strings, categories: strings },
  }
}

/** Write the design scripts back into the canonical config. Pure; exported for tests. */
export function applyScripts(prev: CookieConsentConfig, scripts: CfgScript[]): CookieConsentConfig {
  return {
    ...prev,
    scripts: scripts.map((s, i) => {
      const existing = prev.scripts[i]
      const value = s.value.trim()
      return {
        id: existing?.id ?? `script-${Date.now()}-${i}`,
        name: s.name,
        // `provider` is a display-only domain; derive it from a `src` URL and
        // leave it blank for inline snippets (they have no host).
        provider: scriptHost(s),
        tagId: s.id,
        category: s.cat,
        type: s.type,
        value,
        async: existing?.async ?? true,
      }
    }),
  }
}

/* -------------------------------------------------------------------------- */
/* Presets                                                                     */
/* -------------------------------------------------------------------------- */

/** Optional category presets offered in the Categories empty state. */
export const PRESETS: Record<string, CfgCategory> = {
  analytics: {
    id: "analytics",
    name: "Analytics",
    desc: "Helps us understand how visitors use the site.",
    signals: ["analytics_storage"],
    enabled: true,
    locked: false,
  },
  marketing: {
    id: "marketing",
    name: "Marketing",
    desc: "Used to deliver relevant ads and measure campaigns.",
    signals: ["ad_storage", "ad_user_data", "ad_personalization"],
    enabled: false,
    locked: false,
  },
  preferences: {
    id: "preferences",
    name: "Preferences",
    desc: "Remembers choices like language and region.",
    signals: ["functionality_storage"],
    enabled: false,
    locked: false,
  },
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

/** Everything the Consentful UI needs to read and mutate the configuration. */
export interface ConsentfulModel {
  cfg: Cfg
  /** Save/sync status from the settings engine. */
  status: string
  error: string | null
  /* scalar setters */
  set: <K extends keyof Cfg>(key: K, value: Cfg[K]) => void
  toggle: (key: keyof Cfg) => void
  /* category ops */
  toggleCat: (id: string) => void
  deleteCat: (id: string) => void
  addPreset: (id: string) => void
  createCategory: (draft: { name: string; desc: string; signals: string[]; required: boolean }) => void
  /* script ops */
  deleteScript: (index: number) => void
  createScript: (draft: { name: string; type: ScriptType; value: string; id: string; cat: string }) => void
  /* translation ops (Pro multi-language) */
  addLanguage: (code: string) => void
  removeLanguage: (code: string) => void
  /** Read a locale's override for a design field (empty string when unset). */
  localeValue: (locale: string, key: LocalizableFieldKey) => string
  /** Write a locale's override for a design field (empty clears it). */
  setLocaleValue: (locale: string, key: LocalizableFieldKey, value: string) => void
}

/** Section of {@link Cfg} that maps to a scalar config field. */
type ScalarKey = Exclude<keyof Cfg, "categories" | "scripts">

/** Apply one scalar cfg edit onto the canonical config. */
function applyScalar(prev: CookieConsentConfig, key: ScalarKey, value: unknown): CookieConsentConfig {
  const next: CookieConsentConfig = { ...prev }
  switch (key) {
    case "accent":
      next.theme = { ...prev.theme, accent: value as string }
      break
    case "radius":
      next.theme = { ...prev.theme, borderRadius: value as number }
      break
    case "theme":
      next.theme = { ...prev.theme, mode: value as ThemeMode }
      break
    case "layout":
      next.banner = { ...prev.banner, layout: value as BannerLayout }
      break
    case "position":
      next.banner = { ...prev.banner, position: value as BannerPosition }
      break
    case "overlay":
      next.banner = { ...prev.banner, overlay: value as boolean }
      break
    case "heading":
      next.strings = { ...prev.strings, title: value as string }
      break
    case "body":
      next.strings = { ...prev.strings, message: value as string }
      break
    case "acceptLabel":
      next.strings = { ...prev.strings, acceptAll: value as string }
      break
    case "rejectLabel":
      next.strings = { ...prev.strings, rejectAll: value as string }
      break
    case "manageLabel":
      next.strings = { ...prev.strings, customize: value as string }
      break
    case "saveLabel":
      next.strings = { ...prev.strings, savePreferences: value as string }
      break
    case "privacyUrl":
      next.strings = { ...prev.strings, privacyPolicyUrl: value as string }
      break
    case "showWhen":
      next.behavior = { ...prev.behavior, showMode: SHOW_WHEN_TO_MODE[value as ShowWhen] }
      break
    case "geoEndpoint":
      next.geo = { ...prev.geo, endpoint: value as string }
      break
    case "analyticsEndpoint":
      next.analytics = { ...prev.analytics, endpoint: value as string }
      break
    case "expiryDays":
      next.behavior = { ...prev.behavior, consentExpiryDays: value as number }
      break
    case "respectDNT":
      next.behavior = { ...prev.behavior, respectDoNotTrack: value as boolean }
      break
    case "hideAfter":
      next.behavior = { ...prev.behavior, hideAfterChoice: value as boolean }
      break
    case "reloadOnChange":
      next.behavior = { ...prev.behavior, reloadOnChange: value as boolean }
      break
    case "floatingButton":
      next.advanced = { ...prev.advanced, floatingButton: value as boolean }
      break
    case "floatingButtonPos":
      next.advanced = { ...prev.advanced, floatingButtonPosition: value as FloatingButtonPosition }
      break
    case "googleTagId": {
      const id = (value as string).trim()
      next.advanced = { ...prev.advanced, googleTagId: id || null }
      break
    }
    case "customCss":
      next.advanced = { ...prev.advanced, customCss: value as string }
      break
    case "waitForUpdate":
      next.consentMode = { ...prev.consentMode, waitForUpdateMs: value as number }
      break
    case "consentMode":
      next.consentMode = { ...prev.consentMode, enableConsentMode: value as boolean }
      break
    case "urlPassthrough":
      next.consentMode = { ...prev.consentMode, enableUrlPassthrough: value as boolean }
      break
    case "licenseKey":
      next.license = { ...prev.license, key: (value as string) || null }
      break
    case "plan": {
      const pro = value === "pro"
      next.license = { ...prev.license, tier: pro ? "pro" : "trial", whiteLabel: pro }
      break
    }
    default:
      break
  }
  return next
}

/** Read the config and return the design-shaped model + all mutating actions. */
export function useConsentful(): ConsentfulModel {
  const { config, status, error, update } = useSettingsContext()
  const cfg = useMemo(() => toCfg(config), [config])

  const set = useCallback<ConsentfulModel["set"]>(
    (key, value) => {
      update((prev) => applyScalar(prev, key as ScalarKey, value))
    },
    [update],
  )

  const toggle = useCallback(
    (key: keyof Cfg) => {
      update((prev) => applyScalar(prev, key as ScalarKey, !toCfg(prev)[key]))
    },
    [update],
  )

  const setCategories = useCallback(
    (fn: (cats: CfgCategory[]) => CfgCategory[]) => {
      update((prev) => applyCategories(prev, fn(toCfg(prev).categories)))
    },
    [update],
  )

  const toggleCat = useCallback(
    (id: string) => {
      setCategories((cats) =>
        cats.map((c) => (c.id === id && !c.locked ? { ...c, enabled: !c.enabled } : c)),
      )
    },
    [setCategories],
  )

  const deleteCat = useCallback(
    (id: string) => {
      setCategories((cats) => cats.filter((c) => !(c.id === id && !c.locked)))
    },
    [setCategories],
  )

  const addPreset = useCallback(
    (id: string) => {
      const preset = PRESETS[id]
      if (!preset) return
      setCategories((cats) => (cats.some((c) => c.id === id) ? cats : [...cats, preset]))
    },
    [setCategories],
  )

  const createCategory = useCallback(
    (draft: { name: string; desc: string; signals: string[]; required: boolean }) => {
      const name = draft.name.trim()
      if (!name) return
      setCategories((cats) => {
        const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "category"
        let id = base
        let n = 2
        while (cats.some((c) => c.id === id)) {
          id = `${base}-${n}`
          n++
        }
        const cat: CfgCategory = {
          id,
          name,
          desc: draft.desc.trim() || "Custom consent category.",
          signals: draft.signals.length ? draft.signals : ["functionality_storage"],
          enabled: true,
          locked: draft.required,
        }
        return [...cats, cat]
      })
    },
    [setCategories],
  )

  const setScripts = useCallback(
    (fn: (scripts: CfgScript[]) => CfgScript[]) => {
      update((prev) => applyScripts(prev, fn(toCfg(prev).scripts)))
    },
    [update],
  )

  const deleteScript = useCallback(
    (index: number) => {
      setScripts((scripts) => scripts.filter((_, i) => i !== index))
    },
    [setScripts],
  )

  const createScript = useCallback(
    (draft: { name: string; type: ScriptType; value: string; id: string; cat: string }) => {
      const name = draft.name.trim()
      const value = draft.value.trim()
      // A managed script is meaningless without a payload to gate — require both
      // a name and a value (URL or inline code) so we never inject an empty tag.
      if (!name || !value) return
      setScripts((scripts) => [
        ...scripts,
        { name, type: draft.type, value, id: draft.id.trim(), cat: draft.cat },
      ])
    },
    [setScripts],
  )

  const addLanguage = useCallback(
    (code: string) => {
      const c = code.trim().toLowerCase()
      if (!c) return
      update((prev) => {
        if (prev.strings.translations[c]) return prev
        return { ...prev, strings: { ...prev.strings, translations: { ...prev.strings.translations, [c]: {} } } }
      })
    },
    [update],
  )

  const removeLanguage = useCallback(
    (code: string) => {
      update((prev) => {
        if (!prev.strings.translations[code]) return prev
        const translations = { ...prev.strings.translations }
        delete translations[code]
        return { ...prev, strings: { ...prev.strings, translations } }
      })
    },
    [update],
  )

  const localeValue = useCallback(
    (locale: string, key: LocalizableFieldKey): string => {
      const field = LOCALE_FIELD_MAP[key]
      const value = config.strings.translations[locale]?.[field]
      return typeof value === "string" ? value : ""
    },
    [config],
  )

  const setLocaleValue = useCallback(
    (locale: string, key: LocalizableFieldKey, value: string) => {
      const field = LOCALE_FIELD_MAP[key]
      update((prev) => {
        const current = prev.strings.translations[locale] ?? {}
        const nextLocale: Partial<LocaleStrings> = { ...current }
        // An empty override falls back to the base copy, so clear rather than store "".
        if (value.trim() === "") delete nextLocale[field]
        else nextLocale[field] = value
        return {
          ...prev,
          strings: { ...prev.strings, translations: { ...prev.strings.translations, [locale]: nextLocale } },
        }
      })
    },
    [update],
  )

  return {
    cfg,
    status,
    error,
    set,
    toggle,
    toggleCat,
    deleteCat,
    addPreset,
    createCategory,
    deleteScript,
    createScript,
    addLanguage,
    removeLanguage,
    localeValue,
    setLocaleValue,
  }
}

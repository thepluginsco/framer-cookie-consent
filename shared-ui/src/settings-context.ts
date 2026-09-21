/**
 * The settings seam shared by every platform front-end.
 *
 * The authoring UI (shell + panels + model) reads and writes the canonical
 * {@link CookieConsentConfig} through this context — it never knows *how* the
 * config is persisted. Each host mounts a provider that supplies a concrete
 * {@link SettingsApi}: Framer persists to plugin data and re-injects the site
 * loader; the universal embed keeps it in localStorage and regenerates the
 * snippet; Webflow/WordPress/Shopify/Wix call their own stores. The UI is
 * identical regardless.
 */

import { createContext, useCallback, useContext } from "react"

import type { CookieConsentConfig } from "@framer-cookie-consent/shared"

/** Immutable updater: derive the next config from the previous one. */
export type ConfigUpdater = (prev: CookieConsentConfig) => CookieConsentConfig

/** Everything the authoring UI needs to read + persist the configuration. */
export interface SettingsApi {
  /** The current, complete config. Never mutated in place. */
  config: CookieConsentConfig
  /** Save/sync status for UI feedback (`"idle" | "saving" | "dirty" | "loading" | "error" | …`). */
  status: string
  /** Human-readable message for the most recent failure, or `null`. */
  error: string | null
  /** Apply a change. The host persists it (typically debounced). */
  update: (updater: ConfigUpdater) => void
  /** Optional: reset the config back to defaults. */
  reset?: () => void
}

/** Holds the single {@link SettingsApi} instance for the whole authoring UI. */
export const SettingsContext = createContext<SettingsApi | null>(null)

/**
 * Read the shared settings API. Every panel uses this instead of prop-drilling
 * the config down the tree.
 *
 * @throws If used outside of a settings provider.
 */
export function useSettingsContext(): SettingsApi {
  const ctx = useContext(SettingsContext)
  if (ctx === null) {
    throw new Error("useSettingsContext must be used within a settings provider")
  }
  return ctx
}

/** Top-level config sections that are plain objects (not arrays or meta). */
export type ObjectSectionKey =
  | "consentMode"
  | "behavior"
  | "banner"
  | "theme"
  | "strings"
  | "advanced"

/**
 * Read one object-shaped config section and get a typed patcher for it, so a
 * panel can do `const [banner, setBanner] = useConfigSection("banner")` and call
 * `setBanner({ position })` without spreading the whole config by hand.
 *
 * @param key - The section to edit.
 * @returns `[value, patch]` where `patch` shallow-merges into that section.
 */
export function useConfigSection<K extends ObjectSectionKey>(
  key: K,
): readonly [CookieConsentConfig[K], (patch: Partial<CookieConsentConfig[K]>) => void] {
  const { config, update } = useSettingsContext()
  const patch = useCallback(
    (sectionPatch: Partial<CookieConsentConfig[K]>) => {
      update((prev) => {
        const next = { ...prev }
        next[key] = { ...(prev[key] as object), ...sectionPatch } as CookieConsentConfig[K]
        return next
      })
    },
    [update, key],
  )
  return [config[key], patch] as const
}

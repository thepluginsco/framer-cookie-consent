/**
 * Shared settings context.
 *
 * Kept in a `.ts` module (no JSX) so it isn't a Fast Refresh component
 * boundary: `SettingsProvider` lives in its own `.tsx` file and consumes this.
 */

import { createContext, useCallback, useContext } from "react"

import type { SettingsApi } from "../hooks/useSettings"
import type { CookieConsentConfig } from "../types"

/** Holds the single {@link SettingsApi} instance for the whole plugin UI. */
export const SettingsContext = createContext<SettingsApi | null>(null)

/**
 * Read the shared settings API. Every panel uses this instead of prop-drilling
 * the config down the tree.
 *
 * @throws If used outside of a `<SettingsProvider>`.
 */
export function useSettingsContext(): SettingsApi {
  const ctx = useContext(SettingsContext)
  if (ctx === null) {
    throw new Error("useSettingsContext must be used within <SettingsProvider>")
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
 * `setBanner({ position })` without spreading the whole config by hand. Changes
 * flow through the shared `update`, so they persist + re-inject like any other.
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
      update(prev => {
        const next = { ...prev }
        next[key] = { ...(prev[key] as object), ...sectionPatch } as CookieConsentConfig[K]
        return next
      })
    },
    [update, key],
  )
  return [config[key], patch] as const
}

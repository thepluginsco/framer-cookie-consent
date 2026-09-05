/**
 * `SettingsProvider` — calls {@link useSettings} once and shares the resulting
 * {@link SettingsApi} with the whole plugin UI via {@link SettingsContext}, so
 * panels read/update one config instance without prop-drilling.
 */

import type { ReactNode } from "react"

import { useSettings } from "../hooks/useSettings"
import { SettingsContext } from "./settings-context"

/** Wrap the plugin UI in this once (near the root). */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const settings = useSettings()
  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  )
}

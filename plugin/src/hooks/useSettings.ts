/**
 * `useSettings` — the plugin's configuration state engine.
 *
 * Owns the single {@link CookieConsentConfig} instance for the whole editor UI:
 * loads it from Framer plugin data on mount (migrating older saved configs
 * forward via the shared `parse`/`mergeConfig`), exposes immutable updates, and
 * debounced-persists every change back to Framer while re-injecting the site
 * loader so the published site stays in sync automatically.
 *
 * All Framer API calls are wrapped in try/catch and surfaced through
 * {@link SettingsApi.status} / {@link SettingsApi.error} for the UI to show.
 *
 * Panels should not call this hook directly — they read the shared instance via
 * `useSettingsContext` (one `<SettingsProvider>` calls this hook once).
 */

import { useCallback, useEffect, useRef, useState } from "react"

import { loadConfigString, saveConfigString } from "../lib/configStore"
import { injectLoader } from "../lib/customCode"
import { canSetCustomCode } from "../lib/framer"
import { DEFAULT_CONFIG, parse, serialize } from "../types"
import type { CookieConsentConfig } from "../types"

/** How long to wait after the last change before persisting, in ms. */
const DEBOUNCE_MS = 400

/**
 * Lifecycle of the config relative to its persisted copy:
 * - `loading` — reading from plugin data on mount.
 * - `idle`    — loaded and in sync with what's stored.
 * - `dirty`   — changed locally; a debounced save is pending.
 * - `saving`  — a save is in flight.
 * - `saved`   — the latest change has been persisted + re-injected.
 * - `error`   — the last load or save failed (see {@link SettingsApi.error}).
 */
export type SaveStatus = "loading" | "idle" | "dirty" | "saving" | "saved" | "error"

/**
 * Argument to {@link SettingsApi.update}: either a shallow patch of top-level
 * config sections (e.g. `{ banner }`), or an updater that receives the previous
 * config and returns the next one.
 */
export type ConfigUpdater =
  | Partial<CookieConsentConfig>
  | ((prev: CookieConsentConfig) => CookieConsentConfig)

/** The shared settings API returned by {@link useSettings}. */
export interface SettingsApi {
  /** The current, complete config. Never mutated in place. */
  config: CookieConsentConfig
  /** Save/sync status for UI feedback. */
  status: SaveStatus
  /** Human-readable message for the most recent failure, or `null`. */
  error: string | null
  /** Apply a change. Persists (debounced) and re-injects the loader. */
  update: (updater: ConfigUpdater) => void
  /** Reset the config back to {@link DEFAULT_CONFIG}. */
  reset: () => void
}

/** Normalize any thrown value into a display string. */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Load, edit and persist the banner configuration.
 *
 * @returns The shared {@link SettingsApi}.
 */
export function useSettings(): SettingsApi {
  const [config, setConfig] = useState<CookieConsentConfig>(DEFAULT_CONFIG)
  const [status, setStatus] = useState<SaveStatus>("loading")
  const [error, setError] = useState<string | null>(null)

  /** True once the initial load has completed; gates persistence. */
  const hydratedRef = useRef(false)
  /** The serialized form last written to (or read from) plugin data. */
  const lastSavedRef = useRef<string | null>(null)

  /* ---- Load on mount ----------------------------------------------------- */
  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const saved = await loadConfigString()
        if (cancelled) return
        // `parse` runs through `mergeConfig`, so older/partial saved configs
        // are migrated forward; fall back to defaults when nothing is stored.
        const loaded = saved != null ? parse(saved) : DEFAULT_CONFIG
        lastSavedRef.current = serialize(loaded)
        setConfig(loaded)
        setError(null)
        setStatus("idle")
        // First-configure: make sure the published site has the loader even if
        // the user never edits a field. Best-effort — a viewer without Site
        // Settings permission simply can't install it (that's surfaced by the
        // custom-code UI), so this must never flip the editor into an error.
        try {
          if (canSetCustomCode()) {
            await injectLoader(loaded)
            lastSavedRef.current = serialize(loaded)
          }
        } catch (injectError) {
          console.warn("[cookie-consent] initial loader injection failed:", injectError)
        }
      } catch (loadError) {
        if (cancelled) return
        // Keep the UI usable on a load failure: fall back to defaults, but
        // surface the error so the user knows their saved config wasn't read.
        lastSavedRef.current = serialize(DEFAULT_CONFIG)
        setConfig(DEFAULT_CONFIG)
        setError(toErrorMessage(loadError))
        setStatus("error")
      } finally {
        if (!cancelled) hydratedRef.current = true
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  /* ---- Debounced persist + re-inject on change --------------------------- */
  useEffect(() => {
    if (!hydratedRef.current) return

    const serialized = serialize(config)
    // Nothing new to save (e.g. the change effect firing right after load).
    if (serialized === lastSavedRef.current) return

    setStatus("dirty")

    const handle = setTimeout(() => {
      void (async () => {
        setStatus("saving")
        try {
          await saveConfigString(serialized)
          // Keep the live site in sync with the editor on every change: this
          // re-writes only our marker block in the site's custom code.
          await injectLoader(config)
          lastSavedRef.current = serialized
          setError(null)
          setStatus("saved")
        } catch (saveError) {
          setError(toErrorMessage(saveError))
          setStatus("error")
        }
      })()
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(handle)
    }
  }, [config])

  /* ---- Public actions ---------------------------------------------------- */
  const update = useCallback((updater: ConfigUpdater) => {
    setConfig(prev =>
      typeof updater === "function" ? updater(prev) : { ...prev, ...updater },
    )
  }, [])

  const reset = useCallback(() => {
    setConfig(DEFAULT_CONFIG)
  }, [])

  return { config, status, error, update, reset }
}

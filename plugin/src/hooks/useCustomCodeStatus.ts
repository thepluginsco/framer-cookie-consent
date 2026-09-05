/**
 * Subscribes to Framer's custom-code state and reports whether the loader
 * location has been disabled by the user.
 *
 * Framer lets a user switch OFF a plugin's custom code in site settings, and a
 * plugin CANNOT turn it back on programmatically — we can only detect it and
 * tell the user how to re-enable it. The banner won't load while it's disabled.
 */

import { useEffect, useState } from "react"

import { getCustomCode, isCustomCodeDisabled, subscribeToCustomCode } from "../lib/framer"
import { LOADER_LOCATION } from "../lib/customCode"
import type { CustomCode } from "@framer/plugin"

/** True when the loader's custom-code location is currently disabled. */
export function useCustomCodeDisabled(): boolean {
  const [disabled, setDisabled] = useState(false)

  useEffect(() => {
    let active = true
    const apply = (code: CustomCode): void => {
      if (active) setDisabled(isCustomCodeDisabled(code, LOADER_LOCATION))
    }

    // Seed once, then keep in sync. Wrapped so a Framer API hiccup can't crash
    // the panel — worst case we just don't show the warning.
    getCustomCode().then(apply).catch(() => {})
    let unsubscribe: () => void = () => {}
    try {
      unsubscribe = subscribeToCustomCode(apply)
    } catch {
      /* subscription unavailable */
    }

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return disabled
}

/**
 * Tracks whether the current Framer user may save: writing the banner into the
 * site's custom code needs Framer's custom-code permission, which viewers and
 * some editors don't have.
 *
 * The editor checks this BEFORE any write (no background attempts when it's
 * missing) and shows {@link WRITE_ACCESS_MESSAGE} so the user knows exactly
 * which permission to ask for.
 */

import { useEffect, useState } from "react"

import { canWriteSite, subscribeToWriteAccess } from "../lib/framer"

/** Shown in the plugin while the user lacks the permission a save needs. */
export const WRITE_ACCESS_MESSAGE =
  "View only: you don't have permission to edit this site's custom code, so changes can't be saved or published. " +
  "Ask a project owner to give you edit access (Site Settings → Custom Code), then reopen Consentful."

/** Guarded read: outside Framer (local preview) there is no permission model. */
function readAccess(): boolean {
  try {
    return canWriteSite()
  } catch {
    return true
  }
}

/** True when the current user may save and publish from the plugin. */
export function useWriteAccess(): boolean {
  const [allowed, setAllowed] = useState(readAccess)

  useEffect(() => {
    let unsubscribe: () => void = () => {}
    try {
      unsubscribe = subscribeToWriteAccess(setAllowed)
    } catch {
      /* subscription unavailable — keep the initial reading */
    }
    return () => unsubscribe()
  }, [])

  return allowed
}

/** The notice to show while saving is unavailable, or `null` when it's fine. */
export function useReadOnlyNotice(): string | null {
  return useWriteAccess() ? null : WRITE_ACCESS_MESSAGE
}

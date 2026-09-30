/**
 * Thin bridge to the Wix dashboard host.
 *
 * Wix loads our dashboard page in an iframe and appends a **signed app
 * instance** (`?instance=<signature>.<payload>`) identifying the site. The page
 * never decodes or trusts it itself — it forwards it to the Worker, which
 * verifies the signature with the app secret and derives the site from it.
 *
 * Outside Wix (local `vite dev`) there's no instance, so the UI still renders
 * for development but can't publish.
 */

/** The signed app instance Wix appended to this page's URL, or null outside Wix. */
export function signedInstance(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get("instance") || null;
  } catch {
    return null;
  }
}

/** True when opened by the Wix dashboard (it passed a signed instance). */
export function inWixHost(): boolean {
  return signedInstance() !== null;
}

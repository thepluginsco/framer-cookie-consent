/**
 * Thin bridge to the Wix Dashboard host.
 *
 * A Wix dashboard app runs in an iframe the Wix host controls; the host exposes
 * the current site's id (and a signed instance token, for a production auth
 * guard) via the Dashboard SDK. We only need the site id to scope the token,
 * config store and install. This wrapper keeps every host touch in one place and
 * degrades gracefully when the app is opened outside Wix (e.g. local `vite dev`),
 * so the UI can still be developed without the host.
 *
 * The exact SDK surface differs across Wix's generations; we probe the couple of
 * shapes that expose the site id and fall back to a manual input otherwise, the
 * same honest pattern as the Webflow shell's `webflow-host.ts`.
 */

/** The subset of the Wix Dashboard host we use. */
export interface WixDashboardApi {
  /** Resolve the current site id (or instance id we normalize to it). */
  getSiteId?(): Promise<string> | string;
  /** Legacy Wix SDK: synchronous instance id getter. */
  Utils?: { getInstanceId?(): string };
}

declare global {
  interface Window {
    /** The Wix Dashboard SDK / legacy `window.Wix`, when hosted by Wix. */
    Wix?: WixDashboardApi;
  }
}

/** True when running inside the Wix host (it injected its SDK). */
export function inWixHost(): boolean {
  if (typeof window === "undefined") return false;
  const wix = window.Wix;
  return Boolean(wix && (typeof wix.getSiteId === "function" || wix.Utils?.getInstanceId));
}

/**
 * Resolve the current site id from the Wix host, or `null` when running outside
 * it (local dev), so the caller can fall back to a manual site-id input.
 */
export async function currentSiteId(): Promise<string | null> {
  if (!inWixHost()) return null;
  const wix = window.Wix!;
  try {
    if (typeof wix.getSiteId === "function") {
      const id = await wix.getSiteId();
      return id || null;
    }
    if (wix.Utils?.getInstanceId) {
      return wix.Utils.getInstanceId() || null;
    }
  } catch {
    /* host unavailable */
  }
  return null;
}

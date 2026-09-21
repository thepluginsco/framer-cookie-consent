/**
 * Thin bridge to the Webflow Designer host API (`window.webflow`).
 *
 * The Designer Extension is granted a small `window.webflow` object by the host.
 * We only need the current site id (to scope the token + install) and, for a
 * production auth guard, a short-lived id token. This wrapper keeps every
 * `window.webflow` touch in one place and degrades gracefully when the app is
 * opened outside the Designer (e.g. local `vite dev`), so the UI can still be
 * developed without the host.
 */

/** The subset of the Webflow Designer API we use. */
export interface WebflowDesignerApi {
  getSiteInfo(): Promise<{ siteId: string; shortName?: string; siteName?: string }>;
  /** Short-lived token the Worker can resolve to the authorized user + site. */
  getIdToken?(): Promise<string>;
  /** Resize the extension panel (nice-to-have; optional). */
  setExtensionSize?(size: "default" | "comfortable" | "large"): Promise<void>;
}

declare global {
  interface Window {
    webflow?: WebflowDesignerApi;
  }
}

/** True when running inside the Webflow Designer (the host injected its API). */
export function inDesigner(): boolean {
  return typeof window !== "undefined" && typeof window.webflow?.getSiteInfo === "function";
}

/**
 * Resolve the current site id from the Designer host, or `null` when running
 * outside it (local dev), so the caller can fall back to a manual site-id input.
 */
export async function currentSiteId(): Promise<string | null> {
  if (!inDesigner()) return null;
  try {
    const info = await window.webflow!.getSiteInfo();
    return info.siteId ?? null;
  } catch {
    return null;
  }
}

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
  getSiteInfo(): Promise<{
    siteId: string;
    shortName?: string;
    siteName?: string;
    /** The site's domains (custom + `*.webflow.io`), when the API provides them. */
    domains?: Array<{ url?: string; default?: boolean; stage?: string }>;
  }>;
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
 * Ask the Designer to show the panel at its largest preset (800×600) so the
 * shared editor UI — designed for a wide window — has room to breathe. Safe
 * no-op outside the Designer or on hosts that don't expose the API.
 */
export async function requestLargeSize(): Promise<void> {
  try {
    await window.webflow?.setExtensionSize?.("large");
  } catch {
    /* the panel just stays at its default size */
  }
}

/**
 * The site's live URL from the Designer host (custom domain preferred), or
 * `null` outside the Designer — lets license activation bind the domain
 * without asking the user for it.
 */
export async function currentSiteUrl(): Promise<string | null> {
  if (!inDesigner()) return null;
  try {
    const { domains = [], shortName } = await window.webflow!.getSiteInfo();
    const urls = domains.map((d) => d.url).filter((u): u is string => !!u);
    // Prefer a custom (production) domain; the *.webflow.io staging host is a
    // free preview domain that never needs a site slot.
    const custom = urls.find((u) => !/\.webflow\.io\b/i.test(u));
    return custom ?? urls[0] ?? (shortName ? `${shortName}.webflow.io` : null);
  } catch {
    return null;
  }
}

/**
 * A fresh ID token for the current Designer user (valid ~15 min), or `null`
 * outside the Designer. The Worker resolves it with Webflow to prove the caller
 * is an authorized user of the site before it writes anything.
 */
export async function currentIdToken(): Promise<string | null> {
  if (!inDesigner() || typeof window.webflow!.getIdToken !== "function") return null;
  try {
    return (await window.webflow!.getIdToken()) || null;
  } catch {
    return null;
  }
}

/**
 * Resolve the current site id from the Designer host, or `null` when running
 * outside it (local dev).
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

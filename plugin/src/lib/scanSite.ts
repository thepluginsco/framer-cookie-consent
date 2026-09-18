/**
 * Design-time tracker scanning — plugin side (Phase 1.3).
 *
 * Fetches the site's live HTML (production, else staging) and runs the shared,
 * pure {@link detectTrackers} engine over it. Everything domain-specific about
 * *recognising* trackers lives in `shared/tracker-scan`; this file is only the
 * Framer-flavoured plumbing that gets the HTML and normalises the failure modes
 * into something the UI can show.
 *
 * Note on reach: the plugin runs in a sandboxed iframe, so a cross-origin
 * `fetch` of the published page can be blocked by the browser (CORS) even though
 * the page is public. We surface that as a friendly `fetch-failed` rather than
 * pretending nothing is installed.
 */

import { detectTrackers, type DetectedTracker } from "../types"
import { getLiveSiteUrl } from "./framer"

/** Outcome of a site scan: either detected trackers, or a reason we couldn't. */
export type ScanResult =
  | { ok: true; url: string; trackers: DetectedTracker[] }
  | { ok: false; reason: "not-published" | "fetch-failed"; url: string | null; message: string }

/**
 * Scan the live site for known trackers.
 *
 * Resolves (never rejects) to a {@link ScanResult}: a successful scan carries
 * the detected trackers (possibly empty, meaning "clean"); a failure carries a
 * reason + human message the modal can render directly.
 */
export async function scanSiteForTrackers(): Promise<ScanResult> {
  const url = await getLiveSiteUrl().catch(() => null)
  if (!url) {
    return {
      ok: false,
      reason: "not-published",
      url: null,
      message: "Publish your site first — scanning reads the live page to find tracking tags.",
    }
  }

  try {
    const res = await fetch(url, { credentials: "omit", redirect: "follow" })
    if (!res.ok) {
      return {
        ok: false,
        reason: "fetch-failed",
        url,
        message: `Couldn't read the published page (HTTP ${res.status}).`,
      }
    }
    const html = await res.text()
    return { ok: true, url, trackers: detectTrackers(html) }
  } catch {
    return {
      ok: false,
      reason: "fetch-failed",
      url,
      message:
        "Couldn't reach the published site from the plugin — this is usually the browser's cross-origin (CORS) policy. You can still add tags manually below.",
    }
  }
}

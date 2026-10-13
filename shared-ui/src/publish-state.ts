/**
 * Publish state — tracks whether the editor's config differs from what's LIVE
 * on hosts that publish with an explicit button (WordPress, Webflow, Wix).
 *
 * The source of truth is the host's server-side copy of the published config
 * (a WP option / the Worker's per-site store), loaded via
 * {@link HostPublisher.loadPublished}; after a publish or remove the host calls
 * {@link markPublished} / {@link markUnpublished}. The shell header reads
 * {@link usePublishState} to show "Unpublished changes" + a one-click Publish.
 *
 * License fields are ignored in the comparison: activating a key isn't a site
 * change (the published copy strips the key; the runtime ignores the tier).
 */

import { useSyncExternalStore } from "react"
import type { CookieConsentConfig } from "@framer-cookie-consent/shared"

/** Result of a one-click publish. */
export interface PublishOutcome {
  ok: boolean
  /** User-facing result, e.g. "Published ✓ Your banner is live." */
  message: string
  /**
   * The host can't publish in one click yet (site not connected, opened
   * outside the platform) — the shell sends the user to the Publish tab.
   */
  needsSetup?: boolean
  /**
   * Published, but something still stops it showing (e.g. Shopify's app embed
   * is off). Shown in amber and kept on screen instead of auto-dismissing.
   */
  warning?: boolean
}

/** A host's one-click publisher (only hosts with a real publish button). */
export interface HostPublisher {
  /** Publish `config` to the live site. Never throws — failures are outcomes. */
  publish: (config: CookieConsentConfig) => Promise<PublishOutcome>
  /**
   * What's live now: the published config (`null` if never published) and
   * whether it runs an older runtime than this editor ships. Throw if unknown.
   */
  loadPublished: () => Promise<PublishedSnapshot>
  /**
   * Optional React hook: a short reason the published banner still isn't
   * showing on the site (e.g. "App embed off"), or null. When set, the header
   * shows it in amber instead of "Live". Must be a stable hook per host.
   */
  useLiveBlocker?: () => string | null
}

/** The live side of the comparison. */
export interface PublishedSnapshot {
  config: CookieConsentConfig | null
  /**
   * The live config's {@link publishFingerprint}, when the host only keeps that
   * (Framer stores a short hash instead of a second copy of the config, because
   * plugin data is capped at 4KB per project). Takes precedence over `config`.
   */
  fingerprint?: string | null
  /** The live site pins an older runtime than this editor — republish to update. */
  outdated?: boolean
}

/** cyrb53: a fast 53-bit string hash (hex), plenty to tell two configs apart. */
function hash53(str: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

/**
 * Short, stable hash of the site-relevant config (license excluded, keys
 * sorted), so it can be stored cheaply and compared across sessions.
 */
export function publishFingerprint(config: CookieConsentConfig): string {
  const { license: _license, ...rest } = config
  void _license
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v as Record<string, unknown>)
              .sort()
              .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
          )
        : v
  return hash53(JSON.stringify(sort(rest)))
}

/**
 * `undefined` = not known yet (still loading, or the host can't tell);
 * `null` = never published; string = fingerprint of the live config.
 */
let published: string | null | undefined = undefined
let outdated = false
/** Snapshot identity for useSyncExternalStore (changes on every emit). */
let snapshot: { published: string | null | undefined; outdated: boolean } = { published, outdated }
const listeners = new Set<() => void>()

function emit(): void {
  snapshot = { published, outdated }
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Record what's live after loading it from the host. */
export function setPublishedSnapshot(live: PublishedSnapshot): void {
  published =
    live.fingerprint !== undefined ? live.fingerprint : live.config ? publishFingerprint(live.config) : null
  outdated = published !== null && !!live.outdated
  emit()
}

/** Record a successful publish of `config` (always on the current runtime). */
export function markPublished(config: CookieConsentConfig): void {
  setPublishedSnapshot({ config })
}

/** Record that the banner was removed from the site. */
export function markUnpublished(): void {
  setPublishedSnapshot({ config: null })
}

/** Why the live site differs from the editor, if it does. */
export type PublishDiff = "none" | "never" | "changes" | "outdated"

/** Publish state for `config` against what's live: `known` once loaded; `dirty` when live differs. */
export interface PublishState {
  known: boolean
  dirty: boolean
  diff: PublishDiff
}

/** Pure read of the current state (the hook below subscribes to changes). */
export function getPublishState(config: CookieConsentConfig, snap = snapshot): PublishState {
  if (snap.published === undefined) return { known: false, dirty: false, diff: "none" }
  const diff: PublishDiff =
    snap.published === null
      ? "never"
      : publishFingerprint(config) !== snap.published
        ? "changes"
        : snap.outdated
          ? "outdated"
          : "none"
  return { known: true, dirty: diff !== "none", diff }
}

/** {@link getPublishState}, re-rendering whenever the live state changes. */
export function usePublishState(config: CookieConsentConfig): PublishState {
  return getPublishState(config, useSyncExternalStore(subscribe, () => snapshot))
}

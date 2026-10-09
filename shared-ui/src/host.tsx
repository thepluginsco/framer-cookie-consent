/**
 * The host adapter seam.
 *
 * The shell + panels are identical on every platform; the handful of things
 * that genuinely differ per platform are supplied here by the host that mounts
 * the UI. Keeping this surface small is what lets Framer, the universal embed,
 * Webflow, WordPress, Shopify and Wix share one authoring UI while differing
 * only where they must (how a site is scanned, whether there's a licensing
 * portal, and — the main one — how the configured banner is shipped: Framer
 * auto-syncs custom code, the embed copies a snippet, Wix installs via its
 * Worker, and so on).
 */

import { createContext, useContext } from "react"
import type { ComponentType, ReactNode } from "react"

import type { DetectedTracker } from "@framer-cookie-consent/shared"

import type { ConsentfulModel } from "./model"
import type { HostPublisher } from "./publish-state"

/** Outcome of scanning the host site for third-party trackers. */
export type ScanResult =
  | { ok: true; url: string; trackers: DetectedTracker[] }
  | { ok: false; reason: "not-published" | "fetch-failed" | "unsupported"; url: string | null; message: string }

/** Small persisted flag store (onboarding-seen etc.). Falls back to localStorage. */
export interface HostDataStore {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<void>
  canSet: () => boolean
}

/** Everything the shell/panels need from the host they run inside. */
export interface HostServices {
  /** Short platform name for the header badge, e.g. "Universal embed", "Wix". */
  platformLabel: string
  /** The CDN runtime version shown in the footer / publish checklist. */
  runtimeVersion: string

  /**
   * Scan the host site for known trackers (never rejects). Omit it to hide the
   * scan button entirely (e.g. Framer, where the plugin must not fetch the
   * published site).
   */
  scanSite?: () => Promise<ScanResult>
  /** Live URL of the published site, or null when unknown / unpublished. */
  getLiveSiteUrl: () => Promise<string | null>
  /** Display name of the current site for the header pill, or null to hide it. */
  getSiteName: () => Promise<string | null>

  /** Persist a small UI flag (onboarding seen). */
  data: HostDataStore

  /** Footer status: is the host's code-injection currently disabled? */
  useCodeDisabled: () => boolean
  /**
   * A message to show while the current user can't save or publish (e.g. a
   * Framer viewer without the custom-code permission), or `null` when they can.
   * The shell shows it as a notice bar and stops presenting saves as failures.
   * Omit on hosts with no such permission model.
   */
  useReadOnlyNotice?: () => string | null
  /**
   * Footer-left status label, per platform. `ok` shows when the runtime is
   * ready to ship (Framer: "Custom code enabled"); `bad` shows when it isn't
   * (Framer: "Custom code disabled"). Non-Framer hosts have no disabled state,
   * so `bad` is rarely seen.
   */
  footerStatus: { ok: string; bad: string }
  /** Footer right-hand label (e.g. "runtime 1.2.3 · jsDelivr"). */
  footerNote: string
  /**
   * How the Publish tab describes where the banner runtime is served from.
   * Defaults to the pinned jsDelivr bundle; WordPress ships it in the plugin.
   */
  runtimeDelivery?: { title: string; desc: string }
  /**
   * The Publish tab's subtitle — the one line under the "Publish" heading that
   * describes how this platform ships. Framer auto-syncs; the embed copies a
   * snippet; Wix/Webflow/WordPress install; Shopify deploys a block.
   */
  publishSubtitle: string

  /** Whether to show the License tab (every Consentful host does). */
  showLicenseTab: boolean
  /**
   * Whether the editor stays behind the activation gate until a key is
   * activated. Defaults to `true` wherever the License tab shows. The WordPress
   * Pro add-on sets `false`: the free core it extends must keep working without
   * a key, so only the Pro controls stay locked.
   */
  requireActivation?: boolean
  /** Override the shared License panel (rarely needed; defaults to `LicensePanel`). */
  LicensePanel?: ComponentType<{ m: ConsentfulModel }>

  /**
   * The platform-specific publish action, rendered at the top of the otherwise
   * shared Publish panel — the main "little different" per platform. Framer
   * shows an auto-sync note; the universal embed shows a copy-snippet card;
   * Wix/Webflow/WordPress/Shopify show their install/publish button.
   */
  PublishAction: ComponentType<{ m: ConsentfulModel }>

  /**
   * One-click publisher for hosts that publish with an explicit button
   * (WordPress, Webflow, Wix). When present, the header shows "Unpublished
   * changes" + a Publish button. Omitted by auto-syncing (Framer) and
   * copy-based (Shopify, universal embed) hosts.
   */
  publisher?: HostPublisher

  /**
   * Hook reporting whether the preview shows the "Powered by Consentful" credit.
   * Omitted = always shown (the credit is on for every plan). WordPress makes it
   * the site owner's opt-in, so its preview follows that choice.
   */
  useCreditVisible?: () => boolean
}

const HostContext = createContext<HostServices | null>(null)

/** Read the host services. Throws if used outside a {@link HostProvider}. */
export function useHost(): HostServices {
  const ctx = useContext(HostContext)
  if (ctx === null) {
    throw new Error("useHost must be used within a <HostProvider>")
  }
  return ctx
}

/** Provide the host services to the shell + panels. */
export function HostProvider({ value, children }: { value: HostServices; children: ReactNode }) {
  return <HostContext.Provider value={value}>{children}</HostContext.Provider>
}

/**
 * A browser-localStorage {@link HostDataStore}, the default for hosts without
 * their own key/value persistence (the universal embed, standalone previews).
 * Safe in private windows: every access is guarded.
 */
export function localStorageDataStore(prefix = "consentful."): HostDataStore {
  return {
    get: async (key) => {
      try {
        return window.localStorage.getItem(prefix + key)
      } catch {
        return null
      }
    },
    set: async (key, value) => {
      try {
        window.localStorage.setItem(prefix + key, value)
      } catch {
        /* ignore quota / disabled storage */
      }
    },
    canSet: () => {
      try {
        return typeof window !== "undefined" && !!window.localStorage
      } catch {
        return false
      }
    },
  }
}

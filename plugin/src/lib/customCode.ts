/**
 * The FRAMER ADAPTER — Framer's implementation of the platform-neutral
 * {@link PlatformAdapter} seam.
 *
 * The plugin never ships the banner runtime itself, and (as of Phase 2's core
 * extraction) it no longer builds or splices the loader HTML either. All of that
 * is platform-neutral and lives in `@framer-cookie-consent/shared`
 * ({@link buildLoaderHtml}, `upsertBlock`/`stripBlock`, `installLoader`/
 * `removeLoader`). This module owns ONLY the Framer-specific wiring:
 *   - WHERE the loader goes ({@link LOADER_LOCATION}), and
 *   - HOW to read/write that region (`getCustomCode`/`setCustomCode`),
 * wrapped as a {@link PlatformAdapter} the core drives.
 *
 * That is the entire Framer coupling — the same shape a Webflow/WordPress/embed
 * adapter fills in for Phase 3.
 */

import type { CookieConsentConfig } from "../types"
import type { CustomCodeLocation } from "@framer/plugin"
import {
  installLoader as installLoaderCore,
  removeLoader as removeLoaderCore,
  type PlatformAdapter,
} from "@framer-cookie-consent/shared"
import { getCustomCode, setCustomCode } from "./framer"

/* -------------------------------------------------------------------------- */
/* Re-exports: the platform-neutral loader now lives in core                  */
/* -------------------------------------------------------------------------- */

// Kept exported from here so existing importers (and the loader unit tests) can
// continue to reach the pure helpers via the plugin. They are defined once, in
// the shared core, and shared by every adapter.
export {
  buildLoaderHtml,
  upsertBlock,
  stripBlock,
  MARKER_START,
  MARKER_END,
  type BuildLoaderOptions,
} from "@framer-cookie-consent/shared"

/* -------------------------------------------------------------------------- */
/* Placement                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Where the loader is injected in the published Framer site.
 *
 * `headStart` (start of `<head>`) is deliberate: the Consent Mode defaults must
 * run BEFORE any Google tag on the page, so the "denied by default" guarantee
 * holds. The `<script src>` itself is `defer`red, so an early head placement is
 * non-render-blocking. Shared with the "custom code disabled" detection
 * (`useCustomCodeStatus`). This is Framer-specific — the type is Framer's.
 */
export const LOADER_LOCATION: CustomCodeLocation = "headStart"

/* -------------------------------------------------------------------------- */
/* TEMPORARY — licensing disabled for full-feature testing                    */
/* -------------------------------------------------------------------------- */

/**
 * While the team tests every feature end-to-end, licensing caps are OFF. Flip
 * this to `false` to restore real licensing.
 *
 * Pairs with the `plan` override in `consentful/model.ts` (which unlocks the Pro
 * UI controls). The runtime's license gate is UNCHANGED and still fully tested —
 * we simply hand it a paid-tier config so the published banner renders the FULL
 * configured design (real layout, theme, floating button, custom CSS,
 * white-label) instead of the unlicensed basic bar.
 */
export const LICENSING_DISABLED = true

/**
 * Stamp a paid-tier license onto the config we inject when {@link LICENSING_DISABLED}.
 * Defers to an already-present real license; a no-op once licensing is re-enabled.
 */
function withTestingLicense(config: CookieConsentConfig): CookieConsentConfig {
  if (!LICENSING_DISABLED) return config
  // A real paid license is already present → leave it untouched.
  if (config.license.tier !== "trial" && (config.license.key ?? "").length >= 8) return config
  return {
    ...config,
    license: { tier: "pro", key: "TESTING-LICENSE-UNGATED", whiteLabel: true },
  }
}

/* -------------------------------------------------------------------------- */
/* The Framer adapter                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Framer's {@link PlatformAdapter}: reads/writes the `headStart` custom-code
 * region. Reads are always allowed; writes require the Framer "Site Settings"
 * permission and throw {@link import("./framer").FramerPermissionError} when the
 * user lacks it (callers surface that). Note: if the user has TURNED OFF custom
 * code in Framer, the write still succeeds but the code won't run — that state
 * is detected separately (see `useCustomCodeStatus`) and surfaced as a warning.
 */
export const framerAdapter: PlatformAdapter = {
  async readLoaderRegion(): Promise<string> {
    const existing = await getCustomCode()
    return existing[LOADER_LOCATION].html ?? ""
  },
  async writeLoaderRegion(html: string | null): Promise<void> {
    await setCustomCode({ html, location: LOADER_LOCATION })
  },
}

/* -------------------------------------------------------------------------- */
/* Public plugin API (unchanged signatures; now core-driven)                  */
/* -------------------------------------------------------------------------- */

/**
 * Re-generate the loader and write it into the site's custom code so the
 * published site always reflects the editor config.
 *
 * Delegates the build + marker-scoped splice + churn-free skip to the core
 * {@link installLoaderCore}; the only Framer-specific parts are the adapter and
 * the temporary testing-license stamp. Safe to call on every debounced config
 * change.
 *
 * @param config - The configuration to embed and publish.
 */
export async function injectLoader(config: CookieConsentConfig): Promise<void> {
  await installLoaderCore(framerAdapter, withTestingLicense(config))
}

/**
 * Remove ONLY our loader block from the site's custom code, leaving any other
 * custom code at {@link LOADER_LOCATION} intact. Clears the location entirely
 * when nothing else remains. Used by the "remove banner" action. A no-op when
 * our block isn't present.
 */
export async function removeLoader(): Promise<void> {
  await removeLoaderCore(framerAdapter)
}

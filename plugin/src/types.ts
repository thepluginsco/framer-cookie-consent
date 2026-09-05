/**
 * Types for the plugin UI.
 *
 * The consent config schema lives in the /shared workspace so the plugin and
 * the runtime can never drift. We re-export it here so UI code imports its
 * types (and defaults/helpers) from a single local module, and add the few
 * types that only the editor UI cares about.
 */

// Re-export the shared schema (types + DEFAULT_CONFIG / mergeConfig / serialize
// / parse). This is the single source of truth for the config shape.
export * from "@framer-cookie-consent/shared"

import type { CustomCodeLocation } from "@framer/plugin"

/* -------------------------------------------------------------------------- */
/* UI-only types                                                              */
/* -------------------------------------------------------------------------- */

/** The configuration panels shown in the plugin, in tab order. */
export type PanelId =
  | "categories"
  | "style"
  | "text"
  | "behavior"
  | "scripts"
  | "license"

/**
 * Where the loader is injected in the published site. It goes at the START of
 * `<head>` (see `LOADER_LOCATION` in `lib/customCode.ts`) so the inline Consent
 * Mode defaults run before any Google tag; the runtime `<script>` is deferred so
 * the early placement stays non-render-blocking.
 */
export type LoaderLocation = CustomCodeLocation

/**
 * Whether custom code is currently usable. Surfaced to the user when Framer's
 * per-site "Custom Code" setting has been disabled (which we cannot re-enable
 * programmatically). See `lib/framer.ts`.
 */
export interface CustomCodeStatus {
  /** True when the loader location has been disabled by the user in Framer. */
  disabled: boolean
  /** The location we inject the loader into. */
  location: LoaderLocation
}

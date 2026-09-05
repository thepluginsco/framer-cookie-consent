/**
 * Single source of truth for WHERE the published site loads the consent runtime
 * from.
 *
 * The runtime (`runtime/dist/consent.min.js`) is served from jsDelivr's GitHub
 * CDN, pinned to an exact release TAG — never `@latest`. Pinning is what makes
 * the CDN response permanently cacheable and immune to a surprise runtime change
 * breaking every live site at once.
 *
 * Releasing a new runtime is therefore a ONE-LINE change here: bump
 * {@link RUNTIME_VERSION} to the new tag (after tagging + pushing the built
 * bundle to the repo). Nothing else in the plugin references the CDN URL.
 */

/**
 * GitHub user/org that owns the repository hosting the built runtime bundle.
 *
 * ⚠️ Set this to the account that actually hosts `runtime/dist/consent.min.js`
 * on GitHub before publishing the plugin — jsDelivr serves straight from it.
 */
export const RUNTIME_GH_USER = "thepluginsco"

/** Repository name (under {@link RUNTIME_GH_USER}) containing the runtime bundle. */
export const RUNTIME_GH_REPO = "framer-cookie-consent"

/**
 * PINNED release tag the loader points at. Bump this to ship a new runtime.
 *
 * MUST be an immutable git tag/release (e.g. `v0.1.0`) — never a branch name and
 * never `latest`, so jsDelivr can cache the response forever and existing sites
 * keep booting the exact runtime they were tested against.
 */
export const RUNTIME_VERSION = "v0.1.6"

/** Path to the built runtime bundle within the repo, relative to its root. */
export const RUNTIME_BUNDLE_PATH = "runtime/dist/consent.min.js"

/**
 * Build the fully-pinned jsDelivr URL for the runtime bundle.
 *
 * Shape: `https://cdn.jsdelivr.net/gh/<user>/<repo>@<tag>/<path>`.
 *
 * @returns The absolute CDN URL the loader's `<script src>` points at.
 */
export function runtimeScriptUrl(): string {
  return (
    `https://cdn.jsdelivr.net/gh/${RUNTIME_GH_USER}/${RUNTIME_GH_REPO}` +
    `@${RUNTIME_VERSION}/${RUNTIME_BUNDLE_PATH}`
  )
}

/**
 * Single source of truth for WHERE a published site loads the consent runtime
 * from — now part of the platform-neutral core so EVERY adapter (Framer, the
 * universal embed, Webflow, WordPress, …) points at the exact same bundle.
 *
 * The runtime (`runtime/dist/consent.min.js`) is served from jsDelivr's GitHub
 * CDN, pinned to an exact release TAG — never `@latest`. Pinning is what makes
 * the CDN response permanently cacheable and immune to a surprise runtime change
 * breaking every live site at once.
 *
 * Releasing a new runtime is therefore a ONE-LINE change here: bump
 * {@link RUNTIME_VERSION} to the new tag (after tagging + pushing the built
 * bundle to the repo). Nothing else references the CDN URL.
 */

/**
 * GitHub user/org that owns the repository hosting the built runtime bundle.
 *
 * ⚠️ Set this to the account that actually hosts `runtime/dist/consent.min.js`
 * on GitHub before publishing — jsDelivr serves straight from it.
 */
export const RUNTIME_GH_USER = "thepluginsco";

/** Repository name (under {@link RUNTIME_GH_USER}) containing the runtime bundle. */
export const RUNTIME_GH_REPO = "framer-cookie-consent";

/**
 * PINNED release tag the loader points at. Bump this to ship a new runtime.
 *
 * MUST be an immutable git tag/release (e.g. `v0.1.0`) — never a branch name and
 * never `latest`, so jsDelivr can cache the response forever and existing sites
 * keep booting the exact runtime they were tested against.
 */
export const RUNTIME_VERSION = "v0.1.13";

/**
 * Subresource Integrity hash of the runtime bundle at {@link RUNTIME_VERSION}.
 *
 * Every loader carries it as the script tag's `integrity` attribute, so the
 * browser refuses to run the file if a single byte differs from the build this
 * release was tested with. Together with the pinned tag it makes the runtime an
 * immutable asset: nothing served from the CDN can change behind a published
 * site. MUST be updated together with {@link RUNTIME_VERSION} — a test checks it
 * against `runtime/dist/consent.min.js`.
 */
export const RUNTIME_INTEGRITY =
  "sha384-1GTP0aFaMewQ5LF8lyxSAuoAgivzXKJl0EhbV4W5JBtfWT45VcuIglhT8nIXra4B";

/** Path to the built runtime bundle within the repo, relative to its root. */
export const RUNTIME_BUNDLE_PATH = "runtime/dist/consent.min.js";

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
  );
}

/**
 * Build the deferred `<script>` tag that loads the runtime.
 *
 * For the pinned CDN bundle it adds the {@link RUNTIME_INTEGRITY} hash (and the
 * `crossorigin` attribute SRI requires). A custom `runtimeUrl` (self-hosting,
 * local testing) gets a plain tag, since its bytes are not ours to vouch for.
 *
 * @param runtimeUrl - The script URL; defaults to {@link runtimeScriptUrl}.
 * @param extraAttributes - Extra attribute text, e.g. `data-cc-config="…"`.
 * @returns The ready-to-inline `<script …></script>` element.
 */
export function runtimeScriptTag(runtimeUrl: string = runtimeScriptUrl(), extraAttributes = ""): string {
  const pinned = runtimeUrl === runtimeScriptUrl();
  const integrity = pinned ? ` integrity="${RUNTIME_INTEGRITY}" crossorigin="anonymous"` : "";
  const extra = extraAttributes ? ` ${extraAttributes}` : "";
  return `<script src="${runtimeUrl}"${integrity}${extra} defer></script>`;
}

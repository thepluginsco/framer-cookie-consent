/**
 * Self-hosted drop-in for {@link module:brand-mark}, used by the build that ships
 * INSIDE a platform plugin (WordPress) instead of loading from jsDelivr.
 *
 * Every image resolves to an `images/` folder next to the runtime file itself,
 * so a published site requests nothing from a CDN. Same exports as
 * `brand-mark.ts`; `build.mjs` swaps this module in for the self-hosted bundle.
 */

/**
 * The runtime's own script URL, captured at module-load time while
 * `document.currentScript` still points at our `<script>`. Empty string when
 * unavailable.
 */
const SELF_SRC: string = (() => {
  try {
    const s = typeof document !== 'undefined' ? document.currentScript : null;
    return s instanceof HTMLScriptElement ? s.src : '';
  } catch {
    return '';
  }
})();

/** Resolve `images/<file>` beside the runtime, or `''` when its URL is unknown. */
function assetUrl(file: string): string {
  if (!SELF_SRC) return '';
  try {
    return new URL(`images/${file}`, SELF_SRC).href;
  } catch {
    return '';
  }
}

/** @returns The wordmark PNG shown in the "powered by" credit. */
export function brandLogoUrl(): string {
  return assetUrl('logo.png');
}

/** @returns The compact brand-mark PNG used in the floating re-open button. */
export function logoMarkUrl(): string {
  return assetUrl('logo-mark.png');
}

/** @returns The cookie hero PNG shown in the banner. */
export function cookieMarkUrl(): string {
  return assetUrl('cookie.png');
}

/** @returns The settings-cookie hero PNG shown in the preferences header. */
export function settingsCookieMarkUrl(): string {
  return assetUrl('settings-cookie.png');
}

/** @returns The light wordmark PNG, for dark banner backgrounds. */
export function brandLightLogoUrl(): string {
  return assetUrl('logo-light.png');
}

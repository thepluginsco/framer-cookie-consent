/**
 * Resolves the URL of the Consentful brand mark for the banner's "powered by"
 * credit.
 *
 * The mark is served from the SAME jsDelivr tag this runtime was loaded from, so
 * it always matches the deployed version WITHOUT hardcoding a tag and WITHOUT
 * bloating the tiny runtime bundle with an inlined image. The runtime already
 * loads from jsDelivr, so depending on it for a cosmetic credit image adds no new
 * point of failure; if the image can't load, the `<img>` alt text still reads the
 * credit.
 */

/**
 * The runtime's own script URL, captured at module-load time while
 * `document.currentScript` still points at our `<script>`. Deferred scripts (how
 * the loader injects us) expose `currentScript` during execution. Empty string
 * when unavailable (e.g. the test runner, or an inline eval).
 */
const SELF_SRC: string = (() => {
  try {
    const s = typeof document !== 'undefined' ? document.currentScript : null;
    return s instanceof HTMLScriptElement ? s.src : '';
  } catch {
    return '';
  }
})();

/** Path of the runtime bundle within the repo — swapped for the logo's path. */
const RUNTIME_PATH = '/runtime/dist/consent.min.js';
/** Path of the full brand logo within the repo (committed under the plugin's public dir). */
const LOGO_PATH = '/plugin/public/logo.png';
/**
 * Path of the LIGHT brand-logo variant, for use on dark banner backgrounds. The
 * default {@link LOGO_PATH} wordmark is dark ink tuned for light surfaces; this
 * light variant keeps the credit legible on dark surfaces. Same directory, so the
 * asset drops in next to `logo.png`.
 */
const LOGO_LIGHT_PATH = '/plugin/public/logo-light.png';
/** Path of the banner's cookie-with-shield hero mark (committed under the plugin's public dir). */
const COOKIE_PATH = '/plugin/public/cookie.png';
/** Path of the preferences modal's cookie-with-gear hero mark. */
const SETTINGS_COOKIE_PATH = '/plugin/public/settings-cookie.png';

/**
 * Stable fallbacks pinned to a tag known to contain the logo, used only when the
 * runtime's own origin can't be derived. Bump alongside a runtime re-tag.
 */
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/thepluginsco/framer-cookie-consent@v0.1.6/plugin/public';
const LOGO_FALLBACK = `${CDN_BASE}/logo.png`;
const LOGO_LIGHT_FALLBACK = `${CDN_BASE}/logo-light.png`;
const COOKIE_FALLBACK = `${CDN_BASE}/cookie.png`;
const SETTINGS_COOKIE_FALLBACK = `${CDN_BASE}/settings-cookie.png`;

/**
 * Resolve an asset that lives beside the runtime bundle, matched to whatever
 * jsDelivr tag served this runtime. Falls back to a pinned CDN URL when the
 * runtime's own origin can't be derived (e.g. the test runner).
 */
function assetUrl(repoPath: string, fallback: string): string {
  return SELF_SRC.includes(RUNTIME_PATH) ? SELF_SRC.replace(RUNTIME_PATH, repoPath) : fallback;
}

/**
 * The full brand-logo image URL, matched to whatever tag served this runtime.
 *
 * @returns An absolute URL to the wordmark PNG shown in the "powered by" credit.
 */
export function brandLogoUrl(): string {
  return assetUrl(LOGO_PATH, LOGO_FALLBACK);
}

/**
 * The banner's cookie-with-shield hero image URL, matched to the served tag.
 * If it can't load the `<img>` falls back to its (empty) alt, leaving the layout
 * intact — the mark is decorative.
 *
 * @returns An absolute URL to the cookie hero PNG shown in the banner.
 */
export function cookieMarkUrl(): string {
  return assetUrl(COOKIE_PATH, COOKIE_FALLBACK);
}

/**
 * The preferences modal's cookie-with-gear hero image URL, matched to the served
 * tag. Decorative, so a load failure degrades to empty alt without breaking layout.
 *
 * @returns An absolute URL to the settings-cookie hero PNG shown in the modal header.
 */
export function settingsCookieMarkUrl(): string {
  return assetUrl(SETTINGS_COOKIE_PATH, SETTINGS_COOKIE_FALLBACK);
}

/**
 * The LIGHT brand-logo image URL (for dark banner backgrounds), matched to
 * whatever tag served this runtime. If the light asset is absent at the served
 * tag the `<img>` simply falls back to its alt text ("Consentful"), so the
 * "Powered by Consentful" credit stays legible either way.
 *
 * @returns An absolute URL to the light wordmark PNG.
 */
export function brandLightLogoUrl(): string {
  return assetUrl(LOGO_LIGHT_PATH, LOGO_LIGHT_FALLBACK);
}

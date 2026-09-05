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

/** Path of the runtime bundle within the repo — swapped for the mark's path. */
const RUNTIME_PATH = '/runtime/dist/consent.min.js';
/** Path of the brand mark within the repo (committed under the plugin's public dir). */
const MARK_PATH = '/plugin/public/logo-mark.png';

/**
 * A stable fallback pinned to a tag known to contain the mark, used only when the
 * runtime's own origin can't be derived. Bump alongside a runtime re-tag.
 */
const MARK_FALLBACK =
  'https://cdn.jsdelivr.net/gh/thepluginsco/framer-cookie-consent@v0.1.3/plugin/public/logo-mark.png';

/**
 * The brand-mark image URL, matched to whatever tag served this runtime.
 *
 * @returns An absolute URL to the 86×86 mark PNG (rendered small in the credit).
 */
export function brandMarkUrl(): string {
  if (SELF_SRC.includes(RUNTIME_PATH)) {
    return SELF_SRC.replace(RUNTIME_PATH, MARK_PATH);
  }
  return MARK_FALLBACK;
}

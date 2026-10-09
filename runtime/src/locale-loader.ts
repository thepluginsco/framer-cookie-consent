/**
 * Fetches the one built-in language pack a visitor needs.
 *
 * The packs (`runtime/dist/locales/<code>.json`) are NOT bundled — 29 languages
 * would add ~10 KB gzipped to every site, almost all of it unused. Instead boot
 * fetches the single pack for the language being shown, in parallel with the
 * licence check, and the banner mounts once both resolve. Any failure (offline,
 * blocked, slow) resolves to `undefined` and the default copy stays as authored,
 * so a missing pack can never hold up or break the banner.
 *
 * CDN build: the pack comes from the same jsDelivr tag as the runtime (or the
 * pinned tag when the runtime arrived through a redirect, e.g. Wix's Worker).
 * Self-hosted build (WordPress): from `locales/` beside the runtime file, so a
 * published site requests nothing from a CDN.
 */

import {
  RUNTIME_GH_REPO,
  RUNTIME_GH_USER,
  RUNTIME_VERSION,
  sanitizeLocalePack,
  type LocalePack,
} from '@framer-cookie-consent/shared';

declare const __CC_SELF_HOSTED__: boolean | undefined;

/** The runtime's own script URL, captured while `currentScript` still points at us. */
const SELF_SRC: string = (() => {
  try {
    const s = typeof document !== 'undefined' ? document.currentScript : null;
    return s instanceof HTMLScriptElement ? s.src : '';
  } catch {
    return '';
  }
})();

/** Path of the CDN runtime bundle within the repo. */
const RUNTIME_PATH = '/runtime/dist/consent.min.js';

/**
 * URL of a pack, or `''` when it can't be located (self-hosted with an unknown
 * script URL).
 *
 * @param code - A pack code from `LOCALE_PACK_CODES` (e.g. `'sv'`, `'pt-br'`).
 * @param selfSrc - The runtime's script URL (overridable for tests).
 */
export function localePackUrl(code: string, selfSrc: string = SELF_SRC): string {
  const file = `${code}.json`;
  if (typeof __CC_SELF_HOSTED__ !== 'undefined' && __CC_SELF_HOSTED__) {
    try {
      return selfSrc ? new URL(`locales/${file}`, selfSrc).href : '';
    } catch {
      return '';
    }
  }
  if (selfSrc.includes(RUNTIME_PATH)) return selfSrc.split(RUNTIME_PATH)[0] + `/runtime/dist/locales/${file}`;
  return `https://cdn.jsdelivr.net/gh/${RUNTIME_GH_USER}/${RUNTIME_GH_REPO}@${RUNTIME_VERSION}/runtime/dist/locales/${file}`;
}

/**
 * Fetch and validate a pack. Never rejects: resolves `undefined` on any error
 * or after `timeoutMs`.
 */
export async function loadLocalePack(code: string, timeoutMs = 2500): Promise<LocalePack | undefined> {
  const url = code ? localePackUrl(code) : '';
  if (!url || typeof fetch !== 'function') return undefined;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), timeoutMs);
  try {
    const res = await Promise.race([
      fetch(url, ctrl ? { signal: ctrl.signal } : {}),
      new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return undefined;
    return sanitizeLocalePack(await res.json());
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Consent state + persistence layer for the runtime.
 *
 * Pure, dependency-free. The only import is a TYPE (erased at build time), so
 * this module carries no runtime dependency on the shared package. Every
 * storage access is guarded: Safari private mode throws on `localStorage`, and
 * cookies may be blocked, so failures degrade to "no consent" rather than crash.
 */

import type { CookieConsentConfig } from '@framer-cookie-consent/shared';

/** A persisted consent decision. */
export interface ConsentState {
  /** The `reconsentVersion` in effect when the decision was made. */
  version: string;
  /** Epoch milliseconds the decision was stored. */
  timestamp: number;
  /** Per-category grant map, keyed by category id. */
  categories: Record<string, boolean>;
}

/** The imperative API exposed on `window.CookieConsent`. */
export interface CookieConsentApi {
  /** Current stored decision, or `null` if none/expired/invalidated. */
  getState(): ConsentState | null;
  /** Grant exactly these categories (plus required); persist + emit. */
  accept(categoryIds: string[]): void;
  /** Grant every category. */
  acceptAll(): void;
  /** Grant only required categories. */
  rejectAll(): void;
  /** Ask the banner to open the preferences view. */
  openPreferences(): void;
  /** Erase the stored decision (withdraw consent). */
  withdraw(): void;
}

declare global {
  interface Window {
    CookieConsent?: CookieConsentApi;
  }
  interface WindowEventMap {
    'cookieconsent:change': CustomEvent<ConsentState>;
  }
}

/** Namespaced localStorage key for the consent record. */
export const CONSENT_STORAGE_KEY = 'cc_consent';
/** Default first-party cookie name (configurable per call). */
export const DEFAULT_COOKIE_NAME = 'cc_consent';
const DAY_MS = 86_400_000;

/* --------------------------------- storage -------------------------------- */

/** Read the raw record string from localStorage (primary) or cookie (fallback). */
function readRaw(cookieName: string): { raw: string | null; fromLocal: boolean; fromCookie: boolean } {
  let local: string | null = null;
  try {
    local = localStorage.getItem(CONSENT_STORAGE_KEY);
  } catch {
    /* localStorage unavailable (e.g. Safari private mode) */
  }
  const cookie = readCookie(cookieName);
  return { raw: local ?? cookie, fromLocal: local !== null, fromCookie: cookie !== null };
}

/** Read a single cookie value by name, or `null`. */
function readCookie(name: string): string | null {
  try {
    const prefix = `${name}=`;
    const hit = document.cookie.split('; ').find((c) => c.startsWith(prefix));
    return hit ? decodeURIComponent(hit.slice(prefix.length)) : null;
  } catch {
    return null;
  }
}

/** Persist a raw record to BOTH stores. The consent cookie is strictly necessary. */
function persist(raw: string, cookieName: string, maxAgeDays: number): void {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, raw);
  } catch {
    /* ignore */
  }
  try {
    // Secure is safe on https and localhost; skip it only on plain-http origins.
    const insecure = typeof location !== 'undefined' && location.protocol === 'http:' && location.hostname !== 'localhost';
    const secure = insecure ? '' : '; Secure';
    const maxAge = Math.round(maxAgeDays * 86_400);
    document.cookie = `${cookieName}=${encodeURIComponent(raw)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
  } catch {
    /* ignore */
  }
}

/* --------------------------------- public --------------------------------- */

/**
 * Read the stored consent decision.
 * @returns the decision, or `null` if none is stored, it has expired
 * (older than `consentExpiryDays`), or its version differs from the config's
 * `reconsentVersion` (which forces a re-prompt when tracking setup changes).
 */
export function readConsent(config: CookieConsentConfig, cookieName = DEFAULT_COOKIE_NAME): ConsentState | null {
  const { raw, fromLocal, fromCookie } = readRaw(cookieName);
  if (!raw) return null;
  let state: ConsentState;
  try {
    const p = JSON.parse(raw) as Partial<ConsentState>;
    if (typeof p.version !== 'string' || typeof p.timestamp !== 'number' || typeof p.categories !== 'object' || p.categories === null) {
      return null;
    }
    state = { version: p.version, timestamp: p.timestamp, categories: p.categories as Record<string, boolean> };
  } catch {
    return null;
  }
  if (!isConsentCurrent(config, state)) return null;
  if (isConsentExpired(config, state)) return null;
  // Heal a missing mirror so consent survives clearing either store.
  if (!fromLocal || !fromCookie) persist(raw, cookieName, config.behavior.consentExpiryDays);
  return state;
}

/**
 * Persist a consent decision to both stores. Required categories are forced on.
 * @returns the {@link ConsentState} that was written.
 */
export function writeConsent(
  config: CookieConsentConfig,
  categories: Record<string, boolean>,
  cookieName = DEFAULT_COOKIE_NAME,
): ConsentState {
  const normalized: Record<string, boolean> = { ...categories };
  for (const c of config.categories) {
    if (c.required) normalized[c.id] = true;
  }
  const state: ConsentState = {
    version: config.behavior.reconsentVersion,
    timestamp: Date.now(),
    categories: normalized,
  };
  persist(JSON.stringify(state), cookieName, config.behavior.consentExpiryDays);
  return state;
}

/** Erase the stored decision from both stores (used by "withdraw consent"). */
export function clearConsent(cookieName = DEFAULT_COOKIE_NAME): void {
  try {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `${cookieName}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

/** Whether a given category is granted in the provided state. */
export function hasConsentFor(state: ConsentState, categoryId: string): boolean {
  return state.categories[categoryId] === true;
}

/**
 * Whether a stored decision was made under the config's CURRENT
 * `reconsentVersion`. Bumping the version (a material policy change) makes every
 * prior decision stale, forcing a re-prompt. Exported so the geo/re-consent
 * layer can reuse this exact rule instead of re-implementing it.
 */
export function isConsentCurrent(config: CookieConsentConfig, state: ConsentState): boolean {
  return state.version === config.behavior.reconsentVersion;
}

/**
 * Whether a stored decision has aged past the config's `consentExpiryDays`.
 * @param now - Current epoch ms; injectable for testing (defaults to `Date.now()`).
 */
export function isConsentExpired(
  config: CookieConsentConfig,
  state: ConsentState,
  now: number = Date.now(),
): boolean {
  return now - state.timestamp > config.behavior.consentExpiryDays * DAY_MS;
}

/* --------------------------------- pub/sub -------------------------------- */

type ConsentListener = (state: ConsentState) => void;
const listeners = new Set<ConsentListener>();

/**
 * Subscribe to consent changes (script blocker, banner, analytics react to this).
 * @returns an unsubscribe function.
 */
export function onConsentChange(cb: ConsentListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Notify all subscribers and dispatch a `cookieconsent:change` DOM event. */
export function emitConsentChange(state: ConsentState): void {
  for (const cb of listeners) {
    try {
      cb(state);
    } catch {
      /* a broken listener must not break the others */
    }
  }
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cookieconsent:change', { detail: state }));
    }
  } catch {
    /* ignore */
  }
}

/* ------------------------------- window API ------------------------------- */

/** Build the category map that grants `granted` (plus every required category). */
function decide(config: CookieConsentConfig, granted: readonly string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const c of config.categories) {
    out[c.id] = c.required || granted.includes(c.id);
  }
  return out;
}

/**
 * Build the imperative API and attach it to `window.CookieConsent`.
 * @returns the API object (also returned for non-browser callers/tests).
 */
export function installConsentApi(config: CookieConsentConfig, cookieName = DEFAULT_COOKIE_NAME): CookieConsentApi {
  const apply = (granted: readonly string[]): void => {
    emitConsentChange(writeConsent(config, decide(config, granted), cookieName));
  };
  const api: CookieConsentApi = {
    getState: () => readConsent(config, cookieName),
    accept: (cats) => apply(cats),
    acceptAll: () => apply(config.categories.map((c) => c.id)),
    rejectAll: () => apply([]),
    openPreferences: () => {
      try {
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cookieconsent:openpreferences'));
      } catch {
        /* ignore */
      }
    },
    withdraw: () => {
      clearConsent(cookieName);
      emitConsentChange({ version: config.behavior.reconsentVersion, timestamp: Date.now(), categories: decide(config, []) });
    },
  };
  try {
    if (typeof window !== 'undefined') window.CookieConsent = api;
  } catch {
    /* ignore */
  }
  return api;
}

/**
 * Consent state + persistence layer for the runtime.
 *
 * Pure, dependency-free. The only import is a TYPE (erased at build time), so
 * this module carries no runtime dependency on the shared package. Every
 * storage access is guarded: Safari private mode throws on `localStorage`, and
 * cookies may be blocked, so failures degrade to "no consent" rather than crash.
 */

import type { CookieConsentConfig } from '@framer-cookie-consent/shared';

/**
 * How a consent decision came to be. Recorded on the {@link ConsentReceipt} so
 * an audit can tell an explicit button press from an auto-applied browser signal.
 */
export type ConsentMethod =
  | 'accept_all'
  | 'reject_all'
  | 'custom'
  | 'gpc'
  | 'dnt'
  | 'implied'
  | 'withdraw';

/**
 * A verifiable, self-contained record of a single consent decision. Stamped by
 * {@link writeConsent} and stored inside the {@link ConsentState}, so it travels
 * with the consent cookie and can be exported by the visitor. Carries a
 * tamper-evident {@link ConsentReceipt.proof} fingerprint — an integrity digest,
 * not a cryptographic signature (the zero-server design holds no signing key).
 */
export interface ConsentReceipt {
  /** Unique id for this decision (a UUID when the platform can generate one). */
  id: string;
  /** ISO-8601 timestamp the decision was recorded. */
  issued: string;
  /** How the decision was made (see {@link ConsentMethod}). */
  method: ConsentMethod;
  /** The `reconsentVersion` (consent-copy version) in effect. */
  policyVersion: string;
  /** Config schema version, for forward-compat of the receipt format itself. */
  schemaVersion: number;
  /** Origin (scheme + host) where consent was captured. */
  origin: string;
  /** Privacy-policy URL presented to the visitor at decision time. */
  policyUrl: string;
  /** Visitor's browser language at decision time (e.g. `en-US`). */
  language: string;
  /** Per-category grants at decision time (a self-contained copy). */
  categories: Record<string, boolean>;
  /** Google Consent Mode signals granted by this decision, sorted. */
  signals: string[];
  /** Tamper-evident integrity fingerprint over every field above. */
  proof: string;
}

/** A persisted consent decision. */
export interface ConsentState {
  /** The `reconsentVersion` in effect when the decision was made. */
  version: string;
  /** Epoch milliseconds the decision was stored. */
  timestamp: number;
  /** Per-category grant map, keyed by category id. */
  categories: Record<string, boolean>;
  /**
   * Verifiable receipt for this decision. Present when
   * `config.receipts.enabled` (the default); absent for decisions made with
   * receipts disabled or stored by an older runtime.
   */
  receipt?: ConsentReceipt;
}

/** The imperative API exposed on `window.CookieConsent`. */
export interface CookieConsentApi {
  /** Current stored decision, or `null` if none/expired/invalidated. */
  getState(): ConsentState | null;
  /**
   * Grant exactly these categories (plus required); persist + emit. `method`
   * labels the receipt (defaults to `custom`; the runtime passes `gpc` when
   * auto-applying a Global Privacy Control opt-out).
   */
  accept(categoryIds: string[], method?: ConsentMethod): void;
  /** Grant every category. `method` labels the receipt (defaults to `accept_all`). */
  acceptAll(method?: ConsentMethod): void;
  /** Grant only required categories. `method` labels the receipt (defaults to `reject_all`). */
  rejectAll(method?: ConsentMethod): void;
  /** Ask the banner to open the preferences view. */
  openPreferences(): void;
  /** Erase the stored decision (withdraw consent). */
  withdraw(): void;
  /**
   * The receipt for the current stored decision, or `null` if there is none
   * (no decision yet, or the decision was stored with receipts disabled).
   */
  exportReceipt(): ConsentReceipt | null;
  /**
   * Download the current receipt as a JSON file. Returns `false` (a no-op) when
   * there is no receipt or no DOM to download through.
   */
  downloadReceipt(filename?: string): boolean;
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

/* --------------------------------- receipts ------------------------------- */

/** Best-effort unique id: a UUID when available, else random hex, else time+rand. */
function newReceiptId(): string {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    if (c && typeof c.getRandomValues === 'function') {
      const b = c.getRandomValues(new Uint8Array(16));
      return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    /* crypto unavailable */
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/** Origin (scheme + host) where consent was captured; `''` when unknown. */
function safeOrigin(): string {
  try {
    if (typeof location !== 'undefined') return location.origin || `${location.protocol}//${location.host}`;
  } catch {
    /* ignore */
  }
  return '';
}

/** Visitor's browser language; `''` when unknown. */
function safeLanguage(): string {
  try {
    if (typeof navigator !== 'undefined') return navigator.language || '';
  } catch {
    /* ignore */
  }
  return '';
}

/** Sorted, de-duplicated list of Consent Mode signals granted by a decision. */
function grantedSignals(config: CookieConsentConfig, categories: Record<string, boolean>): string[] {
  const set = new Set<string>();
  for (const c of config.categories) {
    if (categories[c.id]) for (const s of c.signals) set.add(s);
  }
  return [...set].sort();
}

/**
 * A stable, canonical string over every receipt field except `proof`, so the
 * fingerprint is order-independent and reproducible for verification.
 */
function canonicalReceipt(r: Omit<ConsentReceipt, 'proof'>): string {
  const cats = Object.keys(r.categories)
    .sort()
    .map((k) => `${k}:${r.categories[k] ? 1 : 0}`)
    .join(',');
  return [
    r.id,
    r.issued,
    r.method,
    r.policyVersion,
    String(r.schemaVersion),
    r.origin,
    r.policyUrl,
    r.language,
    cats,
    [...r.signals].sort().join(','),
  ].join('|');
}

/**
 * Tamper-evident 64-bit integrity digest (two interleaved FNV-1a-style passes),
 * as 16 lowercase hex chars. NOT a cryptographic signature — a stable
 * fingerprint so an altered receipt can be detected client-side.
 */
function fingerprint(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul((h2 + c) >>> 0, 0x85ebca6b) >>> 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/** Build a fully-populated, fingerprinted receipt for one decision. */
function buildReceipt(
  config: CookieConsentConfig,
  categories: Record<string, boolean>,
  method: ConsentMethod,
  timestamp: number,
): ConsentReceipt {
  const base: Omit<ConsentReceipt, 'proof'> = {
    id: newReceiptId(),
    issued: new Date(timestamp).toISOString(),
    method,
    policyVersion: config.behavior.reconsentVersion,
    schemaVersion: config.meta.schemaVersion,
    origin: safeOrigin(),
    policyUrl: config.strings.privacyPolicyUrl,
    language: safeLanguage(),
    categories: { ...categories },
    signals: grantedSignals(config, categories),
  };
  return { ...base, proof: fingerprint(canonicalReceipt(base)) };
}

/** Whether receipts should be stamped for this config (default on). */
function receiptsEnabled(config: CookieConsentConfig): boolean {
  return config.receipts?.enabled ?? true;
}

/**
 * Verify a receipt's integrity by recomputing its fingerprint. Returns `true`
 * when the receipt is intact, `false` if any field was altered after issue.
 */
export function verifyReceipt(receipt: ConsentReceipt): boolean {
  try {
    const { proof, ...rest } = receipt;
    return typeof proof === 'string' && fingerprint(canonicalReceipt(rest)) === proof;
  } catch {
    return false;
  }
}

/** Download a receipt as a pretty-printed JSON file. No-op without a DOM. */
function triggerReceiptDownload(receipt: ConsentReceipt | null, filename?: string): boolean {
  if (!receipt) return false;
  try {
    if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
      return false;
    }
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `consent-receipt-${receipt.id}.json`;
    (document.body || document.documentElement).appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }, 0);
    return true;
  } catch {
    return false;
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
    // Carry a stored receipt through verbatim (older records simply lack one).
    if (p.receipt && typeof p.receipt === 'object') state.receipt = p.receipt as ConsentReceipt;
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
 * When `config.receipts.enabled` (the default), a verifiable {@link ConsentReceipt}
 * is stamped onto the record; `method` labels how the decision was made.
 * @returns the {@link ConsentState} that was written.
 */
export function writeConsent(
  config: CookieConsentConfig,
  categories: Record<string, boolean>,
  cookieName = DEFAULT_COOKIE_NAME,
  method: ConsentMethod = 'custom',
): ConsentState {
  const normalized: Record<string, boolean> = { ...categories };
  for (const c of config.categories) {
    if (c.required) normalized[c.id] = true;
  }
  const timestamp = Date.now();
  const state: ConsentState = {
    version: config.behavior.reconsentVersion,
    timestamp,
    categories: normalized,
  };
  if (receiptsEnabled(config)) state.receipt = buildReceipt(config, normalized, method, timestamp);
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
  const apply = (granted: readonly string[], method: ConsentMethod): void => {
    emitConsentChange(writeConsent(config, decide(config, granted), cookieName, method));
  };
  const getReceipt = (): ConsentReceipt | null => readConsent(config, cookieName)?.receipt ?? null;
  const api: CookieConsentApi = {
    getState: () => readConsent(config, cookieName),
    accept: (cats, method = 'custom') => apply(cats, method),
    acceptAll: (method = 'accept_all') => apply(config.categories.map((c) => c.id), method),
    rejectAll: (method = 'reject_all') => apply([], method),
    openPreferences: () => {
      try {
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cookieconsent:openpreferences'));
      } catch {
        /* ignore */
      }
    },
    withdraw: () => {
      // Erase the stored record, then emit a synthetic reject-all state. A
      // withdrawal is itself a consent event, so it carries a `withdraw` receipt
      // for any listener (e.g. a central log) — but nothing is persisted, so a
      // later exportReceipt() correctly returns null.
      clearConsent(cookieName);
      const categories = decide(config, []);
      const timestamp = Date.now();
      const state: ConsentState = { version: config.behavior.reconsentVersion, timestamp, categories };
      if (receiptsEnabled(config)) state.receipt = buildReceipt(config, categories, 'withdraw', timestamp);
      emitConsentChange(state);
    },
    exportReceipt: getReceipt,
    downloadReceipt: (filename) => triggerReceiptDownload(getReceipt(), filename),
  };
  try {
    if (typeof window !== 'undefined') window.CookieConsent = api;
  } catch {
    /* ignore */
  }
  return api;
}

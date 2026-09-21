/**
 * Region detection + re-consent policy for the runtime.
 *
 * ⚠️ APPROXIMATE BY DESIGN. The default path makes NO network calls, uses NO
 * paid APIs, and is instant ($0, fully client-side). It infers a coarse region
 * from the browser's IANA time zone (with the locale as a weak secondary hint).
 * This is a heuristic, not geolocation: VPNs, travellers, and misconfigured
 * clocks will be misread. The guiding rule is therefore FAIL SAFE TOWARD
 * PRIVACY — when detection is uncertain we show the banner and block trackers.
 *
 * A Pro tier can swap in an accurate source (e.g. a Cloudflare Worker echoing
 * the `cf-ipcountry` header) WITHOUT touching callers, via the documented
 * {@link RegionResolver} seam consumed by {@link resolveRegion}.
 *
 * Dependency-free. The only imports are the version/expiry predicates from
 * {@link module:consent-state} (reused, never duplicated) and erased types.
 */

import type { CookieConsentConfig, ConsentCategory } from '@framer-cookie-consent/shared';
import { isConsentCurrent, isConsentExpired, type ConsentState } from './consent-state.ts';

/* -------------------------------------------------------------------------- */
/* Region model                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The result of a (best-effort) region inference.
 *
 * `region` is a coarse code — an ISO 3166-1 alpha-2 country (`'DE'`, `'GB'`,
 * `'CH'`), the pseudo-code `'US-CA'` for California, `'US'`/`'OTHER'` for
 * recognised non-regulated locales, or `'UNKNOWN'` when nothing could be
 * inferred. The booleans are the compliance-relevant classifications.
 */
export interface RegionInfo {
  /** Coarse region code (see {@link RegionInfo}). */
  region: string;
  /** In the EU/EEA — GDPR applies. */
  isEU: boolean;
  /** In the UK — UK GDPR applies. */
  isUK: boolean;
  /** In California — CCPA/CPRA applies (approximate; the LA zone spans other states). */
  isCalifornia: boolean;
  /**
   * `true` only when the inference is confident. `false` means the caller
   * should fail safe (treat as a show-region). Note {@link RegionInfo.isCalifornia}
   * is intentionally reported with `certain: false` because the timezone cannot
   * pin the state down.
   */
  certain: boolean;
}

/* -------------------------------------------------------------------------- */
/* Region reference data (compact, hand-maintained)                           */
/* -------------------------------------------------------------------------- */

/** EU member states (ISO alpha-2). */
const EU = new Set<string>([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',
]);
/** EEA = EU plus Iceland, Liechtenstein, Norway (GDPR applies across the EEA). */
const EEA = new Set<string>([...EU, 'IS', 'LI', 'NO']);

/**
 * Compact IANA time zone → coarse code map, covering the regulated regions we
 * care about (EU/EEA/UK/CH) plus enough US zones to classify North America
 * confidently. `'US-CA'` marks the California-ish Pacific zone. Anything not
 * listed is classified by the fallback rules in {@link classifyRegion}.
 */
const TZ_CODE: Record<string, string> = {
  // ---- EU (27) ----
  'Europe/Vienna': 'AT',
  'Europe/Brussels': 'BE',
  'Europe/Sofia': 'BG',
  'Europe/Zagreb': 'HR',
  'Asia/Nicosia': 'CY', 'Asia/Famagusta': 'CY', 'Europe/Nicosia': 'CY',
  'Europe/Prague': 'CZ',
  'Europe/Copenhagen': 'DK',
  'Europe/Tallinn': 'EE',
  'Europe/Helsinki': 'FI', 'Europe/Mariehamn': 'FI',
  'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE', 'Europe/Busingen': 'DE',
  'Europe/Athens': 'GR',
  'Europe/Budapest': 'HU',
  'Europe/Dublin': 'IE',
  'Europe/Rome': 'IT',
  'Europe/Riga': 'LV',
  'Europe/Vilnius': 'LT',
  'Europe/Luxembourg': 'LU',
  'Europe/Malta': 'MT',
  'Europe/Amsterdam': 'NL',
  'Europe/Warsaw': 'PL',
  'Europe/Lisbon': 'PT', 'Atlantic/Azores': 'PT', 'Atlantic/Madeira': 'PT',
  'Europe/Bucharest': 'RO',
  'Europe/Bratislava': 'SK',
  'Europe/Ljubljana': 'SI',
  'Europe/Madrid': 'ES', 'Africa/Ceuta': 'ES', 'Atlantic/Canary': 'ES',
  'Europe/Stockholm': 'SE',
  // ---- EEA extras ----
  'Atlantic/Reykjavik': 'IS',
  'Europe/Vaduz': 'LI',
  'Europe/Oslo': 'NO',
  // ---- UK + Crown Dependencies (UK GDPR / equivalent) ----
  'Europe/London': 'GB', 'Europe/Belfast': 'GB',
  'Europe/Guernsey': 'GB', 'Europe/Jersey': 'GB', 'Europe/Isle_of_Man': 'GB',
  // ---- Switzerland (nFADP) ----
  'Europe/Zurich': 'CH',
  // ---- United States (confident non-EU; Pacific flagged California-ish) ----
  'America/Los_Angeles': 'US-CA',
  'America/New_York': 'US', 'America/Detroit': 'US', 'America/Chicago': 'US',
  'America/Denver': 'US', 'America/Boise': 'US', 'America/Phoenix': 'US',
  'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
  'America/Indiana/Indianapolis': 'US', 'America/Kentucky/Louisville': 'US',
};

/* -------------------------------------------------------------------------- */
/* Pure classification                                                        */
/* -------------------------------------------------------------------------- */

/** Build a {@link RegionInfo} from a resolved coarse country/region code. */
function fromCode(code: string): RegionInfo {
  if (code === 'US-CA') {
    // Best guess from the Pacific zone; can't distinguish CA from OR/WA/NV.
    return { region: 'US-CA', isEU: false, isUK: false, isCalifornia: true, certain: false };
  }
  if (code === 'GB') return { region: 'GB', isEU: false, isUK: true, isCalifornia: false, certain: true };
  if (code === 'CH') return { region: 'CH', isEU: false, isUK: false, isCalifornia: false, certain: true };
  if (EEA.has(code)) return { region: code, isEU: true, isUK: false, isCalifornia: false, certain: true };
  // Recognised, but not a regulated region we gate on (e.g. 'US').
  return { region: code, isEU: false, isUK: false, isCalifornia: false, certain: true };
}

/** Whether a region is one we must show the banner / block trackers for. */
function isRegulated(r: RegionInfo): boolean {
  return r.isEU || r.isUK || r.isCalifornia || r.region === 'CH';
}

/**
 * Collapse a {@link RegionInfo} to a coarse, privacy-safe bucket for analytics
 * (Phase 4.1 A/B / region breakdown). Deliberately low-cardinality — a handful
 * of regulatory zones, never a precise country — so an event can carry "where"
 * without carrying anything that identifies a visitor.
 *
 * @param r - The resolved region.
 * @returns One of `'US-CA'`, `'UK'`, `'CH'`, `'EU'`, `'UNKNOWN'`, `'OTHER'`.
 */
export function regionBucket(r: RegionInfo): string {
  if (r.isCalifornia) return 'US-CA';
  if (r.isUK) return 'UK';
  if (r.region === 'CH') return 'CH';
  if (r.isEU) return 'EU';
  if (r.region === 'UNKNOWN') return 'UNKNOWN';
  return 'OTHER';
}

/**
 * Extract the region subtag (e.g. `'DE'`) from a BCP-47 locale (e.g. `'de-DE'`).
 * Returns `null` for bare languages (`'de'`) — a region needs an explicit
 * `-REGION` part — which keeps the parse unambiguous.
 */
function localeRegion(locale: string | null | undefined): string | null {
  if (!locale) return null;
  const parts = locale.split('-');
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part && /^[A-Za-z]{2}$/.test(part)) return part.toUpperCase();
  }
  return null;
}

/**
 * Classify a time zone (+ optional locale region) into a {@link RegionInfo}.
 * PURE — takes its inputs explicitly and touches no globals, so it is the unit
 * under test for the mapping logic. {@link detectRegion} is the thin wrapper
 * that reads the real environment and calls this.
 *
 * Rules, in order:
 * 1. A time zone in the reference map → that region (confident).
 * 2. An unrecognised `Europe/*` zone → could be EU we don't list → uncertain
 *    (fail safe → treated as a show-region).
 * 3. No time zone at all → uncertain (fail safe).
 * 4. Any other recognised (non-European) zone → confidently non-regulated.
 *
 * Finally, the locale region is a WEAK corroborating hint: if it points at a
 * regulated region while the time zone said otherwise, certainty is downgraded
 * (again failing safe toward showing) — but it never suppresses a banner.
 *
 * @param timeZone - IANA zone (e.g. `'Europe/Berlin'`), or `null`/empty.
 * @param locale - BCP-47 locale (e.g. `navigator.language`, `'de-DE'`), optional.
 * @returns The inferred {@link RegionInfo}.
 */
export function classifyRegion(timeZone: string | null | undefined, locale?: string | null): RegionInfo {
  let result: RegionInfo;

  const code = timeZone ? TZ_CODE[timeZone] : undefined;
  if (code) {
    result = fromCode(code);
  } else if (timeZone && timeZone.startsWith('Europe/')) {
    // Unknown European zone (e.g. a country we don't list) — might be EU. Fail safe.
    result = { region: 'UNKNOWN', isEU: false, isUK: false, isCalifornia: false, certain: false };
  } else if (!timeZone) {
    // Intl unavailable / no zone — cannot tell. Fail safe.
    result = { region: 'UNKNOWN', isEU: false, isUK: false, isCalifornia: false, certain: false };
  } else {
    // A recognised non-European zone we don't specially handle → confidently non-regulated.
    result = { region: 'OTHER', isEU: false, isUK: false, isCalifornia: false, certain: true };
  }

  // Weak secondary hint: a regulated browser locale contradicting a non-regulated
  // zone (e.g. a German-locale visitor reading a US zone) → be cautious, show.
  const region = localeRegion(locale);
  if (region) {
    const localeRegulated = EEA.has(region) || region === 'GB' || region === 'CH';
    if (localeRegulated && !isRegulated(result)) {
      result = { ...result, certain: false };
    }
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Environment readers (impure, guarded, SSR-safe)                            */
/* -------------------------------------------------------------------------- */

/** Read the browser's IANA time zone, or `null` if `Intl` is unavailable. */
function readTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Read the browser's primary BCP-47 locale (e.g. `'de-DE'`), or `null`. */
function readLocale(): string | null {
  try {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator) : undefined;
    return nav?.language || (nav?.languages && nav.languages[0]) || null;
  } catch {
    return null;
  }
}

/**
 * Detect the visitor's coarse region from the live browser environment. This is
 * the default, zero-cost, offline path (see the module header for accuracy
 * caveats). For an accurate override, use {@link resolveRegion} with a
 * {@link RegionResolver}.
 *
 * @returns The inferred {@link RegionInfo} (uncertain/fail-safe if unavailable).
 */
export function detectRegion(): RegionInfo {
  return classifyRegion(readTimeZone(), readLocale());
}

/**
 * Optional async hook that resolves an authoritative region. The Pro tier can
 * supply one backed by a Cloudflare Worker reading `cf-ipcountry`; it should
 * return a {@link RegionInfo} (or a partial to merge over the heuristic) with
 * `certain: true`. Returning `null`/throwing falls back to the sync heuristic.
 */
export type RegionResolver = () => Promise<Partial<RegionInfo> | null | undefined>;

/**
 * Build a confident {@link RegionInfo} from an authoritative country code (and
 * optional `region` subcode). Used by {@link createEndpointResolver} to turn a
 * geo endpoint's answer into the shape the banner decision consumes. An empty or
 * unrecognisable code yields an uncertain `UNKNOWN` (so callers still fail safe).
 *
 * @param country - ISO-3166-1 alpha-2 country code (e.g. `'DE'`, `'US'`).
 * @param region - Optional finer code; `'US-CA'` flags California.
 * @returns A {@link RegionInfo}, `certain: true` when a real code was supplied.
 */
export function regionFromCountry(country: string | null | undefined, region?: string | null): RegionInfo {
  const sub = (region ?? '').trim().toUpperCase();
  const code = sub === 'US-CA' ? 'US-CA' : (country ?? '').trim().toUpperCase();
  if (!code) {
    return { region: 'UNKNOWN', isEU: false, isUK: false, isCalifornia: false, certain: false };
  }
  // The endpoint is authoritative, so even the California guess is `certain`.
  return { ...fromCode(code), certain: true };
}

/**
 * Build a {@link RegionResolver} that fetches an authoritative country from a
 * geo endpoint (typically a Cloudflare Worker echoing `cf-ipcountry`). The
 * endpoint must return JSON like `{ "country": "DE" }` (optionally
 * `{ "region": "US-CA" }`). Any failure (network, non-2xx, bad JSON, no code)
 * resolves to `null`, so {@link resolveRegion} falls back to the free heuristic.
 *
 * @param endpoint - Absolute URL of the region endpoint.
 * @returns A resolver suitable for {@link resolveRegion}.
 */
export function createEndpointResolver(endpoint: string, timeoutMs = 1500): RegionResolver {
  return async () => {
    try {
      if (typeof fetch !== 'function') return null;
      // Never let a slow/hanging endpoint delay the banner beyond `timeoutMs`.
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      let res: Response;
      try {
        res = await fetch(endpoint, {
          credentials: 'omit',
          cache: 'no-store',
          ...(controller ? { signal: controller.signal } : {}),
        });
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (!res.ok) return null;
      const data = (await res.json()) as { country?: string | null; region?: string | null };
      const info = regionFromCountry(data?.country, data?.region);
      return info.certain ? info : null;
    } catch {
      return null;
    }
  };
}

/**
 * Resolve the region via an optional {@link RegionResolver}, awaiting it if
 * provided and merging its answer over the heuristic; otherwise (or on any
 * failure) returns the sync {@link detectRegion} result. The default path — no
 * resolver — performs NO network I/O.
 *
 * @param resolver - Optional accurate async source.
 * @returns A promise of the resolved {@link RegionInfo}.
 */
export async function resolveRegion(resolver?: RegionResolver): Promise<RegionInfo> {
  const heuristic = detectRegion();
  if (!resolver) return heuristic;
  try {
    const override = await resolver();
    if (override && typeof override === 'object') {
      return { ...heuristic, ...override };
    }
  } catch {
    /* accurate source failed — fall back to the free heuristic */
  }
  return heuristic;
}

/* -------------------------------------------------------------------------- */
/* Do Not Track                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Whether the browser is signalling Do Not Track. Reads the several historical
 * spellings (`navigator.doNotTrack`, `window.doNotTrack`, `navigator.msDoNotTrack`).
 * Guarded and SSR-safe (returns `false` when no browser globals exist).
 *
 * @returns `true` when a DNT signal is present.
 */
export function isDoNotTrackEnabled(): boolean {
  try {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { msDoNotTrack?: string }) : undefined;
    const win = typeof window !== 'undefined' ? (window as Window & { doNotTrack?: string }) : undefined;
    const dnt = nav?.doNotTrack ?? win?.doNotTrack ?? nav?.msDoNotTrack;
    return dnt === '1' || dnt === 'yes';
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Global Privacy Control (opt-out of sale/sharing)                           */
/* -------------------------------------------------------------------------- */

/**
 * Whether the browser is asserting Global Privacy Control. Reads the standard
 * `navigator.globalPrivacyControl` boolean (set by Firefox, Brave, DuckDuckGo,
 * the Privacy Badger / OptMeowt extensions, …). Guarded and SSR-safe.
 *
 * GPC is legally recognised as a valid opt-out of the "sale"/"sharing" of
 * personal information under the CCPA/CPRA (California) and Colorado's CPA. It
 * is NOT a blanket rejection: see {@link gpcGrantedCategories}.
 *
 * @returns `true` when the GPC signal is present and set.
 */
export function isGpcEnabled(): boolean {
  try {
    const nav = typeof navigator !== 'undefined'
      ? (navigator as Navigator & { globalPrivacyControl?: boolean })
      : undefined;
    return nav?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

/** The three Consent Mode signals that constitute "sale/sharing" for GPC. */
const SALE_SIGNALS: readonly string[] = ['ad_storage', 'ad_user_data', 'ad_personalization'];

/**
 * Whether a category counts as advertising/"sale of data" for GPC purposes —
 * i.e. it maps to any of {@link SALE_SIGNALS}. These are the ONLY categories a
 * GPC signal forces off; everything else keeps the author's default.
 *
 * @param category - The category to classify.
 * @returns `true` when the category carries an ad/marketing signal.
 */
export function isSaleCategory(category: ConsentCategory): boolean {
  return category.signals.some((s) => SALE_SIGNALS.includes(s));
}

/**
 * The category ids to GRANT when honouring a GPC opt-out. This is deliberately
 * NOT `rejectAll()`: GPC opts the visitor out of the *sale/sharing* of data, so
 * we deny only the advertising categories (see {@link isSaleCategory}) and keep
 * every other category at the author's chosen default (`required` categories are
 * always granted; other non-ad categories are granted iff `defaultEnabled`).
 *
 * The returned list is fed straight to {@link CookieConsentApi.accept}, which
 * grants exactly these plus the required categories and denies the rest — so the
 * ad categories end up denied even if their `defaultEnabled` was `true`.
 *
 * @param config - The active configuration.
 * @returns The category ids to grant under a GPC opt-out.
 */
export function gpcGrantedCategories(config: CookieConsentConfig): string[] {
  return config.categories
    .filter((c) => !isSaleCategory(c) && (c.required || c.defaultEnabled))
    .map((c) => c.id);
}

/* -------------------------------------------------------------------------- */
/* Consent model (opt-in vs opt-out, region-aware)                             */
/* -------------------------------------------------------------------------- */

/** A resolved consent model — `auto` collapsed to a concrete stance. */
export type ResolvedConsentModel = 'opt-in' | 'opt-out';

/**
 * Collapse the author's {@link module:shared.ConsentModel} to a concrete stance
 * for the visitor's detected region.
 *
 * - `opt-in`  → always `'opt-in'`.
 * - `opt-out` → always `'opt-out'`.
 * - `auto`    → `'opt-in'` for regulated regions (EU/EEA, UK, Switzerland,
 *   California) AND for any uncertain detection (fail safe toward privacy);
 *   `'opt-out'` for confidently non-regulated regions (e.g. most of the US).
 *
 * This is the single boundary that makes "region-aware auto-mode" work: one
 * configuration yields a GDPR opt-in prompt in the EU and CCPA-style implied
 * consent (with an opt-out path) elsewhere.
 *
 * @param config - The active configuration.
 * @param region - Region info (defaults to {@link detectRegion}).
 * @returns The concrete consent model to enforce this load.
 */
export function resolveConsentModel(
  config: CookieConsentConfig,
  region: RegionInfo = detectRegion(),
): ResolvedConsentModel {
  const model = config.behavior.consentModel;
  if (model === 'opt-in' || model === 'opt-out') return model;
  // `auto`: opt-in for regulated regions or any uncertain read; opt-out only for
  // a confident non-regulated region.
  return isRegulated(region) || !region.certain ? 'opt-in' : 'opt-out';
}

/**
 * The category ids to grant as *implied consent* under an opt-out model — the
 * author's default toggle state (every `required` category plus every category
 * whose `defaultEnabled` is on). Fed to {@link CookieConsentApi.accept} so the
 * runtime starts trackers immediately in opt-out regions, exactly as if the
 * visitor had accepted the pre-checked defaults, while leaving an opt-out path.
 *
 * NOTE: unlike {@link gpcGrantedCategories} this does NOT force ad/marketing
 * categories off — opt-out consent honours the author's defaults verbatim (a
 * later GPC signal, handled first in boot, still overrides when present).
 *
 * @param config - The active configuration.
 * @returns The category ids to grant as implied consent.
 */
export function impliedConsentGrants(config: CookieConsentConfig): string[] {
  return config.categories.filter((c) => c.required || c.defaultEnabled).map((c) => c.id);
}

/**
 * Whether boot should auto-apply implied consent this load. True only when fresh
 * consent is needed (no decision on record, or a prior one has expired / been
 * invalidated by a `reconsentVersion` bump) AND the resolved model (for the given
 * region) is `opt-out`. When true, boot grants {@link impliedConsentGrants} so
 * trackers run without a prompt; the visitor can still opt out afterwards. A
 * still-valid decision — including a DNT/GPC one applied earlier in boot — always
 * suppresses this (its guard is shared with {@link shouldShowBanner} via
 * {@link needsReconsent}, so the two decisions can never disagree).
 *
 * @param config - The active configuration.
 * @param state - The stored decision, or `null` if none.
 * @param region - Region info (defaults to {@link detectRegion}).
 * @returns `true` if implied consent should be applied.
 */
export function shouldApplyImpliedConsent(
  config: CookieConsentConfig,
  state: ConsentState | null,
  region: RegionInfo = detectRegion(),
): boolean {
  if (!needsReconsent(config, state)) return false;
  return resolveConsentModel(config, region) === 'opt-out';
}

/* -------------------------------------------------------------------------- */
/* Re-consent (reuses consent-state's version/expiry rules)                   */
/* -------------------------------------------------------------------------- */

/**
 * Whether the visitor must (re-)consent — i.e. the banner should be re-shown.
 * `true` when there is no decision on record, when a `reconsentVersion` bump has
 * invalidated the prior decision, or when it has expired. Delegates the version
 * and expiry checks to {@link isConsentCurrent}/{@link isConsentExpired} in
 * consent-state so the rule lives in exactly one place.
 *
 * @param config - The active configuration.
 * @param state - The stored decision, or `null` if none.
 * @returns `true` if fresh consent is required.
 */
export function needsReconsent(config: CookieConsentConfig, state: ConsentState | null): boolean {
  if (!state) return true;
  if (!isConsentCurrent(config, state)) return true;
  if (isConsentExpired(config, state)) return true;
  return false;
}

/* -------------------------------------------------------------------------- */
/* Banner + floating-button decisions                                         */
/* -------------------------------------------------------------------------- */

/**
 * Decide whether to display the consent banner on load.
 *
 * Order of precedence:
 * 1. A valid, current decision already on record → never show (the visitor's
 *    explicit choice wins over every heuristic). This is also how an opt-out
 *    region is handled: boot applies implied consent (see
 *    {@link shouldApplyImpliedConsent}) BEFORE the banner mounts, so the record
 *    exists here and the banner stays silent — trackers run, no prompt.
 * 2. `respectDoNotTrack` + a DNT signal → do NOT show; the runtime should
 *    instead persist a reject-by-default decision (only necessary cookies).
 * 3. `showMode: 'everywhere'` → always show (when consent is needed).
 * 4. `showMode: 'eu-only'` → show only for regulated regions
 *    (EU/EEA, UK, Switzerland, California), and — critically — also whenever
 *    detection is uncertain, failing safe toward privacy.
 *
 * `region` and `doNotTrack` are injectable (defaulting to the live environment)
 * so callers can pre-resolve an accurate region and so the function is pure and
 * testable.
 *
 * @param config - The active configuration.
 * @param existingState - The stored decision, or `null` if none.
 * @param region - Region info (defaults to {@link detectRegion}).
 * @param doNotTrack - DNT signal (defaults to {@link isDoNotTrackEnabled}).
 * @returns `true` if the banner should be shown.
 */
export function shouldShowBanner(
  config: CookieConsentConfig,
  existingState: ConsentState | null,
  region: RegionInfo = detectRegion(),
  doNotTrack: boolean = isDoNotTrackEnabled(),
): boolean {
  // 1. Explicit, still-valid consent → no banner.
  if (!needsReconsent(config, existingState)) return false;

  // 2. DNT is an expressed preference: reject-by-default instead of prompting.
  if (config.behavior.respectDoNotTrack && doNotTrack) return false;

  // 3. Show to everyone.
  if (config.behavior.showMode === 'everywhere') return true;

  // 4. eu-only: regulated regions OR any uncertain detection (fail safe).
  return isRegulated(region) || !region.certain;
}

/**
 * Whether the persistent "cookie settings" floating re-open button should be
 * rendered. Shown only when the author enabled it AND a decision is already on
 * record (so it appears after the banner is gone, letting visitors revisit
 * their choices). While consent is still needed the banner itself is present,
 * so the button is suppressed.
 *
 * @param config - The active configuration.
 * @param state - The stored decision, or `null` if none.
 * @returns `true` if the floating button should be shown.
 */
export function shouldShowFloatingButton(config: CookieConsentConfig, state: ConsentState | null): boolean {
  if (!config.advanced.floatingButton) return false;
  return !needsReconsent(config, state);
}

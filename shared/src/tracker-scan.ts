/**
 * Design-time tracker scanning (Phase 1.3).
 *
 * A pure, dependency-free engine that reads a page's HTML and pattern-matches it
 * against a catalog of well-known analytics / advertising trackers (GA4, GTM,
 * Meta Pixel, …). Each match becomes a {@link DetectedTracker} proposal the
 * plugin can turn into a gated {@link ManagedScript}.
 *
 * Design rules (mirrors {@link ./config-schema.ts}):
 * - NO external dependencies and NO DOM. It runs in the plugin, in Node tests,
 *   and could run in the runtime. Parsing is done with tolerant regexes, never
 *   `DOMParser`, so a single implementation works everywhere.
 * - Every match maps to one of the default consent categories
 *   (`analytics` / `marketing` / `preferences`) with the same Consent Mode
 *   signals the built-in presets use, so a proposal drops cleanly into config.
 * - The engine only *reports*; deciding what to add (and creating any missing
 *   category) is the adapter's job. This keeps it platform-neutral for the
 *   `core/` extraction in Phase 2.
 */

import type { ConsentModeSignal } from './config-schema.js';
import type { ScriptType } from './config-schema.js';

/* -------------------------------------------------------------------------- */
/* Category mapping                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The consent category a tracker is proposed under. These three ids match the
 * default categories shipped in {@link DEFAULT_CONFIG}, so a proposal maps onto
 * an existing category without inventing new taxonomy.
 */
export type TrackerCategoryId = 'analytics' | 'marketing' | 'preferences';

/** The Consent Mode signals implied by each tracker category. */
export const TRACKER_CATEGORY_SIGNALS: Record<TrackerCategoryId, ConsentModeSignal[]> = {
  analytics: ['analytics_storage'],
  marketing: ['ad_storage', 'ad_user_data', 'ad_personalization'],
  preferences: ['functionality_storage'],
};

/** Human label for a tracker category (used when auto-creating one). */
export const TRACKER_CATEGORY_LABEL: Record<TrackerCategoryId, string> = {
  analytics: 'Analytics',
  marketing: 'Marketing',
  preferences: 'Preferences',
};

/* -------------------------------------------------------------------------- */
/* Catalog                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One recognisable tracker. A signature matches either by the host of an
 * external `<script src>` ({@link srcHosts}) or by a fingerprint in inline code
 * / markup ({@link inlinePatterns}).
 */
export interface TrackerSignature {
  /** Stable catalog id (e.g. `ga4`). Also the dedupe key. */
  id: string;
  /** Display name (e.g. `Google Analytics 4`). */
  name: string;
  /** Vendor/company (e.g. `Google`). */
  vendor: string;
  /** Display host shown in the plugin (e.g. `googletagmanager.com`). */
  provider: string;
  /** Consent category this tracker is proposed under. */
  category: TrackerCategoryId;
  /** Host substrings that identify this tracker's external `<script src>`. */
  srcHosts: string[];
  /** Fingerprints matched against inline script bodies and the raw HTML. */
  inlinePatterns?: RegExp[];
  /**
   * Extract the vendor tag id (e.g. `G-XXXX`, `AW-XXXX`) from the matched src
   * URL or the surrounding HTML. Returns `undefined` when none is present.
   */
  extractTagId?: (haystack: string) => string | undefined;
  /**
   * Build the canonical external loader URL for a tracker detected only inline
   * (e.g. Meta Pixel's `fbevents.js`). Lets an inline-only match still become a
   * clean, blockable `src` managed script. Receives the extracted tag id (may
   * be `''`).
   */
  loader?: (tagId: string) => string;
}

/** First capture group of `re` over `s`, or `undefined`. */
function firstGroup(re: RegExp, s: string): string | undefined {
  const m = re.exec(s);
  return m && m[1] ? m[1] : undefined;
}

/**
 * The recognised trackers. Ordered roughly by ubiquity. Keeping this list a
 * plain array (not a map) preserves detection order in the results UI.
 */
export const TRACKER_CATALOG: readonly TrackerSignature[] = [
  {
    id: 'ga4',
    name: 'Google Analytics 4',
    vendor: 'Google',
    provider: 'googletagmanager.com',
    category: 'analytics',
    srcHosts: ['googletagmanager.com/gtag/js'],
    inlinePatterns: [/gtag\(\s*['"]config['"]\s*,\s*['"]G-[A-Z0-9]+/],
    extractTagId: (h) => firstGroup(/\b(G-[A-Z0-9]{6,})\b/, h),
    loader: (id) => `https://www.googletagmanager.com/gtag/js?id=${id || 'G-XXXXXXXXXX'}`,
  },
  {
    id: 'gtm',
    name: 'Google Tag Manager',
    vendor: 'Google',
    provider: 'googletagmanager.com',
    category: 'analytics',
    srcHosts: ['googletagmanager.com/gtm.js'],
    inlinePatterns: [/googletagmanager\.com\/gtm\.js/, /\bGTM-[A-Z0-9]+\b/],
    extractTagId: (h) => firstGroup(/\b(GTM-[A-Z0-9]{4,})\b/, h),
    loader: (id) => `https://www.googletagmanager.com/gtm.js?id=${id || 'GTM-XXXXXXX'}`,
  },
  {
    id: 'ua',
    name: 'Universal Analytics',
    vendor: 'Google',
    provider: 'google-analytics.com',
    category: 'analytics',
    srcHosts: ['google-analytics.com/analytics.js', 'google-analytics.com/ga.js'],
    inlinePatterns: [/\bUA-\d{4,}-\d+\b/],
    extractTagId: (h) => firstGroup(/\b(UA-\d{4,}-\d+)\b/, h),
  },
  {
    id: 'google-ads',
    name: 'Google Ads',
    vendor: 'Google',
    provider: 'googleadservices.com',
    category: 'marketing',
    srcHosts: ['googleadservices.com/pagead/conversion', 'googletagmanager.com/gtag/js?id=AW-'],
    inlinePatterns: [/\bAW-\d{6,}\b/],
    extractTagId: (h) => firstGroup(/\b(AW-\d{6,})\b/, h),
    loader: (id) => `https://www.googletagmanager.com/gtag/js?id=${id || 'AW-XXXXXXXXX'}`,
  },
  {
    id: 'meta-pixel',
    name: 'Meta Pixel',
    vendor: 'Meta',
    provider: 'connect.facebook.net',
    category: 'marketing',
    srcHosts: ['connect.facebook.net'],
    inlinePatterns: [/\bfbq\(\s*['"]init['"]/, /facebook\.com\/tr\?id=/],
    extractTagId: (h) =>
      firstGroup(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{6,})['"]/, h) ??
      firstGroup(/facebook\.com\/tr\?id=(\d{6,})/, h),
    loader: () => 'https://connect.facebook.net/en_US/fbevents.js',
  },
  {
    id: 'tiktok-pixel',
    name: 'TikTok Pixel',
    vendor: 'TikTok',
    provider: 'analytics.tiktok.com',
    category: 'marketing',
    srcHosts: ['analytics.tiktok.com'],
    inlinePatterns: [/\bttq\.load\(/],
    extractTagId: (h) => firstGroup(/ttq\.load\(\s*['"]([A-Z0-9]{10,})['"]/, h),
    loader: () => 'https://analytics.tiktok.com/i18n/pixel/events.js',
  },
  {
    id: 'linkedin-insight',
    name: 'LinkedIn Insight Tag',
    vendor: 'LinkedIn',
    provider: 'snap.licdn.com',
    category: 'marketing',
    srcHosts: ['snap.licdn.com'],
    inlinePatterns: [/_linkedin_partner_id/],
    extractTagId: (h) => firstGroup(/_linkedin_partner_id\s*=\s*['"](\d{4,})['"]/, h),
    loader: () => 'https://snap.licdn.com/li.lms-analytics/insight.min.js',
  },
  {
    id: 'twitter-pixel',
    name: 'X (Twitter) Pixel',
    vendor: 'X',
    provider: 'static.ads-twitter.com',
    category: 'marketing',
    srcHosts: ['static.ads-twitter.com'],
    inlinePatterns: [/\btwq\(/],
    extractTagId: (h) => firstGroup(/twq\(\s*['"](?:config|init)['"]\s*,\s*['"]([a-z0-9]{4,})['"]/, h),
    loader: () => 'https://static.ads-twitter.com/uwt.js',
  },
  {
    id: 'pinterest-tag',
    name: 'Pinterest Tag',
    vendor: 'Pinterest',
    provider: 's.pinimg.com',
    category: 'marketing',
    srcHosts: ['s.pinimg.com/ct'],
    inlinePatterns: [/\bpintrk\(/],
    extractTagId: (h) => firstGroup(/pintrk\(\s*['"]load['"]\s*,\s*['"](\d{6,})['"]/, h),
    loader: () => 'https://s.pinimg.com/ct/core.js',
  },
  {
    id: 'hotjar',
    name: 'Hotjar',
    vendor: 'Hotjar',
    provider: 'static.hotjar.com',
    category: 'analytics',
    srcHosts: ['static.hotjar.com', 'script.hotjar.com'],
    inlinePatterns: [/\bhjid\s*:/, /\.hotjar\.com/],
    extractTagId: (h) => firstGroup(/hjid\s*:\s*(\d{4,})/, h),
    loader: (id) => `https://static.hotjar.com/c/hotjar-${id || 'XXXXXXX'}.js?sv=6`,
  },
  {
    id: 'clarity',
    name: 'Microsoft Clarity',
    vendor: 'Microsoft',
    provider: 'clarity.ms',
    category: 'analytics',
    srcHosts: ['clarity.ms/tag'],
    inlinePatterns: [/clarity\.ms\/tag\//, /\bclarity\(\s*['"]/],
    extractTagId: (h) =>
      firstGroup(/clarity\.ms\/tag\/([a-z0-9]{6,})/, h) ??
      firstGroup(/["']clarity["'],\s*["']script["'],\s*["']([a-z0-9]{6,})["']/, h),
    loader: (id) => `https://www.clarity.ms/tag/${id || 'xxxxxxxxxx'}`,
  },
  {
    id: 'segment',
    name: 'Segment',
    vendor: 'Twilio',
    provider: 'cdn.segment.com',
    category: 'analytics',
    srcHosts: ['cdn.segment.com/analytics.js'],
    inlinePatterns: [/analytics\.load\(\s*['"][A-Za-z0-9]{8,}/],
    extractTagId: (h) => firstGroup(/analytics\.load\(\s*['"]([A-Za-z0-9]{8,})['"]/, h),
  },
  {
    id: 'mixpanel',
    name: 'Mixpanel',
    vendor: 'Mixpanel',
    provider: 'mixpanel.com',
    category: 'analytics',
    srcHosts: ['cdn.mxpanel.com', 'cdn.mixpanel.com'],
    inlinePatterns: [/\bmixpanel\.init\(/],
    extractTagId: (h) => firstGroup(/mixpanel\.init\(\s*['"]([a-f0-9]{16,})['"]/, h),
  },
  {
    id: 'plausible',
    name: 'Plausible Analytics',
    vendor: 'Plausible',
    provider: 'plausible.io',
    category: 'analytics',
    srcHosts: ['plausible.io/js/'],
    extractTagId: (h) => firstGroup(/data-domain=['"]([^'"]+)['"]/, h),
  },
  {
    id: 'intercom',
    name: 'Intercom',
    vendor: 'Intercom',
    provider: 'widget.intercom.io',
    category: 'preferences',
    srcHosts: ['widget.intercom.io', 'js.intercomcdn.com'],
    inlinePatterns: [/\bintercomSettings\b/, /\bIntercom\(/],
    extractTagId: (h) =>
      firstGroup(/app_id\s*:\s*['"]([a-z0-9]{4,})['"]/, h) ??
      firstGroup(/widget\.intercom\.io\/widget\/([a-z0-9]{4,})/, h),
    loader: (id) => `https://widget.intercom.io/widget/${id || 'xxxxxxxx'}`,
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Detection                                                                  */
/* -------------------------------------------------------------------------- */

/** A tracker found on a page, ready to be turned into a managed script. */
export interface DetectedTracker {
  /** The catalog {@link TrackerSignature.id} that matched. */
  id: string;
  /** Display name (from the catalog). */
  name: string;
  /** Vendor/company (from the catalog). */
  vendor: string;
  /** Display host (from the catalog). */
  provider: string;
  /** Suggested consent category id. */
  category: TrackerCategoryId;
  /** Consent Mode signals implied by the category. */
  signals: ConsentModeSignal[];
  /** Vendor tag id when one could be extracted (e.g. `G-ABC123`), else `''`. */
  tagId: string;
  /** How the proposed managed script is delivered. */
  type: ScriptType;
  /**
   * The payload for the managed script: the exact detected `src` URL, or a
   * canonical loader URL for an inline-only match. Empty only when neither is
   * available (rare — such a proposal needs manual setup).
   */
  value: string;
  /** Short, human-readable account of what matched (shown in the UI). */
  evidence: string;
}

/** A parsed `<script>` element: its `src` (if any) and inline body. */
interface ParsedScript {
  src: string;
  body: string;
}

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const SRC_ATTR_RE = /\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i;

/** Pull every `<script>` element out of `html` as `{ src, body }`. */
function parseScripts(html: string): ParsedScript[] {
  const out: ParsedScript[] = [];
  SCRIPT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SCRIPT_RE.exec(html)) !== null) {
    const attrs = m[1] ?? '';
    const body = m[2] ?? '';
    const srcMatch = SRC_ATTR_RE.exec(attrs);
    const src = srcMatch ? (srcMatch[2] ?? srcMatch[3] ?? srcMatch[4] ?? '').trim() : '';
    out.push({ src, body });
  }
  return out;
}

/** Case-insensitively test whether `url` contains any of `hosts`. */
function matchesHost(url: string, hosts: string[]): boolean {
  const u = url.toLowerCase();
  return hosts.some((h) => u.includes(h.toLowerCase()));
}

/**
 * Scan `html` for known trackers and return one proposal per distinct tracker.
 *
 * Detection is source-agnostic: an external `<script src>` matches by host; an
 * inline snippet or a tracking pixel (`<img>`/`<noscript>`) matches by
 * fingerprint. A tracker found both ways is reported once, preferring the
 * concrete `src` it was loaded from. Pure and side-effect-free.
 */
export function detectTrackers(html: string): DetectedTracker[] {
  if (!html) return [];
  const scripts = parseScripts(html);
  const srcs = scripts.map((s) => s.src).filter(Boolean);
  const inlineBlob = scripts.map((s) => s.body).join('\n');

  const results: DetectedTracker[] = [];
  for (const sig of TRACKER_CATALOG) {
    // 1. Prefer an external src match — it gives us the exact, blockable URL.
    const srcHit = srcs.find((src) => matchesHost(src, sig.srcHosts));

    // 2. Otherwise look for an inline / markup fingerprint. Inline code lives in
    //    script bodies; pixels (facebook.com/tr, data-domain) live in raw HTML,
    //    so test both.
    const inlineHit =
      !srcHit &&
      (sig.inlinePatterns?.some((re) => re.test(inlineBlob) || re.test(html)) ?? false);

    if (!srcHit && !inlineHit) continue;

    const tagId = sig.extractTagId?.(srcHit ?? '') || sig.extractTagId?.(inlineBlob) || sig.extractTagId?.(html) || '';

    let type: ScriptType;
    let value: string;
    let evidence: string;
    if (srcHit) {
      type = 'src';
      value = srcHit;
      evidence = `external script from ${sig.provider}`;
    } else if (sig.loader) {
      type = 'src';
      value = sig.loader(tagId);
      evidence = `inline snippet (${sig.provider})`;
    } else {
      type = 'inline';
      value = '';
      evidence = `inline snippet (${sig.provider})`;
    }

    results.push({
      id: sig.id,
      name: sig.name,
      vendor: sig.vendor,
      provider: sig.provider,
      category: sig.category,
      signals: [...TRACKER_CATEGORY_SIGNALS[sig.category]],
      tagId,
      type,
      value,
      evidence: tagId ? `${evidence} · ${tagId}` : evidence,
    });
  }
  return results;
}

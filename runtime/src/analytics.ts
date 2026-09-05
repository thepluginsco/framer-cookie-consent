/**
 * Anonymous consent analytics (Pro).
 *
 * When an analytics endpoint is configured, the runtime reports each consent
 * decision so the site owner can see accept/reject rates. What it sends is
 * deliberately minimal and PRIVACY-SAFE: the decision type and which categories
 * were granted — and NOTHING else. No IP (the endpoint sees the connection IP
 * but the payload never carries one), no cookie, no visitor id, no page URL.
 *
 * Delivery is best-effort and never blocks: `navigator.sendBeacon` when
 * available (survives page unload), otherwise a `keepalive` fetch. Any failure is
 * swallowed — analytics must never break the banner or the host page. When no
 * endpoint is set this module makes NO network call at all.
 */

import type { CookieConsentConfig } from '@framer-cookie-consent/shared';
import { onConsentChange, type ConsentState } from './consent-state.ts';

/** The decision shape a visitor made, derived from the granted categories. */
export type ConsentEventType = 'accept' | 'reject' | 'custom';

/** The minimal, anonymous event payload sent to the collection endpoint. */
export interface ConsentEvent {
  /** `accept` = all optional granted, `reject` = none, `custom` = a mix. */
  type: ConsentEventType;
  /** Granted map keyed by category id (`1` granted / `0` denied), optional cats only. */
  categories: Record<string, 0 | 1>;
  /** The `reconsentVersion` in effect, so counts can be bucketed per policy. */
  version: string;
}

/**
 * Classify a decision into accept / reject / custom by comparing the granted
 * OPTIONAL categories (required ones are always on and ignored). Pure and
 * unit-testable.
 *
 * @param config - The active configuration (source of which categories are optional).
 * @param state - The consent decision.
 * @returns The anonymous {@link ConsentEvent} to report.
 */
export function buildConsentEvent(config: CookieConsentConfig, state: ConsentState): ConsentEvent {
  const optional = config.categories.filter((c) => !c.required);
  const categories: Record<string, 0 | 1> = {};
  let granted = 0;
  for (const c of optional) {
    const ok = state.categories[c.id] === true;
    categories[c.id] = ok ? 1 : 0;
    if (ok) granted += 1;
  }
  const type: ConsentEventType =
    optional.length === 0 || granted === optional.length ? 'accept' : granted === 0 ? 'reject' : 'custom';
  return { type, categories, version: state.version };
}

/** POST an event body to the endpoint, preferring sendBeacon. Best-effort, never throws. */
function send(endpoint: string, body: string): void {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav && typeof nav.sendBeacon === 'function') {
      // Beacon survives page unload and is the ideal transport for telemetry.
      const blob = typeof Blob !== 'undefined' ? new Blob([body], { type: 'application/json' }) : body;
      nav.sendBeacon(endpoint, blob as BodyInit);
      return;
    }
    if (typeof fetch === 'function') {
      void fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
        credentials: 'omit',
        cache: 'no-store',
      }).catch(() => {
        /* best-effort */
      });
    }
  } catch {
    /* telemetry must never break the page */
  }
}

/**
 * Report one consent decision to the configured endpoint. No-op (no network)
 * when analytics is disabled (empty endpoint) or there is no browser.
 *
 * @param config - The active configuration.
 * @param state - The consent decision to report.
 */
export function reportConsent(config: CookieConsentConfig, state: ConsentState): void {
  const endpoint = config.analytics.endpoint.trim();
  if (!endpoint || typeof window === 'undefined') return;
  send(endpoint, JSON.stringify(buildConsentEvent(config, state)));
}

/**
 * Subscribe consent analytics to the consent lifecycle: report every future
 * decision. No-op when analytics is disabled. Call once during boot.
 *
 * @param config - The active configuration.
 * @returns An unsubscribe function (a no-op when analytics is disabled).
 */
export function installConsentAnalytics(config: CookieConsentConfig): () => void {
  if (!config.analytics.endpoint.trim()) return () => {};
  return onConsentChange((state) => reportConsent(config, state));
}

/**
 * A/B variant resolution for the runtime (Phase 4.1) — the impure half.
 *
 * The pure decisions (which variant, what it changes) live in the shared engine
 * ({@link resolveActiveVariant} calls into `ab-test`). This module owns only the
 * two side effects the engine deliberately leaves out:
 *   1. STICKY assignment — a returning visitor keeps the same variant, stored in
 *      localStorage and keyed by an {@link abTestSignature} so it self-invalidates
 *      when the author edits the test.
 *   2. RANDOMNESS — a uniform draw to bucket a first-time visitor.
 *
 * Every storage/crypto access is guarded (Safari private mode throws on
 * localStorage; `crypto` may be absent), degrading to a fresh random assignment
 * rather than crashing — telemetry/presentation must never break the banner.
 */

import {
  abTestSignature,
  applyVariant,
  chooseVariantId,
  findVariant,
  isAbTestActive,
  type CookieConsentConfig,
} from '@framer-cookie-consent/shared';

/** localStorage key holding the sticky `{ sig, id }` assignment. */
export const VARIANT_STORAGE_KEY = 'cc_ab';

/** The resolved A/B outcome for this page load. */
export interface ActiveVariant {
  /** The effective config: base with the assigned variant's presentation applied. */
  config: CookieConsentConfig;
  /** The assigned variant id, or `null` when no test is active. */
  variantId: string | null;
}

interface StoredAssignment {
  /** Signature of the test the assignment was made under (self-invalidates on edit). */
  sig: string;
  /** The assigned variant id. */
  id: string;
}

/** Read the sticky assignment, or `null` when absent/unreadable/malformed. */
function readStored(): StoredAssignment | null {
  try {
    const raw = localStorage.getItem(VARIANT_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<StoredAssignment>;
    if (typeof p.sig === 'string' && typeof p.id === 'string') return { sig: p.sig, id: p.id };
  } catch {
    /* localStorage unavailable or malformed — fall back to a fresh draw */
  }
  return null;
}

/** Persist the sticky assignment (best-effort; a failure just loses stickiness). */
function writeStored(assignment: StoredAssignment): void {
  try {
    localStorage.setItem(VARIANT_STORAGE_KEY, JSON.stringify(assignment));
  } catch {
    /* ignore — the visitor simply gets re-bucketed next load */
  }
}

/** A uniform random number in `[0, 1)`, preferring crypto, falling back to Math.random. */
function draw(): number {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c && typeof c.getRandomValues === 'function') {
      const u = c.getRandomValues(new Uint32Array(1))[0] ?? 0;
      return u / 0x1_0000_0000;
    }
  } catch {
    /* crypto unavailable */
  }
  return Math.random();
}

/**
 * Resolve the effective config + assigned variant for this load. When no test is
 * active it returns the base config verbatim with a `null` id (a cheap no-op —
 * no storage touched). When a test is active it reuses a valid sticky assignment
 * or draws (and persists) a fresh weighted one.
 *
 * @param config - The authored configuration (may carry an A/B test).
 * @returns The {@link ActiveVariant} to render + report.
 */
export function resolveActiveVariant(config: CookieConsentConfig): ActiveVariant {
  const test = config.abTest;
  if (!isAbTestActive(test)) return { config, variantId: null };

  const sig = abTestSignature(test);
  const stored = readStored();
  let id: string | null =
    stored && stored.sig === sig && findVariant(test, stored.id) ? stored.id : null;

  if (!id) {
    id = chooseVariantId(test, draw());
    if (id) writeStored({ sig, id });
  }

  return { config: applyVariant(config, findVariant(test, id)), variantId: id };
}

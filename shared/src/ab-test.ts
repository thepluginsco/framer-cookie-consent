/**
 * A/B consent-rate testing — the pure, platform-neutral engine (Phase 4.1).
 *
 * This module owns the *decisions* (is a test active, which variant a visitor
 * gets, what a variant does to the config) with zero I/O: no DOM, no storage, no
 * network, no randomness of its own — randomness is injected. The impure half
 * (sticky assignment via localStorage, tagging analytics with the variant) lives
 * in the runtime, exactly like every other core/adapter split in this codebase.
 *
 * The load-bearing invariant, enforced by {@link applyVariant}: a variant can
 * only change PRESENTATION (copy / banner layout / theme). Compliance-affecting
 * sections — categories, scripts, consent model, Consent Mode — are always
 * carried from the base config unchanged, so every visitor is protected
 * identically no matter which variant they see.
 */

import { mergeConfig, type AbTestConfig, type AbVariant, type CookieConsentConfig } from './config-schema.js';

/** A variant's effective weight (negative/NaN weights count as zero). */
function safeWeight(v: AbVariant): number {
  return Number.isFinite(v.weight) && v.weight > 0 ? v.weight : 0;
}

/** Sum of all variant weights. */
function totalWeight(variants: AbVariant[]): number {
  return variants.reduce((sum, v) => sum + safeWeight(v), 0);
}

/**
 * Whether the test should actually run: enabled, at least two variants, and a
 * positive total weight. A disabled or single-variant test is inert (the base
 * config renders and nothing is bucketed).
 */
export function isAbTestActive(test: AbTestConfig): boolean {
  return test.enabled && test.variants.length >= 2 && totalWeight(test.variants) > 0;
}

/**
 * Choose a variant id by weighted selection. Pure: `rand` (a number in `[0, 1)`)
 * is injected, so assignment is fully deterministic under test.
 *
 * @param test - The A/B test configuration.
 * @param rand - A uniform random number in `[0, 1)` (e.g. `Math.random()`).
 * @returns The selected variant id, or `null` when the test is inert.
 */
export function chooseVariantId(test: AbTestConfig, rand: number): string | null {
  if (!isAbTestActive(test)) return null;
  const total = totalWeight(test.variants);
  // Clamp into [0, 1) so a stray 1 (or out-of-range value) can't overshoot.
  const clamped = Number.isFinite(rand) ? Math.min(Math.max(rand, 0), 0.999_999_999) : 0;
  let threshold = clamped * total;
  for (const v of test.variants) {
    const w = safeWeight(v);
    if (w <= 0) continue;
    if (threshold < w) return v.id;
    threshold -= w;
  }
  // Floating-point safety net: return the last positively-weighted variant.
  for (let i = test.variants.length - 1; i >= 0; i--) {
    const v = test.variants[i];
    if (v && safeWeight(v) > 0) return v.id;
  }
  return null;
}

/** Find a variant by id, or `null` when the id is absent/unknown. */
export function findVariant(test: AbTestConfig, id: string | null): AbVariant | null {
  if (!id) return null;
  return test.variants.find((v) => v.id === id) ?? null;
}

/**
 * Apply a variant's presentation overrides onto a full base config, returning a
 * fresh, fully-valid config. Only `strings`, `banner` and `theme` are layered on;
 * every other section — crucially the compliance-affecting ones — is carried
 * through from `base` unchanged. Runs through {@link mergeConfig} so the result
 * is always schema-valid. `null` returns the base untouched.
 *
 * @param base - The authored (variant-free) configuration.
 * @param variant - The variant to apply, or `null` for the base.
 * @returns A complete, valid {@link CookieConsentConfig}.
 */
export function applyVariant(base: CookieConsentConfig, variant: AbVariant | null): CookieConsentConfig {
  if (!variant) return base;
  return mergeConfig({
    ...base,
    strings: { ...base.strings, ...variant.strings },
    banner: { ...base.banner, ...variant.banner },
    theme: { ...base.theme, ...variant.theme },
  });
}

/**
 * A stable signature over the test definition (each variant's id + weight, in
 * order). It changes whenever the set of variants or their weights changes, so a
 * stored sticky assignment can be invalidated when the author edits the test —
 * a visitor is only kept on a variant that still exists with the same odds.
 *
 * @param test - The A/B test configuration.
 * @returns A signature string (`''` when the test is disabled).
 */
export function abTestSignature(test: AbTestConfig): string {
  if (!test.enabled) return '';
  return test.variants.map((v) => `${v.id}:${safeWeight(v)}`).join('|');
}

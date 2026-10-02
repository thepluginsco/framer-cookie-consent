/**
 * Plan limits: a site can only publish the features its license tier includes.
 * The free plan keeps consent, Consent Mode and script blocking in the standard
 * bottom-bar design; every paid tier passes through untouched.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  applyPlanLimits,
  mergeConfig,
  stripLicense,
  toPublishedConfig,
} from "../shared/src/index.js";

/** A config that switches on every paid feature. */
function loaded(tier: "trial" | "pro" | "lifetime" | "agency") {
  return mergeConfig({
    behavior: { consentModel: "auto", showMode: "by-region", showRegions: ["IN"] },
    geo: { endpoint: "https://geo.example/where" },
    analytics: { endpoint: "https://stats.example" },
    preferenceCenter: { showVendors: true, perVendorToggles: true },
    abTest: { enabled: true, variants: [{ id: "a", weight: 1 }] },
    banner: { layout: "modal", overlay: true },
    theme: { accent: "#FF0066", mode: "dark", borderRadius: 4, fontFamily: "Georgia" },
    strings: { translations: { fr: { title: "Bonjour" } } },
    advanced: { customCss: ".cc-banner{color:red}", floatingButton: true },
    scripts: [{ name: "GA", type: "src", value: "https://example.com/ga.js", category: "analytics" }],
    license: { key: "CNSNT-TEST", tier },
  });
}

describe("applyPlanLimits", () => {
  it("cuts the free plan down to the standard bottom-bar banner", () => {
    const out = applyPlanLimits(loaded("trial"));
    expect(out.banner.layout).toBe("bar");
    expect(out.banner.overlay).toBe(false);
    expect(out.theme).toEqual(DEFAULT_CONFIG.theme);
    expect(out.advanced.customCss).toBe("");
    expect(out.advanced.floatingButton).toBe(false);
    expect(out.preferenceCenter).toEqual({ showVendors: false, perVendorToggles: false });
    expect(out.abTest).toEqual({ enabled: false, variants: [] });
    expect(out.strings.translations).toEqual({});
    expect(out.behavior.consentModel).toBe("opt-in");
    expect(out.behavior.showMode).toBe("eu-only");
    expect(out.geo.endpoint).toBe("");
    expect(out.analytics.endpoint).toBe("");
  });

  it("keeps what the free plan includes: categories, scripts, Consent Mode, opt-out", () => {
    const input = mergeConfig({ ...loaded("trial"), behavior: { consentModel: "opt-out", showMode: "everywhere" } });
    const out = applyPlanLimits(input);
    expect(out.categories).toEqual(input.categories);
    expect(out.scripts).toEqual(input.scripts);
    expect(out.consentMode).toEqual(input.consentMode);
    expect(out.behavior.consentModel).toBe("opt-out");
    expect(out.behavior.showMode).toBe("everywhere");
  });

  it("leaves every paid tier untouched", () => {
    for (const tier of ["pro", "lifetime", "agency"] as const) {
      const input = loaded(tier);
      expect(applyPlanLimits(input)).toBe(input);
    }
  });
});

describe("toPublishedConfig", () => {
  it("applies the plan limits and strips the license key", () => {
    const free = toPublishedConfig(loaded("trial"));
    expect(free.license.key).toBeNull();
    expect(free.banner.layout).toBe("bar");

    const paid = toPublishedConfig(loaded("pro"));
    expect(paid.license.key).toBeNull();
    expect(paid.banner.layout).toBe("modal");
    expect(paid.theme.accent).toBe("#FF0066");
  });

  it("stripLicense alone never re-limits an already-published paid config", () => {
    const published = toPublishedConfig(loaded("pro"));
    // The published copy carries tier "trial"; serving it again must not cut it down.
    expect(stripLicense(published).banner.layout).toBe("modal");
  });
});

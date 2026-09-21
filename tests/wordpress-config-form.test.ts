/**
 * Tests for the WordPress admin's pure form→config mapping (Phase 3.3).
 *
 * Mirrors the Webflow/embed config-form tests: default seeding, category
 * inclusion / opt-out flags, dropping empty scripts, one-engine identity (the
 * config the admin publishes produces the byte-identical loader), plus the
 * WordPress-specific `mergeDetectedScripts` (idempotent pre-fill of active-plugin
 * trackers).
 */

import { describe, expect, it } from "vitest";
import {
  buildLoaderHtml,
  configScriptBody,
  DEFAULT_CONFIG,
  type DetectedTracker,
} from "@framer-cookie-consent/shared";
import {
  configFromForm,
  defaultFormState,
  mergeDetectedScripts,
  OPTIONAL_CATEGORY_IDS,
  type ScriptFormState,
} from "../apps/wordpress-plugin/src/config-form.js";

describe("defaultFormState", () => {
  it("seeds from DEFAULT_CONFIG", () => {
    const s = defaultFormState();
    expect(s.title).toBe(DEFAULT_CONFIG.strings.title);
    expect(s.layout).toBe(DEFAULT_CONFIG.banner.layout);
    expect(s.consentModel).toBe(DEFAULT_CONFIG.behavior.consentModel);
    expect(s.enableConsentMode).toBe(DEFAULT_CONFIG.consentMode.enableConsentMode);
    for (const id of OPTIONAL_CATEGORY_IDS) expect(s.categories[id].enabled).toBe(true);
    expect(s.categories.analytics.defaultOn).toBe(true);
    expect(s.categories.marketing.defaultOn).toBe(false);
  });
});

describe("configFromForm", () => {
  it("produces a runtime-valid config (necessary always present)", () => {
    const config = configFromForm(defaultFormState());
    expect(config.categories.find((c) => c.id === "necessary")).toBeTruthy();
  });

  it("drops a disabled category and empty scripts", () => {
    const state = defaultFormState();
    state.categories.marketing.enabled = false;
    state.scripts = [
      { name: "GA", category: "analytics", type: "src", value: "https://x/ga.js" },
      { name: "", category: "analytics", type: "src", value: "   " },
    ];
    const config = configFromForm(state);
    expect(config.categories.find((c) => c.id === "marketing")).toBeUndefined();
    expect(config.scripts).toHaveLength(1);
    expect(config.scripts[0]!.name).toBe("GA");
  });

  it("threads an opt-out default into the category", () => {
    const state = defaultFormState();
    state.categories.marketing.defaultOn = true;
    const config = configFromForm(state);
    expect(config.categories.find((c) => c.id === "marketing")!.defaultEnabled).toBe(true);
  });

  it("one engine: publishing this config yields the byte-identical loader", () => {
    const config = configFromForm(defaultFormState());
    const block = buildLoaderHtml(config);
    // The config <script> body inside the loader is the shared configScriptBody.
    expect(block).toContain(`<script>${configScriptBody(config)}</script>`);
  });
});

describe("mergeDetectedScripts", () => {
  const tracker = (value: string, name = "GA4"): DetectedTracker => ({
    id: "ga4",
    name,
    vendor: "Google",
    provider: "google",
    category: "analytics",
    signals: ["analytics_storage"],
    tagId: "",
    type: "src",
    value,
    evidence: "WordPress plugin \"Site Kit\"",
  });

  it("appends detected trackers as script rows", () => {
    const out = mergeDetectedScripts([], [tracker("https://x/ga.js")]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "GA4", category: "analytics", type: "src", value: "https://x/ga.js" });
  });

  it("skips a tracker already present (idempotent)", () => {
    const existing: ScriptFormState[] = [
      { name: "Manual", category: "analytics", type: "src", value: "https://x/ga.js" },
    ];
    const out = mergeDetectedScripts(existing, [tracker("https://x/ga.js")]);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("Manual");
  });

  it("does not mutate the input array", () => {
    const existing: ScriptFormState[] = [];
    const out = mergeDetectedScripts(existing, [tracker("https://x/ga.js")]);
    expect(existing).toHaveLength(0);
    expect(out).toHaveLength(1);
  });

  it("ignores detected trackers with an empty value", () => {
    const out = mergeDetectedScripts([], [tracker("   ")]);
    expect(out).toEqual([]);
  });
});

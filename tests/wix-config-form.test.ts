/**
 * Tests for the Wix dashboard's pure form→config mapping (Phase 3.5).
 *
 * The panel's DOM wiring isn't worth a browser test, but its one piece of real
 * logic — turning the flat form state into a runtime-valid config — is. Locks in
 * default seeding, category inclusion / opt-out flags, dropping empty scripts, and
 * one-engine identity: the config the dashboard stores serializes to the
 * byte-identical body the shared loader emits.
 */

import { describe, expect, it } from "vitest";
import { configScriptBody, DEFAULT_CONFIG, serialize } from "@framer-cookie-consent/shared";
import {
  configFromForm,
  defaultFormState,
  OPTIONAL_CATEGORY_IDS,
} from "../apps/wix-app/src/dashboard/config-form.js";

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
  it("produces a complete, serializable config", () => {
    const config = configFromForm(defaultFormState());
    // Round-trips through the shared serializer (what the config store persists).
    expect(() => JSON.parse(serialize(config))).not.toThrow();
    expect(config.categories.find((c) => c.id === "necessary")).toBeDefined();
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

  it("one engine: the config drives the shared configScriptBody bootstrap", () => {
    const config = configFromForm(defaultFormState());
    const body = configScriptBody(config);
    // The loader body every front-end shares: assign the serialized config.
    expect(body.startsWith("window.__CC_CONFIG__=")).toBe(true);
    expect(body.endsWith(";")).toBe(true);
    // It is deterministic for a given config (what the store persists + serves).
    expect(configScriptBody(config)).toBe(body);
  });
});

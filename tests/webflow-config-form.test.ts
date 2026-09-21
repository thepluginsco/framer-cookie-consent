/**
 * Tests for the Webflow Designer's pure form→config mapping (Phase 3.2).
 *
 * The panel's DOM wiring isn't worth a browser test, but its one piece of real
 * logic — turning the flat form state into a runtime-valid config that the shared
 * Webflow builder accepts — is. Locks in default seeding, category inclusion /
 * opt-out flags, dropping empty scripts, and one-engine identity: the config a
 * Designer publishes registers the byte-identical inline body the Framer loader
 * and the embed emit.
 */

import { describe, expect, it } from "vitest";
import {
  buildWebflowRegistrations,
  configScriptBody,
  DEFAULT_CONFIG,
  WEBFLOW_CONFIG_NAME,
} from "@framer-cookie-consent/shared";
import {
  configFromForm,
  defaultFormState,
  OPTIONAL_CATEGORY_IDS,
} from "../apps/webflow-app/src/designer/config-form.js";

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
  it("produces a config the shared Webflow builder accepts", () => {
    const config = configFromForm(defaultFormState());
    const regs = buildWebflowRegistrations(config, "sha384-fake");
    // Consent Mode default (on by default) + config = 2 inline; runtime hosted.
    expect(regs.inline.some((r) => r.displayName === WEBFLOW_CONFIG_NAME)).toBe(true);
    expect(regs.runtime.integrityHash).toBe("sha384-fake");
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

  it("one engine: the config inline body matches the shared configScriptBody", () => {
    const config = configFromForm(defaultFormState());
    const regs = buildWebflowRegistrations(config, "sha384-fake");
    const configReg = regs.inline.find((r) => r.displayName === WEBFLOW_CONFIG_NAME)!;
    expect(configReg.sourceCode).toBe(configScriptBody(config));
  });
});

/**
 * Tests for the Shopify authoring page's pure form→config mapping (Phase 3.4).
 *
 * Locks in default seeding, category inclusion / opt-out flags, dropping empty
 * scripts, and one-engine identity: the config the page deploys bakes the
 * byte-identical loader body the Framer loader, the embed, Webflow and WordPress
 * emit.
 */

import { describe, expect, it } from "vitest";
import {
  buildShopifyAppEmbedBlock,
  configScriptBody,
  DEFAULT_CONFIG,
} from "@framer-cookie-consent/shared";
import {
  configFromForm,
  defaultFormState,
  OPTIONAL_CATEGORY_IDS,
} from "../apps/shopify-app/src/config-form.js";

describe("defaultFormState", () => {
  it("seeds from DEFAULT_CONFIG", () => {
    const state = defaultFormState();
    expect(state.title).toBe(DEFAULT_CONFIG.strings.title);
    expect(state.accent).toBe(DEFAULT_CONFIG.theme.accent);
    expect(state.showMode).toBe(DEFAULT_CONFIG.behavior.showMode);
    expect(state.consentModel).toBe(DEFAULT_CONFIG.behavior.consentModel);
    expect(state.enableConsentMode).toBe(DEFAULT_CONFIG.consentMode.enableConsentMode);
    expect(state.scripts).toEqual([]);
    for (const id of OPTIONAL_CATEGORY_IDS) {
      expect(state.categories[id].enabled).toBe(true);
    }
  });

  it("returns a fresh object each call (no shared mutation)", () => {
    const a = defaultFormState();
    a.categories.analytics.enabled = false;
    expect(defaultFormState().categories.analytics.enabled).toBe(true);
  });
});

describe("configFromForm", () => {
  it("always includes the always-on necessary category", () => {
    const config = configFromForm(defaultFormState());
    const necessary = config.categories.find((c) => c.id === "necessary");
    expect(necessary?.required).toBe(true);
  });

  it("drops a disabled optional category", () => {
    const state = defaultFormState();
    state.categories.marketing.enabled = false;
    const config = configFromForm(state);
    expect(config.categories.some((c) => c.id === "marketing")).toBe(false);
    expect(config.categories.some((c) => c.id === "analytics")).toBe(true);
  });

  it("threads the opt-out default onto a category", () => {
    const state = defaultFormState();
    state.categories.marketing.defaultOn = true;
    const config = configFromForm(state);
    expect(config.categories.find((c) => c.id === "marketing")?.defaultEnabled).toBe(true);
  });

  it("keeps a filled script and drops an empty one", () => {
    const state = defaultFormState();
    state.scripts = [
      { name: "GA4", category: "analytics", type: "src", value: "https://example.com/ga.js" },
      { name: "empty", category: "analytics", type: "src", value: "   " },
    ];
    const config = configFromForm(state);
    expect(config.scripts).toHaveLength(1);
    expect(config.scripts[0]?.value).toBe("https://example.com/ga.js");
  });

  it("one engine: the deployed block bakes the byte-identical loader body", () => {
    const state = defaultFormState();
    const config = configFromForm(state);
    const { liquid } = buildShopifyAppEmbedBlock(config);
    expect(liquid).toContain(`<script>${configScriptBody(config)}</script>`);
  });
});

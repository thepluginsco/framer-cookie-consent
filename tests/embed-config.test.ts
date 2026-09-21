/**
 * Tests for the hosted embed config page's pure form→config mapping (Phase 3.1).
 *
 * The page's DOM wiring isn't worth a browser test, but its ONE piece of real
 * logic — turning the flat form state into a runtime-valid config — is. These
 * lock in that the mapping honours category inclusion/opt-out flags, drops empty
 * scripts, threads behavior/appearance/content through unchanged, and that the
 * result is byte-identical whether it flows through `configFromForm` or is fed
 * straight to `buildEmbedSnippet` (one engine, no drift).
 */

import { describe, expect, it } from "vitest";
import {
  buildEmbedSnippet,
  DEFAULT_CONFIG,
  parse,
  serialize,
} from "@framer-cookie-consent/shared";
import {
  configFromForm,
  defaultFormState,
  OPTIONAL_CATEGORY_IDS,
} from "../apps/embed-config/src/config-from-form.js";
import { buildPreviewDocument, previewConfig } from "../apps/embed-config/src/preview.js";

describe("defaultFormState", () => {
  it("seeds from DEFAULT_CONFIG so the page opens on shared defaults", () => {
    const s = defaultFormState();
    expect(s.title).toBe(DEFAULT_CONFIG.strings.title);
    expect(s.layout).toBe(DEFAULT_CONFIG.banner.layout);
    expect(s.consentModel).toBe(DEFAULT_CONFIG.behavior.consentModel);
    expect(s.enableConsentMode).toBe(DEFAULT_CONFIG.consentMode.enableConsentMode);
    // All three optional categories are present by default.
    for (const id of OPTIONAL_CATEGORY_IDS) expect(s.categories[id].enabled).toBe(true);
    // Analytics is opt-out default-on; marketing/preferences default-off.
    expect(s.categories.analytics.defaultOn).toBe(true);
    expect(s.categories.marketing.defaultOn).toBe(false);
  });
});

describe("configFromForm", () => {
  it("produces a valid, current-schema config", () => {
    const cfg = configFromForm(defaultFormState());
    expect(cfg.meta.schemaVersion).toBe(DEFAULT_CONFIG.meta.schemaVersion);
    // necessary is always first and required.
    expect(cfg.categories[0]?.id).toBe("necessary");
    expect(cfg.categories[0]?.required).toBe(true);
  });

  it("drops a disabled optional category", () => {
    const s = defaultFormState();
    s.categories.marketing.enabled = false;
    const cfg = configFromForm(s);
    const ids = cfg.categories.map((c) => c.id);
    expect(ids).toContain("analytics");
    expect(ids).not.toContain("marketing");
  });

  it("honours the opt-out default-on flag", () => {
    const s = defaultFormState();
    s.categories.marketing.defaultOn = true;
    const cfg = configFromForm(s);
    const marketing = cfg.categories.find((c) => c.id === "marketing");
    expect(marketing?.defaultEnabled).toBe(true);
  });

  it("threads content, appearance and behavior through unchanged", () => {
    const s = defaultFormState();
    s.title = "Cookies?";
    s.accent = "#ff0066";
    s.borderRadius = 4;
    s.showMode = "everywhere";
    s.consentModel = "opt-out";
    s.respectGpc = false;
    const cfg = configFromForm(s);
    expect(cfg.strings.title).toBe("Cookies?");
    expect(cfg.theme.accent).toBe("#ff0066");
    expect(cfg.theme.borderRadius).toBe(4);
    expect(cfg.behavior.showMode).toBe("everywhere");
    expect(cfg.behavior.consentModel).toBe("opt-out");
    expect(cfg.behavior.respectGpc).toBe(false);
  });

  it("includes a filled script and drops an empty one", () => {
    const s = defaultFormState();
    s.scripts = [
      { name: "GA4", category: "analytics", type: "src", value: "https://www.googletagmanager.com/gtag/js?id=G-XXesc" },
      { name: "Empty", category: "analytics", type: "src", value: "   " },
    ];
    const cfg = configFromForm(s);
    expect(cfg.scripts).toHaveLength(1);
    expect(cfg.scripts[0]?.name).toBe("GA4");
    expect(cfg.scripts[0]?.provider).toBe("www.googletagmanager.com");
    expect(cfg.scripts[0]?.category).toBe("analytics");
  });

  it("names an unnamed script by its type", () => {
    const s = defaultFormState();
    s.scripts = [{ name: "", category: "analytics", type: "inline", value: "console.log(1)" }];
    const cfg = configFromForm(s);
    expect(cfg.scripts[0]?.name).toBe("Inline script");
    expect(cfg.scripts[0]?.provider).toBe("");
  });

  it("survives a serialize→parse round-trip unchanged (runtime-readable)", () => {
    const cfg = configFromForm(defaultFormState());
    expect(parse(serialize(cfg))).toEqual(cfg);
  });
});

describe("preview overrides", () => {
  it("forces showMode=everywhere and consentModel=opt-in for the preview only", () => {
    const s = defaultFormState();
    s.showMode = "eu-only";
    s.consentModel = "opt-out";
    const authored = configFromForm(s);
    const preview = previewConfig(authored);
    // The authored config the user copies is untouched...
    expect(authored.behavior.showMode).toBe("eu-only");
    expect(authored.behavior.consentModel).toBe("opt-out");
    // ...while the preview always shows and always prompts.
    expect(preview.behavior.showMode).toBe("everywhere");
    expect(preview.behavior.consentModel).toBe("opt-in");
  });

  it("builds a preview document that embeds the runtime snippet", () => {
    const doc = buildPreviewDocument(configFromForm(defaultFormState()));
    expect(doc).toContain("<!DOCTYPE html>");
    expect(doc).toContain("window.__CC_CONFIG__");
    expect(doc).toContain("cdn.jsdelivr.net");
  });
});

describe("one engine (no drift)", () => {
  it("the page's snippet equals buildEmbedSnippet on the same config", () => {
    const cfg = configFromForm(defaultFormState());
    const viaPage = buildEmbedSnippet(cfg);
    const direct = buildEmbedSnippet(parse(serialize(cfg)));
    expect(viaPage).toBe(direct);
  });
});

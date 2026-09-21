/**
 * Tests for the Shopify App shell's block composer (Phase 3.4).
 *
 * `buildConsentfulBlock` wraps the shared `buildShopifyAppEmbedBlock` and adds
 * the ONE shell-owned piece: the deferred consent-bridge `<script>`. These tests
 * prove it (a) keeps the shared loader block verbatim (one engine), (b) adds the
 * bridge tag via `asset_url` OUTSIDE the `{% raw %}` wrapper, and (c) leaves the
 * `{% schema %}` block intact and last.
 */

import { describe, expect, it } from "vitest";
import {
  buildShopifyAppEmbedBlock,
  mergeConfig,
  SHOPIFY_BLOCK_FILENAME,
} from "@framer-cookie-consent/shared";
import { buildConsentfulBlock, BRIDGE_ASSET_FILE } from "../apps/shopify-app/src/extension.js";

describe("buildConsentfulBlock", () => {
  it("keeps the same filename as the core block", () => {
    expect(buildConsentfulBlock(mergeConfig()).filename).toBe(SHOPIFY_BLOCK_FILENAME);
  });

  it("contains the entire shared loader block verbatim (one engine)", () => {
    const config = mergeConfig();
    const core = buildShopifyAppEmbedBlock(config).liquid;
    // The core block is split only at the schema boundary, so everything up to
    // `{% schema %}` must survive unchanged.
    const coreHead = core.slice(0, core.indexOf("\n{% schema %}"));
    expect(buildConsentfulBlock(config).liquid).toContain(coreHead);
  });

  it("adds the bridge tag via asset_url", () => {
    const { liquid } = buildConsentfulBlock(mergeConfig());
    expect(liquid).toContain(`<script src="{{ '${BRIDGE_ASSET_FILE}' | asset_url }}" defer></script>`);
  });

  it("puts the bridge tag OUTSIDE the {% raw %} wrapper", () => {
    const { liquid } = buildConsentfulBlock(mergeConfig());
    const endRaw = liquid.indexOf("{%- endraw -%}");
    const bridge = liquid.indexOf("asset_url");
    expect(endRaw).toBeGreaterThan(-1);
    expect(bridge).toBeGreaterThan(endRaw); // bridge comes after raw is closed
  });

  it("keeps the schema block intact and after the bridge tag", () => {
    const { liquid } = buildConsentfulBlock(mergeConfig());
    const bridge = liquid.indexOf("asset_url");
    const schema = liquid.indexOf("{% schema %}");
    expect(schema).toBeGreaterThan(bridge);
    expect(liquid).toContain("{% endschema %}");
    // The schema JSON still parses to a head-targeted app embed.
    const json = liquid.slice(
      liquid.indexOf("{% schema %}") + "{% schema %}".length,
      liquid.indexOf("{% endschema %}"),
    );
    const parsed = JSON.parse(json) as { target: string };
    expect(parsed.target).toBe("head");
  });

  it("passes options through to the core builder (runtimeUrl override)", () => {
    const { liquid } = buildConsentfulBlock(mergeConfig(), { runtimeUrl: "https://cdn.example/consent.js" });
    expect(liquid).toContain('<script src="https://cdn.example/consent.js" defer></script>');
  });
});

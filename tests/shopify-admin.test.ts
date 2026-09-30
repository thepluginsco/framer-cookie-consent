/**
 * Tests for the embedded Shopify admin app's publish path: the static
 * metafield-driven app embed (and that the committed .liquid matches it), and
 * the Admin GraphQL requests `ShopifyAdminClient` sends through App Bridge.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  buildShopifyAppEmbedBlock,
  buildShopifyLoaderHtml,
  isShopifyEmbedEnabled,
  mergeConfig,
  RUNTIME_VERSION,
  SHOPIFY_BLOCK_FILENAME,
} from "@framer-cookie-consent/shared";
import { BRIDGE_ASSET_FILE, buildShippedBlock } from "../apps/shopify-app/src/extension.js";
import { ADMIN_GRAPHQL_URL, ShopifyAdminClient } from "../apps/shopify-app/src/shopify-admin.js";

describe("metafield-driven app embed", () => {
  it("prints the loader metafield and the bridge only once published", () => {
    const { filename, liquid } = buildShippedBlock();
    expect(filename).toBe(SHOPIFY_BLOCK_FILENAME);
    const guard = liquid.indexOf("{%- if app.metafields.consentful.loader -%}");
    const print = liquid.indexOf("{{ app.metafields.consentful.loader.value }}");
    const bridge = liquid.indexOf(`'${BRIDGE_ASSET_FILE}' | asset_url`);
    const end = liquid.indexOf("{%- endif -%}");
    expect(guard).toBeGreaterThan(-1);
    expect(print).toBeGreaterThan(guard);
    expect(bridge).toBeGreaterThan(print);
    expect(end).toBeGreaterThan(bridge);
    expect(liquid.indexOf("{% schema %}")).toBeGreaterThan(end);
  });

  it("is config-independent (no baked config or runtime pin)", () => {
    const { liquid } = buildShippedBlock();
    expect(liquid).not.toContain("__CC_CONFIG__");
    expect(liquid).not.toContain(RUNTIME_VERSION);
  });

  it("matches the committed extensions/consentful/blocks/consentful.liquid", () => {
    const file = fileURLToPath(
      new URL("../apps/shopify-app/extensions/consentful/blocks/consentful.liquid", import.meta.url),
    );
    expect(readFileSync(file, "utf8")).toBe(buildShippedBlock().liquid);
  });

  it("stores the same loader bytes the baked block wraps in {% raw %}", () => {
    const config = mergeConfig();
    expect(buildShopifyAppEmbedBlock(config).liquid).toContain(buildShopifyLoaderHtml(config));
  });
});

/** Fake App Bridge fetch: records GraphQL calls and answers by operation. */
function fakeAdmin(extra: Record<string, unknown> = {}) {
  const calls: { url: string; query: string; variables?: Record<string, any> }[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { query: string; variables?: Record<string, any> };
    calls.push({ url: String(input), ...body });
    let data: unknown;
    if (body.query.includes("metafieldsSet")) data = { metafieldsSet: { userErrors: [] } };
    else if (body.query.includes("metafieldsDelete")) data = { metafieldsDelete: { userErrors: [] } };
    else if (body.query.includes("metafield(")) data = { currentAppInstallation: { metafield: extra.stored ?? null } };
    else
      data = {
        currentAppInstallation: { id: "gid://shopify/AppInstallation/1" },
        shop: { myshopifyDomain: "demo.myshopify.com", primaryDomain: { host: "shop.example.com" } },
      };
    return new Response(JSON.stringify({ data }), { status: 200 });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe("ShopifyAdminClient", () => {
  it("resolves the installation and store domains via direct API access", async () => {
    const { impl, calls } = fakeAdmin();
    const ctx = await new ShopifyAdminClient({ fetchImpl: impl }).shopContext();
    expect(ctx).toEqual({
      installationId: "gid://shopify/AppInstallation/1",
      myshopifyDomain: "demo.myshopify.com",
      primaryHost: "shop.example.com",
    });
    expect(calls[0]!.url).toBe(ADMIN_GRAPHQL_URL);
    expect(ADMIN_GRAPHQL_URL.startsWith("shopify:admin/api/")).toBe(true);
  });

  it("publishes the loader + license-free config as installation metafields", async () => {
    const { impl, calls } = fakeAdmin();
    const config = mergeConfig({ license: { key: "SECRET-KEY" } } as never);
    await new ShopifyAdminClient({ fetchImpl: impl }).publish(config);

    const set = calls.find((c) => c.query.includes("metafieldsSet"))!;
    const [loader, stored] = set.variables!.metafields as Record<string, string>[];
    expect(loader).toMatchObject({
      ownerId: "gid://shopify/AppInstallation/1",
      namespace: "consentful",
      key: "loader",
      type: "multi_line_text_field",
      value: buildShopifyLoaderHtml(config),
    });
    expect(stored).toMatchObject({ namespace: "consentful", key: "config", type: "json" });
    // The license key never leaves the editor.
    expect(loader!.value).not.toContain("SECRET-KEY");
    expect(stored!.value).not.toContain("SECRET-KEY");
  });

  it("honours a runtimeUrl override in the stored loader", async () => {
    const { impl, calls } = fakeAdmin();
    await new ShopifyAdminClient({ fetchImpl: impl, runtimeUrl: "https://cdn.example/c.js" }).publish(mergeConfig());
    const set = calls.find((c) => c.query.includes("metafieldsSet"))!;
    expect(set.variables!.metafields[0].value).toContain('<script src="https://cdn.example/c.js" defer></script>');
  });

  it("remove deletes both metafields", async () => {
    const { impl, calls } = fakeAdmin();
    await new ShopifyAdminClient({ fetchImpl: impl }).remove();
    const del = calls.find((c) => c.query.includes("metafieldsDelete"))!;
    expect(del.variables!.metafields.map((m: { key: string }) => m.key)).toEqual(["loader", "config"]);
  });

  it("loadConfig returns null when unpublished and parses the stored config otherwise", async () => {
    expect(await new ShopifyAdminClient({ fetchImpl: fakeAdmin().impl }).loadConfig()).toBeNull();
    const stored = { value: JSON.stringify(mergeConfig({ strings: { title: "Hi there" } } as never)) };
    const loaded = await new ShopifyAdminClient({ fetchImpl: fakeAdmin({ stored }).impl }).loadConfig();
    expect(loaded?.strings.title).toBe("Hi there");
  });

  it("surfaces GraphQL userErrors", async () => {
    const impl = (async () =>
      new Response(
        JSON.stringify({
          data: {
            currentAppInstallation: { id: "x" },
            shop: { myshopifyDomain: "d", primaryDomain: null },
            metafieldsSet: { userErrors: [{ field: null, message: "Value too long" }] },
          },
        }),
      )) as unknown as typeof fetch;
    await expect(new ShopifyAdminClient({ fetchImpl: impl }).publish(mergeConfig())).rejects.toThrow("Value too long");
  });
});

/** A settings_data.json the way Shopify writes it (comment header + current.blocks). */
function settingsData(blocks: Record<string, unknown>, asPreset = false): string {
  const current = { blocks, sections: {} };
  const body = asPreset ? { current: "Default", presets: { Default: current } } : { current };
  return `/*\n * IMPORTANT: The contents of this file are auto-generated.\n */\n${JSON.stringify(body, null, 2)}`;
}
const OUR_TYPE = "shopify://apps/consentful/blocks/consentful/0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

describe("isShopifyEmbedEnabled", () => {
  it("is true when our embed block is present and not disabled", () => {
    expect(isShopifyEmbedEnabled(settingsData({ "1": { type: OUR_TYPE, disabled: false, settings: {} } }))).toBe(true);
    expect(isShopifyEmbedEnabled(settingsData({ "1": { type: OUR_TYPE, settings: {} } }))).toBe(true);
  });

  it("is false when switched off or never added", () => {
    expect(isShopifyEmbedEnabled(settingsData({ "1": { type: OUR_TYPE, disabled: true } }))).toBe(false);
    expect(isShopifyEmbedEnabled(settingsData({}))).toBe(false);
    expect(isShopifyEmbedEnabled(JSON.stringify({ current: {} }))).toBe(false);
  });

  it("ignores other apps' embeds and same-named sections", () => {
    const other = "shopify://apps/other-app/blocks/cookie-banner/abc";
    expect(isShopifyEmbedEnabled(settingsData({ "1": { type: other, disabled: false } }))).toBe(false);
    expect(isShopifyEmbedEnabled(settingsData({ "1": { type: "consentful" } }))).toBe(false);
  });

  it("follows `current` when it names a preset", () => {
    expect(isShopifyEmbedEnabled(settingsData({ "1": { type: OUR_TYPE, disabled: false } }, true))).toBe(true);
  });

  it("returns null for unreadable content", () => {
    expect(isShopifyEmbedEnabled("not json")).toBeNull();
  });
});

describe("ShopifyAdminClient.embedStatus", () => {
  function themesFetch(body: unknown, status = 200) {
    const calls: string[] = [];
    const impl = (async (_url: string, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)).query);
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return { impl, calls };
  }
  const themes = (body: unknown) => ({ data: { themes: { nodes: [{ files: { nodes: [{ body }] } }] } } });

  it("reads the main theme's settings_data.json", async () => {
    const { impl, calls } = themesFetch(themes({ content: settingsData({ "1": { type: OUR_TYPE, disabled: false } }) }));
    expect(await new ShopifyAdminClient({ fetchImpl: impl }).embedStatus()).toBe(true);
    expect(calls[0]).toContain("roles: [MAIN]");
    expect(calls[0]).toContain('"config/settings_data.json"');
  });

  it("decodes a base64 body", async () => {
    const text = settingsData({ "1": { type: OUR_TYPE, disabled: true } });
    const { impl } = themesFetch(themes({ contentBase64: Buffer.from(text).toString("base64") }));
    expect(await new ShopifyAdminClient({ fetchImpl: impl }).embedStatus()).toBe(false);
  });

  it("is null (unknown) when the scope isn't granted or the theme is missing", async () => {
    const denied = themesFetch({ errors: [{ message: "Access denied for themes field." }] });
    expect(await new ShopifyAdminClient({ fetchImpl: denied.impl }).embedStatus()).toBeNull();
    const none = themesFetch({ data: { themes: { nodes: [] } } });
    expect(await new ShopifyAdminClient({ fetchImpl: none.impl }).embedStatus()).toBeNull();
  });
});

/**
 * Tests for the Wix dashboard's browser-side data client — focused on the
 * config store it reads/writes through the Worker (Phase 3.5). All pure via an
 * injected fetch.
 */

import { describe, expect, it, vi } from "vitest";
import { mergeConfig, serialize } from "@framer-cookie-consent/shared";
import { WixDataClient } from "../apps/wix-app/src/dashboard/data-client.js";

const BASE = "https://consentful-wix.example";

describe("WixDataClient", () => {
  it("reads connection status from /api/status", async () => {
    const impl = vi.fn(async () => new Response(JSON.stringify({ connected: true }))) as unknown as typeof fetch;
    const client = new WixDataClient({ workerBase: BASE, fetchImpl: impl });
    expect(await client.isConnected("s1")).toBe(true);
  });

  it("POSTs siteId + config to /api/install", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(init!.body as string) });
      return new Response(JSON.stringify({ changed: true, defaultPolicySet: true }));
    }) as unknown as typeof fetch;

    const client = new WixDataClient({ workerBase: BASE, fetchImpl: impl });
    const result = await client.install("s1", mergeConfig({}));
    expect(result).toEqual({ changed: true, defaultPolicySet: true });
    expect(calls[0]!.url).toBe(`${BASE}/api/install`);
    expect(calls[0]!.body).toMatchObject({ siteId: "s1" });
  });

  it("loadConfig GETs the public config endpoint and parses the stored config", async () => {
    const stored = serialize(mergeConfig({ theme: { accent: "#00aa55" } }));
    let calledUrl = "";
    const impl = vi.fn(async (input: string | URL | Request) => {
      calledUrl = String(input);
      return new Response(stored, { status: 200 });
    }) as unknown as typeof fetch;

    const client = new WixDataClient({ workerBase: BASE, fetchImpl: impl });
    const config = await client.loadConfig("site 7");

    expect(calledUrl).toBe(`${BASE}/api/wix/config/site%207`);
    expect(config?.theme.accent).toBe("#00aa55");
  });

  it("loadConfig returns null for a brand-new site (404)", async () => {
    const impl = vi.fn(async () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 })) as unknown as typeof fetch;
    const client = new WixDataClient({ workerBase: BASE, fetchImpl: impl });
    expect(await client.loadConfig("s1")).toBeNull();
  });
});

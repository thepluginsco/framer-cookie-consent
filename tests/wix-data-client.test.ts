/**
 * Tests for the Wix dashboard's browser-side data client (Phase 3.5): it
 * forwards the signed instance to the Worker and reads the config store. All
 * pure via an injected fetch.
 */

import { describe, expect, it, vi } from "vitest";
import { mergeConfig, serialize } from "@framer-cookie-consent/shared";
import { WixDataClient } from "../apps/wix-app/src/dashboard/data-client.js";

const BASE = "https://consentful-wix.example";

function recorder(reply: unknown) {
  const calls: { url: string; body: unknown }[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: init?.body ? JSON.parse(init.body as string) : undefined });
    return new Response(JSON.stringify(reply));
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("WixDataClient", () => {
  it("session POSTs the signed instance to /api/status", async () => {
    const { impl, calls } = recorder({ connected: true, siteKey: "abc" });
    const client = new WixDataClient({ workerBase: BASE, fetchImpl: impl });
    expect(await client.session("sig.payload")).toEqual({ connected: true, siteKey: "abc" });
    expect(calls[0]).toEqual({ url: `${BASE}/api/status`, body: { instance: "sig.payload" } });
  });

  it("install POSTs the instance + config to /api/install", async () => {
    const { impl, calls } = recorder({ changed: true, defaultPolicySet: true });
    const client = new WixDataClient({ workerBase: BASE, fetchImpl: impl });
    expect(await client.install("sig.payload", mergeConfig({}))).toEqual({ changed: true, defaultPolicySet: true });
    expect(calls[0]!.url).toBe(`${BASE}/api/install`);
    expect(calls[0]!.body).toMatchObject({ instance: "sig.payload" });
  });

  it("defaults to same-origin (the Worker serves the dashboard)", async () => {
    const { impl, calls } = recorder({ changed: false, defaultPolicySet: false });
    await new WixDataClient({ fetchImpl: impl }).remove("sig.payload");
    expect(calls[0]!.url).toBe("/api/remove");
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

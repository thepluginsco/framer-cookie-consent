/**
 * Tests for the Designer's browser-side data client (Phase 3.2) — the request
 * shapes it sends to the Data Client Worker. All pure via an injected fetch.
 */

import { describe, expect, it, vi } from "vitest";
import { mergeConfig, serialize } from "@framer-cookie-consent/shared";
import { WebflowDataClient } from "../apps/webflow-app/src/designer/data-client.js";

const BASE = "https://worker.example";

describe("WebflowDataClient", () => {
  it("builds a site-scoped authorize URL", () => {
    const client = new WebflowDataClient({ workerBase: BASE + "/" });
    expect(client.authorizeUrl("site 9")).toBe(`${BASE}/authorize?site=site%209`);
  });

  it("reads connection status from /api/status", async () => {
    const impl = vi.fn(async () => new Response(JSON.stringify({ connected: true }))) as unknown as typeof fetch;
    const client = new WebflowDataClient({ workerBase: BASE, fetchImpl: impl });
    expect(await client.isConnected("s1")).toBe(true);
  });

  it("treats a failed status call as not connected", async () => {
    const impl = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const client = new WebflowDataClient({ workerBase: BASE, fetchImpl: impl });
    expect(await client.isConnected("s1")).toBe(false);
  });

  it("POSTs siteId + config to /api/install and returns the write result", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(init!.body as string) });
      return new Response(JSON.stringify({ changed: true, published: true }));
    }) as unknown as typeof fetch;

    const client = new WebflowDataClient({ workerBase: BASE, fetchImpl: impl });
    const config = mergeConfig({});
    const result = await client.install("s1", config);

    expect(result).toEqual({ changed: true, published: true });
    expect(calls[0]!.url).toBe(`${BASE}/api/install`);
    expect(calls[0]!.body).toMatchObject({ siteId: "s1" });
    expect((calls[0]!.body as { config: unknown }).config).toBeTruthy();
  });

  it("POSTs siteId to /api/remove", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(init!.body as string) });
      return new Response(JSON.stringify({ changed: false, published: false }));
    }) as unknown as typeof fetch;

    const client = new WebflowDataClient({ workerBase: BASE, fetchImpl: impl });
    const result = await client.remove("s1");
    expect(result).toEqual({ changed: false, published: false });
    expect(calls[0]!.url).toBe(`${BASE}/api/remove`);
    expect(calls[0]!.body).toEqual({ siteId: "s1" });
  });

  it("throws with status + detail when the worker errors", async () => {
    const impl = vi.fn(async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
    const client = new WebflowDataClient({ workerBase: BASE, fetchImpl: impl });
    await expect(client.remove("s1")).rejects.toThrow(/500.*boom/);
  });

  it("loadConfig GETs /api/config and parses the stored config", async () => {
    const stored = serialize(mergeConfig({ theme: { accent: "#ff0000" } }));
    let calledUrl = "";
    const impl = vi.fn(async (input: string | URL | Request) => {
      calledUrl = String(input);
      return new Response(stored, { status: 200 });
    }) as unknown as typeof fetch;

    const client = new WebflowDataClient({ workerBase: BASE, fetchImpl: impl });
    const config = await client.loadConfig("s 1");

    expect(calledUrl).toBe(`${BASE}/api/config?site=s%201`);
    expect(config?.theme.accent).toBe("#ff0000");
  });

  it("loadConfig returns null when the site has no stored config (404)", async () => {
    const impl = vi.fn(async () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 })) as unknown as typeof fetch;
    const client = new WebflowDataClient({ workerBase: BASE, fetchImpl: impl });
    expect(await client.loadConfig("s1")).toBeNull();
  });
});

/**
 * Tests for the Designer's browser-side data client (Phase 3.2) — the request
 * shapes it sends to the Data Client Worker. All pure via an injected fetch.
 */

import { describe, expect, it, vi } from "vitest";
import { mergeConfig, serialize } from "@framer-cookie-consent/shared";
import { CONNECT_ERROR, WebflowDataClient } from "../apps/webflow-app/src/designer/data-client.js";

const BASE = "https://worker.example";

/** A fetch that records each call and answers with `respond()`. */
function recorder(respond: () => Response) {
  const calls: { url: string; auth?: string; body?: unknown }[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: String(input),
      auth: headers.Authorization,
      ...(init?.body ? { body: JSON.parse(init.body as string) } : {}),
    });
    return respond();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("WebflowDataClient", () => {
  it("builds a site-scoped authorize URL", () => {
    const client = new WebflowDataClient({ workerBase: BASE + "/" });
    expect(client.authorizeUrl("site 9")).toBe(`${BASE}/authorize?site=site%209`);
  });

  it("reads connection status from /api/status with the ID token as a Bearer header", async () => {
    const rec = recorder(() => new Response(JSON.stringify({ connected: true })));
    const client = new WebflowDataClient({ workerBase: BASE, fetchImpl: rec.impl });
    expect(await client.isConnected("s1", "jwt")).toBe(true);
    expect(rec.calls[0]).toMatchObject({ url: `${BASE}/api/status?site=s1`, auth: "Bearer jwt" });
  });

  it("treats a refused status call, or no ID token, as not connected", async () => {
    const rec = recorder(() => new Response("nope", { status: 403 }));
    const client = new WebflowDataClient({ workerBase: BASE, fetchImpl: rec.impl });
    expect(await client.isConnected("s1", "jwt")).toBe(false);
    expect(await client.isConnected("s1", null)).toBe(false);
    expect(rec.calls).toHaveLength(1);
  });

  it("reports a network failure with user-facing wording", async () => {
    const impl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const client = new WebflowDataClient({ workerBase: BASE, fetchImpl: impl });
    await expect(client.isConnected("s1", "jwt")).rejects.toThrow(CONNECT_ERROR);
  });

  it("POSTs siteId + config to /api/install without the license key", async () => {
    const rec = recorder(() => new Response(JSON.stringify({ changed: true, published: true })));
    const client = new WebflowDataClient({ workerBase: BASE, fetchImpl: rec.impl });
    const config = mergeConfig({ license: { key: "CF-SECRET-KEY", tier: "pro" } });
    const result = await client.install("s1", config, "jwt");

    expect(result).toEqual({ changed: true, published: true });
    expect(rec.calls[0]).toMatchObject({ url: `${BASE}/api/install`, auth: "Bearer jwt", body: { siteId: "s1" } });
    const sent = rec.calls[0]!.body as { config: { license: { key: unknown; tier: string } }; idToken?: unknown };
    expect(sent.config.license).toMatchObject({ key: null, tier: "pro" });
    expect(JSON.stringify(sent)).not.toContain("CF-SECRET-KEY");
    expect(sent).not.toHaveProperty("idToken");
  });

  it("POSTs siteId to /api/remove", async () => {
    const rec = recorder(() => new Response(JSON.stringify({ changed: false, published: false })));
    const client = new WebflowDataClient({ workerBase: BASE, fetchImpl: rec.impl });
    const result = await client.remove("s1", "jwt");
    expect(result).toEqual({ changed: false, published: false });
    expect(rec.calls[0]).toMatchObject({ url: `${BASE}/api/remove`, auth: "Bearer jwt", body: { siteId: "s1" } });
  });

  it("refuses to write without an ID token, before any request", async () => {
    const rec = recorder(() => new Response("{}"));
    const client = new WebflowDataClient({ workerBase: BASE, fetchImpl: rec.impl });
    await expect(client.remove("s1", null)).rejects.toThrow(/Webflow Designer/);
    expect(rec.calls).toHaveLength(0);
  });

  it("turns a server error into user-facing wording (no status codes or internals)", async () => {
    const impl = vi.fn(async () => new Response("boom internal", { status: 500 })) as unknown as typeof fetch;
    const client = new WebflowDataClient({ workerBase: BASE, fetchImpl: impl });
    const err = await client.remove("s1", "jwt").catch((e: Error) => e);
    expect((err as Error).message).toBe(CONNECT_ERROR);
  });

  it("loadConfig GETs /api/config with the ID token and parses the stored config", async () => {
    const stored = serialize(mergeConfig({ theme: { accent: "#ff0000" } }));
    const rec = recorder(() => new Response(stored, { status: 200 }));
    const client = new WebflowDataClient({ workerBase: BASE, fetchImpl: rec.impl });
    const config = await client.loadConfig("s 1", "jwt");

    expect(rec.calls[0]).toMatchObject({ url: `${BASE}/api/config?site=s%201`, auth: "Bearer jwt" });
    expect(config?.theme.accent).toBe("#ff0000");
  });

  it("loadConfig returns null when nothing is stored (404) or there is no ID token", async () => {
    const rec = recorder(() => new Response(JSON.stringify({ error: "not_found" }), { status: 404 }));
    const client = new WebflowDataClient({ workerBase: BASE, fetchImpl: rec.impl });
    expect(await client.loadConfig("s1", "jwt")).toBeNull();
    expect(await client.loadConfig("s1", null)).toBeNull();
  });
});

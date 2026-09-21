/**
 * Tests for `WebflowApiClient` (Phase 3.2) — the concrete `WebflowClient` bound
 * to the real Webflow v2 Data API.
 *
 * These assert the exact HTTP verb, path, headers and body of every call, that
 * the array-unwrapping matches Webflow's response envelopes, and that
 * `runtimeIntegrityHash` produces a real `sha384-…` SRI — the impure surface the
 * shared installer drives. A recorded fake fetch stands in for the network, and
 * the pure `installWebflowLoader` from the core is run end-to-end against it to
 * prove the seam fits.
 */

import { describe, expect, it, vi } from "vitest";
import { installWebflowLoader, mergeConfig } from "@framer-cookie-consent/shared";
import {
  WEBFLOW_API_BASE,
  WebflowApiClient,
} from "../apps/webflow-app/src/webflow-api-client.js";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Build a fake fetch that records calls and replies from a route table. */
function fakeFetch(routes: (call: Call) => { status?: number; json?: unknown; text?: string }) {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    const call: Call = { url, method, headers, body };
    calls.push(call);
    const r = routes(call);
    const payload = r.text ?? (r.json !== undefined ? JSON.stringify(r.json) : "");
    return new Response(payload, { status: r.status ?? 200 });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const SITE = "site_123";

describe("WebflowApiClient — endpoint mapping", () => {
  it("GET registered_scripts unwraps the registeredScripts array with a bearer token", async () => {
    const { impl, calls } = fakeFetch(() => ({
      json: { registeredScripts: [{ id: "s1", displayName: "consentfulConfig", version: "0.0.1" }] },
    }));
    const client = new WebflowApiClient({ token: "TOK", siteId: SITE, fetchImpl: impl });
    const list = await client.listRegisteredScripts();

    expect(list).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${WEBFLOW_API_BASE}/sites/${SITE}/registered_scripts`);
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.headers.Authorization).toBe("Bearer TOK");
  });

  it("GET custom_code unwraps the applied scripts array", async () => {
    const { impl, calls } = fakeFetch(() => ({
      json: { scripts: [{ id: "s1", location: "header", version: "0.0.1" }] },
    }));
    const client = new WebflowApiClient({ token: "TOK", siteId: SITE, fetchImpl: impl });
    const applied = await client.getAppliedScripts();

    expect(applied).toEqual([{ id: "s1", location: "header", version: "0.0.1" }]);
    expect(calls[0]!.url).toBe(`${WEBFLOW_API_BASE}/sites/${SITE}/custom_code`);
  });

  it("PUT custom_code sends the complete scripts list", async () => {
    const { impl, calls } = fakeFetch(() => ({ json: { scripts: [] } }));
    const client = new WebflowApiClient({ token: "TOK", siteId: SITE, fetchImpl: impl });
    await client.applyScripts([{ id: "s1", location: "header", version: "0.0.1" }]);

    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.url).toBe(`${WEBFLOW_API_BASE}/sites/${SITE}/custom_code`);
    expect(calls[0]!.body).toEqual({ scripts: [{ id: "s1", location: "header", version: "0.0.1" }] });
    expect(calls[0]!.headers["Content-Type"]).toBe("application/json");
  });

  it("POST inline/hosted registrations hit the right paths with the payload", async () => {
    const { impl, calls } = fakeFetch((c) => ({
      json: { id: c.url.endsWith("/inline") ? "in1" : "host1", version: "0.0.9" },
    }));
    const client = new WebflowApiClient({ token: "TOK", siteId: SITE, fetchImpl: impl });

    await client.registerInlineScript({ sourceCode: "x=1", displayName: "consentfulConfig", version: "0.0.9", canCopy: false });
    await client.registerHostedScript({ hostedLocation: "https://cdn/x.js", integrityHash: "sha384-h", displayName: "consentfulRuntime", version: "0.1.6", canCopy: false });

    expect(calls[0]!.url).toBe(`${WEBFLOW_API_BASE}/sites/${SITE}/registered_scripts/inline`);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[1]!.url).toBe(`${WEBFLOW_API_BASE}/sites/${SITE}/registered_scripts/hosted`);
    expect(calls[1]!.body).toMatchObject({ hostedLocation: "https://cdn/x.js", integrityHash: "sha384-h" });
  });

  it("publish POSTs the target to the publish endpoint", async () => {
    const { impl, calls } = fakeFetch(() => ({ status: 200, text: "" }));
    const client = new WebflowApiClient({
      token: "TOK",
      siteId: SITE,
      fetchImpl: impl,
      customDomains: ["dom_1"],
    });
    await client.publish();

    expect(calls[0]!.url).toBe(`${WEBFLOW_API_BASE}/sites/${SITE}/publish`);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.body).toEqual({ publishToWebflowSubdomain: true, customDomains: ["dom_1"] });
  });

  it("throws with status + body on a non-2xx response", async () => {
    const { impl } = fakeFetch(() => ({ status: 403, text: "forbidden" }));
    const client = new WebflowApiClient({ token: "TOK", siteId: SITE, fetchImpl: impl });
    await expect(client.getAppliedScripts()).rejects.toThrow(/403.*forbidden/);
  });
});

describe("WebflowApiClient — runtimeIntegrityHash", () => {
  it("fetches the bundle and returns a real sha384 SRI", async () => {
    const bytes = new TextEncoder().encode("console.log('runtime')");
    const impl = vi.fn(async () => new Response(bytes)) as unknown as typeof fetch;
    const client = new WebflowApiClient({ token: "TOK", siteId: SITE, fetchImpl: impl });

    const hash = await client.runtimeIntegrityHash("https://cdn/consent.min.js");
    expect(hash).toMatch(/^sha384-[A-Za-z0-9+/]+=*$/);

    // Deterministic: recompute the expected digest independently.
    const digest = await crypto.subtle.digest("SHA-384", bytes);
    let bin = "";
    const view = new Uint8Array(digest);
    for (let i = 0; i < view.length; i++) bin += String.fromCharCode(view[i]!);
    expect(hash).toBe(`sha384-${btoa(bin)}`);
  });
});

describe("WebflowApiClient — driven by the shared installer", () => {
  it("installs the loader end-to-end (register → apply header → publish)", async () => {
    const registered: { id: string; displayName: string; version: string }[] = [];
    const applied: { id: string; location: string; version: string }[] = [];
    let published = 0;
    let idSeq = 0;

    const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body ? JSON.parse(init.body as string) : undefined;

      if (url.endsWith("/consent.min.js")) return new Response(new TextEncoder().encode("rt"));
      if (url.endsWith("/registered_scripts") && method === "GET") {
        return new Response(JSON.stringify({ registeredScripts: registered }));
      }
      if (url.includes("/registered_scripts/") && method === "POST") {
        const reg = { id: `id${++idSeq}`, displayName: body.displayName, version: body.version };
        registered.push(reg);
        return new Response(JSON.stringify(reg), { status: 201 });
      }
      if (url.endsWith("/custom_code") && method === "GET") {
        return new Response(JSON.stringify({ scripts: applied }));
      }
      if (url.endsWith("/custom_code") && method === "PUT") {
        applied.length = 0;
        applied.push(...body.scripts);
        return new Response(JSON.stringify({ scripts: applied }));
      }
      if (url.endsWith("/publish") && method === "POST") {
        published++;
        return new Response("");
      }
      return new Response("no route", { status: 404 });
    }) as unknown as typeof fetch;

    const client = new WebflowApiClient({ token: "TOK", siteId: SITE, fetchImpl: impl });
    const config = mergeConfig({ consentMode: { enableConsentMode: true } });

    const result = await installWebflowLoader(client, config);

    expect(result).toEqual({ changed: true, published: true });
    expect(published).toBe(1);
    // Consent Mode default → config → runtime, all applied to the header.
    expect(applied).toHaveLength(3);
    expect(applied.every((s) => s.location === "header")).toBe(true);

    // Re-install with the same config is churn-free: no second publish.
    const again = await installWebflowLoader(client, config);
    expect(again).toEqual({ changed: false, published: false });
    expect(published).toBe(1);
  });
});

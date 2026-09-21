/**
 * Tests for `WixApiClient` (Phase 3.5 App shell) — the concrete `WixClient` wired
 * to the Wix REST APIs. Every method is asserted against an injected fetch: the
 * request method/path/headers/body, the 404→null mapping, and error propagation.
 */

import { describe, expect, it, vi } from "vitest";
import {
  WixApiClient,
  WIX_API_BASE,
  WIX_SCRIPTS_PATH,
  WIX_CONSENT_POLICY_PATH,
} from "../apps/wix-app/src/wix-api-client.js";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status });
}

describe("WixApiClient.getEmbeddedScript", () => {
  it("GETs the scripts resource with the raw token and normalizes the shape", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${WIX_API_BASE}${WIX_SCRIPTS_PATH}`);
      expect(init!.method).toBe("GET");
      expect((init!.headers as Record<string, string>).Authorization).toBe("tok");
      return jsonResponse({ properties: { parameters: { siteId: "abc" }, disabled: false } });
    }) as unknown as typeof fetch;

    const client = new WixApiClient({ token: "tok", fetchImpl });
    expect(await client.getEmbeddedScript()).toEqual({ parameters: { siteId: "abc" }, disabled: false });
  });

  it("returns null on 404", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    const client = new WixApiClient({ token: "tok", fetchImpl });
    expect(await client.getEmbeddedScript()).toBeNull();
  });

  it("omits disabled when the API didn't return it", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ embeddedScript: { parameters: { siteId: "abc" } } }),
    ) as unknown as typeof fetch;
    const client = new WixApiClient({ token: "tok", fetchImpl });
    expect(await client.getEmbeddedScript()).toEqual({ parameters: { siteId: "abc" } });
  });
});

describe("WixApiClient.embedScript / deleteEmbeddedScript", () => {
  it("PUTs the value wrapped in { properties }", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${WIX_API_BASE}${WIX_SCRIPTS_PATH}`);
      expect(init!.method).toBe("PUT");
      expect(JSON.parse(String(init!.body))).toEqual({
        properties: { parameters: { siteId: "abc" }, disabled: false },
      });
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const client = new WixApiClient({ token: "tok", fetchImpl });
    await client.embedScript({ parameters: { siteId: "abc" }, disabled: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("DELETEs the scripts resource", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init!.method).toBe("DELETE");
      return jsonResponse({});
    }) as unknown as typeof fetch;
    const client = new WixApiClient({ token: "tok", fetchImpl });
    await client.deleteEmbeddedScript();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("WixApiClient.updateDefaultConsentPolicy", () => {
  it("PATCHes the consent-policy resource with { defaultPolicy }", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${WIX_API_BASE}${WIX_CONSENT_POLICY_PATH}`);
      expect(init!.method).toBe("PATCH");
      expect(JSON.parse(String(init!.body))).toEqual({
        defaultPolicy: { essential: true, functional: false, analytics: false, advertising: false, dataToThirdParty: false },
      });
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const client = new WixApiClient({ token: "tok", fetchImpl });
    await client.updateDefaultConsentPolicy({
      essential: true, functional: false, analytics: false, advertising: false, dataToThirdParty: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("WixApiClient error handling", () => {
  it("throws with the status + body on a non-404 error", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
    const client = new WixApiClient({ token: "tok", fetchImpl });
    await expect(client.embedScript({ parameters: {} })).rejects.toThrow(/500/);
  });
});

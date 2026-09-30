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

  it("returns null on 404 or an empty (never embedded) response", async () => {
    const notFound = vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    expect(await new WixApiClient({ token: "tok", fetchImpl: notFound }).getEmbeddedScript()).toBeNull();
    const empty = vi.fn(async () => jsonResponse({ properties: { parameters: {} } })) as unknown as typeof fetch;
    expect(await new WixApiClient({ token: "tok", fetchImpl: empty }).getEmbeddedScript()).toBeNull();
  });

  it("omits disabled when the API didn't return it", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ properties: { parameters: { siteId: "abc" } } }),
    ) as unknown as typeof fetch;
    const client = new WixApiClient({ token: "tok", fetchImpl });
    expect(await client.getEmbeddedScript()).toEqual({ parameters: { siteId: "abc" } });
  });
});

describe("WixApiClient.embedScript / deleteEmbeddedScript", () => {
  it("POSTs the value wrapped in { properties }", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${WIX_API_BASE}${WIX_SCRIPTS_PATH}`);
      expect(init!.method).toBe("POST");
      expect(JSON.parse(String(init!.body))).toEqual({
        properties: { parameters: { siteId: "abc" }, disabled: false },
      });
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const client = new WixApiClient({ token: "tok", fetchImpl });
    await client.embedScript({ parameters: { siteId: "abc" }, disabled: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("removes by re-embedding the current parameters with disabled: true (Wix has no delete)", async () => {
    const calls: { method: string; body?: unknown }[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push({ method: init!.method!, ...(init!.body ? { body: JSON.parse(String(init!.body)) } : {}) });
      return init!.method === "GET"
        ? jsonResponse({ properties: { parameters: { siteId: "abc" }, disabled: false } })
        : jsonResponse({});
    }) as unknown as typeof fetch;
    await new WixApiClient({ token: "tok", fetchImpl }).deleteEmbeddedScript();
    expect(calls).toEqual([
      { method: "GET" },
      { method: "POST", body: { properties: { parameters: { siteId: "abc" }, disabled: true } } },
    ]);
  });

  it("remove is a no-op when nothing is embedded", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    await new WixApiClient({ token: "tok", fetchImpl }).deleteEmbeddedScript();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("WixApiClient.updateDefaultConsentPolicy", () => {
  it("POSTs { consentPolicy } to the Site Properties policy method", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${WIX_API_BASE}${WIX_CONSENT_POLICY_PATH}`);
      expect(url).toBe("https://www.wixapis.com/site-properties/v4/properties/policy");
      expect(init!.method).toBe("POST");
      expect(JSON.parse(String(init!.body))).toEqual({
        consentPolicy: { essential: true, functional: false, analytics: false, advertising: false, dataToThirdParty: false },
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

describe("WixApiClient.getSiteInfo", () => {
  it("GETs the app instance and returns the published URL + name", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe("https://www.wixapis.com/apps/v1/instance");
      return jsonResponse({ instance: {}, site: { url: "https://acme.wixsite.com/shop", siteDisplayName: "Acme" } });
    }) as unknown as typeof fetch;
    expect(await new WixApiClient({ token: "tok", fetchImpl }).getSiteInfo()).toEqual({
      url: "https://acme.wixsite.com/shop",
      name: "Acme",
    });
  });

  it("omits url for an unpublished site", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ site: { siteDisplayName: "Acme" } })) as unknown as typeof fetch;
    expect(await new WixApiClient({ token: "tok", fetchImpl }).getSiteInfo()).toEqual({ name: "Acme" });
  });
});

describe("WixApiClient error handling", () => {
  it("throws with the status + body on a non-404 error", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
    const client = new WixApiClient({ token: "tok", fetchImpl });
    await expect(client.embedScript({ parameters: {} })).rejects.toThrow(/500/);
  });
});

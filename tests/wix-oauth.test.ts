/**
 * Tests for the Wix OAuth helpers (Phase 3.5 App shell): building the install URL
 * and exchanging / refreshing tokens. Pure request-shape assertions against an
 * injected fetch — no live Wix app.
 */

import { describe, expect, it, vi } from "vitest";
import {
  buildInstallUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  WIX_INSTALL_URL,
  WIX_TOKEN_URL,
} from "../apps/wix-app/src/oauth.js";

describe("buildInstallUrl", () => {
  it("targets Wix's installer with appId, redirectUrl and state", () => {
    const url = new URL(buildInstallUrl({ appId: "app_1", redirectUrl: "https://w/callback", state: "site_9" }));
    expect(url.origin + url.pathname).toBe(WIX_INSTALL_URL);
    expect(url.searchParams.get("appId")).toBe("app_1");
    expect(url.searchParams.get("redirectUrl")).toBe("https://w/callback");
    expect(url.searchParams.get("state")).toBe("site_9");
  });

  it("omits state when not provided", () => {
    const url = new URL(buildInstallUrl({ appId: "app_1", redirectUrl: "https://w/callback" }));
    expect(url.searchParams.has("state")).toBe(false);
  });
});

describe("exchangeCodeForToken", () => {
  it("POSTs an authorization_code grant and returns the tokens", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      expect(body).toEqual({
        grant_type: "authorization_code",
        client_id: "app_1",
        client_secret: "shh",
        code: "code_123",
      });
      return new Response(JSON.stringify({ access_token: "AT", refresh_token: "RT", expires_in: 300 }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const out = await exchangeCodeForToken({ clientId: "app_1", clientSecret: "shh", code: "code_123", fetchImpl });
    expect(out.access_token).toBe("AT");
    expect(out.refresh_token).toBe("RT");
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(WIX_TOKEN_URL);
  });

  it("throws with the status + body on failure", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 400 })) as unknown as typeof fetch;
    await expect(
      exchangeCodeForToken({ clientId: "a", clientSecret: "b", code: "c", fetchImpl }),
    ).rejects.toThrow(/400/);
  });
});

describe("refreshAccessToken", () => {
  it("POSTs a refresh_token grant", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      expect(body.grant_type).toBe("refresh_token");
      expect(body.refresh_token).toBe("RT");
      return new Response(JSON.stringify({ access_token: "AT2", refresh_token: "RT" }), { status: 200 });
    }) as unknown as typeof fetch;

    const out = await refreshAccessToken({ clientId: "a", clientSecret: "b", refreshToken: "RT", fetchImpl });
    expect(out.access_token).toBe("AT2");
  });
});

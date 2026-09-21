/**
 * Tests for the Webflow App shell's OAuth helpers (Phase 3.2).
 *
 * Lock in the exact authorize URL (endpoint, response_type, scopes, state) and
 * the token-exchange request shape (JSON body, grant_type, redirect_uri) against
 * the live Webflow v2 endpoints, plus error propagation — the credential flow's
 * only unit-testable surface.
 */

import { describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  WEBFLOW_AUTHORIZE_URL,
  WEBFLOW_SCOPES,
  WEBFLOW_TOKEN_URL,
} from "../apps/webflow-app/src/oauth.js";

describe("buildAuthorizeUrl", () => {
  it("targets Webflow's authorize endpoint with the code flow + default scopes", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "abc123",
        redirectUri: "https://worker.example/callback",
        state: "site_9",
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(WEBFLOW_AUTHORIZE_URL);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("abc123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://worker.example/callback");
    expect(url.searchParams.get("state")).toBe("site_9");
    expect(url.searchParams.get("scope")).toBe(WEBFLOW_SCOPES.join(" "));
  });

  it("requests the scopes needed to write custom code and publish", () => {
    expect([...WEBFLOW_SCOPES]).toEqual(
      expect.arrayContaining(["custom_code:write", "sites:write"]),
    );
  });

  it("omits state when not provided and honours a scope override", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "x",
        redirectUri: "https://r/cb",
        scopes: ["sites:read"],
      }),
    );
    expect(url.searchParams.has("state")).toBe(false);
    expect(url.searchParams.get("scope")).toBe("sites:read");
  });
});

describe("exchangeCodeForToken", () => {
  it("POSTs a JSON authorization_code grant to the token endpoint", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "tok", token_type: "bearer" }), { status: 200 }),
    );
    const token = await exchangeCodeForToken({
      clientId: "cid",
      clientSecret: "secret",
      code: "the-code",
      redirectUri: "https://r/cb",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(token.access_token).toBe("tok");

    const [calledUrl, init] = fetchImpl.mock.calls[0]!;
    expect(calledUrl).toBe(WEBFLOW_TOKEN_URL);
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      client_id: "cid",
      client_secret: "secret",
      code: "the-code",
      grant_type: "authorization_code",
      redirect_uri: "https://r/cb",
    });
  });

  it("throws with status + body when Webflow rejects the exchange", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad code", { status: 400 }));
    await expect(
      exchangeCodeForToken({
        clientId: "c",
        clientSecret: "s",
        code: "x",
        redirectUri: "r",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/400.*bad code/);
  });
});

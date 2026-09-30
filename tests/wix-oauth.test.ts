/**
 * Tests for Wix app auth (Phase 3.5): the OAuth client-credentials token call
 * and signed-app-instance verification (the dashboard's proof of which site it
 * is — the Worker's only trust anchor).
 */

import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAccessToken, verifyInstance, WIX_TOKEN_URL } from "../apps/wix-app/src/oauth.js";

const SECRET = "app-secret-123";

/** Sign a payload the way Wix does: base64url(HMAC-SHA256(secret, b64payload)) + "." + b64payload, no padding. */
export function signInstance(payload: object, secret = SECRET): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${sig}.${data}`;
}

describe("createAccessToken", () => {
  it("POSTs a client_credentials grant with the instance id and returns the token", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ access_token: "TOK", expires_in: 14400 })));
    const token = await createAccessToken({
      appId: "app-1",
      appSecret: SECRET,
      instanceId: "inst-1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(token).toBe("TOK");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(WIX_TOKEN_URL);
    expect(url).toBe("https://www.wixapis.com/oauth2/token");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      grant_type: "client_credentials",
      client_id: "app-1",
      client_secret: SECRET,
      instance_id: "inst-1",
    });
  });

  it("throws with the status + body on failure", async () => {
    const fetchImpl = (async () => new Response("bad client", { status: 401 })) as unknown as typeof fetch;
    await expect(
      createAccessToken({ appId: "a", appSecret: "s", instanceId: "i", fetchImpl }),
    ).rejects.toThrow(/401.*bad client/);
  });
});

describe("verifyInstance", () => {
  it("returns the payload for a correctly signed instance", async () => {
    const inst = signInstance({ instanceId: "2f8e-41ab", siteOwnerId: "owner" });
    expect(await verifyInstance(inst, SECRET)).toMatchObject({ instanceId: "2f8e-41ab" });
  });

  it("rejects a wrong secret, a tampered payload, or garbage", async () => {
    const inst = signInstance({ instanceId: "2f8e-41ab" });
    expect(await verifyInstance(inst, "other-secret")).toBeNull();
    const [sig] = inst.split(".");
    const forged = Buffer.from(JSON.stringify({ instanceId: "someone-else" })).toString("base64url");
    expect(await verifyInstance(`${sig}.${forged}`, SECRET)).toBeNull();
    expect(await verifyInstance("not-an-instance", SECRET)).toBeNull();
    expect(await verifyInstance(inst, "")).toBeNull();
  });

  it("rejects a validly signed payload with no instanceId", async () => {
    expect(await verifyInstance(signInstance({ siteOwnerId: "x" }), SECRET)).toBeNull();
  });
});

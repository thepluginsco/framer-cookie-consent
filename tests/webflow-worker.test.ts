/**
 * Routing tests for the Webflow Data Client Worker (Phase 3.2).
 *
 * Covers the request handling that doesn't touch the live Webflow API: the
 * authorize redirect, connection status, and the guard rails on /api/* (missing
 * site, not-connected). The install/remove happy paths against the real API are
 * covered by the WebflowApiClient + installWebflowLoader tests; here we only
 * assert the Worker's routing and validation.
 */

import { describe, expect, it } from "vitest";
import { signState, verifyState } from "../apps/webflow-app/src/oauth.js";
import { mergeConfig, parse, serialize } from "@framer-cookie-consent/shared";
import worker, { storableConfig, type Env, type KVNamespace } from "../apps/webflow-app/src/worker.js";

/** In-memory KV standing in for the Cloudflare binding. */
function memoryKV(seed: Record<string, string> = {}): KVNamespace {
  const store = new Map(Object.entries(seed));
  return {
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => void store.set(k, v),
    delete: async (k) => void store.delete(k),
  };
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    WEBFLOW_CLIENT_ID: "cid",
    WEBFLOW_CLIENT_SECRET: "secret",
    WEBFLOW_REDIRECT_URI: "https://worker.example/callback",
    APP_ORIGIN: "https://designer.example",
    TOKENS: memoryKV(),
    ...overrides,
  };
}

describe("Worker routing", () => {
  it("/authorize redirects to Webflow with the site in a signed state", async () => {
    const res = await worker.fetch(
      new Request("https://worker.example/authorize?site=site_9"),
      makeEnv(),
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("Location")!);
    expect(location.origin + location.pathname).toBe("https://webflow.com/oauth/authorize");
    expect(await verifyState(location.searchParams.get("state")!, "secret")).toBe("site_9");
    expect(location.searchParams.get("client_id")).toBe("cid");
  });

  describe("/callback", () => {
    /** Fake Webflow: the token exchange succeeds and the token covers `sites`. */
    function fakeWebflow(sites: string[]) {
      const exchanges: any[] = [];
      const impl = (async (input: string, init?: RequestInit) => {
        if (String(input).endsWith("/oauth/access_token")) {
          exchanges.push(JSON.parse(String(init?.body)));
          return new Response(JSON.stringify({ access_token: "tok", token_type: "bearer" }));
        }
        return new Response(JSON.stringify({ sites: sites.map((id) => ({ id })) }));
      }) as unknown as typeof fetch;
      return { impl, exchanges };
    }

    it("stores the token for every site the user authorized", async () => {
      const wf = fakeWebflow(["site_9", "site_10"]);
      const tokens = memoryKV();
      const env = makeEnv({ TOKENS: tokens, fetchImpl: wf.impl });
      const state = await signState("site_9", "secret");
      const res = await worker.fetch(new Request(`https://worker.example/callback?code=c&state=${state}`), env);
      expect(res.status).toBe(302);
      expect(await tokens.get("token:site_9")).toBe("tok");
      expect(await tokens.get("token:site_10")).toBe("tok");
      expect(wf.exchanges[0]).toMatchObject({ code: "c", redirect_uri: "https://worker.example/callback" });
    });

    it("refuses a token that doesn't cover the site in state (403) and stores nothing", async () => {
      const wf = fakeWebflow(["attacker_site"]);
      const tokens = memoryKV({ "token:site_9": "owner-tok" });
      const env = makeEnv({ TOKENS: tokens, fetchImpl: wf.impl });
      const state = await signState("site_9", "secret");
      const res = await worker.fetch(new Request(`https://worker.example/callback?code=c&state=${state}`), env);
      expect(res.status).toBe(403);
      expect(await tokens.get("token:site_9")).toBe("owner-tok");
      expect(await tokens.get("token:attacker_site")).toBeNull();
    });

    it("rejects a forged or expired state (400) before exchanging the code", async () => {
      const wf = fakeWebflow(["site_9"]);
      const env = makeEnv({ fetchImpl: wf.impl });
      const forged = await worker.fetch(new Request("https://worker.example/callback?code=c&state=site_9"), env);
      expect(forged.status).toBe(400);
      const wrongKey = await signState("site_9", "other-secret");
      expect((await worker.fetch(new Request(`https://worker.example/callback?code=c&state=${wrongKey}`), env)).status).toBe(400);
      const expired = await signState("site_9", "secret", Date.now() - 3_600_000);
      expect((await worker.fetch(new Request(`https://worker.example/callback?code=c&state=${expired}`), env)).status).toBe(400);
      expect(wf.exchanges).toHaveLength(0);
    });

    it("connects an install started on Webflow's side (no state, no redirect_uri)", async () => {
      const wf = fakeWebflow(["site_9"]);
      const tokens = memoryKV();
      const env = makeEnv({ TOKENS: tokens, fetchImpl: wf.impl });
      const res = await worker.fetch(new Request("https://worker.example/callback?code=c"), env);
      expect(res.status).toBe(302);
      expect(await tokens.get("token:site_9")).toBe("tok");
      expect(wf.exchanges[0]).not.toHaveProperty("redirect_uri");
    });
  });

  /** Fake Webflow ID-token resolver: `jwt-<site>` resolves to that site, anything else is rejected. */
  const resolver = (async (input: string, init?: RequestInit) => {
    if (String(input).endsWith("/token/resolve")) {
      const { idToken } = JSON.parse(String(init?.body)) as { idToken: string };
      return idToken.startsWith("jwt-")
        ? new Response(JSON.stringify({ id: "u1", siteId: idToken.slice(4) }))
        : new Response("invalid", { status: 401 });
    }
    return new Response("unexpected", { status: 500 });
  }) as unknown as typeof fetch;

  const authed = (url: string, idToken?: string) =>
    new Request(url, idToken ? { headers: { Authorization: `Bearer ${idToken}` } } : {});

  describe("/api/status", () => {
    const env = () => makeEnv({ TOKENS: memoryKV({ "token:site_9": "tok" }), fetchImpl: resolver });

    it("reports connected for a designer of the site", async () => {
      const res = await worker.fetch(authed("https://worker.example/api/status?site=site_9", "jwt-site_9"), env());
      expect(await res.json()).toEqual({ connected: true });
    });

    it("rejects a request without an ID token (401)", async () => {
      const res = await worker.fetch(authed("https://worker.example/api/status?site=site_9"), env());
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: "missing_id_token" });
    });

    it("rejects an ID token for another site (403)", async () => {
      const res = await worker.fetch(authed("https://worker.example/api/status?site=site_9", "jwt-attacker"), env());
      expect(res.status).toBe(403);
    });

    it("rejects an ID token Webflow cannot resolve (403)", async () => {
      const res = await worker.fetch(authed("https://worker.example/api/status?site=site_9", "forged"), env());
      expect(res.status).toBe(403);
    });

    it("answers not connected for a site without a stored token", async () => {
      const res = await worker.fetch(authed("https://worker.example/api/status?site=other", "jwt-other"), env());
      expect(await res.json()).toEqual({ connected: false });
    });
  });

  it("/api/install rejects a missing site with 400", async () => {
    const res = await worker.fetch(
      new Request("https://worker.example/api/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: {} }),
      }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "missing_site" });
  });

  it("/api/install returns 401 when the site has no stored token", async () => {
    const res = await worker.fetch(
      new Request("https://worker.example/api/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: "site_9", config: {} }),
      }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "missing_id_token" });
  });

  it("answers OPTIONS preflight with CORS headers", async () => {
    const res = await worker.fetch(
      new Request("https://worker.example/api/install", { method: "OPTIONS" }),
      makeEnv(),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://designer.example");
  });

  it("unknown routes 404", async () => {
    const res = await worker.fetch(new Request("https://worker.example/nope"), makeEnv());
    expect(res.status).toBe(404);
  });

  describe("ID-token guard on writes", () => {
    /** Fake Webflow: resolve returns `resolvedSite` (or 401); site has no custom code. */
    function fakeWebflow(resolvedSite: string | null) {
      const calls: { url: string; auth?: string; body?: any }[] = [];
      const impl = (async (input: string, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        calls.push({ url: String(input), auth: headers.Authorization, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
        if (String(input).endsWith("/token/resolve")) {
          return resolvedSite
            ? new Response(JSON.stringify({ id: "u1", email: "a@b.c", siteId: resolvedSite }))
            : new Response("invalid", { status: 401 });
        }
        if (String(input).endsWith("/custom_code")) return new Response("not found", { status: 404 });
        return new Response(JSON.stringify({ registeredScripts: [] }));
      }) as unknown as typeof fetch;
      return { impl, calls };
    }

    function removeReq(body: unknown, idToken?: string): Request {
      return new Request("https://worker.example/api/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify(body),
      });
    }

    it("ignores an ID token sent in the body instead of the Authorization header", async () => {
      const wf = fakeWebflow("site_9");
      const env = makeEnv({ TOKENS: memoryKV({ "token:site_9": "tok" }), fetchImpl: wf.impl });
      const res = await worker.fetch(removeReq({ siteId: "site_9", idToken: "jwt" }), env);
      expect(res.status).toBe(401);
    });

    it("rejects a write with no ID token (401), even for a connected site", async () => {
      const wf = fakeWebflow("site_9");
      const env = makeEnv({ TOKENS: memoryKV({ "token:site_9": "tok" }), fetchImpl: wf.impl });
      const res = await worker.fetch(removeReq({ siteId: "site_9" }), env);
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: "missing_id_token" });
      expect(wf.calls).toHaveLength(0);
    });

    it("rejects an ID token issued for a different site (403) without touching the site", async () => {
      const wf = fakeWebflow("attacker_site");
      const env = makeEnv({ TOKENS: memoryKV({ "token:site_9": "tok" }), fetchImpl: wf.impl });
      const res = await worker.fetch(removeReq({ siteId: "site_9" }, "jwt"), env);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: "invalid_id_token" });
      expect(wf.calls.map((c) => c.url)).toEqual(["https://api.webflow.com/beta/token/resolve"]);
    });

    it("rejects an ID token Webflow won't resolve (expired/forged) with 403", async () => {
      const wf = fakeWebflow(null);
      const env = makeEnv({ TOKENS: memoryKV({ "token:site_9": "tok" }), fetchImpl: wf.impl });
      const res = await worker.fetch(removeReq({ siteId: "site_9" }, "bad"), env);
      expect(res.status).toBe(403);
    });

    it("allows the write when the ID token resolves to the same site", async () => {
      const wf = fakeWebflow("site_9");
      const env = makeEnv({ TOKENS: memoryKV({ "token:site_9": "tok" }), fetchImpl: wf.impl });
      const res = await worker.fetch(removeReq({ siteId: "site_9" }, "jwt"), env);
      expect(res.status).toBe(200);
      expect(wf.calls[0]).toMatchObject({
        url: "https://api.webflow.com/beta/token/resolve",
        auth: "Bearer tok",
        body: { idToken: "jwt" },
      });
    });
  });

  describe("/api/config", () => {
    // A config stored by an older build, still carrying a license key.
    const keyed = serialize(mergeConfig({ license: { key: "CF-SECRET-KEY", tier: "pro" } }));
    const env = (configs?: KVNamespace) =>
      makeEnv({ TOKENS: memoryKV({ "token:site_9": "tok" }), fetchImpl: resolver, ...(configs ? { CONFIGS: configs } : {}) });

    it("serves the stored config to a designer of the site, never with a license key", async () => {
      const res = await worker.fetch(
        authed("https://worker.example/api/config?site=site_9", "jwt-site_9"),
        env(memoryKV({ "config:site_9": keyed })),
      );
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).not.toContain("CF-SECRET-KEY");
      expect(parse(body).license).toMatchObject({ key: null, tier: "pro" });
    });

    it("rejects unauthenticated (401) and cross-site (403) reads", async () => {
      const configs = memoryKV({ "config:site_9": keyed });
      const anon = await worker.fetch(authed("https://worker.example/api/config?site=site_9"), env(configs));
      expect(anon.status).toBe(401);
      const other = await worker.fetch(authed("https://worker.example/api/config?site=site_9", "jwt-attacker"), env(configs));
      expect(other.status).toBe(403);
      expect(await other.text()).not.toContain("CF-SECRET-KEY");
    });

    it("404s when nothing is stored or there is no store; 400 without a site", async () => {
      const miss = await worker.fetch(authed("https://worker.example/api/config?site=site_9", "jwt-site_9"), env(memoryKV()));
      expect(miss.status).toBe(404);
      const noStore = await worker.fetch(authed("https://worker.example/api/config?site=site_9", "jwt-site_9"), env());
      expect(noStore.status).toBe(404);
      const missingSite = await worker.fetch(authed("https://worker.example/api/config", "jwt-site_9"), env());
      expect(missingSite.status).toBe(400);
    });
  });

  it("storableConfig drops the license key but keeps the plan", () => {
    const stored = storableConfig(mergeConfig({ license: { key: "CF-SECRET-KEY", tier: "pro" } }));
    expect(stored.license).toMatchObject({ key: null, tier: "pro" });
  });

  it("allows the Authorization header in CORS preflight", async () => {
    const res = await worker.fetch(new Request("https://worker.example/api/status", { method: "OPTIONS" }), makeEnv());
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });

  it("does not echo internal error details", async () => {
    const env = makeEnv({
      TOKENS: { get: async () => { throw new Error("kv secret detail"); }, put: async () => {}, delete: async () => {} },
    });
    const res = await worker.fetch(authed("https://worker.example/api/status?site=site_9", "jwt-site_9"), env);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret detail");
  });
});

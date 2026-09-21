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
import worker, { type Env, type KVNamespace } from "../apps/webflow-app/src/worker.js";

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
  it("/authorize redirects to Webflow with the site in state", async () => {
    const res = await worker.fetch(
      new Request("https://worker.example/authorize?site=site_9"),
      makeEnv(),
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("Location")!);
    expect(location.origin + location.pathname).toBe("https://webflow.com/oauth/authorize");
    expect(location.searchParams.get("state")).toBe("site_9");
    expect(location.searchParams.get("client_id")).toBe("cid");
  });

  it("/api/status reports whether a token is stored", async () => {
    const env = makeEnv({ TOKENS: memoryKV({ "token:site_9": "tok" }) });
    const connected = await worker.fetch(new Request("https://worker.example/api/status?site=site_9"), env);
    expect(await connected.json()).toEqual({ connected: true });

    const missing = await worker.fetch(new Request("https://worker.example/api/status?site=other"), env);
    expect(await missing.json()).toEqual({ connected: false });
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
    expect(await res.json()).toMatchObject({ error: "not_connected" });
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

  it("/api/config serves a stored config, or 404 when none/no store", async () => {
    const stored = '{"meta":{"schemaVersion":2}}';
    const env = makeEnv({ CONFIGS: memoryKV({ "config:site_9": stored }) });

    const hit = await worker.fetch(new Request("https://worker.example/api/config?site=site_9"), env);
    expect(hit.status).toBe(200);
    expect(await hit.text()).toBe(stored);

    const miss = await worker.fetch(new Request("https://worker.example/api/config?site=other"), env);
    expect(miss.status).toBe(404);

    // No CONFIGS binding at all → 404 (the store is optional).
    const noStore = await worker.fetch(new Request("https://worker.example/api/config?site=site_9"), makeEnv());
    expect(noStore.status).toBe(404);

    const missingSite = await worker.fetch(new Request("https://worker.example/api/config"), env);
    expect(missingSite.status).toBe(400);
  });
});

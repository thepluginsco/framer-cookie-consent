/**
 * Routing tests for the Wix Data Client Worker (Phase 3.5).
 *
 * Covers the request handling that doesn't touch the live Wix API: the install
 * redirect, connection status, the config store round-trip (POST /api/config →
 * public GET /api/wix/config/<id>), and the guard rails on /api/* (missing site,
 * not-connected). The install-embeds happy path against the real API is covered
 * by the WixApiClient + installWixLoader tests; here we only assert the Worker's
 * routing, validation and config store.
 */

import { describe, expect, it } from "vitest";
import { WIX_INSTALL_URL } from "../apps/wix-app/src/oauth.js";
import worker, { type Env, type KVNamespace } from "../apps/wix-app/src/worker.js";

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
    WIX_APP_ID: "app_1",
    WIX_APP_SECRET: "secret",
    WIX_REDIRECT_URL: "https://worker.example/callback",
    APP_ORIGIN: "https://dashboard.example",
    TOKENS: memoryKV(),
    CONFIGS: memoryKV(),
    ...overrides,
  };
}

describe("Worker routing", () => {
  it("/authorize redirects to Wix's installer with the site in state", async () => {
    const res = await worker.fetch(
      new Request("https://worker.example/authorize?site=site-9"),
      makeEnv(),
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("Location")!);
    expect(location.origin + location.pathname).toBe(WIX_INSTALL_URL);
    expect(location.searchParams.get("state")).toBe("site-9");
    expect(location.searchParams.get("appId")).toBe("app_1");
  });

  it("/api/status reports whether a token is stored (by normalized id)", async () => {
    // Token keyed by the normalized (hyphen-stripped) id.
    const env = makeEnv({ TOKENS: memoryKV({ "token:site9": "{\"access_token\":\"t\"}" }) });
    const connected = await worker.fetch(new Request("https://worker.example/api/status?site=site-9"), env);
    expect(await connected.json()).toEqual({ connected: true });

    const missing = await worker.fetch(new Request("https://worker.example/api/status?site=other"), env);
    expect(await missing.json()).toEqual({ connected: false });
  });

  it("/api/config stores config that the public endpoint then serves", async () => {
    const env = makeEnv();
    const save = await worker.fetch(
      new Request("https://worker.example/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: "site-9", config: { strings: { title: "Hi there" } } }),
      }),
      env,
    );
    expect(save.status).toBe(200);
    expect(await save.json()).toEqual({ stored: true });

    const served = await worker.fetch(new Request("https://worker.example/api/wix/config/site9"), env);
    expect(served.status).toBe(200);
    expect(served.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const config = (await served.json()) as { strings: { title: string } };
    expect(config.strings.title).toBe("Hi there");
  });

  it("public config endpoint 404s for an unknown site", async () => {
    const res = await worker.fetch(new Request("https://worker.example/api/wix/config/nope"), makeEnv());
    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
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
        body: JSON.stringify({ siteId: "site-9", config: {} }),
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
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://dashboard.example");
  });

  it("unknown routes 404", async () => {
    const res = await worker.fetch(new Request("https://worker.example/nope"), makeEnv());
    expect(res.status).toBe(404);
  });
});

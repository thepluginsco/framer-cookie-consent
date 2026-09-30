/**
 * Routing tests for the Wix Data Client Worker (Phase 3.5).
 *
 * Covers signed-instance auth on every `/api/*` route (the only trust anchor —
 * callers never name a site), the config store round-trip (POST /api/config →
 * public GET /api/wix/config/<key>, license stripped), the install happy path
 * against a fake Wix (token mint → embed → opt-in default), remove, and static
 * asset fallthrough.
 */

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runtimeScriptUrl } from "@framer-cookie-consent/shared";
import worker, { type Env, type KVNamespace } from "../apps/wix-app/src/worker.js";

const SECRET = "secret";
const INSTANCE_ID = "2f8e0c1a-41ab-4c2d-9e3f-0a1b2c3d4e5f";
const SITE_KEY = INSTANCE_ID.replace(/-/g, "");

function signInstance(payload: object, secret = SECRET): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${createHmac("sha256", secret).update(data).digest("base64url")}.${data}`;
}
const INSTANCE = signInstance({ instanceId: INSTANCE_ID });

/** In-memory KV standing in for the Cloudflare binding. */
function memoryKV(seed: Record<string, string> = {}): KVNamespace & { store: Map<string, string> } {
  const store = new Map(Object.entries(seed));
  return {
    store,
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => void store.set(k, v),
    delete: async (k) => void store.delete(k),
  };
}

/** A fake Wix: records calls; scripts start un-embedded. */
function fakeWix() {
  const calls: { method: string; url: string; body?: any }[] = [];
  let embedded: unknown = null;
  const impl = (async (input: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: init?.method ?? "GET", url: String(input), ...(body ? { body } : {}) });
    if (String(input).endsWith("/oauth2/token")) return new Response(JSON.stringify({ access_token: "TOK" }));
    if (String(input).endsWith("/apps/v1/instance")) {
      return new Response(JSON.stringify({ site: { url: "https://acme.wixsite.com/shop", siteDisplayName: "Acme" } }));
    }
    if (String(input).endsWith("/apps/v1/scripts")) {
      if ((init?.method ?? "GET") === "GET") {
        return embedded ? new Response(JSON.stringify({ properties: embedded })) : new Response("", { status: 404 });
      }
      embedded = body.properties;
      return new Response("{}");
    }
    return new Response("{}");
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return { WIX_APP_ID: "app_1", WIX_APP_SECRET: SECRET, CONFIGS: memoryKV(), ...overrides };
}

function post(path: string, body: unknown): Request {
  return new Request(`https://worker.example${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Worker auth (signed instance)", () => {
  it("/api/status verifies the instance and returns the site key + published URL", async () => {
    const res = await worker.fetch(post("/api/status", { instance: INSTANCE }), makeEnv({ fetchImpl: fakeWix().impl }));
    expect(await res.json()).toEqual({
      connected: true,
      siteKey: SITE_KEY,
      siteUrl: "https://acme.wixsite.com/shop",
      siteName: "Acme",
    });
  });

  it("/api/status still connects when the site info lookup fails", async () => {
    const failing = (async () => new Response("nope", { status: 403 })) as unknown as typeof fetch;
    const res = await worker.fetch(post("/api/status", { instance: INSTANCE }), makeEnv({ fetchImpl: failing }));
    expect(await res.json()).toEqual({ connected: true, siteKey: SITE_KEY });
  });

  it("/api/status is not connected for a forged or missing instance", async () => {
    const forged = signInstance({ instanceId: INSTANCE_ID }, "attacker-secret");
    expect(await (await worker.fetch(post("/api/status", { instance: forged }), makeEnv())).json()).toEqual({ connected: false });
    expect(await (await worker.fetch(post("/api/status", {}), makeEnv())).json()).toEqual({ connected: false });
  });

  it("every write route rejects an invalid instance with 401", async () => {
    for (const path of ["/api/install", "/api/config", "/api/remove"]) {
      const res = await worker.fetch(post(path, { instance: "bogus.instance", config: {} }), makeEnv());
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: "invalid_instance" });
    }
  });

  it("ignores any caller-supplied site id — the instance decides the site", async () => {
    const configs = memoryKV();
    await worker.fetch(post("/api/config", { instance: INSTANCE, siteId: "victim", config: {} }), makeEnv({ CONFIGS: configs }));
    expect([...configs.store.keys()]).toEqual([`config:${SITE_KEY}`]);
  });
});

describe("Worker config store", () => {
  it("/api/config stores config (license stripped) that the public endpoint serves", async () => {
    const env = makeEnv();
    const save = await worker.fetch(
      post("/api/config", { instance: INSTANCE, config: { strings: { title: "Hi there" }, license: { key: "SECRET-KEY" } } }),
      env,
    );
    expect(await save.json()).toEqual({ stored: true });

    const served = await worker.fetch(new Request(`https://worker.example/api/wix/config/${SITE_KEY}`), env);
    expect(served.status).toBe(200);
    expect(served.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const text = await served.text();
    expect(JSON.parse(text).strings.title).toBe("Hi there");
    expect(text).not.toContain("SECRET-KEY");
  });

  it("public config endpoint 404s for an unknown site", async () => {
    const res = await worker.fetch(new Request("https://worker.example/api/wix/config/nope"), makeEnv());
    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("Worker install / remove against Wix", () => {
  it("install mints a token, embeds the site key, and sets the opt-in default on first install", async () => {
    const wix = fakeWix();
    const env = makeEnv({ fetchImpl: wix.impl });
    const res = await worker.fetch(post("/api/install", { instance: INSTANCE, config: {} }), env);
    expect(await res.json()).toEqual({ changed: true, defaultPolicySet: true });

    expect(wix.calls[0]).toMatchObject({
      method: "POST",
      url: "https://www.wixapis.com/oauth2/token",
      body: { grant_type: "client_credentials", client_id: "app_1", instance_id: INSTANCE_ID },
    });
    expect(wix.calls).toContainEqual({
      method: "POST",
      url: "https://www.wixapis.com/apps/v1/scripts",
      body: { properties: { parameters: { siteId: SITE_KEY }, disabled: false } },
    });
    expect(wix.calls.at(-1)).toMatchObject({
      method: "POST",
      url: "https://www.wixapis.com/site-properties/v4/properties/policy",
      body: { consentPolicy: { essential: true, analytics: false, advertising: false } },
    });
    // The config was stored before embedding, so the bootstrap can fetch it.
    expect((await worker.fetch(new Request(`https://worker.example/api/wix/config/${SITE_KEY}`), env)).status).toBe(200);
  });

  it("remove disables the script and drops the stored config", async () => {
    const wix = fakeWix();
    const env = makeEnv({ fetchImpl: wix.impl });
    await worker.fetch(post("/api/install", { instance: INSTANCE, config: {} }), env);
    const res = await worker.fetch(post("/api/remove", { instance: INSTANCE }), env);
    expect(await res.json()).toEqual({ changed: true, defaultPolicySet: false });
    expect(wix.calls.at(-1)).toMatchObject({ body: { properties: { disabled: true } } });
    expect((await worker.fetch(new Request(`https://worker.example/api/wix/config/${SITE_KEY}`), env)).status).toBe(404);
  });
});

describe("Worker routing", () => {
  it("answers OPTIONS preflight with CORS headers", async () => {
    const res = await worker.fetch(new Request("https://worker.example/api/install", { method: "OPTIONS" }), makeEnv());
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("serves everything outside /api from static assets (dashboard + bridge)", async () => {
    const seen: string[] = [];
    const env = makeEnv({ ASSETS: { fetch: async (r: Request) => (seen.push(new URL(r.url).pathname), new Response("asset")) } });
    const res = await worker.fetch(new Request("https://worker.example/consentful-wix-bridge.js"), env);
    expect(await res.text()).toBe("asset");
    expect(seen).toEqual(["/consentful-wix-bridge.js"]);
  });

  it("/runtime.js redirects to the pinned runtime bundle", async () => {
    const res = await worker.fetch(new Request("https://worker.example/runtime.js"), makeEnv());
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(runtimeScriptUrl());
  });

  it("unknown /api routes and missing assets 404", async () => {
    expect((await worker.fetch(post("/api/nope", {}), makeEnv())).status).toBe(404);
    expect((await worker.fetch(new Request("https://worker.example/nope"), makeEnv())).status).toBe(404);
  });
});

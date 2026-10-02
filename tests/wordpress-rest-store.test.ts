/**
 * Tests for the WordPress admin bundle's REST store (Phase 3.3).
 *
 * The store reaches the site's published settings, editor settings and
 * active-plugin list over the WordPress REST API. These lock in (a) the request
 * shapes (paths, nonce header, body), (b) that what is published is JSON — never
 * HTML — and (c) that the detect-trackers wiring routes `active_plugins` through
 * `detectWordPressTrackers`.
 */

import { describe, expect, it, vi } from "vitest";
import { mergeConfig, parse, serialize, toPublishedConfig } from "@framer-cookie-consent/shared";
import { WordPressRestStore } from "../apps/wordpress-plugin/src/rest-store.js";

const BASE = "https://site.example/wp-json/consentful/v1";
const NONCE = "nonce-123";

/**
 * An in-memory fake of the PHP REST controller: the published + editor options
 * plus an active-plugin list, so the real store can be driven end-to-end.
 * Records calls.
 */
function makeServer(plugins: string[] = []) {
  const state = { published: null as string | null, plugins, config: null as string | null };
  const calls: { method: string; url: string; nonce?: string; body?: unknown }[] = [];

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const nonce = (init?.headers as Record<string, string> | undefined)?.["X-WP-Nonce"];
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url, nonce, body });

    if (url.endsWith("/published") && method === "GET") {
      return new Response(JSON.stringify({ published: state.published }));
    }
    if (url.endsWith("/published") && method === "POST") {
      state.published = body.published == null || body.published === "" ? null : body.published;
      return new Response(JSON.stringify({ ok: true, published: state.published }));
    }
    if (url.endsWith("/config") && method === "GET") {
      return new Response(JSON.stringify({ config: state.config }));
    }
    if (url.endsWith("/config") && method === "POST") {
      state.config = body.config == null || body.config === "" ? null : body.config;
      return new Response(JSON.stringify({ ok: true, config: state.config }));
    }
    if (url.endsWith("/active-plugins") && method === "GET") {
      return new Response(JSON.stringify({ plugins: state.plugins }));
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;

  return { state, calls, fetchImpl };
}

function makeStore(server: ReturnType<typeof makeServer>): WordPressRestStore {
  return new WordPressRestStore({ restBase: BASE + "/", nonce: NONCE, fetchImpl: server.fetchImpl });
}

describe("WordPressRestStore request shapes", () => {
  it("reads the published settings and sends the nonce", async () => {
    const server = makeServer();
    server.state.published = "{}";
    const store = makeStore(server);
    expect(await store.readPublished()).toBe("{}");
    expect(server.calls[0]!.url).toBe(`${BASE}/published`);
    expect(server.calls[0]!.method).toBe("GET");
    expect(server.calls[0]!.nonce).toBe(NONCE);
  });

  it("returns null when no banner is published", async () => {
    const store = makeStore(makeServer());
    expect(await store.readPublished()).toBeNull();
  });

  it("POSTs the settings JSON to /published with the nonce", async () => {
    const server = makeServer();
    const store = makeStore(server);
    const json = serialize(toPublishedConfig(mergeConfig({})));
    await store.writePublished(json);
    const post = server.calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe(`${BASE}/published`);
    expect(post.nonce).toBe(NONCE);
    expect(post.body).toEqual({ published: json });
    expect(server.state.published).toBe(json);
  });

  it("publishes JSON, never HTML", async () => {
    const server = makeServer();
    const store = makeStore(server);
    await store.writePublished(serialize(toPublishedConfig(mergeConfig({}))));
    expect(() => JSON.parse(server.state.published as string)).not.toThrow();
    expect(server.state.published).not.toContain("<script");
  });

  it("takes the banner off the site by POSTing published: null", async () => {
    const server = makeServer();
    server.state.published = "{}";
    const store = makeStore(server);
    await store.writePublished(null);
    const post = server.calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ published: null });
    expect(server.state.published).toBeNull();
  });

  it("throws with status + detail on a failed read", async () => {
    const impl = vi.fn(async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
    const store = new WordPressRestStore({ restBase: BASE, nonce: NONCE, fetchImpl: impl });
    await expect(store.readPublished()).rejects.toThrow(/500.*boom/);
  });
});

describe("detectTrackers wiring", () => {
  it("maps active plugins through detectWordPressTrackers", async () => {
    const server = makeServer(["google-site-kit/google-site-kit.php", "hello-dolly/hello.php"]);
    const store = makeStore(server);

    const detected = await store.detectTrackers();

    expect(server.calls[0]!.url).toBe(`${BASE}/active-plugins`);
    expect(detected).toHaveLength(1);
    expect(detected[0]!.id).toBe("ga4");
    expect(detected[0]!.evidence).toContain("Site Kit");
  });

  it("returns [] when no known tracker plugins are active", async () => {
    const server = makeServer(["hello-dolly/hello.php"]);
    const store = makeStore(server);
    expect(await store.detectTrackers()).toEqual([]);
  });
});

describe("config store (load-on-mount)", () => {
  it("returns null for an unset config option", async () => {
    const store = makeStore(makeServer());
    expect(await store.readConfigOption()).toBeNull();
  });

  it("round-trips config JSON through /config with the nonce", async () => {
    const server = makeServer();
    const store = makeStore(server);
    const json = serialize(mergeConfig({ theme: { accent: "#123456" } }));

    await store.writeConfigOption(json);
    const post = server.calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe(`${BASE}/config`);
    expect(post.nonce).toBe(NONCE);
    expect(post.body).toEqual({ config: json });

    expect(await store.readConfigOption()).toBe(json);
    expect(parse(await store.readConfigOption() as string).theme.accent).toBe("#123456");
  });

  it("writeConfigOption(null) clears the stored config", async () => {
    const server = makeServer();
    const store = makeStore(server);
    await store.writeConfigOption(serialize(mergeConfig({})));
    await store.writeConfigOption(null);
    expect(server.state.config).toBeNull();
    expect(await store.readConfigOption()).toBeNull();
  });
});

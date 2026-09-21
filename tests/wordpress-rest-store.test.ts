/**
 * Tests for the WordPress admin bundle's REST-backed loader store (Phase 3.3).
 *
 * The concrete `WordPressLoaderStore` the shared core left as a seam: it reaches
 * the site's head option + active-plugin list over the WordPress REST API. These
 * lock in (a) the request shapes (paths, nonce header, body), (b) that driving
 * the SHARED `installWordPressLoader`/`removeWordPressLoader` through it stores
 * the byte-identical `buildLoaderHtml` block and is churn-free, and (c) that the
 * detect-trackers wiring routes `active_plugins` through `detectWordPressTrackers`.
 */

import { describe, expect, it, vi } from "vitest";
import {
  buildLoaderHtml,
  installWordPressLoader,
  mergeConfig,
  parse,
  removeWordPressLoader,
  serialize,
} from "@framer-cookie-consent/shared";
import { WordPressRestStore } from "../apps/wordpress-plugin/src/rest-store.js";

const BASE = "https://site.example/wp-json/consentful/v1";
const NONCE = "nonce-123";

/**
 * An in-memory fake of the PHP REST controller: a single head option plus an
 * active-plugin list, so the real store can be driven end-to-end. Records calls.
 */
function makeServer(plugins: string[] = []) {
  const state = { head: "", plugins, config: null as string | null };
  const calls: { method: string; url: string; nonce?: string; body?: unknown }[] = [];

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const nonce = (init?.headers as Record<string, string> | undefined)?.["X-WP-Nonce"];
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url, nonce, body });

    if (url.endsWith("/head") && method === "GET") {
      return new Response(JSON.stringify({ head: state.head }));
    }
    if (url.endsWith("/head") && method === "POST") {
      state.head = body.head == null ? "" : body.head;
      return new Response(JSON.stringify({ ok: true, head: state.head }));
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
  it("reads the head option and sends the nonce", async () => {
    const server = makeServer();
    server.state.head = "<!-- x -->";
    const store = makeStore(server);
    expect(await store.readHeadOption()).toBe("<!-- x -->");
    expect(server.calls[0]!.url).toBe(`${BASE}/head`);
    expect(server.calls[0]!.method).toBe("GET");
    expect(server.calls[0]!.nonce).toBe(NONCE);
  });

  it("returns '' for an unset head option", async () => {
    const server = makeServer();
    const store = makeStore(server);
    expect(await store.readHeadOption()).toBe("");
  });

  it("POSTs the html to /head with the nonce", async () => {
    const server = makeServer();
    const store = makeStore(server);
    await store.writeHeadOption("<b>hi</b>");
    const post = server.calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe(`${BASE}/head`);
    expect(post.nonce).toBe(NONCE);
    expect(post.body).toEqual({ head: "<b>hi</b>" });
    expect(server.state.head).toBe("<b>hi</b>");
  });

  it("clears the option by POSTing head: null", async () => {
    const server = makeServer();
    server.state.head = "something";
    const store = makeStore(server);
    await store.writeHeadOption(null);
    const post = server.calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ head: null });
    expect(server.state.head).toBe("");
  });

  it("throws with status + detail on a failed read", async () => {
    const impl = vi.fn(async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
    const store = new WordPressRestStore({ restBase: BASE, nonce: NONCE, fetchImpl: impl });
    await expect(store.readHeadOption()).rejects.toThrow(/500.*boom/);
  });
});

describe("installWordPressLoader through the REST store", () => {
  it("stores the byte-identical buildLoaderHtml block", async () => {
    const server = makeServer();
    const store = makeStore(server);
    const config = mergeConfig({});

    const wrote = await installWordPressLoader(store, config);

    expect(wrote).toBe(true);
    expect(server.state.head).toBe(buildLoaderHtml(config));
  });

  it("is churn-free: a second identical install writes nothing", async () => {
    const server = makeServer();
    const store = makeStore(server);
    const config = mergeConfig({});

    await installWordPressLoader(store, config);
    server.calls.length = 0; // reset

    const wrote = await installWordPressLoader(store, config);
    expect(wrote).toBe(false);
    // A GET to read the region, but NO POST.
    expect(server.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("preserves foreign head code when installing", async () => {
    const server = makeServer();
    server.state.head = "<meta name=\"foreign\" />";
    const store = makeStore(server);
    const config = mergeConfig({});

    await installWordPressLoader(store, config);

    expect(server.state.head).toContain("<meta name=\"foreign\" />");
    expect(server.state.head).toContain(buildLoaderHtml(config));
  });

  it("removes only our block, clearing the option when nothing else remains", async () => {
    const server = makeServer();
    const store = makeStore(server);
    const config = mergeConfig({});

    await installWordPressLoader(store, config);
    const removed = await removeWordPressLoader(store);

    expect(removed).toBe(true);
    expect(server.state.head).toBe("");
  });

  it("remove is a no-op when nothing is published", async () => {
    const server = makeServer();
    const store = makeStore(server);
    const removed = await removeWordPressLoader(store);
    expect(removed).toBe(false);
    expect(server.calls.some((c) => c.method === "POST")).toBe(false);
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

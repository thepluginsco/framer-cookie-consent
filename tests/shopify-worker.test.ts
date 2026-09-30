/**
 * Tests for the Shopify production Worker: the mandatory privacy compliance
 * webhooks (HMAC-verified) and the embedded-app frame-ancestors CSP.
 */

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import worker, {
  COMPLIANCE_WEBHOOK_PATH,
  frameAncestors,
  type Env,
} from "../apps/shopify-app/src/worker.js";

const SECRET = "shpss_test_secret";

function webhook(body: string, secret: string | null = SECRET): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Shopify-Topic": "customers/redact",
  };
  if (secret) headers["X-Shopify-Hmac-Sha256"] = createHmac("sha256", secret).update(body).digest("base64");
  return new Request(`https://app.example${COMPLIANCE_WEBHOOK_PATH}`, { method: "POST", headers, body });
}

const env = (overrides: Partial<Env> = {}): Env => ({ SHOPIFY_API_SECRET: SECRET, ...overrides });

describe("compliance webhooks", () => {
  const body = JSON.stringify({ shop_id: 1, shop_domain: "demo.myshopify.com", customer: { id: 7 } });

  it("accepts a correctly signed webhook with 200", async () => {
    expect((await worker.fetch(webhook(body), env())).status).toBe(200);
  });

  it("rejects a missing or wrong signature with 401", async () => {
    expect((await worker.fetch(webhook(body, null), env())).status).toBe(401);
    expect((await worker.fetch(webhook(body, "other-secret"), env())).status).toBe(401);
  });

  it("rejects a tampered body", async () => {
    const req = webhook(body);
    const tampered = new Request(req.url, { method: "POST", headers: req.headers, body: body.replace("7", "8") });
    expect((await worker.fetch(tampered, env())).status).toBe(401);
  });

  it("only accepts POST", async () => {
    expect((await worker.fetch(new Request(`https://app.example${COMPLIANCE_WEBHOOK_PATH}`), env())).status).toBe(405);
  });
});

describe("admin app hosting", () => {
  it("frame-ancestors allows only the shop and Shopify admin", () => {
    expect(frameAncestors("demo.myshopify.com")).toBe(
      "frame-ancestors https://demo.myshopify.com https://admin.shopify.com;",
    );
    // Anything that isn't a *.myshopify.com host is ignored.
    expect(frameAncestors("evil.com")).toBe("frame-ancestors https://admin.shopify.com;");
    expect(frameAncestors(null)).toBe("frame-ancestors https://admin.shopify.com;");
  });

  it("serves HTML from assets with the CSP added, other assets untouched", async () => {
    const assets = {
      fetch: async (r: Request) =>
        new URL(r.url).pathname.endsWith(".js")
          ? new Response("js", { headers: { "Content-Type": "text/javascript" } })
          : new Response("<html>", { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    };
    const html = await worker.fetch(new Request("https://app.example/?shop=demo.myshopify.com&host=x"), env({ ASSETS: assets }));
    expect(await html.text()).toBe("<html>");
    expect(html.headers.get("Content-Security-Policy")).toContain("https://demo.myshopify.com");

    const js = await worker.fetch(new Request("https://app.example/assets/app.js"), env({ ASSETS: assets }));
    expect(js.headers.get("Content-Security-Policy")).toBeNull();
  });
});

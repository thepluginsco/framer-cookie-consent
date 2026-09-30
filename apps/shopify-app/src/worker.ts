/**
 * Production host for the Shopify admin app — a Cloudflare Worker.
 *
 * The app itself is static (App Bridge + direct Admin API access, no backend),
 * so the Worker only:
 *   - serves the built admin app (`dist/`, via Workers static assets) with the
 *     `frame-ancestors` CSP Shopify requires of embedded apps; and
 *   - answers Shopify's mandatory privacy (GDPR) compliance webhooks
 *     (`customers/data_request`, `customers/redact`, `shop/redact`) at
 *     `/webhooks/compliance`, after verifying the HMAC with the app secret.
 *     Consentful stores no customer data (banner settings live in the shop's
 *     own app-data metafields, removed by Shopify on uninstall), so a verified
 *     request just gets a 200.
 */

/** Environment bindings. */
export interface Env {
  /** App client secret — verifies webhook HMACs (`wrangler secret put SHOPIFY_API_SECRET`). */
  SHOPIFY_API_SECRET: string;
  /** Workers static assets (the built admin app). Absent in unit tests. */
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

/** Where Shopify posts the privacy compliance webhooks (see shopify.app.toml). */
export const COMPLIANCE_WEBHOOK_PATH = "/webhooks/compliance";

/** `*.myshopify.com` only — anything else is ignored for the CSP. */
const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

/**
 * The CSP Shopify requires for embedded apps: the page may only be framed by
 * the merchant's shop and Shopify admin.
 */
export function frameAncestors(shop: string | null): string {
  const shopSrc = shop && SHOP_RE.test(shop) ? `https://${shop} ` : "";
  return `frame-ancestors ${shopSrc}https://admin.shopify.com;`;
}

/** base64(HMAC-SHA256(secret, body)) — Shopify's webhook signature. */
async function hmacBase64(secret: string, body: ArrayBuffer): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
  let bin = "";
  for (let i = 0; i < sig.length; i++) bin += String.fromCharCode(sig[i]!);
  return btoa(bin);
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify a Shopify webhook against the raw body. */
export async function verifyWebhook(request: Request, secret: string): Promise<boolean> {
  const header = request.headers.get("X-Shopify-Hmac-Sha256");
  if (!header || !secret) return false;
  const expected = await hmacBase64(secret, await request.arrayBuffer());
  return safeEqual(expected, header);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === COMPLIANCE_WEBHOOK_PATH) {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      if (!(await verifyWebhook(request, env.SHOPIFY_API_SECRET))) {
        return new Response("Unauthorized", { status: 401 });
      }
      // No customer data is stored anywhere — nothing to export or erase.
      return new Response(null, { status: 200 });
    }

    if (!env.ASSETS) return new Response("Not found", { status: 404 });
    const res = await env.ASSETS.fetch(request);
    if (!(res.headers.get("Content-Type") ?? "").includes("text/html")) return res;
    const headers = new Headers(res.headers);
    headers.set("Content-Security-Policy", frameAncestors(url.searchParams.get("shop")));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};

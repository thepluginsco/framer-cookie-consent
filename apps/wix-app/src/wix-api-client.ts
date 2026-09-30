/**
 * `WixApiClient` — the concrete {@link WixClient} the Phase 3.5 core
 * (`shared/src/wix.ts`) orchestrates, wired to the real Wix REST APIs.
 *
 * This is the impure half the core deliberately left behind a seam: the
 * app-authenticated HTTP calls. The pure engine ({@link installWixLoader} /
 * {@link removeWixLoader}) never talks to the network — it drives THIS client, so
 * a Wix site boots the byte-identical loader every other platform installs.
 *
 * A single instance is scoped to one app-instance access token (minted by
 * {@link ./oauth}); the Worker builds one per authorized request. The Embedded
 * Scripts API operates on the instance the token identifies, so no site id is
 * threaded through.
 *
 * Endpoints (Wix, base `https://www.wixapis.com`, verified 2026-09-30):
 *   - GET  /apps/v1/scripts                    → our embedded script (or 404)
 *   - POST /apps/v1/scripts                    → embed / re-embed ({ properties })
 *     (there is no delete — removal re-embeds with `disabled: true`)
 *   - POST /site-properties/v4/properties/policy → set the site DEFAULT policy
 *
 * Every method takes an injected `fetch`, so the request method/path/body/headers
 * are fully unit-testable without a live Wix app.
 */

import type {
  WixClient,
  WixConsentPolicy,
  WixEmbeddedScript,
} from "@framer-cookie-consent/shared";

/** Wix REST base URL. */
export const WIX_API_BASE = "https://www.wixapis.com";

/** Path of the Embedded Scripts resource (relative to {@link WIX_API_BASE}). */
export const WIX_SCRIPTS_PATH = "/apps/v1/scripts";

/** Path of the App Instance resource (site URL + name). */
export const WIX_APP_INSTANCE_PATH = "/apps/v1/instance";

/** Path of the Site Properties "update consent policy" method. */
export const WIX_CONSENT_POLICY_PATH = "/site-properties/v4/properties/policy";

/** Construction options for {@link WixApiClient}. */
export interface WixApiClientOptions {
  /** An app-instance access token (from {@link createAccessToken}). */
  token: string;
  /** Injected fetch (the Worker global); overridable in tests. */
  fetchImpl?: typeof fetch;
  /** Base URL override (tests / self-hosted proxies). Defaults to {@link WIX_API_BASE}. */
  baseUrl?: string;
}

/** Wire shape of the "get embedded script" response (subset). */
interface EmbeddedScriptResponse {
  properties?: WixEmbeddedScript;
}

/**
 * A {@link WixClient} backed by the live Wix REST APIs.
 *
 * One instance is scoped to a single app-instance `token`; the Worker builds one
 * per authorized install/remove request and hands it to the shared orchestrator.
 */
export class WixApiClient implements WixClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;

  constructor(options: WixApiClientOptions) {
    this.token = options.token;
    this.baseUrl = options.baseUrl ?? WIX_API_BASE;
    // Bind: a bare `fetch` stored on `this` throws "Illegal invocation" when called as a method.
    this.doFetch = options.fetchImpl ?? fetch.bind(globalThis);
  }

  /**
   * Perform an authenticated JSON request. Wix app-instance tokens go in the
   * `Authorization` header as the raw token (no `Bearer` prefix). Returns the
   * parsed body, `null` on 404, or throws on any other error.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T | null> {
    const res = await this.doFetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.token,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Wix ${method} ${path} failed (${res.status}): ${detail}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  async getEmbeddedScript(): Promise<WixEmbeddedScript | null> {
    const data = await this.request<EmbeddedScriptResponse>("GET", WIX_SCRIPTS_PATH);
    const script = data?.properties;
    // Never embedded: 404, or an empty properties object.
    if (!script || typeof script !== "object" || !script.parameters || Object.keys(script.parameters).length === 0) {
      return null;
    }
    // Only include `disabled` when the API returned it (exactOptionalPropertyTypes).
    const normalized: WixEmbeddedScript = { parameters: script.parameters };
    if (typeof script.disabled === "boolean") normalized.disabled = script.disabled;
    return normalized;
  }

  async embedScript(value: WixEmbeddedScript): Promise<void> {
    await this.request("POST", WIX_SCRIPTS_PATH, { properties: value });
  }

  /** Wix has no delete: re-embed the current parameters with `disabled: true`. */
  async deleteEmbeddedScript(): Promise<void> {
    const current = await this.getEmbeddedScript();
    if (!current) return;
    await this.request("POST", WIX_SCRIPTS_PATH, {
      properties: { parameters: current.parameters, disabled: true },
    });
  }

  /**
   * The site's published URL and display name (`GET /apps/v1/instance`). `url`
   * is only present once the site has been published.
   */
  async getSiteInfo(): Promise<{ url?: string; name?: string }> {
    const data = await this.request<{ site?: { url?: string; siteDisplayName?: string } }>(
      "GET",
      WIX_APP_INSTANCE_PATH,
    );
    const out: { url?: string; name?: string } = {};
    if (data?.site?.url) out.url = data.site.url;
    if (data?.site?.siteDisplayName) out.name = data.site.siteDisplayName;
    return out;
  }

  async updateDefaultConsentPolicy(policy: WixConsentPolicy): Promise<void> {
    await this.request("POST", WIX_CONSENT_POLICY_PATH, { consentPolicy: policy });
  }
}

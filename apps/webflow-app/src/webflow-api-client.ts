/**
 * `WebflowApiClient` — the concrete {@link WebflowClient} the Phase 3.2 core
 * (`shared/src/webflow.ts`) orchestrates, wired to the real Webflow v2 Data API.
 *
 * This is the impure half the core deliberately left behind a seam: HTTP calls,
 * the runtime's SRI hash, and publishing. The pure engine
 * ({@link installWebflowLoader} / {@link buildWebflowRegistrations}) never talks
 * to the network — it drives THIS client, so a Framer site and a Webflow site
 * publish byte-identical consent behaviour.
 *
 * Endpoints (Webflow v2, base `https://api.webflow.com/v2`, verified 2026-09-18):
 *   - GET    /sites/{id}/registered_scripts            → { registeredScripts: [...] }
 *   - POST   /sites/{id}/registered_scripts/inline     → registration
 *   - POST   /sites/{id}/registered_scripts/hosted     → registration
 *   - GET    /sites/{id}/custom_code                    → { scripts: [...] }  (applied)
 *   - PUT    /sites/{id}/custom_code                    → { scripts: [...] }  (upsert)
 *   - POST   /sites/{id}/publish                        → publish result
 *
 * The only untestable-by-unit piece is the actual network; every method takes an
 * injected `fetch`, so the request method/path/body/headers are fully covered.
 */

import type {
  WebflowAppliedScript,
  WebflowClient,
  WebflowHostedRegistration,
  WebflowInlineRegistration,
  WebflowRegisteredScript,
} from "@framer-cookie-consent/shared";

/** Webflow v2 Data API base URL. */
export const WEBFLOW_API_BASE = "https://api.webflow.com/v2";

/** Construction options for {@link WebflowApiClient}. */
export interface WebflowApiClientOptions {
  /** A site-scoped OAuth access token (from {@link exchangeCodeForToken}). */
  token: string;
  /** The Webflow site id to operate on. */
  siteId: string;
  /**
   * Publish target when {@link WebflowApiClient.publish} runs. Webflow's publish
   * endpoint requires an explicit target; default publishes to the free
   * `*.webflow.io` subdomain.
   */
  publishToWebflowSubdomain?: boolean;
  /** Custom domain ids to publish to (in addition to / instead of the subdomain). */
  customDomains?: string[];
  /** Injected fetch (the Worker global); overridable in tests. */
  fetchImpl?: typeof fetch;
  /** Base URL override (tests / self-hosted proxies). Defaults to {@link WEBFLOW_API_BASE}. */
  baseUrl?: string;
}

/** Shape of the "list registered scripts" response. */
interface RegisteredScriptsResponse {
  registeredScripts?: WebflowRegisteredScript[];
}

/** Shape of the applied-custom-code response (GET/PUT `/custom_code`). */
interface CustomCodeResponse {
  scripts?: WebflowAppliedScript[];
}

/**
 * A {@link WebflowClient} backed by the live Webflow v2 Data API.
 *
 * One instance is scoped to a single `{ token, siteId }`; the Data Client Worker
 * builds one per authorized install request and hands it to the shared
 * installer.
 */
export class WebflowApiClient implements WebflowClient {
  private readonly token: string;
  private readonly siteId: string;
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;
  private readonly publishToWebflowSubdomain: boolean;
  private readonly customDomains?: string[];

  constructor(options: WebflowApiClientOptions) {
    this.token = options.token;
    this.siteId = options.siteId;
    this.baseUrl = options.baseUrl ?? WEBFLOW_API_BASE;
    // Bind: a bare `fetch` stored on `this` throws "Illegal invocation" when called as a method.
    this.doFetch = options.fetchImpl ?? fetch.bind(globalThis);
    this.publishToWebflowSubdomain = options.publishToWebflowSubdomain ?? true;
    if (options.customDomains) this.customDomains = options.customDomains;
  }

  /** Perform an authenticated JSON request and parse the body (or throw). */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.doFetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Webflow ${method} ${path} failed (${res.status}): ${detail}`);
    }
    // Some endpoints (publish) may return an empty body; tolerate it.
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  private sitePath(suffix: string): string {
    return `/sites/${encodeURIComponent(this.siteId)}${suffix}`;
  }

  async getAppliedScripts(): Promise<WebflowAppliedScript[]> {
    const data = await this.request<CustomCodeResponse>("GET", this.sitePath("/custom_code"));
    return data.scripts ?? [];
  }

  async applyScripts(scripts: WebflowAppliedScript[]): Promise<void> {
    await this.request<CustomCodeResponse>("PUT", this.sitePath("/custom_code"), { scripts });
  }

  async listRegisteredScripts(): Promise<WebflowRegisteredScript[]> {
    const data = await this.request<RegisteredScriptsResponse>(
      "GET",
      this.sitePath("/registered_scripts"),
    );
    return data.registeredScripts ?? [];
  }

  async registerInlineScript(
    input: WebflowInlineRegistration,
  ): Promise<WebflowRegisteredScript> {
    return this.request<WebflowRegisteredScript>(
      "POST",
      this.sitePath("/registered_scripts/inline"),
      input,
    );
  }

  async registerHostedScript(
    input: WebflowHostedRegistration,
  ): Promise<WebflowRegisteredScript> {
    return this.request<WebflowRegisteredScript>(
      "POST",
      this.sitePath("/registered_scripts/hosted"),
      input,
    );
  }

  /**
   * Resolve the Subresource-Integrity hash for the hosted runtime by fetching
   * the bundle and hashing it with SHA-384 (Web Crypto, available in Workers and
   * modern browsers). Returned in the `sha384-<base64>` form Webflow expects.
   */
  async runtimeIntegrityHash(url: string): Promise<string> {
    const res = await this.doFetch(url);
    if (!res.ok) {
      throw new Error(`Fetching runtime for SRI failed (${res.status}): ${url}`);
    }
    const bytes = await res.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-384", bytes);
    return `sha384-${base64FromBytes(new Uint8Array(digest))}`;
  }

  async publish(): Promise<void> {
    const body: { publishToWebflowSubdomain: boolean; customDomains?: string[] } = {
      publishToWebflowSubdomain: this.publishToWebflowSubdomain,
    };
    if (this.customDomains) body.customDomains = this.customDomains;
    await this.request<unknown>("POST", this.sitePath("/publish"), body);
  }
}

/** Base64-encode raw bytes without Node Buffer (Worker/browser-safe). */
function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  // `btoa` exists in Workers and browsers; the app never runs under bare Node.
  return btoa(binary);
}

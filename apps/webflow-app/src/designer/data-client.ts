/**
 * Browser-side client for the Data Client Worker.
 *
 * The Designer Extension runs in a sandboxed iframe with no Webflow credentials;
 * it talks to the Worker ({@link ../worker.ts}) for everything that needs a
 * token: checking connection status, kicking off OAuth, and installing/removing
 * the loader. Every `/api/*` call carries the Designer user's short-lived ID
 * token (`webflow.getIdToken()`) as `Authorization: Bearer …`, which the Worker
 * resolves with Webflow before answering. All request shapes are pure and
 * unit-testable via an injected `fetch`; only {@link connect} touches `window`.
 */

import { parse, type CookieConsentConfig } from "@framer-cookie-consent/shared";

/** Result of an install/remove call (mirrors the core's WebflowWriteResult). */
export interface WriteResult {
  changed: boolean;
  published: boolean;
}

/** Config for the browser data client. */
export interface DataClientOptions {
  /** Base URL of the deployed Worker (e.g. `https://consentful-connect.workers.dev`). */
  workerBase: string;
  /** Injected fetch; overridable in tests. */
  fetchImpl?: typeof fetch;
}

/** Shown when the service can't be reached or fails for a reason the user can't fix. */
export const CONNECT_ERROR = "Unable to connect. Try again or contact support.";

/** A failed Worker call, carrying a message that is safe to show the user. */
export class DataClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DataClientError";
  }
}

/** User-facing text for a failed Worker response. */
function errorMessage(status: number): string {
  if (status === 401) return "Open Consentful inside the Webflow Designer and connect your site, then try again.";
  if (status === 403) return "Your Webflow session has expired or you don't have access to this site. Reopen the app and try again.";
  return CONNECT_ERROR;
}

/**
 * The license key never leaves the panel: the live site doesn't need it and the
 * Worker doesn't store it. The tier stays so the published design matches the plan.
 */
export function withoutLicenseKey(config: CookieConsentConfig): CookieConsentConfig {
  return { ...config, license: { ...config.license, key: null } };
}

export class WebflowDataClient {
  private readonly base: string;
  private readonly doFetch: typeof fetch;

  constructor(options: DataClientOptions) {
    this.base = options.workerBase.replace(/\/$/, "");
    // Bind: a bare `fetch` stored on `this` throws "Illegal invocation" when called as a method.
    this.doFetch = options.fetchImpl ?? fetch.bind(globalThis);
  }

  /**
   * True when the Worker holds a token for `siteId` and `idToken` proves the
   * caller is one of its Designer users. Any refusal reads as not connected;
   * a network failure throws.
   */
  async isConnected(siteId: string, idToken: string | null): Promise<boolean> {
    if (!idToken) return false;
    const res = await this.call(`/api/status?site=${encodeURIComponent(siteId)}`, idToken);
    if (!res.ok) return false;
    const data = (await res.json()) as { connected?: boolean };
    return Boolean(data.connected);
  }

  /** The URL that starts OAuth for `siteId` (open it in a popup / new tab). */
  authorizeUrl(siteId: string): string {
    return `${this.base}/authorize?site=${encodeURIComponent(siteId)}`;
  }

  /** Open the OAuth flow (browser only). */
  connect(siteId: string): void {
    window.open(this.authorizeUrl(siteId), "_blank", "noopener");
  }

  /** Install / update the loader on the site. */
  async install(siteId: string, config: CookieConsentConfig, idToken: string | null): Promise<WriteResult> {
    return this.post("/api/install", { siteId, config: withoutLicenseKey(config) }, idToken);
  }

  /** Remove the loader from the site. */
  async remove(siteId: string, idToken: string | null): Promise<WriteResult> {
    return this.post("/api/remove", { siteId }, idToken);
  }

  /**
   * Load the site's last-published config so the Designer panel reopens on the
   * live banner, not a fresh default. Returns `null` when nothing is stored yet
   * (never published, or the Worker has no CONFIGS store) or there's no ID
   * token (outside the Designer) — the caller keeps its local draft.
   */
  async loadConfig(siteId: string, idToken: string | null): Promise<CookieConsentConfig | null> {
    if (!idToken) return null;
    const res = await this.call(`/api/config?site=${encodeURIComponent(siteId)}`, idToken);
    if (res.status === 404) return null;
    if (!res.ok) throw new DataClientError(errorMessage(res.status), res.status);
    return parse(await res.text());
  }

  /** One request to the Worker; a network failure becomes {@link CONNECT_ERROR}. */
  private async call(path: string, idToken: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await this.doFetch(`${this.base}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${idToken}` },
      });
    } catch {
      throw new DataClientError(CONNECT_ERROR, 0);
    }
  }

  private async post(path: string, body: unknown, idToken: string | null): Promise<WriteResult> {
    if (!idToken) throw new DataClientError(errorMessage(401), 401);
    const res = await this.call(path, idToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new DataClientError(errorMessage(res.status), res.status);
    return (await res.json()) as WriteResult;
  }
}

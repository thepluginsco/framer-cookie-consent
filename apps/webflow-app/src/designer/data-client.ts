/**
 * Browser-side client for the Data Client Worker.
 *
 * The Designer Extension runs in a sandboxed iframe with no Webflow credentials;
 * it talks to the Worker ({@link ../worker.ts}) for everything that needs a
 * token: checking connection status, kicking off OAuth, and installing/removing
 * the loader. All request shapes are pure and unit-testable via an injected
 * `fetch`; only {@link connect} touches `window`.
 */

import { parse, type CookieConsentConfig } from "@framer-cookie-consent/shared";

/** Result of an install/remove call (mirrors the core's WebflowWriteResult). */
export interface WriteResult {
  changed: boolean;
  published: boolean;
}

/** Config for the browser data client. */
export interface DataClientOptions {
  /** Base URL of the deployed Worker (e.g. `https://consentful-webflow.workers.dev`). */
  workerBase: string;
  /** Injected fetch; overridable in tests. */
  fetchImpl?: typeof fetch;
}

export class WebflowDataClient {
  private readonly base: string;
  private readonly doFetch: typeof fetch;

  constructor(options: DataClientOptions) {
    this.base = options.workerBase.replace(/\/$/, "");
    this.doFetch = options.fetchImpl ?? fetch;
  }

  /** True when the Worker holds a token for `siteId`. */
  async isConnected(siteId: string): Promise<boolean> {
    const res = await this.doFetch(`${this.base}/api/status?site=${encodeURIComponent(siteId)}`);
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
  async install(siteId: string, config: CookieConsentConfig): Promise<WriteResult> {
    return this.post("/api/install", { siteId, config });
  }

  /** Remove the loader from the site. */
  async remove(siteId: string): Promise<WriteResult> {
    return this.post("/api/remove", { siteId });
  }

  /**
   * Load the site's last-published config so the Designer panel reopens on the
   * live banner, not a fresh default. Returns `null` when nothing is stored yet
   * (never published, or the Worker has no CONFIGS store) or on any error — the
   * caller keeps its local draft.
   */
  async loadConfig(siteId: string): Promise<CookieConsentConfig | null> {
    const res = await this.doFetch(`${this.base}/api/config?site=${encodeURIComponent(siteId)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Worker config load failed (${res.status})`);
    return parse(await res.text());
  }

  private async post(path: string, body: unknown): Promise<WriteResult> {
    const res = await this.doFetch(`${this.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Worker ${path} failed (${res.status}): ${detail}`);
    }
    return (await res.json()) as WriteResult;
  }
}

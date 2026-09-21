/**
 * Browser-side client for the Wix Data Client Worker.
 *
 * The dashboard page has no Wix credentials; it talks to the Worker
 * ({@link ../worker.ts}) for everything that needs a token or the config store:
 * checking connection status, kicking off OAuth, saving config, and
 * installing/removing the loader. All request shapes are pure and unit-testable
 * via an injected `fetch`; only {@link connect} touches `window`.
 */

import { parse, type CookieConsentConfig } from "@framer-cookie-consent/shared";

/** Path the Worker serves a site's stored config from (public, CORS-*). */
const WIX_CONFIG_PATH = "/api/wix/config";

/** Result of an install/remove call (mirrors the core's WixWriteResult). */
export interface WriteResult {
  changed: boolean;
  defaultPolicySet: boolean;
}

/** Config for the browser data client. */
export interface DataClientOptions {
  /** Base URL of the deployed Worker (e.g. `https://consentful-wix.workers.dev`). */
  workerBase: string;
  /** Injected fetch; overridable in tests. */
  fetchImpl?: typeof fetch;
}

export class WixDataClient {
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

  /** The URL that starts OAuth/app-install for `siteId` (open it in a popup). */
  authorizeUrl(siteId: string): string {
    return `${this.base}/authorize?site=${encodeURIComponent(siteId)}`;
  }

  /** Open the install flow (browser only). */
  connect(siteId: string): void {
    window.open(this.authorizeUrl(siteId), "_blank", "noopener");
  }

  /** Install the loader on the site (embeds the script + sets the opt-in default). */
  async install(siteId: string, config: CookieConsentConfig): Promise<WriteResult> {
    return this.post("/api/install", { siteId, config });
  }

  /** Save config only — a config edit never needs to touch Wix. */
  async saveConfig(siteId: string, config: CookieConsentConfig): Promise<void> {
    await this.postRaw("/api/config", { siteId, config });
  }

  /**
   * Load the site's stored config so the dashboard opens on what's actually
   * live, not a fresh default. Returns `null` when nothing has been saved yet
   * (a brand-new site) or the Worker is unreachable — callers keep their local
   * draft in that case. Reads the same public endpoint the published-site
   * bootstrap uses.
   */
  async loadConfig(siteId: string): Promise<CookieConsentConfig | null> {
    const res = await this.doFetch(`${this.base}${WIX_CONFIG_PATH}/${encodeURIComponent(siteId)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Worker config load failed (${res.status})`);
    return parse(await res.text());
  }

  /** Remove the loader from the site (and drop its stored config). */
  async remove(siteId: string): Promise<WriteResult> {
    return this.post("/api/remove", { siteId });
  }

  private async post(path: string, body: unknown): Promise<WriteResult> {
    return (await this.postRaw(path, body)) as WriteResult;
  }

  private async postRaw(path: string, body: unknown): Promise<unknown> {
    const res = await this.doFetch(`${this.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Worker ${path} failed (${res.status}): ${detail}`);
    }
    return res.json();
  }
}

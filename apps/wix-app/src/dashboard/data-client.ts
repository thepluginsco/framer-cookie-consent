/**
 * Browser-side client for the Wix Data Client Worker.
 *
 * The dashboard page has no Wix credentials; it forwards the signed app
 * instance Wix gave it, and the Worker ({@link ../worker.ts}) verifies it and
 * does everything that needs a token or the config store: confirming the
 * session, saving config, and installing/removing the loader. All request
 * shapes are pure and unit-testable via an injected `fetch`.
 */

import { parse, type CookieConsentConfig } from "@framer-cookie-consent/shared";

/** Path the Worker serves a site's stored config from (public, CORS-*). */
const WIX_CONFIG_PATH = "/api/wix/config";

/** Result of an install/remove call (mirrors the core's WixWriteResult). */
export interface WriteResult {
  changed: boolean;
  defaultPolicySet: boolean;
}

/** The verified dashboard session. */
export interface WixSession {
  connected: boolean;
  /** The site's key in the config store (normalized instance id). */
  siteKey?: string;
  /** The published site's URL (absent until the site is published). */
  siteUrl?: string;
  /** The site's display name. */
  siteName?: string;
}

/** Config for the browser data client. */
export interface DataClientOptions {
  /**
   * Base URL of the deployed Worker. Empty (the default) = same origin: the
   * Worker serves this dashboard page itself.
   */
  workerBase?: string;
  /** Injected fetch; overridable in tests. */
  fetchImpl?: typeof fetch;
}

export class WixDataClient {
  private readonly base: string;
  private readonly doFetch: typeof fetch;

  constructor(options: DataClientOptions = {}) {
    this.base = (options.workerBase ?? "").replace(/\/$/, "");
    // Bind: a bare `fetch` stored on `this` throws "Illegal invocation" when called as a method.
    this.doFetch = options.fetchImpl ?? fetch.bind(globalThis);
  }

  /** Verify the signed instance with the Worker → the site's key. */
  async session(instance: string): Promise<WixSession> {
    return (await this.postRaw("/api/status", { instance })) as WixSession;
  }

  /** Install the loader on the site (stores config, embeds the script, sets the opt-in default). */
  async install(instance: string, config: CookieConsentConfig): Promise<WriteResult> {
    return (await this.postRaw("/api/install", { instance, config })) as WriteResult;
  }

  /** Save config only — a config edit never needs to touch Wix. */
  async saveConfig(instance: string, config: CookieConsentConfig): Promise<void> {
    await this.postRaw("/api/config", { instance, config });
  }

  /**
   * Load the site's stored config so the dashboard opens on what's actually
   * live, not a fresh default. Returns `null` when nothing has been saved yet.
   * Reads the same public endpoint the published-site bootstrap uses.
   */
  async loadConfig(siteKey: string): Promise<CookieConsentConfig | null> {
    const res = await this.doFetch(`${this.base}${WIX_CONFIG_PATH}/${encodeURIComponent(siteKey)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Worker config load failed (${res.status})`);
    return parse(await res.text());
  }

  /** Remove the loader from the site (and drop its stored config). */
  async remove(instance: string): Promise<WriteResult> {
    return (await this.postRaw("/api/remove", { instance })) as WriteResult;
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

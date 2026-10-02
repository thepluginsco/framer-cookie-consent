/**
 * The browser-side WordPress store.
 *
 * The admin bundle runs inside wp-admin and reaches the site's stored banner
 * settings and active-plugin list over the WordPress REST API. This class owns
 * ONLY the HTTP shapes.
 *
 * WordPress stores the published settings as JSON, and PHP loads the banner
 * runtime bundled inside the plugin with those settings printed before it — so
 * no HTML is ever sent to or stored on the site (unlike the head-blob adapters).
 *
 * The credential-holding surface (the option read/write and reading
 * `active_plugins`) lives in the PHP plugin's REST controller, which gates every
 * route on `current_user_can('manage_options')`. Here we only carry the REST
 * nonce so WordPress accepts the write as coming from the logged-in admin.
 *
 * Every request shape is pure and unit-testable via an injected `fetch`.
 */

import type { DetectedTracker } from "@framer-cookie-consent/shared";
import { detectWordPressTrackers } from "@framer-cookie-consent/shared";

/** Options for {@link WordPressRestStore}. */
export interface RestStoreOptions {
  /**
   * REST namespace root with no trailing slash, e.g.
   * `https://site.example/wp-json/consentful/v1`.
   */
  restBase: string;
  /** WordPress REST nonce, sent as `X-WP-Nonce` so cookie auth is accepted. */
  nonce: string;
  /** Injected fetch; overridable in tests. */
  fetchImpl?: typeof fetch;
}

/** Shape of the `GET /published` response. */
interface PublishedResponse {
  published?: string | null;
}

/** Shape of the `GET /config` response. */
interface ConfigResponse {
  config?: string | null;
}

/** Shape of the `GET /active-plugins` response. */
interface ActivePluginsResponse {
  plugins?: string[];
}

/**
 * Reads and writes the published + editor settings over the WordPress REST API,
 * and exposes the site's active-plugin list for pre-publish tracker detection.
 */
export class WordPressRestStore {
  private readonly base: string;
  private readonly nonce: string;
  private readonly doFetch: typeof fetch;

  constructor(options: RestStoreOptions) {
    this.base = options.restBase.replace(/\/$/, "");
    this.nonce = options.nonce;
    // Bind: a bare `fetch` stored on `this` throws "Illegal invocation" when called as a method.
    this.doFetch = options.fetchImpl ?? fetch.bind(globalThis);
  }

  /**
   * Read the PUBLISHED banner settings (serialized JSON), or `null` when no
   * banner is on the site. This is what the front end loads.
   */
  async readPublished(): Promise<string | null> {
    const res = await this.doFetch(`${this.base}/published`, {
      headers: { "X-WP-Nonce": this.nonce },
    });
    if (!res.ok) throw await this.error("GET /published", res);
    const data = (await res.json()) as PublishedResponse;
    return data.published ?? null;
  }

  /** Persist the published banner settings JSON; `null` takes the banner off the site. */
  async writePublished(json: string | null): Promise<void> {
    const res = await this.doFetch(`${this.base}/published`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-WP-Nonce": this.nonce },
      body: JSON.stringify({ published: json }),
    });
    if (!res.ok) throw await this.error("POST /published", res);
  }

  /**
   * Read the stored authoring config (the serialized JSON), or `null` when none
   * has been saved yet — so the admin screen can reopen on the live banner. This
   * is separate from {@link readPublished}: that is the plan-limited config the
   * front end loads; this is the full config the editor reloads.
   */
  async readConfigOption(): Promise<string | null> {
    const res = await this.doFetch(`${this.base}/config`, {
      headers: { "X-WP-Nonce": this.nonce },
    });
    if (!res.ok) throw await this.error("GET /config", res);
    const data = (await res.json()) as ConfigResponse;
    return data.config ?? null;
  }

  /** Persist the authoring config JSON; `null` clears it. */
  async writeConfigOption(json: string | null): Promise<void> {
    const res = await this.doFetch(`${this.base}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-WP-Nonce": this.nonce },
      body: JSON.stringify({ config: json }),
    });
    if (!res.ok) throw await this.error("POST /config", res);
  }

  /**
   * Fetch the site's active plugins and map them to catalog trackers via the
   * shared {@link detectWordPressTrackers} — the pre-publish analogue of the
   * design-time HTML scan. Returns `[]` when nothing recognised.
   */
  async detectTrackers(): Promise<DetectedTracker[]> {
    const res = await this.doFetch(`${this.base}/active-plugins`, {
      headers: { "X-WP-Nonce": this.nonce },
    });
    if (!res.ok) throw await this.error("GET /active-plugins", res);
    const data = (await res.json()) as ActivePluginsResponse;
    return detectWordPressTrackers(Array.isArray(data.plugins) ? data.plugins : []);
  }

  private async error(what: string, res: Response): Promise<Error> {
    const detail = await res.text().catch(() => "");
    return new Error(`WordPress REST ${what} failed (${res.status}): ${detail}`);
  }
}

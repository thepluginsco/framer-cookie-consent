/**
 * The WIX ADAPTER — Phase 3.5's front-end for the shared engine.
 *
 * Wix is the one long-tail platform (of Wix / Squarespace / Ghost / Carrd) that
 * graduates out of embed-only, because it has BOTH seams: a programmatic head
 * write (the app-authenticated **Embedded Scripts API**) and a first-class
 * consent bridge (the site **Consent Policy**). The other three stay on the
 * universal `<script>` embed forever (no header-write API / no marketplace).
 *
 * The KEY architectural difference from every other adapter: **Wix is NOT
 * ∅-infra.** The Embedded Scripts API only substitutes dynamic parameters that
 * are *alphanumeric strings — no spaces, no punctuation* — into a script the app
 * pre-declares as a component. Our usual inline `window.__CC_CONFIG__ = {…JSON…}`
 * block cannot travel through an alphanumeric parameter, so the config is NOT
 * baked into the page. Instead:
 *
 *   1. The app declares ONE static embedded-script component — a tiny bootstrap
 *      ({@link buildWixBootstrapScript}) whose only dynamic parameter is the
 *      site's id ({@link WIX_SITE_PARAM}, alphanumeric — legal).
 *   2. On install, {@link installWixLoader} embeds that component on the site with
 *      the concrete `siteId` parameter.
 *   3. At runtime the bootstrap fetches the site's config from our per-site config
 *      store ({@link wixConfigUrl}), assigns it to `window.__CC_CONFIG__`, and
 *      loads the SAME version-pinned jsDelivr runtime every other adapter uses.
 *
 * So a Wix site boots the byte-identical runtime and the byte-identical config
 * shape — the runtime needs NO Wix-specific code path (it already reads an object
 * on `window.__CC_CONFIG__`). The only new infra is the site-keyed config store,
 * which reuses the Phase 2.2 licensing Worker + DB rather than net-new plumbing.
 *
 * The genuinely NEW, Wix-specific engine piece is {@link mapToWixConsent}: the
 * bridge to Wix's five-bucket Consent Policy (the analogue of `mapToShopifyConsent`
 * / Shopify's four buckets), plus {@link WIX_REJECT_ALL_POLICY} — the opt-in
 * default the backend sets on install so a fresh site starts fully denied.
 *
 * Everything here is PURE (payload building + a consent mapping + orchestration)
 * and testable against an in-memory {@link WixClient}. The impure surface — OAuth,
 * the Embedded Scripts / Site Properties REST calls, and the browser
 * `consentPolicy.setConsentPolicy` call — lives in the deferred Wix App shell,
 * exactly as the Webflow shell implements `WebflowClient`.
 */

import type { CookieConsentConfig, ConsentModeSignal } from "./config-schema.js";
import { runtimeScriptUrl } from "./runtime-cdn.js";

/* -------------------------------------------------------------------------- */
/* Per-site config store (Wix is NOT ∅-infra)                                 */
/* -------------------------------------------------------------------------- */

/**
 * Origin of the per-site config store the Wix bootstrap fetches from — reused
 * from the Phase 2.2 licensing Worker rather than net-new infra. The store maps a
 * normalized site id → that site's serialized {@link CookieConsentConfig}.
 *
 * ⚠️ Point this at the deployed Worker origin before launch. It is overridable
 * per call ({@link WixBootstrapOptions.configBaseUrl}) for local testing.
 */
export const WIX_CONFIG_BASE_URL = "https://consentful.theplugins.co";

/** Path prefix (under {@link WIX_CONFIG_BASE_URL}) for the config endpoint. */
export const WIX_CONFIG_PATH = "/api/wix/config";

/**
 * Build the config-store URL the bootstrap fetches a site's config from.
 *
 * @param siteId - The normalized (alphanumeric) site id (see {@link normalizeWixSiteId}).
 * @param baseUrl - Override the store origin (default {@link WIX_CONFIG_BASE_URL}).
 * @returns e.g. `https://consentful.theplugins.co/api/wix/config/abc123`.
 */
export function wixConfigUrl(siteId: string, baseUrl: string = WIX_CONFIG_BASE_URL): string {
  return `${baseUrl.replace(/\/+$/, "")}${WIX_CONFIG_PATH}/${encodeURIComponent(siteId)}`;
}

/* -------------------------------------------------------------------------- */
/* Site-id normalization (the alphanumeric-only parameter constraint)         */
/* -------------------------------------------------------------------------- */

/**
 * The dynamic-parameter name our embedded-script component declares. Wix
 * substitutes `{{siteId}}` in the template with the concrete value at inject
 * time; the value MUST be alphanumeric (see {@link normalizeWixSiteId}).
 */
export const WIX_SITE_PARAM = "siteId";

/**
 * Normalize a Wix site/instance id into the alphanumeric form the Embedded
 * Scripts API accepts as a parameter value.
 *
 * Wix site ids are GUIDs (`f0e5…-4a1b-…`) — the hyphens are *illegal* in a
 * dynamic parameter, which admits `[A-Za-z0-9]` only. Stripping every
 * non-alphanumeric character is deterministic and reversible-enough for a key:
 * the config store is keyed by the SAME normalized id, so the bootstrap fetches
 * exactly what the install wrote.
 *
 * @throws RangeError if nothing alphanumeric remains.
 */
export function normalizeWixSiteId(raw: string): string {
  const normalized = (raw ?? "").replace(/[^A-Za-z0-9]/g, "");
  if (normalized === "") {
    throw new RangeError(
      `Wix site id ${JSON.stringify(raw)} has no alphanumeric characters; ` +
        `it cannot be used as an Embedded Scripts parameter.`,
    );
  }
  return normalized;
}

/* -------------------------------------------------------------------------- */
/* The pre-declared bootstrap component                                       */
/* -------------------------------------------------------------------------- */

/** Options for {@link buildWixBootstrapScript}. */
export interface WixBootstrapOptions {
  /** Override the runtime `<script src>` URL (local testing / self-hosting). */
  runtimeUrl?: string;
  /** Override the config-store origin (default {@link WIX_CONFIG_BASE_URL}). */
  configBaseUrl?: string;
  /**
   * URL of the Wix **consent-bridge** asset to also load (deferred), which relays
   * each banner decision into Wix's Consent Policy via {@link mapToWixConsent}.
   * Optional: omit and the bootstrap loads only the runtime (the banner still
   * works; Wix's own tags just aren't bridged). The Wix App shell builds this
   * asset and passes its deployed URL when declaring the component.
   */
  bridgeUrl?: string;
  /**
   * Emit the concrete `siteId` inline instead of the `{{siteId}}` mustache token.
   * Leave undefined to produce the STATIC template the app declares once (Wix
   * substitutes the token per site); pass a value only to render a resolved
   * bootstrap (e.g. for a preview or a test).
   */
  siteId?: string;
}

/**
 * Build the tiny bootstrap that IS our Wix embedded-script component.
 *
 * The app declares this once (with the `{{siteId}}` token); Wix injects it into
 * `<head>` on every page of an installed site, substituting the site's id. At
 * runtime it:
 *   1. reads the (already-substituted) site id,
 *   2. fetches that site's config JSON from {@link wixConfigUrl},
 *   3. assigns it to `window.__CC_CONFIG__` (an object — the runtime merges it),
 *   4. appends the version-pinned, `defer`red runtime `<script>`.
 *
 * Because the runtime already accepts an object on `window.__CC_CONFIG__`, there
 * is NO Wix-specific runtime path — one engine. Everything is best-effort and
 * swallows errors so a fetch failure degrades to "no banner", never a broken
 * host page. The `<script>` tag itself is included so the value can be embedded
 * directly; the app config declares the same body.
 *
 * @returns The bootstrap as a `<script>…</script>` string.
 */
export function buildWixBootstrapScript(options: WixBootstrapOptions = {}): string {
  const runtimeUrl = options.runtimeUrl ?? runtimeScriptUrl();
  const baseUrl = options.configBaseUrl ?? WIX_CONFIG_BASE_URL;
  // The template token Wix substitutes, or a resolved literal when previewing.
  const siteExpr =
    options.siteId === undefined
      ? `"{{${WIX_SITE_PARAM}}}"`
      : JSON.stringify(normalizeWixSiteId(options.siteId));

  const endpointPrefix = `${baseUrl.replace(/\/+$/, "")}${WIX_CONFIG_PATH}/`;

  // Optional second `defer`red asset — the consent bridge — appended after the
  // runtime so Wix's own tags honour the same decision. Emitted only when a URL
  // is supplied; otherwise the bootstrap loads just the runtime.
  const loadBridge =
    options.bridgeUrl === undefined
      ? ""
      : `var b=document.createElement("script");` +
        `b.src=${JSON.stringify(options.bridgeUrl)};b.defer=true;` +
        `(document.head||document.documentElement).appendChild(b);`;

  const body =
    `(function(){` +
    `var s=${siteExpr};if(!s)return;` +
    `fetch(${JSON.stringify(endpointPrefix)}+encodeURIComponent(s))` +
    `.then(function(r){return r.json();})` +
    `.then(function(cfg){` +
    `window.__CC_CONFIG__=cfg;` +
    `var t=document.createElement("script");` +
    `t.src=${JSON.stringify(runtimeUrl)};t.defer=true;` +
    `(document.head||document.documentElement).appendChild(t);` +
    loadBridge +
    `}).catch(function(){});` +
    `})();`;

  return `<script>${body}</script>`;
}

/* -------------------------------------------------------------------------- */
/* Embedded Scripts API — a faithful (minimal) subset                         */
/* -------------------------------------------------------------------------- */

/**
 * The per-site value of our embedded-script component: the parameter map Wix
 * substitutes into the declared template, plus whether it is enabled. This is the
 * exact shape the Embedded Scripts API's "embed" call carries.
 */
export interface WixEmbeddedScript {
  /** Parameters substituted into the template (we set only {@link WIX_SITE_PARAM}). */
  parameters: Record<string, string>;
  /** `true` when the script is embedded but disabled; absent/`false` when live. */
  disabled?: boolean;
}

/**
 * The five consent buckets of a Wix Consent Policy, exactly as the frontend
 * `consentPolicy.setConsentPolicy` / backend `updateConsentPolicy` name them.
 * `essential` is always granted (Wix requires it) — mirrored by our `necessary`.
 * @see https://dev.wix.com/docs/sdk/frontend-modules/window/consent-policy/introduction
 */
export interface WixConsentPolicy {
  essential: boolean;
  functional: boolean;
  analytics: boolean;
  advertising: boolean;
  dataToThirdParty: boolean;
}

/**
 * The impure Wix wiring the App shell supplies — the Wix analogue of
 * {@link WebflowClient}. Each method maps to one app-authenticated REST call
 * against a single installed site (the client is constructed per site/instance,
 * so no id is threaded through here). The pure orchestration below never talks to
 * the network itself.
 */
export interface WixClient {
  /** GET our embedded-script value for the site, or `null` if not embedded. */
  getEmbeddedScript(): Promise<WixEmbeddedScript | null>;
  /** Embed (or re-embed) our component with the given value on the site. */
  embedScript(value: WixEmbeddedScript): Promise<void>;
  /** Remove our embedded script from the site. */
  deleteEmbeddedScript(): Promise<void>;
  /**
   * Set the site's DEFAULT Consent Policy (Site Properties REST
   * `updateConsentPolicy`). Optional: only the install-time opt-in default uses
   * it; when present, {@link installWixLoader} sets {@link WIX_REJECT_ALL_POLICY}.
   */
  updateDefaultConsentPolicy?(policy: WixConsentPolicy): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Consent policy — the opt-in default + the per-decision bridge              */
/* -------------------------------------------------------------------------- */

/**
 * The opt-in default policy the backend sets on install: everything denied
 * except `essential`. This is stronger than Shopify's default and is exactly
 * what the "Consent Apps" program expects — a fresh site starts fully gated
 * until the visitor decides.
 */
export const WIX_REJECT_ALL_POLICY: Readonly<WixConsentPolicy> = Object.freeze({
  essential: true,
  functional: false,
  analytics: false,
  advertising: false,
  dataToThirdParty: false,
});

/** The Consent Mode signals that mean "advertising" (Wix advertising/3rd-party). */
const AD_SIGNALS: readonly ConsentModeSignal[] = [
  "ad_storage",
  "ad_user_data",
  "ad_personalization",
];

/**
 * Map our category grants to Wix's five-bucket Consent Policy.
 *
 * Like {@link mapToShopifyConsent}, the bridge goes through the platform-neutral
 * Consent Mode signals every {@link ConsentCategory} already carries, so it needs
 * no Wix-specific taxonomy and stays correct for custom categories:
 *   - `essential`        → always `true` (Wix requires it; our `necessary`);
 *   - `functional`       ← `functionality_storage` or `personalization_storage`;
 *   - `analytics`        ← `analytics_storage`;
 *   - `advertising`      ← any ad signal (`ad_storage`/`ad_user_data`/`ad_personalization`);
 *   - `dataToThirdParty` ← the ad signals again — the "share with third parties"
 *     bucket mirrors our sale/sharing logic, exactly as Shopify's `sale_of_data`.
 *
 * Pure and side-effect-free. The runtime hook calls
 * `consentPolicy.setConsentPolicy(mapToWixConsent(config, ids))` on every
 * decision; this function is that hook's whole payload.
 *
 * @param config - The active configuration (source of each category's signals).
 * @param grantedCategoryIds - Ids of the categories the visitor granted.
 * @returns The Wix consent-policy object (all five buckets set).
 */
export function mapToWixConsent(
  config: CookieConsentConfig,
  grantedCategoryIds: readonly string[],
): WixConsentPolicy {
  const granted = new Set(grantedCategoryIds);

  const signals = new Set<ConsentModeSignal>();
  for (const category of config.categories) {
    if (!granted.has(category.id)) continue;
    for (const signal of category.signals) signals.add(signal);
  }

  const hasAd = AD_SIGNALS.some((signal) => signals.has(signal));

  return {
    essential: true,
    functional:
      signals.has("functionality_storage") || signals.has("personalization_storage"),
    analytics: signals.has("analytics_storage"),
    advertising: hasAd,
    dataToThirdParty: hasAd,
  };
}

/* -------------------------------------------------------------------------- */
/* Orchestration                                                              */
/* -------------------------------------------------------------------------- */

/** Options for {@link installWixLoader}. */
export interface InstallWixOptions {
  /**
   * Set the site's default Consent Policy to {@link WIX_REJECT_ALL_POLICY} on
   * install (proper opt-in). Requires {@link WixClient.updateDefaultConsentPolicy}.
   * Defaults to `true`.
   */
  setDefaultPolicy?: boolean;
}

/** Result of an install/remove — what actually changed on the site. */
export interface WixWriteResult {
  /** True if the embedded script was written (something changed). */
  changed: boolean;
  /** True if the default Consent Policy was set (install only). */
  defaultPolicySet: boolean;
}

/** True when two embedded-script values are equivalent (params + enabled state). */
function sameEmbedded(a: WixEmbeddedScript | null, b: WixEmbeddedScript): boolean {
  if (!a) return false;
  if (Boolean(a.disabled) !== Boolean(b.disabled)) return false;
  const ak = Object.keys(a.parameters);
  const bk = Object.keys(b.parameters);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => a.parameters[k] === b.parameters[k]);
}

/**
 * Install (or update) our consent loader on a Wix site: embed the bootstrap
 * component with the site's normalized id as its only parameter, and — on a
 * first install — set the site's default Consent Policy to reject-all-but-
 * essential (proper opt-in).
 *
 * Idempotent and churn-free: it re-embeds only when the parameter value or
 * enabled state actually differs, so it is safe to call on every config save
 * (the config itself lives in the per-site store, not the embedded script, so a
 * config edit never needs to touch Wix at all). The default policy is set only
 * when the script was NOT already present, so it never re-clamps a site whose
 * visitors have since decided.
 *
 * @param client - The per-site Wix client (see {@link WixClient}).
 * @param rawSiteId - The site/instance id (GUID); normalized internally.
 * @param options - See {@link InstallWixOptions}.
 */
export async function installWixLoader(
  client: WixClient,
  rawSiteId: string,
  options: InstallWixOptions = {},
): Promise<WixWriteResult> {
  const siteId = normalizeWixSiteId(rawSiteId);
  const desired: WixEmbeddedScript = {
    parameters: { [WIX_SITE_PARAM]: siteId },
    disabled: false,
  };

  const current = await client.getEmbeddedScript();
  const firstInstall = current === null;

  let changed = false;
  if (!sameEmbedded(current, desired)) {
    await client.embedScript(desired);
    changed = true;
  }

  // Opt-in default: only on a genuine first install, and only if the shell wired
  // the Site Properties call. Never re-clamp an already-installed site.
  let defaultPolicySet = false;
  const wantDefault = (options.setDefaultPolicy ?? true) && firstInstall;
  if (wantDefault && client.updateDefaultConsentPolicy) {
    await client.updateDefaultConsentPolicy({ ...WIX_REJECT_ALL_POLICY });
    defaultPolicySet = true;
  }

  return { changed, defaultPolicySet };
}

/**
 * Remove ONLY our embedded script from a Wix site. A no-op (no write) when it is
 * not present.
 *
 * Note: it does NOT reset the site's default Consent Policy — Wix does that
 * automatically on uninstall, but ONLY for apps whose id is registered with the
 * Wix "Consent Apps" team (a one-time human step before launch). See the Phase
 * 3.5 notes; do not attempt to reset the policy here or a partial uninstall could
 * leave the site stuck on reject-all.
 */
export async function removeWixLoader(client: WixClient): Promise<WixWriteResult> {
  const current = await client.getEmbeddedScript();
  if (current === null) return { changed: false, defaultPolicySet: false };
  await client.deleteEmbeddedScript();
  return { changed: true, defaultPolicySet: false };
}

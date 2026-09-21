/**
 * The WEBFLOW ADAPTER — Phase 3.2's front-end for the shared engine.
 *
 * Webflow is the first platform that does NOT fit the head-HTML-blob
 * {@link PlatformAdapter} seam (Framer, and any host that hands you a free-form
 * custom-code region). Webflow's v2 Data API has **no** editable head blob:
 * custom code is a two-step *registered → applied scripts* model —
 *   1. **register** each script on the site: an *inline* script (its JS
 *      `sourceCode`, ≤ 10 000 chars, no `<script>` tags — Webflow wraps it) or a
 *      *hosted* script (a URL + its SRI `integrityHash`); each registration is
 *      immutable and keyed by `displayName` + semver `version`;
 *   2. **apply** a list of `{ id, location, version }` to the site's `header`/
 *      `footer`; the apply call is a full upsert (send the COMPLETE list), and
 *      changes only go live after the site is **published**.
 *
 * So Webflow gets a sibling installer rather than a `PlatformAdapter` — but it is
 * still the SAME engine: the config and Consent Mode default scripts are the
 * byte-identical {@link configScriptBody} / {@link consentDefaultScriptBody} that
 * the Framer loader and the universal embed emit, and the runtime is the same
 * version-pinned jsDelivr bundle ({@link runtimeScriptUrl}). A Framer site and a
 * Webflow site therefore publish the exact same consent behaviour.
 *
 * Everything here is PURE (payload building + orchestration) and testable against
 * an in-memory {@link WebflowClient}. The impure surface — HTTP calls, computing
 * the runtime's SRI hash, OAuth, and publishing — lives entirely behind that
 * client interface, to be implemented by the Webflow App shell (which holds the
 * user's Webflow credentials, exactly as the Framer plugin host provides
 * `getCustomCode`/`setCustomCode`).
 */

import type { CookieConsentConfig } from "./config-schema.js";
import { configScriptBody, consentDefaultScriptBody } from "./loader.js";
import { RUNTIME_VERSION, runtimeScriptUrl } from "./runtime-cdn.js";

/* -------------------------------------------------------------------------- */
/* Naming — how we recognise OUR scripts among the user's                     */
/* -------------------------------------------------------------------------- */

/**
 * Prefix on every `displayName` we register. It is how {@link removeWebflowLoader}
 * and the upsert in {@link installWebflowLoader} tell OUR scripts apart from any
 * the user (or another app) registered, so we only ever touch our own.
 *
 * Webflow requires `displayName` to be 1–50 alphanumeric characters, so the
 * names below are camelCase with no separators.
 */
export const WEBFLOW_DISPLAY_PREFIX = "consentful";
/** Registered name of the hosted runtime bundle script. */
export const WEBFLOW_RUNTIME_NAME = "consentfulRuntime";
/** Registered name of the inline `window.__CC_CONFIG__` script. */
export const WEBFLOW_CONFIG_NAME = "consentfulConfig";
/** Registered name of the inline Consent Mode default bootstrap. */
export const WEBFLOW_CONSENT_DEFAULT_NAME = "consentfulConsentDefault";

/** Webflow's hard cap on an inline script's `sourceCode` length. */
export const WEBFLOW_INLINE_MAX_CHARS = 10_000;

/** True for a `displayName` that belongs to us. */
export function isConsentfulScript(displayName: string | undefined): boolean {
  return (displayName ?? "").startsWith(WEBFLOW_DISPLAY_PREFIX);
}

/* -------------------------------------------------------------------------- */
/* Types — a faithful (minimal) subset of the Webflow v2 custom-code API      */
/* -------------------------------------------------------------------------- */

/** Where an applied script is injected. */
export type WebflowScriptLocation = "header" | "footer";

/** A script as returned by Webflow's "get registered scripts" endpoint (subset). */
export interface WebflowRegisteredScript {
  /** Webflow's stable id for the registration (used when applying). */
  id: string;
  /** The user-facing name we registered it under. */
  displayName?: string;
  /** Semver version string of this immutable registration. */
  version: string;
}

/** An entry in a site's applied custom-code list — exactly Webflow's shape. */
export interface WebflowAppliedScript {
  id: string;
  location: WebflowScriptLocation;
  version: string;
}

/** Body for registering an inline script (`POST …/registered_scripts/inline`). */
export interface WebflowInlineRegistration {
  /** Inline JS, no `<script>` tags, ≤ {@link WEBFLOW_INLINE_MAX_CHARS}. */
  sourceCode: string;
  displayName: string;
  version: string;
  canCopy: boolean;
}

/** Body for registering a hosted script (`POST …/registered_scripts/hosted`). */
export interface WebflowHostedRegistration {
  /** Absolute URL the script is served from. */
  hostedLocation: string;
  /** Subresource-integrity hash (e.g. `sha384-…`). */
  integrityHash: string;
  displayName: string;
  version: string;
  canCopy: boolean;
}

/**
 * The impure Webflow wiring the App shell supplies — the Webflow analogue of the
 * Framer plugin's `getCustomCode`/`setCustomCode`. Every method maps to one
 * Webflow v2 Data API call (or, for {@link runtimeIntegrityHash}, an SRI fetch).
 * The pure orchestration below never talks to the network itself.
 */
export interface WebflowClient {
  /** GET the site's currently applied custom-code list. */
  getAppliedScripts(): Promise<WebflowAppliedScript[]>;
  /** PUT the COMPLETE applied-scripts list (a full upsert). */
  applyScripts(scripts: WebflowAppliedScript[]): Promise<void>;
  /** GET every script registered on the site (to reuse existing versions). */
  listRegisteredScripts(): Promise<WebflowRegisteredScript[]>;
  /** POST a new inline registration; resolves to the created registration. */
  registerInlineScript(input: WebflowInlineRegistration): Promise<WebflowRegisteredScript>;
  /** POST a new hosted registration; resolves to the created registration. */
  registerHostedScript(input: WebflowHostedRegistration): Promise<WebflowRegisteredScript>;
  /**
   * Resolve the Subresource-Integrity hash for the hosted runtime `url`
   * (e.g. from jsDelivr's SRI endpoint, or by fetching + hashing). Impure, so it
   * lives here rather than in the pure payload builder.
   */
  runtimeIntegrityHash(url: string): Promise<string>;
  /**
   * Publish the site so applied-code changes take effect. Optional: some flows
   * publish separately. When present, the installers call it after a change.
   */
  publish?(): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Content-addressed versions (Webflow registrations are immutable)           */
/* -------------------------------------------------------------------------- */

/**
 * FNV-1a 32-bit hash → unsigned integer. Small, dependency-free, deterministic.
 * Not cryptographic — only used to derive a stable version number from content.
 */
export function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts, kept in unsigned range.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * Derive an immutable semver `version` from an inline script's content.
 *
 * Webflow forbids overwriting a registered `displayName`+`version`, but our
 * config script changes on every edit. Encoding a content hash into the patch
 * number (`0.0.<fnv1a32>`) gives each distinct body its own immutable version
 * deterministically — no server-side counter, no state to store. Identical
 * content re-derives the identical version, so re-registration is a safe no-op.
 */
export function contentVersion(sourceCode: string): string {
  return `0.0.${fnv1a32(sourceCode)}`;
}

/** RUNTIME_VERSION (`v0.1.6`) as a bare semver (`0.1.6`) for Webflow's `version`. */
export function runtimeRegistrationVersion(): string {
  return RUNTIME_VERSION.replace(/^v/, "");
}

/* -------------------------------------------------------------------------- */
/* Pure payload building                                                      */
/* -------------------------------------------------------------------------- */

/** Options shared by the Webflow builder + installers. */
export interface WebflowLoaderOptions {
  /** Override the runtime `<script src>` URL (local testing / self-hosting). */
  runtimeUrl?: string;
}

/** The registrations a site needs for the loader, in apply order. */
export interface WebflowRegistrations {
  /** Inline scripts (Consent Mode default first when enabled, then config). */
  inline: WebflowInlineRegistration[];
  /** The hosted runtime bundle. */
  runtime: WebflowHostedRegistration;
}

/**
 * Build every registration the loader needs for `config`, given the runtime's
 * already-resolved SRI `integrityHash` (impure to compute, so passed in).
 *
 * The inline scripts reuse the SAME bodies as the Framer loader and the embed
 * ({@link configScriptBody} / {@link consentDefaultScriptBody}) — one engine.
 * Each inline registration carries a content-addressed {@link contentVersion} so
 * edits produce fresh immutable versions; the runtime is version-pinned to
 * {@link runtimeRegistrationVersion}.
 *
 * @throws RangeError if the config body exceeds {@link WEBFLOW_INLINE_MAX_CHARS}.
 */
export function buildWebflowRegistrations(
  config: CookieConsentConfig,
  integrityHash: string,
  options: WebflowLoaderOptions = {},
): WebflowRegistrations {
  const runtimeUrl = options.runtimeUrl ?? runtimeScriptUrl();

  const inline: WebflowInlineRegistration[] = [];

  if (config.consentMode.enableConsentMode) {
    const body = consentDefaultScriptBody(config.consentMode.waitForUpdateMs);
    inline.push({
      sourceCode: body,
      displayName: WEBFLOW_CONSENT_DEFAULT_NAME,
      version: contentVersion(body),
      canCopy: false,
    });
  }

  const configBody = configScriptBody(config);
  if (configBody.length > WEBFLOW_INLINE_MAX_CHARS) {
    throw new RangeError(
      `Config inline script is ${configBody.length} chars, over Webflow's ` +
        `${WEBFLOW_INLINE_MAX_CHARS}-char inline limit. Trim the config ` +
        `(e.g. fewer custom strings) or host it externally.`,
    );
  }
  inline.push({
    sourceCode: configBody,
    displayName: WEBFLOW_CONFIG_NAME,
    version: contentVersion(configBody),
    canCopy: false,
  });

  const runtime: WebflowHostedRegistration = {
    hostedLocation: runtimeUrl,
    integrityHash,
    displayName: WEBFLOW_RUNTIME_NAME,
    version: runtimeRegistrationVersion(),
    canCopy: false,
  };

  return { inline, runtime };
}

/** True when two applied-scripts lists are identical (order-sensitive). */
function sameApplied(a: WebflowAppliedScript[], b: WebflowAppliedScript[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.id !== y.id || x.location !== y.location || x.version !== y.version) return false;
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/* Orchestration                                                              */
/* -------------------------------------------------------------------------- */

/** Result of an install/remove — whether anything changed on the site. */
export interface WebflowWriteResult {
  /** True if the applied-scripts list was written (something changed). */
  changed: boolean;
  /** True if the site was published (only when it changed and `publish` exists). */
  published: boolean;
}

/**
 * Ensure a registration exists on the site, reusing an identical one when the
 * immutable `displayName`+`version` is already present. Returns its id+version.
 */
async function ensureRegistered(
  client: WebflowClient,
  existing: WebflowRegisteredScript[],
  kind: "inline" | "hosted",
  reg: WebflowInlineRegistration | WebflowHostedRegistration,
): Promise<WebflowAppliedScript> {
  const found = existing.find(
    r => r.displayName === reg.displayName && r.version === reg.version,
  );
  const registered =
    found ??
    (kind === "inline"
      ? await client.registerInlineScript(reg as WebflowInlineRegistration)
      : await client.registerHostedScript(reg as WebflowHostedRegistration));
  return { id: registered.id, location: "header", version: registered.version };
}

/**
 * Install (or update) the consent loader on a Webflow site: register the config,
 * Consent Mode default and runtime scripts as needed, then apply the complete
 * list to the site `header` — OUR scripts first (in run order: Consent Mode
 * default → config → runtime), preserving every other script already applied.
 *
 * Idempotent and churn-free: it re-derives content-addressed versions, reuses
 * existing registrations, and skips the apply (and publish) entirely when the
 * resulting list is unchanged — safe to call on every debounced config edit.
 *
 * @param publishOnChange - Publish the site after a change (default `true`).
 */
export async function installWebflowLoader(
  client: WebflowClient,
  config: CookieConsentConfig,
  options: WebflowLoaderOptions & { publishOnChange?: boolean } = {},
): Promise<WebflowWriteResult> {
  const runtimeUrl = options.runtimeUrl ?? runtimeScriptUrl();
  const integrityHash = await client.runtimeIntegrityHash(runtimeUrl);
  const { inline, runtime } = buildWebflowRegistrations(config, integrityHash, options);

  const registered = await client.listRegisteredScripts();

  // Register (or reuse) each script; keep OUR run order: inline scripts (Consent
  // Mode default, then config) before the deferred runtime.
  const ours: WebflowAppliedScript[] = [];
  for (const reg of inline) ours.push(await ensureRegistered(client, registered, "inline", reg));
  ours.push(await ensureRegistered(client, registered, "hosted", runtime));

  // Any script whose registration we couldn't classify stays untouched; a script
  // we know is ours (by displayName) is dropped from `others` so a stale version
  // is replaced rather than duplicated.
  const nameById = new Map(registered.map(r => [r.id, r.displayName] as const));
  const current = await client.getAppliedScripts();
  const others = current.filter(s => !isConsentfulScript(nameById.get(s.id)));

  const next = [...others, ...ours];
  if (sameApplied(current, next)) return { changed: false, published: false };

  await client.applyScripts(next);
  const published = Boolean((options.publishOnChange ?? true) && client.publish);
  if (published) await client.publish!();
  return { changed: true, published };
}

/**
 * Remove ONLY our loader scripts from a Webflow site, leaving every other applied
 * script in place. A no-op (no write, no publish) when none of ours are applied.
 *
 * @param publishOnChange - Publish the site after a change (default `true`).
 */
export async function removeWebflowLoader(
  client: WebflowClient,
  options: { publishOnChange?: boolean } = {},
): Promise<WebflowWriteResult> {
  const registered = await client.listRegisteredScripts();
  const oursIds = new Set(
    registered.filter(r => isConsentfulScript(r.displayName)).map(r => r.id),
  );

  const current = await client.getAppliedScripts();
  const next = current.filter(s => !oursIds.has(s.id));
  if (next.length === current.length) return { changed: false, published: false };

  await client.applyScripts(next);
  const published = Boolean((options.publishOnChange ?? true) && client.publish);
  if (published) await client.publish!();
  return { changed: true, published };
}

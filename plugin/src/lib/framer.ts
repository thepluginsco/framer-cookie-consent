/**
 * Thin, typed wrapper around the Framer plugin API (`@framer/plugin`).
 *
 * Every call the rest of the plugin makes into Framer goes through here, so
 * there is exactly one place that:
 *   - knows the concrete API surface we depend on,
 *   - checks Framer's runtime permission model (`framer.isAllowedTo`) BEFORE
 *     every call — reads included — and turns a denial into a
 *     {@link FramerPermissionError} with a message the UI can show as-is, and
 *   - turns any other API failure into a {@link FramerApiError} with a clear,
 *     user-facing message (never a raw rejection).
 *
 * Framer's permission model is entirely runtime — there is no permissions
 * field in framer.json. "Plugins can do only what the user can": the writes we
 * use (`setCustomCode`, `setPluginData`) are PROTECTED methods and are checked
 * with `framer.isAllowedTo` before every call ({@link guarded}). The reads
 * (`getProjectInfo`, `getPublishInfo`, `getCustomCode`, `getPluginData`,
 * `subscribeToCustomCode`, `showUI`) are UNPROTECTED in the SDK — they are not
 * part of its `ProtectedMethod` type, so there is no permission to check — and
 * go through {@link safeRead}, which turns any failure into a clear message.
 * @see https://www.framer.com/developers/plugins-permissions
 */

import { framer } from "@framer/plugin"
import type { CustomCode, CustomCodeLocation, ProjectInfo, PublishInfo, ProtectedMethod } from "@framer/plugin"

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/** User-facing explanations for each permission the plugin may be denied. */
const DENIED_MESSAGES: Partial<Record<string, string>> = {
  setCustomCode:
    "You don't have permission to edit this site's custom code. Ask a project owner for edit access (Site Settings → Custom Code).",
  setPluginData:
    "You don't have permission to save plugin settings in this project. Ask a project owner for edit access.",
}

/**
 * Thrown when the current user lacks the Framer permission a protected call needs. Its
 * `message` is written for the person using the plugin and is shown as-is.
 */
export class FramerPermissionError extends Error {
  /** The `framer.isAllowedTo` method that was denied. */
  readonly method: string

  constructor(method: string) {
    super(DENIED_MESSAGES[method] ?? `You don't have permission to do this in Framer (${method}).`)
    this.name = "FramerPermissionError"
    this.method = method
  }
}

/** Thrown when a Framer API call fails for any reason other than a denied permission. */
export class FramerApiError extends Error {
  /** The Framer API method that failed. */
  readonly method: string

  constructor(method: string, cause: unknown) {
    super(`Framer couldn't complete "${method}". Close and reopen Consentful, then try again.`)
    this.name = "FramerApiError"
    this.method = method
    ;(this as { cause?: unknown }).cause = cause
  }
}

/* -------------------------------------------------------------------------- */
/* Permission checks                                                          */
/* -------------------------------------------------------------------------- */

/**
 * True when the current user may call every one of `methods`. Never throws: an
 * unavailable permission API (e.g. outside Framer) counts as not allowed.
 */
export function isAllowed(...methods: [ProtectedMethod, ...ProtectedMethod[]]): boolean {
  try {
    return framer.isAllowedTo(...methods)
  } catch {
    return false
  }
}

/**
 * Run a Framer API call only after its permission check passes. A denial
 * throws {@link FramerPermissionError}; any other failure {@link FramerApiError}.
 */
async function guarded<T>(method: ProtectedMethod, call: () => Promise<T>): Promise<T> {
  if (!isAllowed(method)) throw new FramerPermissionError(method)
  try {
    return await call()
  } catch (err) {
    if (err instanceof FramerPermissionError) throw err
    throw new FramerApiError(method, err)
  }
}

/** User-facing explanations for each read that can fail. */
const READ_FAILED: Partial<Record<string, string>> = {
  getCustomCode: "Consentful couldn't read this site's custom code. Close and reopen the plugin, then try again.",
  getPluginData: "Consentful couldn't read its saved settings. Close and reopen the plugin, then try again.",
  getProjectInfo: "Consentful couldn't read this project's details.",
  getPublishInfo: "Consentful couldn't read this site's publish status.",
}

/**
 * Run an UNPROTECTED Framer read (no permission exists to check). Any failure
 * becomes a {@link FramerApiError} carrying a user-facing message.
 */
async function safeRead<T>(method: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (err) {
    const e = new FramerApiError(method, err)
    const msg = READ_FAILED[method]
    if (msg) e.message = msg
    throw e
  }
}

/* -------------------------------------------------------------------------- */
/* Plugin window                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Open the plugin window (unprotected). Returns `false` (never throws) when it
 * fails or Framer isn't available, e.g. in a plain browser during local checks.
 */
export async function showPluginUI(options: Parameters<typeof framer.showUI>[0]): Promise<boolean> {
  try {
    await framer.showUI(options)
    return true
  } catch {
    return false
  }
}

/* -------------------------------------------------------------------------- */
/* Project info                                                               */
/* -------------------------------------------------------------------------- */

/** Get the current project's info (name + id). Unprotected. */
export function getProjectInfo(): Promise<ProjectInfo> {
  return safeRead("getProjectInfo", () => framer.getProjectInfo())
}

/**
 * Get the current publish info for staging + production. Each side is `null`
 * until the site has been published there, so callers must guard before using
 * a `url`. Unprotected.
 */
export function getPublishInfo(): Promise<PublishInfo> {
  return safeRead("getPublishInfo", () => framer.getPublishInfo())
}

/**
 * The best live URL to link a visitor to: production if the site is published,
 * otherwise the staging URL, otherwise `null` (never published, or the publish
 * status can't be read). Never throws.
 */
export async function getLiveSiteUrl(): Promise<string | null> {
  try {
    const info = await getPublishInfo()
    return info.production?.url ?? info.staging?.url ?? null
  } catch {
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* Custom code                                                                */
/* -------------------------------------------------------------------------- */

/** Options for {@link setCustomCode}. Mirrors Framer's internal shape. */
export interface SetCustomCodeOptions {
  /** Valid HTML to inject, or `null` to clear the previously injected code. */
  html: string | null
  /** Where in the document the code is injected. */
  location: CustomCodeLocation
}

/** Read the custom code the plugin has set, including per-location disabled state. Unprotected. */
export function getCustomCode(): Promise<CustomCode> {
  return safeRead("getCustomCode", () => framer.getCustomCode())
}

/**
 * Install (or clear, with `html: null`) the plugin's custom code snippet.
 *
 * A plugin may set custom HTML only once per location; calling again replaces
 * it. Throws {@link FramerPermissionError} if the user cannot edit site
 * settings — check {@link canSetCustomCode} first to disable the UI.
 */
export function setCustomCode(options: SetCustomCodeOptions): Promise<void> {
  return guarded("setCustomCode", () => framer.setCustomCode({ html: options.html, location: options.location }))
}

/** True when the current user is allowed to set custom code. */
export function canSetCustomCode(): boolean {
  return isAllowed("setCustomCode")
}

/**
 * Subscribe to custom-code changes (set/cleared/enabled/disabled). Returns an
 * unsubscribe function; a no-op one when the subscription is unavailable.
 */
export function subscribeToCustomCode(callback: (customCode: CustomCode) => void): () => void {
  try {
    return framer.subscribeToCustomCode(callback)
  } catch {
    return () => {}
  }
}

/**
 * Detect whether the loader at `location` has been disabled by the user via
 * Framer's per-site "Custom Code" setting.
 *
 * IMPORTANT: a plugin CANNOT re-enable custom code programmatically — only the
 * user can, in Framer's settings. When this returns `true` the caller should
 * surface a warning telling the user the banner will not load until they
 * re-enable custom code.
 */
export function isCustomCodeDisabled(code: CustomCode, location: CustomCodeLocation): boolean {
  return code[location].disabled
}

/* -------------------------------------------------------------------------- */
/* Plugin data (persisted key/value store, scoped to this plugin + project)   */
/* -------------------------------------------------------------------------- */

/** Read a persisted plugin-data value by key (`null` if unset). Unprotected. */
export function getPluginData(key: string): Promise<string | null> {
  return safeRead("getPluginData", () => framer.getPluginData(key))
}

/**
 * Persist a plugin-data value (pass `null` to delete the key).
 *
 * Throws {@link FramerPermissionError} if the user cannot edit site settings.
 */
export function setPluginData(key: string, value: string | null): Promise<void> {
  return guarded("setPluginData", () => framer.setPluginData(key, value))
}

/** True when the current user is allowed to write plugin data. */
export function canSetPluginData(): boolean {
  return isAllowed("setPluginData")
}

/* -------------------------------------------------------------------------- */
/* Write access (the one gate every save goes through)                        */
/* -------------------------------------------------------------------------- */

/**
 * True when the current user may do everything a save needs: store the config
 * (`setPluginData`) and write the loader into the site's custom code
 * (`setCustomCode`). Check this BEFORE starting a save — never attempt the
 * write and catch the denial.
 */
export function canWriteSite(): boolean {
  return isAllowed("setCustomCode", "setPluginData")
}

/**
 * Subscribe to changes in {@link canWriteSite} (a project owner can grant or
 * revoke the permission while the plugin is open). Returns an unsubscribe.
 */
export function subscribeToWriteAccess(callback: (allowed: boolean) => void): () => void {
  try {
    return framer.subscribeToIsAllowedTo("setCustomCode", "setPluginData", callback)
  } catch {
    return () => {}
  }
}

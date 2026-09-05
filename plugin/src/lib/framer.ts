/**
 * Thin, typed wrapper around the Framer plugin API (`@framer/plugin`).
 *
 * Every call the rest of the plugin makes into Framer goes through here, so
 * there is exactly one place that:
 *   - knows the concrete API surface we depend on,
 *   - enforces Framer's runtime permission model (`framer.isAllowedTo`), and
 *   - detects the "custom code disabled by the user" state and surfaces it.
 *
 * Framer's permission model is entirely runtime — there is no permissions
 * field in framer.json. "Plugins can do only what the user can", so writes
 * (`setCustomCode`, `setPluginData`) require the user to have Site Settings
 * permission; reads (`getProjectInfo`, `getCustomCode`, `getPluginData`,
 * `subscribeToCustomCode`) are always allowed.
 * @see https://www.framer.com/developers/plugins-permissions
 */

import { framer } from "@framer/plugin"
import type { CustomCode, CustomCodeLocation, ProjectInfo, PublishInfo } from "@framer/plugin"

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Thrown by a write helper when the current user lacks the Framer permission
 * required to perform it. Callers should catch this and show a friendly
 * message (e.g. "Ask a project admin to publish the banner").
 */
export class FramerPermissionError extends Error {
  /** The `framer.isAllowedTo` method that was denied. */
  readonly method: string

  constructor(method: string) {
    super(
      `Framer denied "${method}": the current user lacks the required ` +
        `permission. Plugins can only do what the user can.`,
    )
    this.name = "FramerPermissionError"
    this.method = method
  }
}

/* -------------------------------------------------------------------------- */
/* Project info                                                               */
/* -------------------------------------------------------------------------- */

/** Get the current project's info (name + id). Always allowed. */
export function getProjectInfo(): Promise<ProjectInfo> {
  return framer.getProjectInfo()
}

/**
 * Get the current publish info for staging + production. Always allowed. Each
 * side is `null` until the site has been published there, so callers must guard
 * before using a `url`.
 */
export function getPublishInfo(): Promise<PublishInfo> {
  return framer.getPublishInfo()
}

/**
 * The best live URL to link a visitor to: production if the site is published,
 * otherwise the staging URL, otherwise `null` (never published).
 */
export async function getLiveSiteUrl(): Promise<string | null> {
  try {
    const info = await framer.getPublishInfo()
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

/** Read the custom code the plugin has set, including per-location disabled state. Always allowed. */
export function getCustomCode(): Promise<CustomCode> {
  return framer.getCustomCode()
}

/**
 * Install (or clear, with `html: null`) the plugin's custom code snippet.
 *
 * A plugin may set custom HTML only once per location; calling again replaces
 * it. Throws {@link FramerPermissionError} if the user cannot edit site
 * settings — check {@link canSetCustomCode} first to disable the UI.
 */
export async function setCustomCode(options: SetCustomCodeOptions): Promise<void> {
  if (!framer.isAllowedTo("setCustomCode")) {
    throw new FramerPermissionError("setCustomCode")
  }
  await framer.setCustomCode({ html: options.html, location: options.location })
}

/** True when the current user is allowed to set custom code. */
export function canSetCustomCode(): boolean {
  return framer.isAllowedTo("setCustomCode")
}

/**
 * Subscribe to custom-code changes (set/cleared/enabled/disabled). Always
 * allowed. Returns an unsubscribe function; call it on cleanup.
 */
export function subscribeToCustomCode(
  callback: (customCode: CustomCode) => void,
): () => void {
  return framer.subscribeToCustomCode(callback)
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
export function isCustomCodeDisabled(
  code: CustomCode,
  location: CustomCodeLocation,
): boolean {
  return code[location].disabled
}

/**
 * Convenience: fetch the current custom code and report whether the loader at
 * `location` is disabled. See {@link isCustomCodeDisabled} for the caveat that
 * we cannot re-enable it for the user.
 */
export async function getCustomCodeDisabled(
  location: CustomCodeLocation,
): Promise<boolean> {
  const code = await framer.getCustomCode()
  return isCustomCodeDisabled(code, location)
}

/* -------------------------------------------------------------------------- */
/* Plugin data (persisted key/value store, scoped to this plugin + project)   */
/* -------------------------------------------------------------------------- */

/** Read a persisted plugin-data value by key (`null` if unset). Always allowed. */
export function getPluginData(key: string): Promise<string | null> {
  return framer.getPluginData(key)
}

/**
 * Persist a plugin-data value (pass `null` to delete the key).
 *
 * Throws {@link FramerPermissionError} if the user cannot edit site settings.
 */
export async function setPluginData(
  key: string,
  value: string | null,
): Promise<void> {
  if (!framer.isAllowedTo("setPluginData")) {
    throw new FramerPermissionError("setPluginData")
  }
  await framer.setPluginData(key, value)
}

/** True when the current user is allowed to write plugin data. */
export function canSetPluginData(): boolean {
  return framer.isAllowedTo("setPluginData")
}

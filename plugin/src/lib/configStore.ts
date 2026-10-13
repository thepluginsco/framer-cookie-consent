/**
 * Config storage on top of Framer plugin data.
 *
 * Framer caps plugin data at 2KB per value AND 4KB in total per project, and
 * `setPluginData` throws once a project is over it. So we keep as little as
 * possible there:
 *
 *   consentfulConfig.count / .0 / .1 …  the editor's config, gzip-compressed
 *                                       and base64'd ("gz:…"), split into
 *                                       ≤1.8KB chunks (a default config is
 *                                       ~3KB raw, ~1KB stored)
 *   consentfulInstalled                 a short fingerprint of the config last
 *                                       INSTALLED into custom code (drives the
 *                                       "Unpublished changes" status)
 *
 * Earlier versions stored the config uncompressed (`cookieConsentConfig.*`) and
 * a full second copy of the installed config (`consentfulInstalledConfig.*`),
 * which pushed projects over the 4KB total. {@link migrateLegacyData} removes
 * those keys (deleting is always allowed, even over the limit).
 */

import { publishFingerprint } from "@framer-cookie-consent/shared-ui"
import { parse } from "@framer-cookie-consent/shared"

import { getPluginData, setPluginData } from "./framer"

/** Namespace for the editor's saved config (compressed). */
const PREFIX = "consentfulConfig"
/** Key holding the fingerprint of the installed config. */
const INSTALLED_KEY = "consentfulInstalled"
/** Legacy namespaces (uncompressed config; full installed copy). */
const LEGACY_PREFIX = "cookieConsentConfig"
const LEGACY_INSTALLED_PREFIX = "consentfulInstalledConfig"

/** Marks a stored value as gzip + base64. */
const GZ = "gz:"

/**
 * Max bytes per chunk. Kept comfortably below Framer's 2KB (2048-byte) value
 * limit so there is headroom regardless of how the limit is measured.
 */
const MAX_CHUNK_BYTES = 1800

const encoder = new TextEncoder()

/**
 * Split a string into chunks each ≤ {@link MAX_CHUNK_BYTES} UTF-8 bytes,
 * iterating by code point so multi-byte characters are never split.
 */
function splitByByteBudget(value: string): string[] {
  const chunks: string[] = []
  let current = ""
  let currentBytes = 0

  for (const char of value) {
    const charBytes = encoder.encode(char).length
    if (current !== "" && currentBytes + charBytes > MAX_CHUNK_BYTES) {
      chunks.push(current)
      current = ""
      currentBytes = 0
    }
    current += char
    currentBytes += charBytes
  }
  if (current !== "") chunks.push(current)

  return chunks
}

/** gzip + base64 a string (falls back to the raw string without CompressionStream). */
async function compress(value: string): Promise<string> {
  if (typeof CompressionStream === "undefined") return value
  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream("gzip"))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  let bin = ""
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return GZ + btoa(bin)
}

/** Reverse of {@link compress}; plain (legacy) strings pass through. */
async function decompress(value: string): Promise<string> {
  if (!value.startsWith(GZ)) return value
  const bin = atob(value.slice(GZ.length))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))
  return await new Response(stream).text()
}

/** Read the stored chunk count (0 when nothing is stored or it is unreadable). */
async function readCount(prefix: string): Promise<number> {
  const raw = await getPluginData(`${prefix}.count`)
  if (raw === null) return 0
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

/** Load a chunked string, or `null` when nothing (or only part of it) is stored. */
async function loadChunked(prefix: string): Promise<string | null> {
  const count = await readCount(prefix)
  if (count <= 0) return null

  let value = ""
  for (let i = 0; i < count; i++) {
    const chunk = await getPluginData(`${prefix}.${i}`)
    // A missing chunk means the stored value is incomplete — treat the whole
    // thing as unsaved rather than returning a truncated (invalid) string.
    if (chunk === null) return null
    value += chunk
  }
  return value
}

/**
 * Persist a string split across as many keys as needed (`null` clears it).
 * Stale chunks from a previously longer value are cleared first (freeing
 * space), then the chunks, then the count, so a reader never sees a count
 * pointing at an unwritten chunk.
 */
async function saveChunked(prefix: string, value: string | null): Promise<void> {
  const chunks = value === null ? [] : splitByByteBudget(value)
  const previousCount = await readCount(prefix)

  for (let i = chunks.length; i < previousCount; i++) {
    await setPluginData(`${prefix}.${i}`, null)
  }
  for (let i = 0; i < chunks.length; i++) {
    await setPluginData(`${prefix}.${i}`, chunks[i] ?? "")
  }

  await setPluginData(`${prefix}.count`, value === null ? null : String(chunks.length))
}

/** Delete every key of a legacy chunked value (always allowed, even over the limit). */
async function clearChunked(prefix: string): Promise<boolean> {
  const count = await readCount(prefix)
  const hasCount = (await getPluginData(`${prefix}.count`)) !== null
  if (!hasCount) return false
  for (let i = 0; i < Math.max(count, 1); i++) await setPluginData(`${prefix}.${i}`, null)
  await setPluginData(`${prefix}.count`, null)
  return true
}

/**
 * Load the serialized config string, or `null` when nothing is stored (or the
 * stored data is incomplete/corrupt, in which case the caller falls back to
 * defaults). Reads the current format first, then the legacy one.
 */
export async function loadConfigString(): Promise<string | null> {
  const stored = await loadChunked(PREFIX)
  if (stored !== null) {
    try {
      return await decompress(stored)
    } catch {
      return null
    }
  }
  return loadChunked(LEGACY_PREFIX)
}

/** Persist the editor's serialized config string (compressed). */
export async function saveConfigString(value: string): Promise<void> {
  await saveChunked(PREFIX, await compress(value))
}

/** Fingerprint of the config last installed into custom code, or `null` if none is recorded. */
export function loadInstalledFingerprint(): Promise<string | null> {
  return getPluginData(INSTALLED_KEY)
}

/** Record (or with `null`, forget) the fingerprint of the installed config. */
export function saveInstalledFingerprint(value: string | null): Promise<void> {
  return setPluginData(INSTALLED_KEY, value)
}

/** The legacy full copy of the installed config, if an older version stored one. */
export function loadLegacyInstalledConfigString(): Promise<string | null> {
  return loadChunked(LEGACY_INSTALLED_PREFIX)
}

/**
 * Move a project off the legacy layout: delete the full installed copy and the
 * uncompressed config (after saving it compressed). Returns true when anything
 * was cleaned up. Needs the plugin-data permission; callers check it first.
 */
export async function migrateLegacyData(legacyConfig: string | null): Promise<boolean> {
  // Keep the "installed" status: record the legacy copy's fingerprint first.
  const legacyInstalled = await loadChunked(LEGACY_INSTALLED_PREFIX)
  if (legacyInstalled !== null && (await getPluginData(INSTALLED_KEY)) === null) {
    await clearChunked(LEGACY_INSTALLED_PREFIX)
    await saveInstalledFingerprint(publishFingerprint(parse(legacyInstalled)))
  }
  let changed = await clearChunked(LEGACY_INSTALLED_PREFIX)
  changed = changed || legacyInstalled !== null
  if ((await getPluginData(`${LEGACY_PREFIX}.count`)) !== null) {
    if (legacyConfig !== null && (await loadChunked(PREFIX)) === null) {
      // Free the space first, then write the compressed copy.
      await clearChunked(LEGACY_PREFIX)
      await saveConfigString(legacyConfig)
    } else {
      await clearChunked(LEGACY_PREFIX)
    }
    changed = true
  }
  return changed
}

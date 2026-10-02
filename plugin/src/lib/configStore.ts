/**
 * Chunked config storage on top of Framer plugin data.
 *
 * Framer caps each plugin-data *value* at 2KB, but a serialized config is
 * larger than that (the defaults alone are ~2.5KB, and custom scripts/copy push
 * it higher). So we split the serialized string into byte-bounded chunks stored
 * under separate keys, plus a small "count" key, and reassemble on load. This
 * keeps `serialize`/`parse` as the single source of truth while staying under
 * the per-value limit for configs of any size.
 *
 * Layout (per project):
 *   cookieConsentConfig.count -> "<n>"          number of chunks
 *   cookieConsentConfig.0     -> "<chunk 0>"    first ~1.8KB of the string
 *   cookieConsentConfig.1     -> "<chunk 1>"    ...
 */

import { getPluginData, setPluginData } from "./framer"

/** Namespace for the editor's saved config. */
const PREFIX = "cookieConsentConfig"
/**
 * Namespace for the config that was last INSTALLED into the site's custom code
 * (written only when the user clicks Install / Update). Comparing it with the
 * editor's config is what drives the "Not installed" / "Unpublished changes"
 * status.
 */
const INSTALLED_PREFIX = "consentfulInstalledConfig"

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
 *
 * Writes the chunks first and the `count` last, so a reader never sees a count
 * that points at a chunk which hasn't been written yet. Stale chunks left over
 * from a previously larger value are cleared. Requires the `setPluginData`
 * permission (each write is guarded in `lib/framer`).
 */
async function saveChunked(prefix: string, value: string | null): Promise<void> {
  const chunks = value === null ? [] : splitByByteBudget(value)
  const previousCount = await readCount(prefix)

  for (let i = 0; i < chunks.length; i++) {
    await setPluginData(`${prefix}.${i}`, chunks[i] ?? "")
  }
  // Remove chunks from a previous, longer save so stale tail data can't leak in.
  for (let i = chunks.length; i < previousCount; i++) {
    await setPluginData(`${prefix}.${i}`, null)
  }

  await setPluginData(`${prefix}.count`, value === null ? null : String(chunks.length))
}

/**
 * Load the serialized config string, or `null` when nothing is stored (or the
 * stored data is incomplete/corrupt, in which case the caller falls back to
 * defaults). Reads are always allowed by Framer.
 */
export function loadConfigString(): Promise<string | null> {
  return loadChunked(PREFIX)
}

/** Persist the editor's serialized config string. */
export function saveConfigString(value: string): Promise<void> {
  return saveChunked(PREFIX, value)
}

/** The config last installed into the site's custom code, or `null` if none is recorded. */
export function loadInstalledConfigString(): Promise<string | null> {
  return loadChunked(INSTALLED_PREFIX)
}

/** Record (or with `null`, forget) the config installed into the site's custom code. */
export function saveInstalledConfigString(value: string | null): Promise<void> {
  return saveChunked(INSTALLED_PREFIX, value)
}

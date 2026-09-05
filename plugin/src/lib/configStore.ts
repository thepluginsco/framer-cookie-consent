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

/** Namespace for all config keys. */
const PREFIX = "cookieConsentConfig"
/** Key holding the chunk count. */
const COUNT_KEY = `${PREFIX}.count`

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
async function readCount(): Promise<number> {
  const raw = await getPluginData(COUNT_KEY)
  if (raw === null) return 0
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

/**
 * Load the serialized config string, or `null` when nothing is stored (or the
 * stored data is incomplete/corrupt, in which case the caller falls back to
 * defaults). Reads are always allowed by Framer.
 */
export async function loadConfigString(): Promise<string | null> {
  const count = await readCount()
  if (count <= 0) return null

  let value = ""
  for (let i = 0; i < count; i++) {
    const chunk = await getPluginData(`${PREFIX}.${i}`)
    // A missing chunk means the stored value is incomplete — treat the whole
    // thing as unsaved rather than returning a truncated (invalid) string.
    if (chunk === null) return null
    value += chunk
  }
  return value
}

/**
 * Persist the serialized config string, split across as many keys as needed.
 *
 * Writes the chunks first and the `count` last, so a reader never sees a count
 * that points at a chunk which hasn't been written yet. Stale chunks left over
 * from a previously larger config are cleared. Requires the `setPluginData`
 * permission (each write is guarded in `lib/framer`).
 */
export async function saveConfigString(value: string): Promise<void> {
  const chunks = splitByByteBudget(value)
  const previousCount = await readCount()

  for (let i = 0; i < chunks.length; i++) {
    await setPluginData(`${PREFIX}.${i}`, chunks[i] ?? "")
  }
  // Remove chunks from a previous, longer save so stale tail data can't leak in.
  for (let i = chunks.length; i < previousCount; i++) {
    await setPluginData(`${PREFIX}.${i}`, null)
  }

  await setPluginData(COUNT_KEY, String(chunks.length))
}

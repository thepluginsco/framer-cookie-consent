import { beforeEach, describe, expect, it, vi } from "vitest"

import { DEFAULT_CONFIG, serialize } from "@framer-cookie-consent/shared"
import { publishFingerprint } from "@framer-cookie-consent/shared-ui"

/** In-memory plugin data with Framer's limits: 2KB per value, 4KB per project. */
const data = new Map<string, string>()
const size = () => [...data].reduce((n, [k, v]) => n + k.length + v.length, 0)

vi.mock("../plugin/src/lib/framer", () => ({
  getPluginData: async (key: string) => data.get(key) ?? null,
  setPluginData: async (key: string, value: string | null) => {
    if (value === null) return void data.delete(key)
    if (value.length > 2048) throw new Error("value over 2KB")
    const prev = data.get(key)
    data.set(key, value)
    if (size() > 4096) {
      if (prev === undefined) data.delete(key)
      else data.set(key, prev)
      throw new Error("couldn't complete setPluginData")
    }
  },
}))

const store = await import("../plugin/src/lib/configStore")

/** Write the pre-0.1.18 layout directly: uncompressed config + full installed copy. */
function writeLegacy(prefix: string, value: string) {
  const chunks = value.match(/[\s\S]{1,1800}/g) ?? []
  chunks.forEach((c, i) => data.set(`${prefix}.${i}`, c))
  data.set(`${prefix}.count`, String(chunks.length))
}

describe("Framer config store", () => {
  beforeEach(() => data.clear())

  it("keeps config + installed fingerprint well under the 4KB project limit", async () => {
    const raw = serialize(DEFAULT_CONFIG)
    await store.saveConfigString(raw)
    await store.saveInstalledFingerprint(publishFingerprint(DEFAULT_CONFIG))
    expect(size()).toBeLessThan(2048)
    expect(await store.loadConfigString()).toBe(raw)
    expect(await store.loadInstalledFingerprint()).toBe(publishFingerprint(DEFAULT_CONFIG))
  })

  it("keeps saving after many edits", async () => {
    for (let i = 0; i < 20; i++) {
      const cfg = { ...DEFAULT_CONFIG, banner: { ...DEFAULT_CONFIG.banner, title: `Title ${i}`.repeat(i + 1) } }
      await store.saveConfigString(serialize(cfg))
    }
    expect(size()).toBeLessThan(4096)
  })

  it("migrates a project stuck over the limit and keeps its installed status", async () => {
    const raw = serialize(DEFAULT_CONFIG)
    writeLegacy("cookieConsentConfig", raw)
    writeLegacy("consentfulInstalledConfig", raw)
    expect(size()).toBeGreaterThan(4096)

    const legacy = await store.loadConfigString()
    expect(legacy).toBe(raw)
    expect(await store.migrateLegacyData(legacy)).toBe(true)

    expect([...data.keys()].some((k) => k.startsWith("cookieConsentConfig"))).toBe(false)
    expect([...data.keys()].some((k) => k.startsWith("consentfulInstalledConfig"))).toBe(false)
    expect(await store.loadConfigString()).toBe(raw)
    expect(await store.loadInstalledFingerprint()).toBe(publishFingerprint(DEFAULT_CONFIG))
    expect(size()).toBeLessThan(2048)
    // and saving works again
    await store.saveConfigString(raw)
  })

  it("migration is a no-op on the new layout", async () => {
    await store.saveConfigString(serialize(DEFAULT_CONFIG))
    expect(await store.migrateLegacyData(await store.loadConfigString())).toBe(false)
  })
})

/**
 * The WordPress plugin ships in two shapes from one source (see
 * apps/wordpress-plugin/vite.config.ts): the full plugin (default build — license
 * activation, custom CSS / scripts, standard runtime) and the WordPress.org
 * review build (`--mode wporg` — no license code, no stored custom code,
 * self-hosted runtime). These checks read the BUILT, committed plugin files, which
 * are the full plugin.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const PLUGIN = resolve(__dirname, "../apps/wordpress-plugin/plugin")
const read = (path: string) => readFileSync(resolve(PLUGIN, path), "utf8")

describe("WordPress full plugin", () => {
  it("admin bundle carries license activation", () => {
    const js = read("consentful/assets/consentful-admin.js")
    expect(js).toContain("site-activate")
    expect(js).toContain("X-WP-Nonce") // still talks to its own REST routes
  })

  it("bundles the standard (licensed) runtime, byte-for-byte", () => {
    const bundled = read("consentful/assets/runtime/consent.min.js")
    expect(bundled).toBe(readFileSync(resolve(__dirname, "../runtime/dist/consent.min.js"), "utf8"))
    expect(bundled).toContain("site-entitlement")
  })

  it("keeps stored custom code (PHP strips it only in the WordPress.org build)", () => {
    expect(read("consentful/includes/build-mode.php")).toContain("define( 'CONSENTFUL_RESTRICTED', false );")
    expect(read("consentful/consentful.php")).toContain("if ( ! CONSENTFUL_RESTRICTED ) {")
  })
})

describe("WordPress Pro add-on", () => {
  it("ships the licensed editor and hooks the free plugin's admin assets", () => {
    expect(read("consentful-pro/assets/consentful-admin.js")).toContain("site-activate")
    const php = read("consentful-pro/consentful-pro.php")
    expect(php).toContain("Requires Plugins:  consentful")
    expect(php).toContain("add_filter( 'consentful_admin_assets'")
    expect(read("consentful/includes/class-consentful-admin.php")).toContain("apply_filters(\n\t\t\t'consentful_admin_assets'")
  })
})

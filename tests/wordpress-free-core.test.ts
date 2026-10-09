/**
 * The WordPress.org plugin must be free and fully functional: no license check,
 * no activation, no call to a Consentful server (Plugin Directory guidelines 5
 * and 6). These checks read the BUILT, committed plugin files, so a stray import
 * that pulls licensing code back into the free build fails here.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const PLUGIN = resolve(__dirname, "../apps/wordpress-plugin/plugin")
const read = (path: string) => readFileSync(resolve(PLUGIN, path), "utf8")

const LICENSING = ["onrender.com", "site-activate", "site-entitlement", "jwks", "cnsnt_pk_"]

describe("WordPress free core", () => {
  it("admin bundle carries no licensing code and no outbound fetch", () => {
    const js = read("consentful/assets/consentful-admin.js")
    for (const needle of LICENSING) expect(js).not.toContain(needle)
    expect(js).not.toMatch(/\bfetch\(/)
    expect(js).toContain("X-WP-Nonce") // still talks to its own REST routes
  })

  it("bundled runtime never contacts Consentful or a CDN", () => {
    const js = read("consentful/assets/runtime/consent.min.js")
    for (const needle of [...LICENSING, "jsdelivr"]) expect(js).not.toContain(needle)
  })

  it("plugin header and readme ask for no key", () => {
    expect(read("consentful/consentful.php")).not.toMatch(/license key/i)
    const readme = read("consentful/readme.txt")
    for (const phrase of ["key is required", "License tab", "paste the key", "licensing service"]) expect(readme).not.toContain(phrase)
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

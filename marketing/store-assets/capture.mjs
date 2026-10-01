/**
 * Captures the real-UI screenshots used in the store graphics
 * (see ../store-graphics-prompts.md). Output: ./ui/*.png at 2× density.
 *
 * Nothing here is mocked visually — the editor is the real shared-ui shell
 * (standalone preview) and the banner is the real runtime bundle on a demo
 * page. Only the licence activation call is answered locally so no real key or
 * portal seat is used.
 *
 * Run:
 *   1. npm run --workspace plugin preview:standalone      (editor on :5273)
 *   2. npm run build --workspace runtime                  (if dist is stale)
 *   3. npm i puppeteer-core   in any scratch folder, then
 *      PUPPETEER_CORE=file:///<that folder>/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js \
 *        node marketing/store-assets/capture.mjs
 */
import { createServer } from "node:http"
import { readFile, mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"

const { default: puppeteer } = await import(process.env.PUPPETEER_CORE ?? "puppeteer-core")

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, "../..")
const OUT = path.join(HERE, "ui")
const EDITOR_URL = process.env.EDITOR_URL ?? "http://localhost:5273/preview/index.html"
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe"
const DEMO_PORT = 5290

const SITE_NAME = "Fernway Studio"
const ACCENT = "#4B23D3"
const TRACKERS = [
  {
    name: "Google Analytics 4",
    url: "https://www.googletagmanager.com/gtag/js?id=G-4XZ8QP2L7M",
    tagId: "G-4XZ8QP2L7M",
    purpose: "Measures visits and page views",
    category: "Analytics",
  },
  {
    name: "Meta Pixel",
    url: "https://connect.facebook.net/en_US/fbevents.js",
    tagId: "481520963274",
    purpose: "Measures ad campaign conversions",
    category: "Marketing",
  },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts })

/* ------------------------------ demo site -------------------------------- */

const demoServer = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost")
  const file =
    url.pathname === "/consent.min.js"
      ? path.join(REPO, "runtime/dist/consent.min.js")
      : path.join(HERE, "demo-site/index.html")
  try {
    const body = await readFile(file)
    res.writeHead(200, { "content-type": file.endsWith(".js") ? "text/javascript" : "text/html; charset=utf-8" })
    res.end(body)
  } catch {
    res.writeHead(404).end()
  }
})

/** The banner config for the demo page; merged onto DEFAULT_CONFIG by the runtime. */
function demoConfig(overrides = {}) {
  return {
    behavior: { showMode: "everywhere" },
    theme: { accent: ACCENT, mode: "light", ...overrides.theme },
    banner: { layout: "card", position: "bottom-right", ...overrides.banner },
    preferenceCenter: { showVendors: true, perVendorToggles: true },
    strings: { privacyPolicyUrl: "https://fernway.studio/privacy" },
    scripts: TRACKERS.map((t, i) => ({
      id: `demo-${i}`,
      name: t.name,
      provider: new URL(t.url).hostname,
      tagId: t.tagId,
      purpose: t.purpose,
      category: t.category.toLowerCase(),
      type: "src",
      value: t.url,
      async: true,
    })),
  }
}

async function captureBanner(browser) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })

  const open = async (overrides = {}, site = "light") => {
    const cfg = encodeURIComponent(JSON.stringify(demoConfig(overrides)))
    await page.goto(`http://localhost:${DEMO_PORT}/?site=${site}&cfg=${cfg}`, { waitUntil: "networkidle0" })
    await page.waitForSelector(".cc-banner", { timeout: 8000 })
    await sleep(700)
  }

  /** The element alone on a transparent background (shadow included). */
  const isolated = async (name, selector, pad = 48) => {
    const box = await page.evaluate((sel) => {
      const r = document.querySelector(sel)?.getBoundingClientRect()
      return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null
    }, selector)
    if (!box) return console.warn("  ! no element for", selector)
    const style = await page.addStyleTag({
      content:
        "html,body{background:transparent!important}.wrap{visibility:hidden!important}.cc-overlay,.cc-modal__backdrop{background:transparent!important;backdrop-filter:none!important}",
    })
    const vp = page.viewport()
    const x = Math.max(0, box.x - pad)
    const y = Math.max(0, box.y - pad)
    await shot(page, name, {
      omitBackground: true,
      clip: { x, y, width: Math.min(vp.width - x, box.width + pad * 2), height: Math.min(vp.height - y, box.height + pad * 2) },
    })
    await style.evaluate((el) => el.remove())
  }

  await open()
  await shot(page, "ui-01-banner-on-site")
  await isolated("ui-01b-banner-card", ".cc-banner")

  await page.evaluate(() => window.CookieConsent.openPreferences())
  await sleep(700)
  await shot(page, "ui-02-preference-center")
  const prefsSel = await page.evaluate(() =>
    [".cc-modal__dialog", ".cc-prefs", ".cc-modal", "[role=dialog]"].find((s) => document.querySelector(s)),
  )
  if (prefsSel) {
    await page.addStyleTag({ content: ".cc-banner{visibility:hidden!important}" })
    await isolated("ui-02b-preference-center-card", prefsSel)
  }

  await open({ banner: { layout: "bar", position: "bottom-center" } })
  await shot(page, "ui-01c-banner-bar")

  // No dark-theme capture yet: the dark credit logo (plugin/public/logo-light.png)
  // is not on the CDN, so the dark banner shows a broken image.

  await page.close()
}

/* -------------------------------- editor --------------------------------- */

async function captureEditor(browser) {
  const page = await browser.newPage()
  await page.setViewport({ width: 820, height: 640, deviceScaleFactor: 2 })
  await page.setRequestInterception(true)
  page.on("request", async (req) => {
    const url = req.url()
    // Licence activation: answered locally, so no real key or seat is involved.
    if (url.includes("/public/site-activate")) {
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "POST, OPTIONS",
      }
      if (req.method() === "OPTIONS") return req.respond({ status: 204, headers })
      return req.respond({
        status: 200,
        headers,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          tier: "pro",
          whiteLabel: false,
          plan: { slug: "studio", name: "Studio" },
          maxSites: 5,
          isDev: true,
          reason: null,
        }),
      })
    }
    // Give the mocked Framer project a presentable name.
    if (url.includes("/preview/framer-mock.ts")) {
      const src = await (await fetch(url)).text()
      return req.respond({
        status: 200,
        contentType: "text/javascript",
        body: src.replaceAll("Preview Project", SITE_NAME).replaceAll("consentful-demo.framer.website", "fernway.framer.website"),
      })
    }
    req.continue()
  })

  /**
   * Click the LAST control whose label contains `text` (modals and the drawer
   * render last). Falls back to a leaf element with exactly that text, for
   * segmented controls that aren't buttons.
   */
  const click = async (text, wait = 450) => {
    const ok = await page.evaluate((t) => {
      const label = (el) => (el.innerText || "").replace(/\n/g, " ")
      let all = [...document.querySelectorAll("button,[role=button]")].filter((b) => label(b).includes(t))
      if (!all.length) all = [...document.querySelectorAll("div,span")].filter((e) => !e.children.length && label(e).trim() === t)
      all.at(-1)?.click()
      return all.length > 0
    }, text)
    if (!ok) console.warn("  ! no button:", text)
    await sleep(wait)
  }
  const fill = async (placeholderPart, value) => {
    const handle = await page.evaluateHandle(
      (p) => [...document.querySelectorAll("input,textarea")].find((i) => (i.placeholder || "").includes(p)),
      placeholderPart,
    )
    const el = handle.asElement()
    if (!el) return console.warn("  ! no input:", placeholderPart)
    await el.click({ clickCount: 3 })
    await el.type(value)
  }

  await page.goto(EDITOR_URL, { waitUntil: "networkidle0" })
  await page.evaluate(() => document.fonts.ready)
  await sleep(400)
  await page.click("body")
  await shot(page, "ui-10-activation-gate")

  await page.type("input", "CNSNT-4F7A-9K2M-X8QD")
  await page.keyboard.press("Enter")
  await sleep(1800)
  await shot(page, "ui-11-onboarding")
  await click("Skip")

  // Brand accent, so the live preview matches the banner shots.
  await click("Theme")
  const accent = await page.evaluateHandle(() => [...document.querySelectorAll("input")].find((i) => i.type !== "color" && /^#[0-9a-f]{6}$/i.test(i.value)))
  if (accent.asElement()) {
    await accent.asElement().focus()
    await page.keyboard.down("Control")
    await page.keyboard.press("KeyA")
    await page.keyboard.up("Control")
    await accent.asElement().type(ACCENT)
    await page.keyboard.press("Tab")
  }

  await click("Scripts")
  for (const t of TRACKERS) {
    await click("Add managed script", 500)
    await fill("LinkedIn Insight Tag", t.name)
    await fill("snap.licdn.com", t.url)
    await fill("1234567", t.tagId)
    await fill("Measures ad campaign", t.purpose)
    await click(t.category, 200)
    await click("Add script", 600)
  }

  const tab = async (label, name, after) => {
    await click(label, 700)
    if (after) await after()
    await shot(page, name)
  }
  await tab("Categories", "ui-03-editor-categories")
  await tab("Scripts", "ui-04-editor-scripts")
  await tab("Theme", "ui-05-editor-theme")
  await click("Preview", 800)
  await shot(page, "ui-05b-editor-theme-preview")
  await click("Preferences", 600)
  await shot(page, "ui-05c-editor-preview-preferences")
  await page.keyboard.press("Escape")
  await sleep(400)
  await tab("Publish", "ui-06-editor-publish")
  await tab("Consent Mode", "ui-07-editor-consent-mode")
  await tab("Behavior", "ui-08-editor-behavior")
  await tab("Insights", "ui-09-editor-insights")
  await tab("License", "ui-12-editor-license")

  await page.close()
}

/* --------------------------------- main ---------------------------------- */

await mkdir(OUT, { recursive: true })
await new Promise((r) => demoServer.listen(DEMO_PORT, r))
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
try {
  await captureBanner(browser)
  await captureEditor(browser)
} finally {
  await browser.close()
  demoServer.close()
}
console.log("Saved to", OUT)

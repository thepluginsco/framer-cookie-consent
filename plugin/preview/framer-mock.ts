/**
 * Standalone-preview mock for `@framer/plugin`.
 *
 * Used ONLY by `vite.preview.config.ts` (aliased in place of the real package)
 * so the Consentful UI can render + be screenshotted outside the Framer editor.
 * It never ships — the production build imports the real package.
 */

let store: Record<string, string | null> = {}
const customCode: Record<string, string | null> = {}
const customCodeWrites: string[] = []
;(window as unknown as { __customCodeWrites: string[] }).__customCodeWrites = customCodeWrites

let allowed = !new URLSearchParams(window.location.search).has("readonly")
const allowedListeners = new Set<(isAllowed: boolean) => void>()
;(window as unknown as { __setAllowed: (value: boolean) => void }).__setAllowed = (value) => {
  allowed = value
  for (const listener of allowedListeners) listener(value)
}

export const framer = {
  showUI: async (): Promise<void> => {},
  getPluginData: async (key: string): Promise<string | null> => store[key] ?? null,
  setPluginData: async (key: string, value: string | null): Promise<void> => {
    store[key] = value
  },
  getProjectInfo: async (): Promise<{ id: string; name: string }> => ({ id: "preview", name: "Preview Project" }),
  getPublishInfo: async (): Promise<{
    production: { url: string; currentPageUrl: string; deploymentTime: number; optimizationStatus: null } | null
    staging: { url: string; currentPageUrl: string; deploymentTime: number; optimizationStatus: null } | null
  }> => ({
    production: {
      url: "https://consentful-demo.framer.website",
      currentPageUrl: "https://consentful-demo.framer.website",
      deploymentTime: Date.now(),
      optimizationStatus: null,
    },
    staging: null,
  }),
  getCustomCode: async (): Promise<Record<string, { html: string | null; disabled: boolean }>> => ({
    headStart: { html: customCode.headStart ?? null, disabled: false },
    headEnd: { html: customCode.headEnd ?? null, disabled: false },
    bodyStart: { html: customCode.bodyStart ?? null, disabled: false },
    bodyEnd: { html: customCode.bodyEnd ?? null, disabled: false },
  }),
  // Records every write on `window.__customCodeWrites`, so a preview session can
  // confirm nothing is written until Install / Update banner is clicked.
  setCustomCode: async (options: { html: string | null; location: string }): Promise<void> => {
    customCode[options.location] = options.html
    customCodeWrites.push(options.location)
  },
  // Add `?readonly` to the preview URL to see the "view only" state a Framer
  // user without the custom-code permission gets.
  // Or flip it while the editor is open: `__setAllowed(false)` in the console.
  isAllowedTo: (): boolean => allowed,
  subscribeToIsAllowedTo: (...args: unknown[]): (() => void) => {
    const callback = args[args.length - 1] as (isAllowed: boolean) => void
    allowedListeners.add(callback)
    return () => allowedListeners.delete(callback)
  },
  subscribeToCustomCode: (): (() => void) => () => {},
}

// Reset store on module load so each preview session starts fresh (shows onboarding).
store = {}

// Add `?plan=free` or `?plan=pro` to answer licence activation locally (any key
// is accepted), so the editor's free and paid states can be checked without a
// real key or a call to the licensing server.
const previewPlan = new URLSearchParams(window.location.search).get("plan")
if (previewPlan === "free" || previewPlan === "pro") {
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (!url.includes("/public/site-activate")) return realFetch(input, init)
    const paid = previewPlan === "pro"
    return new Response(
      JSON.stringify({
        ok: true,
        tier: paid ? "pro" : "trial",
        whiteLabel: false,
        plan: paid ? { slug: "studio", name: "Studio" } : { slug: "starter-free", name: "Free" },
        maxSites: paid ? 5 : 1,
        isDev: true,
        reason: null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  }
}

/**
 * Standalone-preview mock for `@framer/plugin`.
 *
 * Used ONLY by `vite.preview.config.ts` (aliased in place of the real package)
 * so the Consentful UI can render + be screenshotted outside the Framer editor.
 * It never ships — the production build imports the real package.
 */

let store: Record<string, string | null> = {}

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
    headStart: { html: null, disabled: false },
    headEnd: { html: null, disabled: false },
    bodyStart: { html: null, disabled: false },
    bodyEnd: { html: null, disabled: false },
  }),
  setCustomCode: async (): Promise<void> => {},
  isAllowedTo: (): boolean => true,
  subscribeToCustomCode: (): (() => void) => () => {},
}

// Reset store on module load so each preview session starts fresh (shows onboarding).
store = {}

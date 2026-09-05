import { fileURLToPath } from "node:url"

import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

/**
 * Standalone-preview config: renders the Consentful UI outside Framer by aliasing
 * `@framer/plugin` to a local mock. Plain HTTP (no mkcert) so headless
 * screenshotting works. Not used for the shipped build.
 *
 *   vite --config vite.preview.config.ts
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@framer/plugin/framer.css",
        replacement: fileURLToPath(new URL("./preview/empty.css", import.meta.url)),
      },
      {
        find: "@framer/plugin",
        replacement: fileURLToPath(new URL("./preview/framer-mock.ts", import.meta.url)),
      },
    ],
  },
  server: { port: 5273, open: false },
})

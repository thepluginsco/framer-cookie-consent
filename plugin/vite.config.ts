import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import mkcert from "vite-plugin-mkcert"
import framer from "vite-plugin-framer"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), mkcert(), framer()],
  // Framer Marketplace: no user-configurable endpoints. Folds the shared UI's
  // guards to constants so that code is left out of the bundle.
  define: { __CF_NO_CUSTOM_ENDPOINTS__: "true" },
})

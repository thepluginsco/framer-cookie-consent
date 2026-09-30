import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The Shopify admin app: the shared editor, embedded in Shopify admin via App
 * Bridge. A static build — it publishes through App Bridge's direct Admin API
 * access, so there's no backend.
 *
 * Under `shopify app dev` the CLI starts this server (shopify.web.toml), passes
 * `PORT`/`FRONTEND_PORT` and the public tunnel in `HOST`, and injects
 * `SHOPIFY_API_KEY` (read by index.html's App Bridge meta tag — hence the extra
 * env prefix). Standalone `npm run dev` still works on :5173 for UI work.
 *
 * The storefront **consent bridge** asset (`src/consent-bridge.ts`) is bundled
 * separately by esbuild into `extensions/consentful/assets/` (`npm run build:bridge`), NOT by
 * Vite — it ships inside the theme app extension, not in this page's `dist/`.
 */
const port = Number(process.env.PORT ?? process.env.FRONTEND_PORT ?? 5173);
const tunnelHost = process.env.HOST ? new URL(process.env.HOST).hostname : null;

export default defineConfig({
  base: "./",
  envPrefix: ["VITE_", "SHOPIFY_"],
  plugins: [react()],
  server: {
    port,
    strictPort: !!process.env.PORT,
    // Shopify admin loads the app through the CLI's tunnel host.
    allowedHosts: true,
    hmr:
      tunnelHost && tunnelHost !== "localhost"
        ? { protocol: "wss", host: tunnelHost, clientPort: 443 }
        : undefined,
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});

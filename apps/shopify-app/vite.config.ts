import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Static build for the Shopify authoring UI. Framework-free vanilla TS, so no
 * framework plugin. The page generates the deployable app-embed block and lets a
 * merchant copy/download it — it is ∅-infra (deployable to any static host), the
 * merchant runs the Shopify CLI to deploy the extension itself.
 *
 * The storefront **consent bridge** asset (`src/consent-bridge.ts`) is bundled
 * separately by esbuild into `extension/assets/` (`npm run build:bridge`), NOT by
 * Vite — it ships inside the theme app extension, not in this page's `dist/`.
 */
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2022",
    outDir: "dist",
  },
});

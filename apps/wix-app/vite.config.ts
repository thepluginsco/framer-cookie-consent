import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Static build for the Wix dashboard authoring page. Framework-free vanilla TS,
 * so no framework plugin. Wix serves an app's dashboard page from a URL the app
 * config registers; this build emits that static bundle. The Worker
 * (`src/worker.ts`) is built + deployed separately by Wrangler
 * (`npm run deploy:worker`), and the consent bridge is bundled by esbuild
 * (`npm run build:bridge`) — neither is part of this Vite build.
 *
 * `VITE_WORKER_BASE` bakes the deployed Worker's URL into the dashboard at build
 * time (the page has no way to discover it at runtime).
 */
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2022",
    outDir: "dist",
    // The Worker + bridge are bundled elsewhere — keep them out of the SPA build.
    rollupOptions: { input: "index.html" },
  },
});

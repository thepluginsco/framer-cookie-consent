import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Static build for the Webflow Designer Extension UI. Framework-free vanilla TS,
 * so no framework plugin. Webflow serves a Designer Extension as a static bundle
 * (the `public/` zip uploaded via the CLI or App settings); this build emits that
 * bundle. The Data Client Worker (`src/worker.ts`) is built + deployed separately
 * by Wrangler (`npm run deploy:worker`), not by Vite.
 *
 * `VITE_WORKER_BASE` bakes the deployed Worker's URL into the extension at build
 * time (the extension has no way to discover it at runtime).
 */
export default defineConfig({
  base: "./",
  plugins: [react()],
  // No source static dir — the whole bundle is generated. Leaving Vite's default
  // `publicDir: "public"` on would make it copy the previous build back into the
  // output, so disable it explicitly.
  publicDir: false,
  build: {
    target: "es2022",
    // Emit straight into the folder the Webflow CLI serves/bundles
    // (`webflow extension serve` → `public/`), so a plain `npm run build` is
    // picked up by the Designer with no copy step.
    outDir: "public",
    emptyOutDir: true,
    // The Worker is bundled by Wrangler, not Vite — keep it out of the SPA build.
    rollupOptions: { input: "index.html" },
  },
});

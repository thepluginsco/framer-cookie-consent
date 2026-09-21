import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Build for the WordPress admin bundle (Phase 3.3).
 *
 * Framework-free vanilla TS, so no framework plugin. The output is the admin
 * settings-screen UI that PHP enqueues via `wp_enqueue_script`/`wp_enqueue_style`,
 * so the filenames are STABLE (no content hash) and land directly inside the
 * shippable PHP plugin at `plugin/consentful/assets/` — the built bundle is part
 * of the plugin you zip and distribute.
 *
 * The PHP plugin, its REST routes and the `wp_head` printer are hand-written PHP
 * (not built here); this build only produces the browser bundle the shared engine
 * runs in. `npm run dev` uses `index.html` for a standalone local harness.
 */
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2022",
    outDir: "plugin/consentful/assets",
    emptyOutDir: true,
    rollupOptions: {
      // Relative to the project root — no `__dirname` needed.
      input: "src/main.tsx",
      output: {
        entryFileNames: "consentful-admin.js",
        // PHP enqueues the stable `consentful-admin.js`/`.css`; keep those
        // names fixed, but hash the shared-ui fonts/images so the several
        // bundled font files don't collide on one fixed name.
        assetFileNames: (info) =>
          info.name && info.name.endsWith(".css")
            ? "consentful-admin.css"
            : "assets/[name]-[hash][extname]",
      },
    },
  },
});

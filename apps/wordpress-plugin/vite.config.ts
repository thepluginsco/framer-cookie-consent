import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Ship the banner runtime INSIDE the plugin. WordPress serves it from the
 * plugin's own folder, so a published site loads no script from a CDN. The file
 * is the same `runtime/dist/consent.min.js` every other platform uses.
 */
function bundleRuntime(): Plugin {
  return {
    name: "consentful-bundle-runtime",
    apply: "build",
    closeBundle() {
      const out = resolve(import.meta.dirname, "plugin/consentful/assets/runtime");
      mkdirSync(out, { recursive: true });
      copyFileSync(resolve(import.meta.dirname, "../../runtime/dist/consent.min.js"), resolve(out, "consent.min.js"));
    },
  };
}

/**
 * Build for the WordPress admin bundle (Phase 3.3).
 *
 * The output is the admin
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
  plugins: [react(), bundleRuntime()],
  build: {
    target: "es2022",
    // One stylesheet file PHP can enqueue (an IIFE build would otherwise inject
    // the CSS from JavaScript).
    cssCodeSplit: false,
    outDir: "plugin/consentful/assets",
    emptyOutDir: true,
    rollupOptions: {
      // Relative to the project root — no `__dirname` needed.
      input: "src/main.tsx",
      output: {
        // A classic script (not an ES module), so WordPress can enqueue it with
        // a plain `wp_enqueue_script` and localize data onto it.
        format: "iife",
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

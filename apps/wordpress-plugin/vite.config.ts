import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Ship the banner runtime INSIDE the plugin. WordPress serves it from the
 * plugin's own folder, so a published site loads no script from a CDN. The file
 * is the self-hosted runtime build (`runtime/dist/consent.self-hosted.min.js`):
 * the same runtime every other platform uses, except its banner images resolve
 * to `images/` beside it, which this step fills from `plugin/public/`, and its
 * built-in language packs load from `locales/` beside it.
 */
function bundleRuntime(): Plugin {
  return {
      name: "consentful-bundle-runtime",
      apply: "build",
      closeBundle() {
        const repo = resolve(import.meta.dirname, "../..");
        const out = resolve(import.meta.dirname, "plugin/consentful/assets/runtime");
        mkdirSync(resolve(out, "images"), { recursive: true });
        copyFileSync(resolve(repo, "runtime/dist/consent.self-hosted.min.js"), resolve(out, "consent.min.js"));
        // Built-in language packs, fetched by the runtime from `locales/` beside it.
        rmSync(resolve(out, "locales"), { recursive: true, force: true });
        cpSync(resolve(repo, "runtime/dist/locales"), resolve(out, "locales"), { recursive: true });
        for (const image of ["logo.png", "logo-mark.png", "logo-light.png", "cookie.png", "settings-cookie.png"]) {
          const from = resolve(repo, "plugin/public", image);
          if (existsSync(from)) copyFileSync(from, resolve(out, "images", image));
        }
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
  export default defineConfig(({ mode }) => {
    /**
     * Two builds from one source:
     * - default → the FREE plugin hosted on WordPress.org (`plugin/consentful/`):
     *   no license code at all (`__CC_FREE_CORE__`), plus the bundled runtime.
     * - `--mode pro` → the Pro add-on's admin screen (`plugin/consentful-pro/`),
     *   sold from consentful.theplugins.co: the full editor with the License tab.
     *   It reuses the free plugin's runtime, so it ships no runtime of its own.
     */
    const pro = mode === "pro"
    return {
    base: "./",
    plugins: pro ? [react()] : [react(), bundleRuntime()],
    // The plugin bundles its own runtime, so drop the "Embed on another site"
    // card: its snippet points at the CDN runtime.
    define: { __CC_EMBED_SNIPPET__: "false", __CC_FREE_CORE__: pro ? "false" : "true" },
    build: {
      target: "es2022",
      // One stylesheet file PHP can enqueue (an IIFE build would otherwise inject
      // the CSS from JavaScript).
      cssCodeSplit: false,
      outDir: pro ? "plugin/consentful-pro/assets" : "plugin/consentful/assets",
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
  }
});

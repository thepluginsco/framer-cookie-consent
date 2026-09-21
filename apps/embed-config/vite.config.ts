import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Static build for the hosted embed config page. It now renders the shared
 * React authoring UI (`@framer-cookie-consent/shared-ui`) so the embed builder
 * looks identical to the Framer plugin; the output is still plain static files
 * deployable to any host (Cloudflare Pages, Netlify, GitHub Pages) with zero
 * server — the ∅-infra guiding principle is unchanged.
 */
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2022",
    outDir: "dist",
  },
});

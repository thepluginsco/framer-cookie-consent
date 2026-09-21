/**
 * Ambient module declarations for the static assets Vite bundles (logo, cookie
 * marks). Each consuming app's Vite turns these imports into a URL string; tsc
 * only needs to know they resolve to a string. Mirrors the plugin's vite-env.
 */

declare module "*.png" {
  const src: string
  export default src
}

declare module "*.svg" {
  const src: string
  export default src
}

declare module "*.woff2" {
  const src: string
  export default src
}

declare module "*.css" {
  const content: string
  export default content
}

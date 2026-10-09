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

/*
 * Build flag `__CF_NO_CUSTOM_ENDPOINTS__`: `true` in builds that must not talk to
 * user-configured URLs (the Framer plugin — Marketplace rule). Files that read
 * it declare it locally and read it ONLY as the inline expression
 * `typeof __CF_NO_CUSTOM_ENDPOINTS__ !== "undefined" && __CF_NO_CUSTOM_ENDPOINTS__`,
 * so Vite's `define` folds it to a constant and the guarded code (custom geo /
 * analytics endpoints, the Insights stats fetch, the portal URL override) is
 * dropped from that bundle entirely. Undefined everywhere else.
 */

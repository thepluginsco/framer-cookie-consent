/**
 * Live preview for the WordPress admin settings screen.
 *
 * Identical in spirit to the embed page's preview: it runs the REAL runtime by
 * pasting the SAME {@link buildEmbedSnippet} output into a standalone document's
 * `<head>` and letting it boot in an `<iframe srcdoc>` — exactly what a visitor's
 * browser does when PHP prints our loader into `wp_head`.
 *
 * Two preview-only overrides make the banner always demonstrate (forced
 * `showMode:'everywhere'` + `consentModel:'opt-in'`); neither touches the config
 * that is actually stored.
 */

import type { CookieConsentConfig } from "@framer-cookie-consent/shared";
import { buildEmbedSnippet, mergeConfig } from "@framer-cookie-consent/shared";

/** Options controlling the preview document. */
export interface PreviewOptions {
  /** Runtime `<script src>` override (e.g. a local bundle during development). */
  runtimeUrl?: string;
}

const HOST_BODY = `
  <main class="cc-preview-host">
    <header><span class="cc-preview-logo">Your WordPress site</span></header>
    <h1>A page on your website</h1>
    <p>This is a live preview. The consent banner below is running the real
       Consentful runtime with your current settings, exactly as it will once
       published into your site's &lt;head&gt;.</p>
    <p class="cc-preview-muted">Reload the preview to see the first-visit banner again.</p>
  </main>
`;

const HOST_STYLES = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
         background: #f6f7f9; color: #1a1a1e; }
  .cc-preview-host { max-width: 640px; margin: 0 auto; padding: 40px 24px 160px; }
  .cc-preview-host header { margin-bottom: 32px; }
  .cc-preview-logo { font-weight: 700; letter-spacing: -0.01em; }
  .cc-preview-host h1 { font-size: 28px; letter-spacing: -0.02em; margin: 0 0 12px; }
  .cc-preview-host p { line-height: 1.55; margin: 0 0 12px; color: #3a3a42; }
  .cc-preview-muted { color: #8a8a94; font-size: 14px; }
  @media (prefers-color-scheme: dark) {
    body { background: #16161a; color: #ececf0; }
    .cc-preview-host p { color: #b6b6c0; }
    .cc-preview-muted { color: #7a7a86; }
  }
`;

/**
 * Force the preview-only config overrides. Pure + separate so the intent is
 * obvious and testable: the stored config is never mutated here.
 */
export function previewConfig(config: CookieConsentConfig): CookieConsentConfig {
  return mergeConfig({
    ...config,
    behavior: { ...config.behavior, showMode: "everywhere", consentModel: "opt-in" },
  });
}

/** Build the full `srcdoc` HTML for the preview iframe. */
export function buildPreviewDocument(config: CookieConsentConfig, options: PreviewOptions = {}): string {
  const snippet = buildEmbedSnippet(previewConfig(config), {
    comment: false,
    ...(options.runtimeUrl !== undefined ? { runtimeUrl: options.runtimeUrl } : {}),
  });
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<title>Banner preview</title>",
    `<style>${HOST_STYLES}</style>`,
    snippet,
    "</head>",
    "<body>",
    HOST_BODY,
    "</body>",
    "</html>",
  ].join("\n");
}

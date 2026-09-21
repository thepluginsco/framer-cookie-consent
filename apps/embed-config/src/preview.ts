/**
 * Live preview for the hosted embed config page.
 *
 * The honest way to preview an embed is to actually run it: this builds a tiny
 * standalone HTML document that pastes the SAME {@link buildEmbedSnippet} output
 * into a `<head>` and lets the real runtime boot — exactly what a visitor's
 * browser does. The page hands this string to an `<iframe srcdoc>`.
 *
 * Two preview-only overrides make it always demonstrate the banner:
 *   - `showMode` is forced to `'everywhere'` so the banner appears regardless of
 *     the author's region gating (which needs a real visitor location), and
 *   - `consentModel` is forced to `'opt-in'` so a fresh preview always PROMPTS
 *     rather than silently applying implied consent.
 * Neither override touches the config the user copies — they exist only so the
 * preview iframe reliably shows the banner being configured.
 */

import type { CookieConsentConfig } from "@framer-cookie-consent/shared";
import { buildEmbedSnippet, mergeConfig } from "@framer-cookie-consent/shared";

/** Options controlling the preview document. */
export interface PreviewOptions {
  /** Runtime `<script src>` override (e.g. a local bundle during development). */
  runtimeUrl?: string;
}

/**
 * A minimal, neutral "host page" so the banner previews against real page chrome
 * rather than a blank void. Deliberately plain — the banner is the subject.
 */
const HOST_BODY = `
  <main class="cc-preview-host">
    <header><span class="cc-preview-logo">Your site</span></header>
    <h1>A page on your website</h1>
    <p>This is a live preview. The consent banner below is running the real
       Consentful runtime with your current settings.</p>
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
 * Force the preview-only config overrides. Kept pure and separate so the intent
 * is obvious and unit-testable: the copied config is never mutated here.
 */
export function previewConfig(config: CookieConsentConfig): CookieConsentConfig {
  return mergeConfig({
    ...config,
    behavior: { ...config.behavior, showMode: "everywhere", consentModel: "opt-in" },
  });
}

/**
 * Build the full `srcdoc` HTML for the preview iframe.
 *
 * @param config - The author's current config.
 * @param options - See {@link PreviewOptions}.
 * @returns A complete HTML document string for `<iframe srcdoc>`.
 */
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

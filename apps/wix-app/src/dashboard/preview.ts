/**
 * Live banner preview for the Wix dashboard page.
 *
 * Same honest approach as the other shells: run the REAL runtime by pasting the
 * shared {@link buildEmbedSnippet} output into a tiny `<head>` and letting it boot
 * in an `<iframe srcdoc>`. Two preview-only overrides (`showMode:'everywhere'` +
 * `consentModel:'opt-in'`) guarantee the banner always shows and prompts; the
 * config the dashboard actually stores is never mutated.
 */

import type { CookieConsentConfig } from "@framer-cookie-consent/shared";
import { buildEmbedSnippet, mergeConfig } from "@framer-cookie-consent/shared";

const HOST_STYLES = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
         background: #f6f7f9; color: #1a1a1e; }
  .host { max-width: 560px; margin: 0 auto; padding: 28px 20px 160px; }
  .host h1 { font-size: 22px; letter-spacing: -0.02em; margin: 0 0 10px; }
  .host p { line-height: 1.5; margin: 0 0 10px; color: #3a3a42; }
  @media (prefers-color-scheme: dark) {
    body { background: #16161a; color: #ececf0; }
    .host p { color: #b6b6c0; }
  }
`;

/** Preview-only overrides so the banner always demonstrates. Pure. */
export function previewConfig(config: CookieConsentConfig): CookieConsentConfig {
  return mergeConfig({
    ...config,
    behavior: { ...config.behavior, showMode: "everywhere", consentModel: "opt-in" },
  });
}

/** Build the `srcdoc` HTML for the preview iframe. */
export function buildPreviewDocument(config: CookieConsentConfig): string {
  const snippet = buildEmbedSnippet(previewConfig(config), { comment: false });
  return [
    "<!DOCTYPE html>",
    '<html lang="en"><head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<title>Banner preview</title>",
    `<style>${HOST_STYLES}</style>`,
    snippet,
    "</head><body>",
    '<main class="host"><h1>Your Wix site</h1>',
    "<p>Live preview running the real Consentful runtime with your current settings.</p></main>",
    "</body></html>",
  ].join("\n");
}

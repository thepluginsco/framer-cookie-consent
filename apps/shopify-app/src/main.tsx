/**
 * Entry point for the Shopify authoring UI.
 *
 * Mounts the shared Consentful editor (via the Shopify host adapter) into
 * `#root`, so the Shopify authoring page is the same UI Framer ships. The
 * storefront consent-bridge asset is a separate esbuild bundle, untouched.
 */

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@framer-cookie-consent/shared-ui/fonts.css"
import "./styles.css"
import { ShopifyApp } from "./shopify-host"

const root = document.getElementById("root")
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ShopifyApp />
    </StrictMode>,
  )
}

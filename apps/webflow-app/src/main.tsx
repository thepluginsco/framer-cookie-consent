/**
 * Entry point for the Webflow Designer Extension UI.
 *
 * Mounts the shared Consentful editor (via the Webflow host adapter) into
 * `#root`, so the Designer panel is the same UI Framer ships. The only network
 * is to the Data Client Worker, through the publish action.
 */

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@framer-cookie-consent/shared-ui/fonts.css"
import "./styles.css"
import { WebflowApp } from "./designer/webflow-app"

const root = document.getElementById("root")
if (root) {
  createRoot(root).render(
    <StrictMode>
      <WebflowApp />
    </StrictMode>,
  )
}

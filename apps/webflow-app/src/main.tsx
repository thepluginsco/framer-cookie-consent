/**
 * Entry point for the Webflow Designer Extension UI.
 *
 * Mounts the shared Consentful editor (via the Webflow host adapter) into
 * `#root`, so the Designer panel is the same UI Framer ships. The only network
 * is to the Data Client Worker, through the publish action.
 */

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import fontsCss from "@framer-cookie-consent/shared-ui/fonts.css?inline"
import appCss from "./styles.css?inline"
import { WebflowApp } from "./designer/webflow-app"
import { requestLargeSize } from "./designer/webflow-host"

// The styles ship inside the JS bundle (not as a separate .css file) so the one
// JS source map traces them to readable source for Marketplace review.
const style = document.createElement("style")
style.textContent = fontsCss + appCss
document.head.append(style)

// Give the shared editor room — request Webflow's largest panel (800×600).
void requestLargeSize()

const root = document.getElementById("root")
if (root) {
  createRoot(root).render(
    <StrictMode>
      <WebflowApp />
    </StrictMode>,
  )
}

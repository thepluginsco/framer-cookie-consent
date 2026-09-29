/**
 * Entry point for the hosted embed config page.
 *
 * Mounts the shared Consentful editor (via the universal-embed host adapter)
 * into `#root`, so the embed builder is the same UI Framer ships.
 */

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@framer-cookie-consent/shared-ui/fonts.css"
import "./styles.css"
import { EmbedApp } from "./embed-host"
import { PortalApp, portalSiteId } from "./portal-host"

// Opened from the dashboard (?site=cs_…) → edit that website; else standalone.
const siteId = portalSiteId()
const root = document.getElementById("root")
if (root) {
  createRoot(root).render(
    <StrictMode>
      {siteId ? <PortalApp siteId={siteId} /> : <EmbedApp />}
    </StrictMode>,
  )
}

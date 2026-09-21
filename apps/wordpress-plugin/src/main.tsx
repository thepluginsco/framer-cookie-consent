/**
 * Entry point for the WordPress admin bundle.
 *
 * PHP renders a mount node (`#consentful-admin`) on the settings screen and
 * enqueues this bundle; `#app` is the standalone fallback for `npm run dev`.
 * Mounts the shared Consentful editor (via the WordPress host adapter), so the
 * admin screen is the same UI Framer ships.
 */

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@framer-cookie-consent/shared-ui/fonts.css"
import "./styles.css"
import { WordPressApp } from "./wordpress-host"

const root = document.getElementById("consentful-admin") ?? document.getElementById("app")
if (root) {
  createRoot(root).render(
    <StrictMode>
      <WordPressApp />
    </StrictMode>,
  )
}

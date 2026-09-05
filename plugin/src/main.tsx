import "@framer/plugin/framer.css"
import "./consentful/fonts.css"

import React from "react"
import ReactDOM from "react-dom/client"

import { App } from "./App.tsx"
import { ErrorBoundary } from "./lib/ErrorBoundary.tsx"
import { initErrorReporting } from "./lib/errorReporting.ts"

// Optional, non-required error reporting. No-op unless VITE_SENTRY_DSN is set AND
// a Sentry loader is present (see lib/errorReporting.ts). Safe to always call.
initErrorReporting()

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

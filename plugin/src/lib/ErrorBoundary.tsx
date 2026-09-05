import React from "react"

import { captureError } from "./errorReporting"

/**
 * Editor-UI error boundary. Catches render/runtime errors in the plugin panel so
 * a bug shows a small recoverable message instead of a blank white iframe, and
 * routes the error through {@link captureError} (console by default; Sentry only
 * if opted in — see `errorReporting.ts`).
 *
 * This guards the PLUGIN editor only. It has nothing to do with the published
 * site's runtime, which has its own independent, network-free error hook.
 */
interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    captureError(error, "plugin-ui")
    // The component stack is useful context in the console during development.
    // eslint-disable-next-line no-console
    console.error("[consentful] component stack:", info.componentStack)
  }

  private handleReload = (): void => {
    this.setState({ error: null })
  }

  override render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, font: "13px/1.5 inherit" }}>
          <p style={{ fontWeight: 700, margin: "0 0 6px" }}>Something went wrong.</p>
          <p style={{ margin: "0 0 12px", opacity: 0.7 }}>
            The Consentful panel hit an unexpected error. Your saved settings are safe.
          </p>
          <button type="button" onClick={this.handleReload}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

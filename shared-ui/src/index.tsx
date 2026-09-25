/**
 * `@framer-cookie-consent/shared-ui` — the one authoring UI every platform
 * front-end renders. A host mounts {@link ConsentfulShell} inside a
 * {@link HostProvider} (platform services) and a settings provider (config
 * persistence), and gets the identical Consentful editor Framer has.
 *
 * Consumers must also import the bundled fonts once:
 *   import "@framer-cookie-consent/shared-ui/fonts.css"
 */

export * from "./tokens"
export * from "./ui"
export * from "./settings-context"
export * from "./host"
export * from "./model"
export * from "./preview"
export * from "./panels"
export * from "./modals"
export { ConsentfulShell } from "./shell"
export { LicensePanel } from "./license/LicensePanel"
export { useLicense, hostnameOf, type LicenseApi, type LicenseStatus } from "./license/use-license"
export {
  createPortalClient,
  PortalNetworkError,
  type ActivationResult,
  type PortalClient,
  type PortalClientDeps,
  type PortalPlan,
} from "./license/portal-client"

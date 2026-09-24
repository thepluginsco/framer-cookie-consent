/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional Sentry DSN for the plugin editor's error reporting. UNSET by
   * default → reporting is off and costs nothing. See `src/lib/errorReporting.ts`.
   */
  readonly VITE_SENTRY_DSN?: string

  /*
   * Licensing is portal-based (domain activation); the portal API origin +
   * publishable key are shared constants in `shared/src/portal.ts`, not env vars.
   * No plugin-side licensing env vars are needed.
   */
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

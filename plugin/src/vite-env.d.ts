/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional Sentry DSN for the plugin editor's error reporting. UNSET by
   * default → reporting is off and costs nothing. See `src/lib/errorReporting.ts`.
   */
  readonly VITE_SENTRY_DSN?: string

  /* Lemon Squeezy licensing ids (see `src/lib/licenseConfig.ts` + `.env.example`).
   * Unset → the plugin runs trial-only until they're provided. */
  /** Numeric Lemon Squeezy store id. */
  readonly VITE_LS_STORE_ID?: string
  /** Public product/checkout URL for the "Buy a license" button. */
  readonly VITE_LS_PRODUCT_URL?: string
  /** Lifetime tier product + variant ids. */
  readonly VITE_LS_LIFETIME_PRODUCT_ID?: string
  readonly VITE_LS_LIFETIME_VARIANT_ID?: string
  /** Pro tier product + variant ids. */
  readonly VITE_LS_PRO_PRODUCT_ID?: string
  readonly VITE_LS_PRO_VARIANT_ID?: string
  /** Agency tier product + variant ids. */
  readonly VITE_LS_AGENCY_PRODUCT_ID?: string
  readonly VITE_LS_AGENCY_VARIANT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

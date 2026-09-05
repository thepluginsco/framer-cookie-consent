/**
 * Public entry point for the shared package.
 *
 * The consent config schema is the single source of truth imported by BOTH the
 * Framer plugin (which writes config) and the runtime (which reads it). Keeping
 * it here — and re-exporting it from one place — is what guarantees the two
 * halves can never drift apart.
 */
export * from './config-schema.js';

/**
 * Optional, non-required error reporting for the PLUGIN editor UI.
 *
 * This is OFF by default and adds **no npm dependency** and **no cost** unless a
 * team explicitly opts in. Two independent switches must both be true for a single
 * event to leave the browser:
 *
 *  1. `VITE_SENTRY_DSN` is set at build time (the env flag), and
 *  2. a Sentry SDK is actually present on `window.Sentry`.
 *
 * We deliberately integrate against the **global `window.Sentry`** (Sentry's free
 * "Loader Script" install) rather than importing `@sentry/browser`, so this file
 * compiles and the plugin builds whether or not anyone ever wires Sentry up —
 * there is nothing to `npm install` to keep the build green. If a team prefers the
 * bundled SDK instead, see the note at the bottom of this file.
 *
 * Enabling it (later, optionally):
 *
 *   1. Create a free Sentry project → copy its DSN + Loader Script `<script>`.
 *   2. Add the Loader Script to the plugin's `index.html` (or load it before the
 *      app), so `window.Sentry` exists.
 *   3. Set `VITE_SENTRY_DSN=<your-dsn>` in `plugin/.env.local` (see `.env.example`).
 *
 * With neither step done, {@link initErrorReporting} returns immediately and
 * {@link captureError} only logs to the console — exactly today's behaviour.
 */

/** The minimal slice of the Sentry SDK surface we call. */
interface SentryGlobal {
  init?: (options: Record<string, unknown>) => void;
  captureException?: (error: unknown, captureContext?: unknown) => void;
}

declare global {
  interface Window {
    Sentry?: SentryGlobal;
  }
}

/** Flips true only after a successful opt-in init; gates every capture call. */
let active = false;

/** The Sentry global, if a loader made one available. */
function sentry(): SentryGlobal | undefined {
  return typeof window !== 'undefined' ? window.Sentry : undefined;
}

/**
 * Initialise error reporting IF (and only if) it has been opted into. Safe to
 * call unconditionally at startup: with no DSN or no Sentry present it is a no-op.
 * Never throws.
 */
export function initErrorReporting(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // default path: disabled, zero cost, zero network.

  const sdk = sentry();
  if (!sdk?.init) {
    // The flag is set but no SDK is loaded — tell the developer how, don't crash.
    // eslint-disable-next-line no-console
    console.info(
      '[consentful] VITE_SENTRY_DSN is set but window.Sentry is not loaded — ' +
        'error reporting stays OFF. Add the Sentry Loader Script (see errorReporting.ts).',
    );
    return;
  }

  try {
    sdk.init({
      dsn,
      environment: import.meta.env.MODE,
      // Free-tier friendly: errors only, no performance/replay quota burn.
      tracesSampleRate: 0,
      // Never send editor content / config as PII.
      sendDefaultPii: false,
    });
    active = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[consentful] Sentry init failed; continuing without reporting.', err);
  }
}

/**
 * Report an error from the plugin. Always logs to the console (local, free); also
 * forwards to Sentry only when reporting was successfully opted into. Never throws.
 *
 * @param error - The thrown value.
 * @param context - A short tag naming where it happened (e.g. `'publish'`).
 */
export function captureError(error: unknown, context?: string): void {
  if (active) {
    try {
      sentry()?.captureException?.(error, context ? { tags: { context } } : undefined);
    } catch {
      /* reporting must never itself break the editor */
    }
  }
  // eslint-disable-next-line no-console
  console.error(`[consentful]${context ? ` (${context})` : ''}`, error);
}

/* ---------------------------------------------------------------------------
 * Alternative: bundled @sentry/browser instead of the Loader Script
 * ---------------------------------------------------------------------------
 * If you'd rather bundle the SDK, run `npm i @sentry/browser` in the plugin
 * workspace and replace the `window.Sentry` calls above with a lazy import so it
 * only loads when the DSN is set:
 *
 *   const Sentry = await import('@sentry/browser')
 *   Sentry.init({ dsn, environment: import.meta.env.MODE, tracesSampleRate: 0 })
 *   Sentry.captureException(error, { tags: { context } })
 *
 * Keep the `if (!dsn) return` guard so it stays optional and zero-cost by default.
 * ------------------------------------------------------------------------- */

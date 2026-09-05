/**
 * Optional, zero-cost error visibility for the runtime.
 *
 * This is deliberately the smallest possible thing that gives a site owner a way
 * to SEE runtime errors without us ever phoning home:
 *
 * - **OFF by default.** With no opt-in, {@link reportError} does nothing beyond a
 *   single guarded `console.error` safety net — the same local, free visibility
 *   the runtime has always had. Nothing is buffered, batched, or sent anywhere.
 * - **NEVER makes external calls.** This module imports nothing, opens no socket,
 *   and calls no network API. Honouring the $0 infra promise is a hard invariant,
 *   not a default that can be flipped: the only way errors leave the page is a
 *   sink the SITE OWNER supplies (see below), which is their code, not ours.
 * - **Opt-in is a hook, not a service.** A site can route runtime errors into its
 *   OWN telemetry by setting `window.__CC_ON_ERROR__` (or calling
 *   {@link configureErrorLogger}). We simply invoke it; whatever it does — log,
 *   ignore, or forward to Sentry — is the owner's choice and the owner's cost.
 *
 * SSR-safe and never throws: a failure inside the logger must never become a new
 * error on the host page.
 */

/** A site-supplied error sink. Receives the error and a short context tag. */
export type ErrorSink = (error: unknown, context?: string) => void;

/** Programmatic configuration for {@link configureErrorLogger}. */
export interface ErrorLoggerOptions {
  /** Emit a verbose `console.error` (with context + stack) on every report. */
  verbose?: boolean;
  /** Custom sink invoked on every report. MUST be the owner's code — we never ship one. */
  sink?: ErrorSink | null;
}

declare global {
  interface Window {
    /** Opt-in verbose logging without any code (e.g. set in the browser console). */
    __CC_DEBUG__?: boolean;
    /** Opt-in error sink; the runtime calls it but never provides one itself. */
    __CC_ON_ERROR__?: ErrorSink;
  }
}

/** Process-local overrides set via {@link configureErrorLogger} (default: OFF). */
const state: { verbose: boolean; sink: ErrorSink | null } = { verbose: false, sink: null };

/**
 * Configure the logger programmatically (mainly for the host site or tests).
 * Passing `{}` leaves the current setting untouched for unspecified fields.
 *
 * @param options - Verbose flag and/or a custom {@link ErrorSink}.
 */
export function configureErrorLogger(options: ErrorLoggerOptions = {}): void {
  if (typeof options.verbose === 'boolean') state.verbose = options.verbose;
  if (options.sink !== undefined) state.sink = options.sink;
}

/** Reset all logger state to the default (OFF). Test helper; also safe at runtime. */
export function resetErrorLogger(): void {
  state.verbose = false;
  state.sink = null;
}

/** Read the ambient `window` without throwing in a non-browser context. */
function win(): Window | undefined {
  return typeof window !== 'undefined' ? window : undefined;
}

/** Effective verbose flag: programmatic override OR the `window.__CC_DEBUG__` opt-in. */
function isVerbose(): boolean {
  if (state.verbose) return true;
  try {
    return win()?.__CC_DEBUG__ === true;
  } catch {
    return false;
  }
}

/** Effective sink: programmatic override OR the `window.__CC_ON_ERROR__` opt-in. */
function resolveSink(): ErrorSink | null {
  if (state.sink) return state.sink;
  try {
    const fn = win()?.__CC_ON_ERROR__;
    return typeof fn === 'function' ? fn : null;
  } catch {
    return null;
  }
}

/**
 * Report a runtime error. Always non-fatal and always local:
 *
 * 1. A concise `console.error` safety net (or a verbose one, with context/stack,
 *    when opted in) — this is the "basic visibility" that ships on by default.
 * 2. If — and only if — the site owner supplied a sink, it is invoked with the
 *    error and context. We do NOT catch it up into any network transport; the
 *    sink is the owner's own code.
 *
 * The whole function is wrapped so the logger can never itself throw.
 *
 * @param error - The thrown value (any type).
 * @param context - A short tag naming where it happened (e.g. `'boot'`).
 */
export function reportError(error: unknown, context?: string): void {
  const label = context ? `[cookie-consent] runtime error (${context})` : '[cookie-consent] runtime error';
  try {
    if (isVerbose()) {
      const stack = error instanceof Error ? error.stack ?? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error(`${label}:`, error, `\n${stack}`);
    } else {
      // eslint-disable-next-line no-console
      console.error(`${label} (suppressed):`, error);
    }
  } catch {
    /* console unavailable — nothing more we can safely do */
  }
  const sink = resolveSink();
  if (sink) {
    try {
      sink(error, context);
    } catch {
      /* a broken owner sink must never break the host page */
    }
  }
}

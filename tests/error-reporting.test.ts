/**
 * Tests for the PLUGIN editor's optional Sentry error reporting.
 *
 * The invariant is that it is OFF and inert unless BOTH the `VITE_SENTRY_DSN`
 * env flag is set AND a Sentry SDK is present on `window.Sentry`. We drive the
 * env flag with `vi.stubEnv` and a fake `window.Sentry`, and confirm the default
 * path touches nothing but the console.
 *
 * Run with `vitest run`.
 */

import { test, beforeEach, afterEach, expect, vi } from 'vitest';

const g = globalThis as Record<string, unknown>;

let infoSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

/** Import a fresh copy of the module so its `active` flag starts false each test. */
async function load() {
  vi.resetModules();
  return import('../plugin/src/lib/errorReporting.ts');
}

beforeEach(() => {
  delete g.window;
  vi.unstubAllEnvs();
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  delete g.window;
});

/* -------------------------------- default OFF ----------------------------- */

test('no DSN: init is a no-op and captureError only logs to the console', async () => {
  // No VITE_SENTRY_DSN → disabled.
  const init = vi.fn();
  g.window = { Sentry: { init, captureException: vi.fn() } };
  const mod = await load();

  mod.initErrorReporting();
  expect(init).not.toHaveBeenCalled(); // never initialised without the flag

  mod.captureError(new Error('boom'), 'publish');
  expect((g.window as { Sentry: { captureException: ReturnType<typeof vi.fn> } }).Sentry.captureException).not.toHaveBeenCalled();
  expect(errorSpy).toHaveBeenCalled();
});

/* ---------------------------- DSN set, no SDK ----------------------------- */

test('DSN set but no Sentry loaded: logs an info hint and stays OFF', async () => {
  vi.stubEnv('VITE_SENTRY_DSN', 'https://key@o0.ingest.sentry.io/1');
  g.window = {}; // no Sentry global
  const mod = await load();

  mod.initErrorReporting();
  expect(infoSpy).toHaveBeenCalled();

  mod.captureError(new Error('x'));
  expect(errorSpy).toHaveBeenCalled(); // console fallback only
});

/* --------------------------- DSN set + SDK present ------------------------ */

test('DSN set with Sentry present: init runs and captureError forwards to Sentry', async () => {
  vi.stubEnv('VITE_SENTRY_DSN', 'https://key@o0.ingest.sentry.io/1');
  const init = vi.fn();
  const captureException = vi.fn();
  g.window = { Sentry: { init, captureException } };
  const mod = await load();

  mod.initErrorReporting();
  expect(init).toHaveBeenCalledTimes(1);
  const opts = init.mock.calls[0]![0] as Record<string, unknown>;
  expect(opts.dsn).toBe('https://key@o0.ingest.sentry.io/1');
  expect(opts.sendDefaultPii).toBe(false);

  const err = new Error('captured');
  mod.captureError(err, 'save');
  expect(captureException).toHaveBeenCalledWith(err, { tags: { context: 'save' } });
});

test('a throwing Sentry.captureException never propagates out of captureError', async () => {
  vi.stubEnv('VITE_SENTRY_DSN', 'https://key@o0.ingest.sentry.io/1');
  g.window = {
    Sentry: {
      init: vi.fn(),
      captureException: () => {
        throw new Error('sentry down');
      },
    },
  };
  const mod = await load();
  mod.initErrorReporting();
  expect(() => mod.captureError(new Error('y'))).not.toThrow();
});
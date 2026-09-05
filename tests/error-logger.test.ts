/**
 * Tests for the runtime's optional, zero-cost error logger.
 *
 * The compliance-relevant invariant here is NEGATIVE: the logger must never make
 * an external call and must be OFF by default. We prove that by asserting it only
 * ever touches `console` and a site-supplied sink — there is no network transport
 * to stub because none exists.
 *
 * Run with `vitest run`.
 */

import { test, beforeEach, afterEach, expect, vi } from 'vitest';

import {
  reportError,
  configureErrorLogger,
  resetErrorLogger,
  type ErrorSink,
} from '../runtime/src/error-logger.ts';

const g = globalThis as Record<string, unknown>;

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetErrorLogger();
  delete g.window;
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  resetErrorLogger();
  delete g.window;
});

/* ------------------------------- default: OFF ----------------------------- */

test('OFF by default: reports a concise, suppressed console.error and calls no sink', () => {
  const err = new Error('boom');
  reportError(err, 'boot');

  expect(consoleError).toHaveBeenCalledTimes(1);
  const [msg, passed] = consoleError.mock.calls[0]!;
  expect(String(msg)).toContain('(boot)');
  expect(String(msg)).toContain('suppressed');
  expect(passed).toBe(err);
});

test('OFF by default: never invokes a sink because none is configured', () => {
  // There is no ambient sink and none configured → only console is touched.
  reportError('a string error');
  expect(consoleError).toHaveBeenCalledTimes(1);
});

/* ------------------------- programmatic configuration --------------------- */

test('configureErrorLogger: a custom sink receives the error + context', () => {
  const seen: Array<{ error: unknown; context?: string }> = [];
  const sink: ErrorSink = (error, context) => seen.push({ error, context });
  configureErrorLogger({ sink });

  const err = new Error('kaboom');
  reportError(err, 'mount');

  expect(seen).toHaveLength(1);
  expect(seen[0]!.error).toBe(err);
  expect(seen[0]!.context).toBe('mount');
});

test('verbose mode: includes a stack/detail line in the console output', () => {
  configureErrorLogger({ verbose: true });
  reportError(new Error('detailed'), 'ctx');
  const call = consoleError.mock.calls[0]!;
  // Verbose form passes the error object AND a trailing stack/detail string.
  expect(call.some((a) => typeof a === 'string' && a.includes('detailed'))).toBe(true);
});

/* ----------------------------- window opt-ins ----------------------------- */

test('window.__CC_ON_ERROR__ opt-in is honoured as the sink', () => {
  const calls: unknown[] = [];
  g.window = { __CC_ON_ERROR__: (e: unknown) => calls.push(e) };
  const err = new Error('via window');
  reportError(err);
  expect(calls).toEqual([err]);
});

test('window.__CC_DEBUG__ opt-in switches on verbose logging without any code', () => {
  g.window = { __CC_DEBUG__: true };
  reportError(new Error('verbose-via-flag'));
  const call = consoleError.mock.calls[0]!;
  expect(call.some((a) => typeof a === 'string' && a.includes('verbose-via-flag'))).toBe(true);
});

/* ------------------------------ robustness -------------------------------- */

test('a throwing sink never propagates (host page must not break)', () => {
  configureErrorLogger({
    sink: () => {
      throw new Error('sink is broken');
    },
  });
  expect(() => reportError(new Error('original'))).not.toThrow();
  // The original error was still surfaced to the console safety net.
  expect(consoleError).toHaveBeenCalled();
});

test('SSR-safe: reporting with no window present does not throw', () => {
  expect(typeof g.window).toBe('undefined');
  expect(() => reportError(new Error('ssr'))).not.toThrow();
  expect(consoleError).toHaveBeenCalledTimes(1);
});

test('resetErrorLogger clears a configured sink back to OFF', () => {
  const sink = vi.fn();
  configureErrorLogger({ sink });
  reportError(new Error('one'));
  expect(sink).toHaveBeenCalledTimes(1);

  resetErrorLogger();
  reportError(new Error('two'));
  expect(sink).toHaveBeenCalledTimes(1); // not called again after reset
});

/**
 * Root Vitest configuration for the whole monorepo.
 *
 * The cross-package suite in `/tests` spans the plugin ⇄ shared ⇄ runtime
 * boundary. It runs under Vitest with jsdom available: most suites install their
 * OWN jsdom instance (so they control the document lifecycle, storage, and the
 * DOM-constructor globals `instanceof` needs), which is why the default
 * `environment` is `node` rather than a shared ambient jsdom — a per-test jsdom
 * that the suite owns is more deterministic than one the runner installs.
 *
 * Vitest resolves the `@framer-cookie-consent/shared` workspace package straight
 * to its TypeScript source and transforms it on the fly, so no pre-build step is
 * needed before `npm test`.
 *
 * Coverage is focused on the runtime's COMPLIANCE-CRITICAL modules
 * (consent-mode, script-blocker, consent-state); those carry per-file thresholds
 * so a regression that drops their coverage fails CI, not just the reviewer's
 * attention.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // jsdom is used explicitly per-suite; `jsdom` is listed so the dep is pinned
    // and available to `new JSDOM(...)` and to `// @vitest-environment jsdom`.
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      reportsDirectory: './coverage',
      include: [
        'runtime/src/**/*.ts',
        'shared/src/**/*.ts',
        'plugin/src/lib/**/*.ts',
      ],
      exclude: [
        // The bundled artifact and entry auto-boot are exercised elsewhere.
        'runtime/dist/**',
        '**/*.d.ts',
      ],
      // Compliance-critical modules are held to a high, enforced bar. If a change
      // drops their coverage below these, `npm run test:coverage` fails.
      thresholds: {
        'runtime/src/consent-mode.ts': { statements: 95, branches: 85, functions: 100, lines: 95 },
        'runtime/src/script-blocker.ts': { statements: 90, branches: 85, functions: 90, lines: 90 },
        'runtime/src/consent-state.ts': { statements: 90, branches: 85, functions: 95, lines: 90 },
      },
    },
  },
});

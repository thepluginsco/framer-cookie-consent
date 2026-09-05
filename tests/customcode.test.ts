/**
 * Unit tests for the custom-code loader bridge (the plugin → published-site
 * boundary): the HTML the loader emits, and the marker-scoped splice logic that
 * inserts/replaces/removes ONLY our block without disturbing other custom code.
 *
 * `@framer/plugin` is mocked so importing the module graph never touches the
 * real (browser-only) Framer API — the functions under test are all pure.
 *
 * Run with `vitest run`.
 */

import { test, vi } from 'vitest';
import assert from 'node:assert/strict';

// Mocked before importing customCode (which transitively imports framer.ts).
vi.mock('@framer/plugin', () => ({ framer: {} }));

import { mergeConfig } from '@framer-cookie-consent/shared';
import {
  buildLoaderHtml,
  upsertBlock,
  stripBlock,
  MARKER_START,
  MARKER_END,
} from '../plugin/src/lib/customCode.ts';

const RUNTIME_URL = 'https://cdn.example.test/consent.min.js';

/* -------------------------------------------------------------------------- */
/* buildLoaderHtml                                                             */
/* -------------------------------------------------------------------------- */

test('buildLoaderHtml: wraps everything in the markers and embeds the config + runtime', () => {
  const html = buildLoaderHtml(mergeConfig(), { runtimeUrl: RUNTIME_URL });
  assert.ok(html.startsWith(MARKER_START));
  assert.ok(html.trimEnd().endsWith(MARKER_END));
  assert.ok(html.includes('window.__CC_CONFIG__='));
  assert.ok(html.includes(`<script src="${RUNTIME_URL}" defer></script>`));
});

test('buildLoaderHtml: includes the inline Consent Mode default when enabled', () => {
  const html = buildLoaderHtml(mergeConfig({ consentMode: { enableConsentMode: true } }), { runtimeUrl: RUNTIME_URL });
  assert.ok(html.includes("gtag('consent','default'"));
  assert.ok(html.includes('security_storage'));
});

test('buildLoaderHtml: omits the inline Consent Mode default when disabled', () => {
  const html = buildLoaderHtml(mergeConfig({ consentMode: { enableConsentMode: false } }), { runtimeUrl: RUNTIME_URL });
  assert.equal(html.includes("gtag('consent','default'"), false);
});

test('buildLoaderHtml: escapes < > & in the embedded config so it cannot break out of <script>', () => {
  const html = buildLoaderHtml(
    mergeConfig({ strings: { title: 'Hi </script><script>alert(1)</script> & more' } }),
    { runtimeUrl: RUNTIME_URL },
  );
  // Isolate the config literal (between the assignment and its closing tag).
  const marker = 'window.__CC_CONFIG__=';
  const start = html.indexOf(marker) + marker.length;
  const literal = html.slice(start, html.indexOf(';</script>', start));

  // No raw angle brackets / ampersands survive inside the embedded JSON.
  assert.equal(literal.includes('<'), false);
  assert.equal(literal.includes('>'), false);
  assert.equal(literal.includes('&'), false);
  // They are present as unicode escapes instead.
  assert.ok(literal.includes('\\u003c'));
  assert.ok(literal.includes('\\u003e'));
});

/* -------------------------------------------------------------------------- */
/* upsertBlock                                                                 */
/* -------------------------------------------------------------------------- */

test('upsertBlock: appends our block to unrelated existing custom code', () => {
  const existing = '<meta name="other-plugin" content="x">';
  const block = `${MARKER_START}\nBLOCK\n${MARKER_END}`;
  const out = upsertBlock(existing, block);
  assert.ok(out.includes(existing));
  assert.ok(out.includes(block));
});

test('upsertBlock: replaces our block in place, once, preserving surrounding code', () => {
  const before = '<!-- kept before -->';
  const after = '<!-- kept after -->';
  const v1 = `${MARKER_START}\nOLD\n${MARKER_END}`;
  const v2 = `${MARKER_START}\nNEW\n${MARKER_END}`;
  const existing = `${before}\n${v1}\n${after}`;

  const out = upsertBlock(existing, v2);
  assert.ok(out.includes('NEW'));
  assert.equal(out.includes('OLD'), false);
  assert.ok(out.includes(before));
  assert.ok(out.includes(after));
  // Exactly one block — no accumulation on repeated writes.
  assert.equal(out.split(MARKER_START).length - 1, 1);
});

test('upsertBlock: writing the same block twice is idempotent', () => {
  const block = `${MARKER_START}\nSAME\n${MARKER_END}`;
  const once = upsertBlock('', block);
  const twice = upsertBlock(once, block);
  assert.equal(once, twice);
});

/* -------------------------------------------------------------------------- */
/* stripBlock                                                                  */
/* -------------------------------------------------------------------------- */

test('stripBlock: removes our block but keeps other custom code', () => {
  const other = '<meta name="other" content="y">';
  const block = `${MARKER_START}\nBLOCK\n${MARKER_END}`;
  const existing = `${other}\n${block}`;
  const out = stripBlock(existing);
  assert.equal(out, other);
});

test('stripBlock: returns null when our block was the only content', () => {
  const block = `${MARKER_START}\nBLOCK\n${MARKER_END}`;
  assert.equal(stripBlock(block), null);
});

test('stripBlock: leaves unrelated code untouched when no block is present', () => {
  const other = '<meta name="other" content="z">';
  assert.equal(stripBlock(other), other);
});

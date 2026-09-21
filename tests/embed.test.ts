/**
 * Unit tests for the universal `<script>` EMBED builder (Phase 3.1) in
 * `@framer-cookie-consent/shared`: `buildEmbedSnippet` + `escapeForAttribute`.
 *
 * They prove the embed is the SAME engine as the Framer loader (byte-identical
 * `window.__CC_CONFIG__` script + Consent Mode default), just formatted for a
 * human paste target — plus the alternative single-tag `data-cc-config` form and
 * its round-trip through HTML-attribute escaping.
 *
 * Run with `vitest run`.
 */

import { test, expect } from 'vitest';
import assert from 'node:assert/strict';

import {
  mergeConfig,
  serialize,
  parse,
  buildEmbedSnippet,
  escapeForAttribute,
  escapeForScript,
  buildLoaderHtml,
  runtimeScriptUrl,
  RUNTIME_VERSION,
  MARKER_START,
  MARKER_END,
  type CookieConsentConfig,
} from '@framer-cookie-consent/shared';

/** A config with Consent Mode ON (the default) and one with it OFF. */
function configWith(consentMode: boolean): CookieConsentConfig {
  return mergeConfig({ consentMode: { enableConsentMode: consentMode } });
}

/** Reverse {@link escapeForAttribute} the way a browser decodes an attribute. */
function decodeAttribute(escaped: string): string {
  return escaped
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&'); // ampersand LAST so we never double-decode
}

/* -------------------------------------------------------------------------- */
/* window form (default)                                                       */
/* -------------------------------------------------------------------------- */

test('window form: emits the comment, inline config, consent default, and deferred runtime', () => {
  const config = configWith(true);
  const snippet = buildEmbedSnippet(config);

  // Friendly comment, but NOT the internal splice markers (this is copy-paste).
  assert.ok(snippet.includes('<!-- Consentful cookie consent'));
  assert.ok(!snippet.includes(MARKER_START));
  assert.ok(!snippet.includes(MARKER_END));

  // Config inlined on window, exactly as escaped for a <script> body.
  assert.ok(snippet.includes(`<script>window.__CC_CONFIG__=${escapeForScript(serialize(config))};</script>`));

  // Consent Mode default present (denied-by-default) before the runtime.
  assert.ok(snippet.includes("gtag('consent','default'"));

  // Version-pinned, deferred runtime tag.
  assert.ok(snippet.includes(`<script src="${runtimeScriptUrl()}" defer></script>`));
  assert.ok(snippet.includes(`@${RUNTIME_VERSION}/`));
});

test('window form: is the SAME engine as the Framer loader (identical config script)', () => {
  const config = configWith(true);
  const embed = buildEmbedSnippet(config);
  const loader = buildLoaderHtml(config);

  // The exact inline config <script> the loader injects also appears verbatim in
  // the embed — proof the two front-ends can never drift.
  const configScript = `<script>window.__CC_CONFIG__=${escapeForScript(serialize(config))};</script>`;
  assert.ok(loader.includes(configScript));
  assert.ok(embed.includes(configScript));
});

test('window form: consent default is omitted when Consent Mode is disabled', () => {
  const snippet = buildEmbedSnippet(configWith(false));
  assert.ok(!snippet.includes("gtag('consent','default'"));
  // Runtime + config are still present.
  assert.ok(snippet.includes('window.__CC_CONFIG__='));
  assert.ok(snippet.includes('defer></script>'));
});

test('comment:false omits the leading comment', () => {
  const snippet = buildEmbedSnippet(configWith(true), { comment: false });
  assert.ok(!snippet.includes('<!-- Consentful'));
  assert.ok(snippet.startsWith('<script>window.__CC_CONFIG__='));
});

test('runtimeUrl override is honoured', () => {
  const url = 'https://example.test/consent.min.js';
  const snippet = buildEmbedSnippet(configWith(true), { runtimeUrl: url });
  assert.ok(snippet.includes(`<script src="${url}" defer></script>`));
  assert.ok(!snippet.includes('cdn.jsdelivr.net'));
});

/* -------------------------------------------------------------------------- */
/* attribute form                                                              */
/* -------------------------------------------------------------------------- */

test('attribute form: single runtime tag carries data-cc-config, no window global', () => {
  const config = configWith(true);
  const snippet = buildEmbedSnippet(config, { form: 'attribute' });

  assert.ok(!snippet.includes('window.__CC_CONFIG__'));
  assert.ok(snippet.includes('data-cc-config="'));
  assert.ok(snippet.includes(`<script src="${runtimeScriptUrl()}" data-cc-config=`));
  // Consent default still inlined for pre-runtime denial.
  assert.ok(snippet.includes("gtag('consent','default'"));
});

test('attribute form: the data-cc-config value round-trips back to the config', () => {
  const config = configWith(true);
  const snippet = buildEmbedSnippet(config, { form: 'attribute' });

  const match = snippet.match(/data-cc-config="([^"]*)"/);
  assert.ok(match, 'expected a data-cc-config attribute');
  const decoded = decodeAttribute(match![1]);
  // Decoded attribute is the exact serialized JSON, and parses to the same config.
  assert.equal(decoded, serialize(config));
  assert.deepEqual(parse(decoded), config);
});

/* -------------------------------------------------------------------------- */
/* escapeForAttribute                                                          */
/* -------------------------------------------------------------------------- */

test('escapeForAttribute: escapes &, ", < and > (ampersand first)', () => {
  assert.equal(escapeForAttribute('a & b'), 'a &amp; b');
  assert.equal(escapeForAttribute('say "hi"'), 'say &quot;hi&quot;');
  assert.equal(escapeForAttribute('<x>'), '&lt;x&gt;');
  // A pre-existing entity is not double-escaped into a wrong shape: & → &amp; only.
  assert.equal(escapeForAttribute('&quot;'), '&amp;quot;');
});

test('escapeForAttribute: a policy URL with a closing tag cannot break the attribute', () => {
  const json = JSON.stringify({ url: 'https://x.example/"></script><b>' });
  const escaped = escapeForAttribute(json);
  assert.ok(!escaped.includes('"'));
  assert.ok(!escaped.includes('<'));
  assert.ok(!escaped.includes('>'));
  // And it decodes back to the original JSON.
  assert.equal(decodeAttribute(escaped), json);
});

/**
 * Embed blocking: third-party iframes are parked behind a click-to-load
 * placeholder until their category is granted (or the visitor loads one).
 */

import { test, beforeEach, afterEach, expect } from 'vitest';
import { JSDOM } from 'jsdom';

import { mergeConfig } from '@framer-cookie-consent/shared';
import { emitConsentChange, type ConsentState } from '../runtime/src/consent-state.ts';
import { embedProvider, installEmbedBlocker, placeholderHtml, type EmbedBlocker } from '../runtime/src/embed-blocker.ts';

const g = globalThis as Record<string, unknown>;
let dom: InstanceType<typeof JSDOM>;
let blocker: EmbedBlocker | null = null;

beforeEach(() => {
  dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { url: 'https://example.com/' });
  const w = dom.window;
  g.window = w;
  g.document = w.document;
  g.MutationObserver = w.MutationObserver;
  g.Node = w.Node;
  g.localStorage = w.localStorage;
});

afterEach(() => {
  blocker?.disconnect();
  blocker = null;
  dom.window.close();
  for (const k of ['window', 'document', 'MutationObserver', 'Node', 'localStorage']) delete g[k];
});

const on = mergeConfig({ behavior: { blockEmbeds: true } });
const off = mergeConfig();

function granting(...ids: string[]): ConsentState {
  const categories: Record<string, boolean> = {};
  for (const c of on.categories) categories[c.id] = ids.includes(c.id);
  return { version: on.behavior.reconsentVersion, timestamp: 1, categories };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function iframe(src: string): HTMLIFrameElement {
  const f = dom.window.document.createElement('iframe');
  f.setAttribute('src', src);
  dom.window.document.body.appendChild(f);
  return f;
}

test('recognises the common embed providers, not ordinary iframes', () => {
  expect(embedProvider('https://www.youtube.com/embed/abc')).toBe('YouTube');
  expect(embedProvider('https://www.youtube-nocookie.com/embed/abc')).toBe('YouTube');
  expect(embedProvider('https://player.vimeo.com/video/1')).toBe('Vimeo');
  expect(embedProvider('https://www.tiktok.com/embed/v2/123')).toBe('TikTok');
  expect(embedProvider('https://www.instagram.com/p/xyz/embed')).toBe('Instagram');
  expect(embedProvider('https://open.spotify.com/embed/track/1')).toBe('Spotify');
  expect(embedProvider('https://www.google.com/maps/embed?pb=1')).toBe('Google Maps');
  expect(embedProvider('//platform.twitter.com/embed/Tweet.html')).toBe('X');
  expect(embedProvider('https://example.com/widget')).toBeNull();
  expect(embedProvider('https://www.youtube.com/watch?v=1')).toBeNull();
});

test('parks a detected embed behind a placeholder until consent', async () => {
  const f = iframe('https://www.youtube.com/embed/abc');
  blocker = installEmbedBlocker(on);
  expect(f.hasAttribute('src')).toBe(false);
  expect(f.getAttribute('data-cc-src')).toBe('https://www.youtube.com/embed/abc');
  expect(f.getAttribute('data-cc-category')).toBe('marketing');
  expect(f.getAttribute('srcdoc')).toContain('YouTube');
  expect(f.getAttribute('srcdoc')).toContain('Load content');

  emitConsentChange(granting('analytics'));
  expect(f.hasAttribute('src')).toBe(false);

  emitConsentChange(granting('marketing'));
  expect(f.getAttribute('src')).toBe('https://www.youtube.com/embed/abc');
  expect(f.hasAttribute('srcdoc')).toBe(false);
  await flush();
  expect(f.getAttribute('src')).toBe('https://www.youtube.com/embed/abc');
});

test('gates embeds added later, and re-pointed ones', async () => {
  blocker = installEmbedBlocker(on);
  const f = iframe('https://player.vimeo.com/video/1');
  await flush();
  expect(f.hasAttribute('src')).toBe(false);
  expect(f.getAttribute('srcdoc')).toContain('Vimeo');

  // A framework re-setting src on a blocked embed is parked again.
  f.setAttribute('src', 'https://player.vimeo.com/video/2');
  await flush();
  expect(f.hasAttribute('src')).toBe(false);
  expect(f.getAttribute('data-cc-src')).toBe('https://player.vimeo.com/video/2');
});

test('leaves embeds alone when blocking is off, and ordinary iframes always', async () => {
  blocker = installEmbedBlocker(off);
  const yt = iframe('https://www.youtube.com/embed/abc');
  await flush();
  expect(yt.getAttribute('src')).toBe('https://www.youtube.com/embed/abc');
  blocker.disconnect();

  blocker = installEmbedBlocker(on);
  const other = iframe('https://example.com/widget');
  await flush();
  expect(other.getAttribute('src')).toBe('https://example.com/widget');
});

test('honours marked-up iframes even with automatic blocking off', () => {
  const d = dom.window.document;
  const f = d.createElement('iframe');
  f.setAttribute('data-cc-src', 'https://maps.example.com/embed');
  f.setAttribute('data-cc-category', 'preferences');
  d.body.appendChild(f);
  blocker = installEmbedBlocker(off);
  expect(f.getAttribute('srcdoc')).toContain('maps.example.com');
  emitConsentChange(granting('preferences'));
  expect(f.getAttribute('src')).toBe('https://maps.example.com/embed');
});

test('does not block when the category is already granted', () => {
  emitConsentChange(granting('marketing'));
  const f = iframe('https://www.youtube.com/embed/abc');
  blocker = installEmbedBlocker(on);
  emitConsentChange(granting('marketing'));
  expect(f.getAttribute('src')).toBe('https://www.youtube.com/embed/abc');
});

test('uses the configured category and localized copy', () => {
  const cfg = mergeConfig({ behavior: { blockEmbeds: true, embedCategory: 'analytics' } });
  const f = iframe('https://open.spotify.com/embed/track/1');
  blocker = installEmbedBlocker(cfg);
  expect(f.getAttribute('data-cc-category')).toBe('analytics');
  blocker.setStrings({ embedBlocked: 'Contenu de {service}.', embedLoad: 'Charger' });
  expect(f.getAttribute('srcdoc')).toContain('Contenu de Spotify.');
  expect(f.getAttribute('srcdoc')).toContain('Charger');
});

test('placeholder escapes text and rejects a non-colour accent', () => {
  const html = placeholderHtml('<img src=x onerror=alert(1)>', '"go"', 'red;}body{x:y');
  expect(html).not.toContain('<img');
  expect(html).toContain('&#60;img');
  expect(html).toContain('#4b23d3');
  expect(html).not.toContain('red;}');
});

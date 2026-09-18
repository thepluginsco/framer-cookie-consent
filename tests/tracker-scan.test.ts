/**
 * Unit tests for the design-time tracker scanner (Phase 1.3).
 *
 * The engine is pure (`detectTrackers(html)`), so these tests feed it hand-built
 * HTML fragments — the same shapes vendors ship — and assert what it proposes:
 * which tracker, under which consent category, with which extracted tag id, and
 * as a `src` vs `inline` managed script. Run with `vitest run`.
 *
 * Required coverage:
 * - external `<script src>` detection (GA4, GTM) with tag-id extraction;
 * - inline-only detection (Meta Pixel, LinkedIn) → canonical loader URL;
 * - pixel-in-markup detection (facebook.com/tr noscript);
 * - correct category + Consent Mode signal mapping;
 * - dedupe (one proposal per vendor even when loaded twice);
 * - a clean page and empty input yield nothing.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  detectTrackers,
  TRACKER_CATALOG,
  TRACKER_CATEGORY_SIGNALS,
  type DetectedTracker,
} from '@framer-cookie-consent/shared';

/** Find the single proposal for a catalog id (asserts exactly one exists). */
function one(list: DetectedTracker[], id: string): DetectedTracker {
  const hits = list.filter((d) => d.id === id);
  assert.equal(hits.length, 1, `expected exactly one "${id}", got ${hits.length}`);
  return hits[0]!;
}

test('GA4 via gtag <script src> is detected, categorised analytics, tag id extracted', () => {
  const html = `
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-ABC123XYZ');
    </script>`;
  const d = one(detectTrackers(html), 'ga4');
  assert.equal(d.category, 'analytics');
  assert.deepEqual(d.signals, TRACKER_CATEGORY_SIGNALS.analytics);
  assert.equal(d.type, 'src');
  assert.equal(d.tagId, 'G-ABC123XYZ');
  assert.match(d.value, /googletagmanager\.com\/gtag\/js/);
});

test('GTM container is detected with its GTM- id', () => {
  const html = `<script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-ABCD12');</script>`;
  const d = one(detectTrackers(html), 'gtm');
  assert.equal(d.tagId, 'GTM-ABCD12');
  assert.equal(d.type, 'src'); // inline-only match falls back to canonical loader
  assert.match(d.value, /gtm\.js\?id=GTM-ABCD12/);
});

test('Meta Pixel inline snippet → marketing, canonical fbevents loader, numeric id', () => {
  const html = `
    <script>
      !function(f,b,e,v,n,t,s){}(window, document,'script');
      fbq('init', '123456789012345');
      fbq('track', 'PageView');
    </script>`;
  const d = one(detectTrackers(html), 'meta-pixel');
  assert.equal(d.category, 'marketing');
  assert.deepEqual(d.signals, TRACKER_CATEGORY_SIGNALS.marketing);
  assert.equal(d.type, 'src');
  assert.equal(d.value, 'https://connect.facebook.net/en_US/fbevents.js');
  assert.equal(d.tagId, '123456789012345');
});

test('Meta Pixel is detected from its <noscript> tracking pixel alone', () => {
  const html = `<noscript><img height="1" width="1" src="https://www.facebook.com/tr?id=998877665544332&ev=PageView"/></noscript>`;
  const d = one(detectTrackers(html), 'meta-pixel');
  assert.equal(d.tagId, '998877665544332');
});

test('LinkedIn Insight Tag inline → marketing with partner id', () => {
  const html = `<script>_linkedin_partner_id = "1234567"; window._linkedin_data_partner_ids = [];</script>`;
  const d = one(detectTrackers(html), 'linkedin-insight');
  assert.equal(d.category, 'marketing');
  assert.equal(d.tagId, '1234567');
  assert.match(d.value, /snap\.licdn\.com/);
});

test('Hotjar loader URL embeds the extracted hjid', () => {
  const html = `<script>(function(h,o,t,j,a,r){h.hj=h.hj||function(){};h._hjSettings={hjid:2599999,hjsv:6};})();</script>`;
  const d = one(detectTrackers(html), 'hotjar');
  assert.equal(d.tagId, '2599999');
  assert.match(d.value, /hotjar-2599999\.js/);
});

test('Plausible src is detected and data-domain captured as the id', () => {
  const html = `<script defer data-domain="example.com" src="https://plausible.io/js/script.js"></script>`;
  const d = one(detectTrackers(html), 'plausible');
  assert.equal(d.type, 'src');
  assert.equal(d.tagId, 'example.com');
});

test('a page loading GA4 twice yields a single deduped proposal', () => {
  const html = `
    <script src="https://www.googletagmanager.com/gtag/js?id=G-DUPLICATE1"></script>
    <script src="https://www.googletagmanager.com/gtag/js?id=G-DUPLICATE1"></script>`;
  assert.equal(detectTrackers(html).filter((d) => d.id === 'ga4').length, 1);
});

test('a mixed real-world page detects each distinct vendor once', () => {
  const html = `
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-REALPAGE1"></script>
    <script>fbq('init','111111111111111');</script>
    <script>_linkedin_partner_id="9090909";</script>
    <script async src="https://static.hotjar.com/c/hotjar-3030303.js?sv=6"></script>`;
  const ids = detectTrackers(html).map((d) => d.id).sort();
  assert.deepEqual(ids, ['ga4', 'hotjar', 'linkedin-insight', 'meta-pixel']);
});

test('a clean page and empty input detect nothing', () => {
  const clean = `<html><head><title>Hi</title></head><body><h1>No trackers here</h1>
    <script>console.log('hello');</script></body></html>`;
  assert.deepEqual(detectTrackers(clean), []);
  assert.deepEqual(detectTrackers(''), []);
});

test('every catalog entry has a category with a defined signal set', () => {
  for (const sig of TRACKER_CATALOG) {
    assert.ok(TRACKER_CATEGORY_SIGNALS[sig.category], `no signals for ${sig.id}`);
    assert.ok(sig.srcHosts.length > 0 || (sig.inlinePatterns?.length ?? 0) > 0, `${sig.id} has no matchers`);
  }
});

test('catalog ids are unique', () => {
  const ids = TRACKER_CATALOG.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

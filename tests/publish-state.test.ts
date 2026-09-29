/**
 * Unit tests for the editor's publish-state tracker
 * (`shared-ui/src/publish-state.ts`) — the logic behind the header's
 * "Unpublished changes" / "Runtime update available" pill on publish-button
 * hosts (WordPress, Webflow, Wix).
 *
 * Run with `vitest run`.
 */

import { test, expect } from 'vitest';

import { mergeConfig } from '../shared/src/config-schema.ts';
import {
  markPublished,
  markUnpublished,
  publishFingerprint,
  setPublishedSnapshot,
  getPublishState,
} from '../shared-ui/src/publish-state.ts';

const base = mergeConfig();

test('the fingerprint ignores license fields and key order', () => {
  const licensed = { ...base, license: { ...base.license, key: 'CNSNT-1', tier: 'pro' as const } };
  expect(publishFingerprint(licensed)).toBe(publishFingerprint(base));
  const reordered = Object.fromEntries(Object.entries(base).reverse()) as typeof base;
  expect(publishFingerprint(reordered)).toBe(publishFingerprint(base));
});

test("clean / changed / never / outdated against what is live", () => {
  const edited = { ...base, banner: { ...base.banner, layout: "modal" as const } };

  setPublishedSnapshot({ config: base });
  expect(getPublishState(base)).toEqual({ known: true, dirty: false, diff: "none" });
  expect(getPublishState(edited).diff).toBe("changes");

  markPublished(edited);
  expect(getPublishState(edited).dirty).toBe(false);

  setPublishedSnapshot({ config: edited, outdated: true });
  expect(getPublishState(edited).diff).toBe("outdated");

  markPublished(edited);
  expect(getPublishState(edited).diff).toBe("none");

  markUnpublished();
  expect(getPublishState(edited).diff).toBe("never");
});

test("unknown state never claims unpublished changes", () => {
  expect(getPublishState(base, { published: undefined, outdated: false })).toEqual({ known: false, dirty: false, diff: "none" });
});

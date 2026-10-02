/**
 * The runtime loads from a pinned CDN URL with a Subresource Integrity hash, so
 * the browser rejects the file if it ever differs from the build we shipped.
 * These tests keep the hash, the pinned tag and the built bundle in step.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  RUNTIME_INTEGRITY,
  RUNTIME_VERSION,
  buildLoaderHtml,
  mergeConfig,
  runtimeScriptTag,
  runtimeScriptUrl,
} from "../shared/src/index.js";

describe("runtime integrity", () => {
  it("matches the built runtime bundle (update it with every RUNTIME_VERSION bump)", () => {
    const bundle = readFileSync(fileURLToPath(new URL("../runtime/dist/consent.min.js", import.meta.url)));
    const expected = `sha384-${createHash("sha384").update(bundle).digest("base64")}`;
    expect(RUNTIME_INTEGRITY, `runtime/dist changed without a new ${RUNTIME_VERSION} hash`).toBe(expected);
  });

  it("the pinned script tag carries the hash and crossorigin", () => {
    expect(runtimeScriptTag()).toBe(
      `<script src="${runtimeScriptUrl()}" integrity="${RUNTIME_INTEGRITY}" crossorigin="anonymous" defer></script>`,
    );
  });

  it("a custom runtime URL gets a plain tag (its bytes aren't ours to vouch for)", () => {
    expect(runtimeScriptTag("https://example.com/consent.js")).toBe(
      `<script src="https://example.com/consent.js" defer></script>`,
    );
  });

  it("the Framer/WordPress loader publishes the integrity-protected tag", () => {
    expect(buildLoaderHtml(mergeConfig())).toContain(runtimeScriptTag());
  });
});

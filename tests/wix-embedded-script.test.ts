/**
 * The committed `apps/wix-app/embedded-script.html` is what gets pasted into the
 * Wix app's Embedded Script extension. It must stay byte-identical to the shared
 * builder's output for our Worker — and must not pin a runtime version (the
 * Worker's /runtime.js redirect does), so runtime releases never require
 * editing the Wix app.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildWixBootstrapScript, RUNTIME_VERSION } from "@framer-cookie-consent/shared";

const WORKER = "https://consentful-wix.thepluginsco.workers.dev";

describe("Wix embedded script", () => {
  const committed = readFileSync(
    fileURLToPath(new URL("../apps/wix-app/embedded-script.html", import.meta.url)),
    "utf8",
  );

  it("matches the shared bootstrap builder for our Worker", () => {
    expect(committed).toBe(
      buildWixBootstrapScript({
        configBaseUrl: WORKER,
        bridgeUrl: `${WORKER}/consentful-wix-bridge.js`,
        runtimeUrl: `${WORKER}/runtime.js`,
      }),
    );
  });

  it("uses the {{siteId}} dynamic parameter and no pinned runtime version", () => {
    expect(committed).toContain('"{{siteId}}"');
    expect(committed).not.toContain(RUNTIME_VERSION);
  });

  it("doesn't boot the runtime when the config fetch fails", () => {
    expect(committed).toContain("if(!r.ok)throw r;");
  });
});

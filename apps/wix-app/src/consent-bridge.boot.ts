/**
 * Bundled entry for the published-site consent-bridge asset.
 *
 * esbuild bundles this (with the shared {@link mapToWixConsent} tree-shaken in)
 * into `dist/consentful-wix-bridge.js`, which the Wix bootstrap loads deferred
 * (when its `bridgeUrl` is set). All logic lives in {@link ./consent-bridge};
 * this file just boots it against the real window.
 */

import { startConsentBridge } from "./consent-bridge.js";

startConsentBridge();

/**
 * Bundled entry for the storefront consent-bridge asset.
 *
 * esbuild bundles this (with the shared {@link mapToShopifyConsent} tree-shaken
 * in) into `extension/assets/consentful-consent-bridge.js`, which the app-embed
 * block loads deferred. All logic lives in {@link ./consent-bridge}; this file
 * just boots it against the real window.
 */

import { startConsentBridge } from "./consent-bridge.js";

startConsentBridge();

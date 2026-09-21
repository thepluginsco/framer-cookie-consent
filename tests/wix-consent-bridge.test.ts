/**
 * Tests for the Wix published-site consent bridge (Phase 3.5 App shell).
 *
 * The bridge relays each of our banner decisions into Wix's Consent Policy. These
 * tests drive its pure pieces + wiring against a fake window: extract granted ids,
 * map through the shared `mapToWixConsent`, wait for a late-loading
 * `consentPolicyManager`, relay the boot state, and relay every
 * `cookieconsent:change`.
 */

import { describe, expect, it, vi } from "vitest";
import { mergeConfig } from "@framer-cookie-consent/shared";
import {
  grantedCategoryIds,
  relayConsent,
  resolveConfig,
  startConsentBridge,
  whenConsentManagerReady,
  type BridgeWindow,
  type WixConsentManager,
} from "../apps/wix-app/src/consent-bridge.js";

describe("grantedCategoryIds", () => {
  it("returns only the granted category ids", () => {
    expect(
      grantedCategoryIds({ categories: { necessary: true, analytics: true, marketing: false } }),
    ).toEqual(["necessary", "analytics"]);
  });

  it("returns [] for null / missing categories", () => {
    expect(grantedCategoryIds(null)).toEqual([]);
    expect(grantedCategoryIds(undefined)).toEqual([]);
    expect(grantedCategoryIds({})).toEqual([]);
  });
});

describe("resolveConfig", () => {
  it("merges __CC_CONFIG__ through the shared mergeConfig (categories carry signals)", () => {
    const config = resolveConfig({ __CC_CONFIG__: {} });
    const analytics = config.categories.find((c) => c.id === "analytics");
    expect(analytics?.signals).toContain("analytics_storage");
  });
});

describe("relayConsent", () => {
  it("calls setConsentPolicy with the mapped five-bucket payload", () => {
    const config = mergeConfig();
    const setConsentPolicy = vi.fn();
    const manager: WixConsentManager = { setConsentPolicy };

    const out = relayConsent(manager, config, { categories: { necessary: true, analytics: true } });

    expect(out.essential).toBe(true);
    expect(out.analytics).toBe(true);
    expect(out.advertising).toBe(false);
    expect(setConsentPolicy).toHaveBeenCalledTimes(1);
    expect(setConsentPolicy).toHaveBeenCalledWith(out);
  });

  it("grants only essential when there is no decision yet", () => {
    const setConsentPolicy = vi.fn();
    const out = relayConsent({ setConsentPolicy }, mergeConfig(), null);
    expect(out).toEqual({
      essential: true, functional: false, analytics: false, advertising: false, dataToThirdParty: false,
    });
  });
});

describe("whenConsentManagerReady", () => {
  it("invokes onReady immediately when the manager is already present", () => {
    const manager: WixConsentManager = { setConsentPolicy: vi.fn() };
    const win: BridgeWindow = { consentPolicyManager: manager };
    const onReady = vi.fn();
    whenConsentManagerReady(win, onReady);
    expect(onReady).toHaveBeenCalledWith(manager);
  });

  it("polls via setTimeout until the manager appears", () => {
    const manager: WixConsentManager = { setConsentPolicy: vi.fn() };
    const pending: Array<() => void> = [];
    const win: BridgeWindow = {
      setTimeout: (handler: () => void) => {
        pending.push(handler);
        return 0;
      },
    };
    const onReady = vi.fn();
    whenConsentManagerReady(win, onReady);
    expect(onReady).not.toHaveBeenCalled();

    // Wix finishes loading, then the next scheduled poll fires.
    win.consentPolicyManager = manager;
    pending.shift()!();
    expect(onReady).toHaveBeenCalledWith(manager);
  });
});

describe("startConsentBridge", () => {
  it("relays the boot state and subscribes to cookieconsent:change", () => {
    const setConsentPolicy = vi.fn();
    let changeHandler: ((event: Event) => void) | undefined;

    const win: BridgeWindow = {
      __CC_CONFIG__: {},
      consentPolicyManager: { setConsentPolicy },
      CookieConsent: { getState: () => ({ categories: { necessary: true, analytics: true } }) },
      addEventListener: (type, listener) => {
        if (type === "cookieconsent:change") changeHandler = listener;
      },
    };

    startConsentBridge(win);

    // Boot: relayed the existing decision (analytics granted).
    expect(setConsentPolicy).toHaveBeenCalledTimes(1);
    expect(setConsentPolicy.mock.calls[0]![0]).toMatchObject({ analytics: true });
    expect(changeHandler).toBeTypeOf("function");

    // A later decision (marketing granted) flows through.
    changeHandler!({ detail: { categories: { necessary: true, marketing: true } } } as unknown as Event);
    expect(setConsentPolicy).toHaveBeenCalledTimes(2);
    expect(setConsentPolicy.mock.calls[1]![0]).toMatchObject({ advertising: true, dataToThirdParty: true });
  });
});

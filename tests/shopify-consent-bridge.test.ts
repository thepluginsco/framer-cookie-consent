/**
 * Tests for the Shopify storefront consent bridge (Phase 3.4 App shell).
 *
 * The bridge relays each of our banner decisions into Shopify's Customer Privacy
 * API. These tests drive its pure pieces + wiring against a fake window: extract
 * granted ids, map through the shared `mapToShopifyConsent`, wait for a
 * late-loading `customerPrivacy`, relay the boot state, and relay every
 * `cookieconsent:change`.
 */

import { describe, expect, it, vi } from "vitest";
import { mergeConfig } from "@framer-cookie-consent/shared";
import {
  grantedCategoryIds,
  relayConsent,
  resolveConfig,
  startConsentBridge,
  whenCustomerPrivacyReady,
  type BridgeWindow,
  type ShopifyCustomerPrivacy,
} from "../apps/shopify-app/src/consent-bridge.js";

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
  it("calls setTrackingConsent with the mapped payload", () => {
    const config = mergeConfig();
    const setTrackingConsent = vi.fn();
    const cp: ShopifyCustomerPrivacy = { setTrackingConsent };

    const out = relayConsent(cp, config, { categories: { necessary: true, analytics: true } });

    expect(out.analytics).toBe(true);
    expect(out.marketing).toBe(false);
    expect(setTrackingConsent).toHaveBeenCalledTimes(1);
    expect(setTrackingConsent).toHaveBeenCalledWith(out);
  });

  it("denies everything when there is no decision yet", () => {
    const setTrackingConsent = vi.fn();
    const out = relayConsent({ setTrackingConsent }, mergeConfig(), null);
    expect(out).toEqual({ analytics: false, marketing: false, preferences: false, sale_of_data: false });
  });
});

describe("whenCustomerPrivacyReady", () => {
  it("invokes onReady immediately when customerPrivacy is already present", () => {
    const cp: ShopifyCustomerPrivacy = { setTrackingConsent: vi.fn() };
    const win: BridgeWindow = { Shopify: { customerPrivacy: cp } };
    const onReady = vi.fn();
    whenCustomerPrivacyReady(win, onReady);
    expect(onReady).toHaveBeenCalledWith(cp);
  });

  it("polls via setTimeout until customerPrivacy appears", () => {
    const cp: ShopifyCustomerPrivacy = { setTrackingConsent: vi.fn() };
    const pending: Array<() => void> = [];
    const win: BridgeWindow = {
      Shopify: {},
      setTimeout: (handler: () => void) => {
        pending.push(handler);
        return 0;
      },
    };
    const onReady = vi.fn();
    whenCustomerPrivacyReady(win, onReady);
    expect(onReady).not.toHaveBeenCalled();

    // Shopify finishes loading, then the next scheduled poll fires.
    win.Shopify!.customerPrivacy = cp;
    pending.shift()!();
    expect(onReady).toHaveBeenCalledWith(cp);
  });
});

describe("startConsentBridge", () => {
  it("relays the boot state and subscribes to cookieconsent:change", () => {
    const setTrackingConsent = vi.fn();
    let changeHandler: ((event: Event) => void) | undefined;

    const win: BridgeWindow = {
      __CC_CONFIG__: {},
      Shopify: { customerPrivacy: { setTrackingConsent } },
      CookieConsent: { getState: () => ({ categories: { necessary: true, analytics: true } }) },
      addEventListener: (type, listener) => {
        if (type === "cookieconsent:change") changeHandler = listener;
      },
    };

    startConsentBridge(win);

    // Boot: relayed the existing decision (analytics granted).
    expect(setTrackingConsent).toHaveBeenCalledTimes(1);
    expect(setTrackingConsent.mock.calls[0]![0]).toMatchObject({ analytics: true });
    expect(changeHandler).toBeTypeOf("function");

    // A later decision (marketing granted) flows through.
    changeHandler!({ detail: { categories: { necessary: true, marketing: true } } } as unknown as Event);
    expect(setTrackingConsent).toHaveBeenCalledTimes(2);
    expect(setTrackingConsent.mock.calls[1]![0]).toMatchObject({ marketing: true, sale_of_data: true });
  });
});

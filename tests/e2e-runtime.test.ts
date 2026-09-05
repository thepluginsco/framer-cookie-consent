/**
 * End-to-end-ish runtime tests.
 *
 * These exercise the WHOLE runtime wired together the way `runtime/src/index.ts`
 * boots it — Consent Mode defaults → imperative API → script blocker → geo-gated
 * banner — against a real jsdom DOM with `runScripts: 'dangerously'`, so a tagged
 * tracker genuinely EXECUTES (or genuinely doesn't). That is the only honest way
 * to prove a compliance tool: we watch whether trackers actually run, not whether
 * the markup merely looks blocked.
 *
 * Each test boots a FRESH copy of the runtime modules (via `vi.resetModules()` +
 * dynamic import) so module-level singletons — Consent Mode's `defaultsSet`, the
 * consent-state listener registry — never leak between scenarios. The boot
 * ordering below is kept identical to `boot()` in index.ts; if that order ever
 * changes, these tests should change with it.
 *
 * Run with `vitest run`.
 */

import { test, describe, beforeEach, afterEach, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import { mergeConfig, type CookieConsentConfig } from '@framer-cookie-consent/shared';
import { checkThemeContrast, contrastRatio, derivePalette, AA_TEXT_CONTRAST } from '../runtime/src/styles.ts';
import type { RegionInfo } from '../runtime/src/geo.ts';
import type { ConsentState } from '../runtime/src/consent-state.ts';

/* -------------------------------------------------------------------------- */
/* jsdom harness                                                              */
/* -------------------------------------------------------------------------- */

let dom: InstanceType<typeof JSDOM>;
const g = globalThis as Record<string, unknown>;

/** Fresh jsdom + the globals the runtime reads. `url` sets the origin. */
function setupDom(url = 'https://acme.com/'): void {
  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'dangerously',
    url,
  });
  const w = dom.window;
  // Trackers report execution by flipping flags on window.__ran.
  (w as unknown as Record<string, unknown>).__ran = {};
  g.window = w;
  g.document = w.document;
  g.localStorage = w.localStorage;
  g.MutationObserver = w.MutationObserver;
  for (const name of [
    'Event',
    'CustomEvent',
    'KeyboardEvent',
    'MouseEvent',
    'Node',
    'HTMLElement',
    'HTMLAnchorElement',
    'HTMLInputElement',
    'HTMLButtonElement',
    'HTMLStyleElement',
    'HTMLScriptElement',
  ]) {
    g[name] = (w as unknown as Record<string, unknown>)[name];
  }
}

afterEach(() => {
  if (dom) dom.window.close();
  for (const k of [
    'window',
    'document',
    'localStorage',
    'MutationObserver',
    'Event',
    'CustomEvent',
    'KeyboardEvent',
    'MouseEvent',
    'Node',
    'HTMLElement',
    'HTMLAnchorElement',
    'HTMLInputElement',
    'HTMLButtonElement',
    'HTMLStyleElement',
    'HTMLScriptElement',
  ]) {
    delete g[k];
  }
});

/* -------------------------------------------------------------------------- */
/* Fresh-module loader + boot mirror                                          */
/* -------------------------------------------------------------------------- */

type RuntimeModules = {
  consentState: typeof import('../runtime/src/consent-state.ts');
  consentMode: typeof import('../runtime/src/consent-mode.ts');
  scriptBlocker: typeof import('../runtime/src/script-blocker.ts');
  geo: typeof import('../runtime/src/geo.ts');
  banner: typeof import('../runtime/src/banner.ts');
  licenseGate: typeof import('../runtime/src/license-gate.ts');
};

/** Load a pristine copy of every runtime module (resets all module singletons). */
async function loadRuntime(): Promise<RuntimeModules> {
  vi.resetModules();
  const [consentState, consentMode, scriptBlocker, geo, banner, licenseGate] = await Promise.all([
    import('../runtime/src/consent-state.ts'),
    import('../runtime/src/consent-mode.ts'),
    import('../runtime/src/script-blocker.ts'),
    import('../runtime/src/geo.ts'),
    import('../runtime/src/banner.ts'),
    import('../runtime/src/license-gate.ts'),
  ]);
  return { consentState, consentMode, scriptBlocker, geo, banner, licenseGate };
}

/**
 * Boot the runtime exactly as `index.ts` does, but with an injectable region /
 * Do-Not-Track so region gating is deterministic (no reliance on the test host's
 * real time zone). Returns the live handles for assertions.
 */
function boot(
  mods: RuntimeModules,
  config: CookieConsentConfig,
  opts: { region?: RegionInfo; doNotTrack?: boolean } = {},
) {
  const { installConsentApi, readConsent, onConsentChange } = mods.consentState;
  const { bootstrapConsentDefaults, updateConsent } = mods.consentMode;
  const { installScriptBlocker } = mods.scriptBlocker;
  const { shouldShowBanner } = mods.geo;
  const { mountBanner } = mods.banner;
  const { isLicensed, resolveBannerConfig } = mods.licenseGate;

  const licensed = isLicensed(config);
  bootstrapConsentDefaults(config);
  onConsentChange((state) => updateConsent(config, state));
  const api = installConsentApi(config);
  const blocker = installScriptBlocker(config);
  const bannerConfig = resolveBannerConfig(config);
  const state = readConsent(config);
  const autoShow = shouldShowBanner(config, state, opts.region, opts.doNotTrack);
  const controller = mountBanner(bannerConfig, { api, autoShow });
  return { api, blocker, controller, licensed, bannerConfig };
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Region fixtures (bypass time-zone heuristics for determinism). */
const EU: RegionInfo = { region: 'DE', isEU: true, isUK: false, isCalifornia: false, certain: true };
const NON_EU: RegionInfo = { region: 'US', isEU: false, isUK: false, isCalifornia: false, certain: true };

/** Every dataLayer entry, normalised to a plain array. */
function gtagCalls(): unknown[][] {
  const dl = (g.window as { dataLayer?: unknown[] }).dataLayer ?? [];
  return dl.map((a) => Array.from(a as ArrayLike<unknown>));
}

/** The args object of the first `gtag(command, verb, {...})` push, if any. */
function findGtag(command: string, verb: string): Record<string, unknown> | undefined {
  const hit = [...gtagCalls()].reverse().find((c) => c[0] === command && c[1] === verb);
  return hit ? (hit[2] as Record<string, unknown>) : undefined;
}

/** Insert an inert `text/plain` placeholder that flips `__ran[flag]` if it runs. */
function addPlaceholder(category: string, flag: string): HTMLScriptElement {
  const d = dom.window.document;
  const s = d.createElement('script');
  s.type = 'text/plain';
  s.setAttribute('data-cc-category', category);
  s.text = `window.__ran[${JSON.stringify(flag)}] = true;`;
  d.body.appendChild(s);
  return s;
}

/** Did a tracker execute? */
function ran(flag: string): boolean {
  return (dom.window as unknown as { __ran: Record<string, boolean> }).__ran[flag] === true;
}

/** Is the consent banner element currently visible? */
function bannerVisible(root: HTMLElement): boolean {
  const banner = root.querySelector('.cc-banner') as HTMLElement | null;
  return !!banner && banner.hidden === false;
}

/** Let jsdom's MutationObserver callback flush. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A plausibly-real Lemon Squeezy key (passes the runtime's format guard). */
const REAL_KEY = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';

const FOUR_SIGNALS = ['ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization'] as const;

beforeEach(() => setupDom());

/* -------------------------------------------------------------------------- */
/* 1. EU boot, no prior consent                                              */
/* -------------------------------------------------------------------------- */

describe('EU visitor, no prior consent', () => {
  test('banner shows, every Consent Mode signal defaults denied, tagged scripts do NOT run', async () => {
    const mods = await loadRuntime();
    addPlaceholder('analytics', 'analytics');
    addPlaceholder('marketing', 'marketing');

    const { controller } = boot(mods, mergeConfig(), { region: EU });

    // Banner is shown to the EU visitor.
    expect(bannerVisible(controller.root)).toBe(true);

    // Consent Mode default: all four grantable signals denied, security granted.
    const def = findGtag('consent', 'default')!;
    expect(def).toBeTruthy();
    for (const s of FOUR_SIGNALS) expect(def[s]).toBe('denied');
    expect(def.security_storage).toBe('granted');

    // Nothing tagged has executed, and the placeholders stay inert.
    expect(ran('analytics')).toBe(false);
    expect(ran('marketing')).toBe(false);
    expect(dom.window.document.querySelectorAll('script[type="text/plain"]').length).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Accept all                                                             */
/* -------------------------------------------------------------------------- */

describe('Accept all', () => {
  test('all four signals granted, every category’s scripts run, consent persisted, banner dismissed', async () => {
    const mods = await loadRuntime();
    addPlaceholder('analytics', 'analytics');
    addPlaceholder('marketing', 'marketing');
    addPlaceholder('preferences', 'prefs');

    const { api, controller } = boot(mods, mergeConfig(), { region: EU });
    expect(bannerVisible(controller.root)).toBe(true);

    api.acceptAll();

    // Consent Mode update: every grantable signal now granted.
    const upd = findGtag('consent', 'update')!;
    expect(upd).toBeTruthy();
    for (const s of FOUR_SIGNALS) expect(upd[s]).toBe('granted');

    // Every tagged script became executable and ran.
    expect(ran('analytics')).toBe(true);
    expect(ran('marketing')).toBe(true);
    expect(ran('prefs')).toBe(true);

    // Consent persisted with every category granted.
    const stored = api.getState()!;
    expect(stored).toBeTruthy();
    for (const c of mergeConfig().categories) expect(stored.categories[c.id]).toBe(true);

    // Banner was dismissed after the choice.
    expect(bannerVisible(controller.root)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Reject all                                                             */
/* -------------------------------------------------------------------------- */

describe('Reject all', () => {
  test('signals stay denied (security aside), no optional scripts run, choice persists, no re-show on revisit', async () => {
    const mods = await loadRuntime();
    addPlaceholder('analytics', 'analytics');
    addPlaceholder('marketing', 'marketing');
    const config = mergeConfig();

    const { api, controller } = boot(mods, config, { region: EU });
    api.rejectAll();

    // The four grantable signals remain denied; security_storage was granted at
    // default time and is never revoked.
    const upd = findGtag('consent', 'update')!;
    expect(upd).toBeTruthy();
    for (const s of FOUR_SIGNALS) expect(upd[s]).toBe('denied');
    expect(findGtag('consent', 'default')!.security_storage).toBe('granted');

    // Only necessary is granted — and it has no scripts — so nothing executed.
    expect(ran('analytics')).toBe(false);
    expect(ran('marketing')).toBe(false);

    // Persisted: necessary on, everything optional off.
    const stored = api.getState()!;
    expect(stored.categories.necessary).toBe(true);
    expect(stored.categories.analytics).toBe(false);
    expect(stored.categories.marketing).toBe(false);
    expect(bannerVisible(controller.root)).toBe(false);

    // Revisit: with a stored decision, the banner must NOT re-show (until expiry
    // or a version bump). Prove it at the decision layer AND via a fresh mount.
    const { shouldShowBanner } = mods.geo;
    expect(shouldShowBanner(config, api.getState(), EU)).toBe(false);
    const revisit = boot(mods, config, { region: EU });
    expect(bannerVisible(revisit.controller.root)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Analytics-only via the preferences UI                                  */
/* -------------------------------------------------------------------------- */

describe('Analytics-only selection through preferences', () => {
  test('analytics_storage granted, ad_* denied, only analytics scripts run', async () => {
    const mods = await loadRuntime();
    addPlaceholder('analytics', 'analytics');
    addPlaceholder('marketing', 'marketing');

    const { controller } = boot(mods, mergeConfig(), { region: EU });

    // Drive the real preferences UI: open it, choose analytics only, save.
    controller.openPreferences();
    const analyticsToggle = controller.root.querySelector('#cc-cat-analytics') as HTMLInputElement;
    const marketingToggle = controller.root.querySelector('#cc-cat-marketing') as HTMLInputElement;
    const prefsToggle = controller.root.querySelector('#cc-cat-preferences') as HTMLInputElement;
    analyticsToggle.checked = true;
    marketingToggle.checked = false;
    prefsToggle.checked = false;
    // "Save choices" is the secondary button in the modal footer.
    (controller.root.querySelector('.cc-modal__footer .cc-btn--secondary') as HTMLButtonElement).click();

    const upd = findGtag('consent', 'update')!;
    expect(upd.analytics_storage).toBe('granted');
    expect(upd.ad_storage).toBe('denied');
    expect(upd.ad_user_data).toBe('denied');
    expect(upd.ad_personalization).toBe('denied');

    expect(ran('analytics')).toBe(true);
    expect(ran('marketing')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 5. Re-consent on a reconsentVersion bump                                   */
/* -------------------------------------------------------------------------- */

describe('Re-consent', () => {
  test('bumping reconsentVersion re-shows the banner on the next boot', async () => {
    const mods = await loadRuntime();
    const v1 = mergeConfig({ behavior: { reconsentVersion: '1' } });

    // Visitor consents under version 1; banner then hidden.
    const first = boot(mods, v1, { region: EU });
    first.api.acceptAll();
    expect(bannerVisible(first.controller.root)).toBe(false);
    expect(mods.geo.shouldShowBanner(v1, first.api.getState(), EU)).toBe(false);

    // A material policy change bumps the version → prior decision goes stale.
    const v2 = mergeConfig({ behavior: { reconsentVersion: '2' } });
    expect(mods.geo.needsReconsent(v2, mods.consentState.readConsent(v2))).toBe(true);

    const second = boot(mods, v2, { region: EU });
    expect(bannerVisible(second.controller.root)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* 6. MutationObserver gates late-injected scripts                           */
/* -------------------------------------------------------------------------- */

describe('Late-injected scripts (MutationObserver)', () => {
  test('a tracker injected after load is gated by the same consent rules', async () => {
    const mods = await loadRuntime();
    const { api, controller } = boot(mods, mergeConfig(), { region: EU });

    // Grant analytics only.
    controller.openPreferences();
    (controller.root.querySelector('#cc-cat-analytics') as HTMLInputElement).checked = true;
    (controller.root.querySelector('#cc-cat-marketing') as HTMLInputElement).checked = false;
    (controller.root.querySelector('.cc-modal__footer .cc-btn--secondary') as HTMLButtonElement).click();
    void api;

    // Now inject two late embeds: one granted, one denied category.
    addPlaceholder('analytics', 'lateAnalytics');
    addPlaceholder('marketing', 'lateMarketing');
    await flush();

    expect(ran('lateAnalytics')).toBe(true);
    expect(ran('lateMarketing')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 7. License gate: uniform across origins                                    */
/* -------------------------------------------------------------------------- */

describe('License gate', () => {
  /** Boot on a given origin + license and report what the banner degraded to. */
  async function bootOn(url: string, license: Partial<CookieConsentConfig['license']>) {
    setupDom(url); // replace the beforeEach dom with the right origin
    const mods = await loadRuntime();
    const cfg = mergeConfig({ banner: { layout: 'card' }, license });
    // A tracker to prove blocking holds regardless of licensing.
    addPlaceholder('analytics', 'analytics');
    const handles = boot(mods, cfg, { region: EU });
    return { mods, ...handles };
  }

  test('staging (Framer preview) with no license → basic branded bar, credit shown', async () => {
    const { controller } = await bootOn('https://my-site.framer.website/', { tier: 'trial', key: null });
    expect(controller.root.querySelector('.cc-banner--bar')).toBeTruthy();
    expect(controller.root.querySelector('.cc-powered a')).toBeTruthy();
    // Compliance never degrades: the tracker is still blocked pre-consent.
    expect(ran('analytics')).toBe(false);
  });

  test('custom domain, unlicensed → identical basic fallback (no "free on staging" asymmetry)', async () => {
    const { controller } = await bootOn('https://www.acme.com/', { tier: 'trial', key: null });
    expect(controller.root.querySelector('.cc-banner--bar')).toBeTruthy();
    expect(controller.root.querySelector('.cc-powered a')).toBeTruthy();
    expect(ran('analytics')).toBe(false);
  });

  test('custom domain, licensed Pro → full card banner AND the credit (shown on every tier)', async () => {
    const { controller } = await bootOn('https://www.acme.com/', { tier: 'pro', key: REAL_KEY, whiteLabel: true });
    expect(controller.root.querySelector('.cc-banner--card')).toBeTruthy();
    // The "powered by" credit now shows on all versions — white-label no longer hides it.
    expect(controller.root.querySelector('.cc-powered')).toBeTruthy();
    expect(ran('analytics')).toBe(false); // still blocked until consent
  });
});

/* -------------------------------------------------------------------------- */
/* 8. Accessibility                                                           */
/* -------------------------------------------------------------------------- */

describe('Accessibility', () => {
  test('preferences modal traps focus and moves focus inside on open', async () => {
    const mods = await loadRuntime();
    const { controller } = boot(mods, mergeConfig({ banner: { layout: 'card' } }), { region: EU });
    controller.openPreferences();

    const modal = controller.root.querySelector('.cc-modal') as HTMLElement;
    expect(modal.contains(dom.window.document.activeElement)).toBe(true);

    const focusable = Array.from(
      modal.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])'),
    );
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    last.focus();
    last.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(dom.window.document.activeElement).toBe(first);
  });

  test('Esc closes a non-blocking preferences modal but never a blocking modal banner', async () => {
    // Non-blocking card layout: Esc closes preferences.
    let mods = await loadRuntime();
    const card = boot(mods, mergeConfig({ banner: { layout: 'card' } }), { region: EU });
    card.controller.openPreferences();
    const cardModal = card.controller.root.querySelector('.cc-modal') as HTMLElement;
    expect(cardModal.hidden).toBe(false);
    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(cardModal.hidden).toBe(true);

    // Blocking modal layout: Esc is inert (a choice is required). The modal
    // layout is a PREMIUM presentation, so it only survives the license gate on a
    // licensed site — an unlicensed site is (correctly) degraded to a bar.
    setupDom();
    mods = await loadRuntime();
    const modalCfg = boot(
      mods,
      mergeConfig({ banner: { layout: 'modal' }, license: { tier: 'pro', key: REAL_KEY } }),
      { region: EU },
    );
    modalCfg.controller.openPreferences();
    const blockingModal = modalCfg.controller.root.querySelector('.cc-modal') as HTMLElement;
    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(blockingModal.hidden).toBe(false);
  });

  test('the necessary category cannot be toggled off (always-on, no interactive control)', async () => {
    const mods = await loadRuntime();
    const { controller } = boot(mods, mergeConfig(), { region: EU });
    controller.openPreferences();
    // No checkbox for necessary — it renders a static "ON" pill instead, so it is
    // structurally impossible to switch off.
    expect(controller.root.querySelector('#cc-cat-necessary')).toBeNull();
    const pill = controller.root.querySelector('.cc-cat__on');
    expect(pill).toBeTruthy();
    expect(pill!.textContent).toBe('ON');
  });

  test('default theme meets WCAG AA (computed contrast ≥ 4.5:1) for text and the accent button', async () => {
    const theme = mergeConfig().theme;

    // No pair in the shipped default theme fails AA.
    expect(checkThemeContrast(theme)).toEqual([]);

    // And the two meaningful pairs compute to ≥ 4.5:1 explicitly.
    const p = derivePalette(theme, 'light');
    const bodyRatio = contrastRatio(p.text, p.bg)!;
    const accentRatio = contrastRatio(p.accentText, p.accent)!;
    expect(bodyRatio).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
    expect(accentRatio).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
  });

  test('non-EU visitor under eu-only is not shown the banner (and trackers stay blocked until any later consent)', async () => {
    const mods = await loadRuntime();
    addPlaceholder('analytics', 'analytics');
    const { controller } = boot(mods, mergeConfig(), { region: NON_EU });
    // eu-only + confidently non-EU → no banner…
    expect(bannerVisible(controller.root)).toBe(false);
    // …but the blocker is still live, so the tracker has NOT run.
    expect(ran('analytics')).toBe(false);
  });
});

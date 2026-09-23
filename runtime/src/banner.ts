/**
 * Visible consent banner + preferences modal + floating re-open button.
 *
 * Vanilla TypeScript and raw DOM — NO framework. The module is self-contained:
 * it injects its own scoped styles ({@link module:styles}), builds accessible
 * markup with real `<button>`/`<a>`/`<input type=checkbox>` controls, and wires
 * every action to the imperative `window.CookieConsent` API from
 * {@link module:consent-state} so choices persist and propagate to Consent Mode
 * and the script blocker automatically.
 *
 * Accessibility is a product requirement, not a nicety — we sell compliance, so
 * ours must pass: dialog/region roles with `aria-labelledby`/`aria-describedby`,
 * focus movement + trapping + restoration for modals, `Esc` to close (except a
 * blocking modal that requires a choice), and keyboard-operable controls.
 *
 * Text is set via `textContent` (never `innerHTML`) so trusted-but-arbitrary
 * config copy can never break layout or inject markup; the one URL we render
 * (the privacy policy) is validated to a safe scheme.
 */

import type { CookieConsentConfig, ConsentCategory, ThemeMode } from '@framer-cookie-consent/shared';
import { installConsentApi, type CookieConsentApi, type ConsentState } from './consent-state.ts';
import { needsReconsent, shouldShowFloatingButton } from './geo.ts';
import { injectStyles, ROOT_CLASS, assertThemeContrast } from './styles.ts';
import { localizeStrings, detectLanguages } from './i18n.ts';
import {
  brandLogoUrl,
  brandLightLogoUrl,
  cookieMarkUrl,
  settingsCookieMarkUrl,
  logoMarkUrl,
} from './brand-mark.ts';

/**
 * Build-time flag, replaced by a literal via esbuild `define`. `false` in the
 * production bundle so the dev-only contrast assertion (and its helper chain) is
 * dead-code-eliminated and tree-shaken out. Undefined under the test runner
 * (bare identifier), where `typeof` keeps the check safe and the assertion runs.
 */
declare const __CC_DEV__: boolean | undefined;

/** Where the (non-white-label) "Powered by" credit links. */
const POWERED_BY_URL = 'https://consentful.theplugins.co';
/** Brand name shown in the credit, beside the mark. */
const POWERED_BY_NAME = 'Consentful';
/** Accessible label for the whole credit link. */
const POWERED_BY_LABEL = 'Powered by Consentful';

/* -------------------------------------------------------------------------- */
/* Small DOM helper                                                           */
/* -------------------------------------------------------------------------- */

/** Event handler map for {@link el}, keyed by DOM event name. */
type Handlers = Partial<Record<string, (e: Event) => void>>;

/** Declarative props for {@link el}. All optional; only what's set is applied. */
interface ElProps {
  /** `class` attribute. */
  class?: string;
  /** `id` attribute. */
  id?: string;
  /** Text content — always assigned via `textContent`, never parsed as HTML. */
  text?: string;
  /** `type` (for `<button>`/`<input>`). */
  type?: string;
  /** `href` (only applied to `<a>`, after scheme validation by the caller). */
  href?: string;
  /** Arbitrary attributes (used for `role`, `aria-*`, `tabindex`, …). */
  attrs?: Record<string, string | number>;
  /** Event listeners keyed by event name. */
  on?: Handlers;
}

/**
 * Create an element with declarative props and children. Text is applied with
 * `textContent` so untrusted-shaped strings can never inject markup; `href` is
 * left to the caller to validate. Kept intentionally small and readable.
 *
 * @param tag - The HTML tag to create.
 * @param props - Declarative props (all optional).
 * @param children - Child nodes/strings appended in order.
 * @returns The created element, typed to its tag.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.id) node.id = props.id;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.type !== undefined && 'type' in node) (node as unknown as { type: string }).type = props.type;
  if (props.href !== undefined && node instanceof HTMLAnchorElement) node.setAttribute('href', props.href);
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, String(v));
  }
  if (props.on) {
    for (const [event, handler] of Object.entries(props.on)) {
      if (handler) node.addEventListener(event, handler);
    }
  }
  for (const child of children) node.append(child);
  return node;
}

/* -------------------------------------------------------------------------- */
/* Category icons                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The four consent-category glyphs, as build-time-constant SVG markup. Keyed by
 * a coarse icon name we map each category id onto. These are trusted literals
 * with no config data interpolated, so assigning them via `innerHTML` (below) is
 * safe — the file's textContent-only rule guards *config* copy, not our own icons.
 */
const CATEGORY_ICON_SVG: Record<string, string> = {
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="13" width="4" height="7" rx="1.3"/><rect x="10" y="9" width="4" height="11" rx="1.3"/><rect x="16" y="5" width="4" height="15" rx="1.3"/></svg>',
  megaphone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1Z"/><path d="M17 9a4 4 0 0 1 0 6"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h9"/><path d="M17 8h3"/><circle cx="15" cy="8" r="2.3"/><path d="M4 16h3"/><path d="M11 16h9"/><circle cx="9" cy="16" r="2.3"/></svg>',
};

/**
 * Map a consent-category id onto one of the {@link CATEGORY_ICON_SVG} glyphs plus
 * its tinted colour class. Unknown ids fall back to the neutral "preferences"
 * slider glyph so a custom category still renders a sensible icon.
 */
function categoryIcon(id: string): { key: string; tone: string } {
  switch (id) {
    case 'necessary':
      return { key: 'lock', tone: 'neutral' };
    case 'analytics':
      return { key: 'chart', tone: 'blue' };
    case 'marketing':
      return { key: 'megaphone', tone: 'violet' };
    case 'preferences':
    case 'functional':
      return { key: 'sliders', tone: 'green' };
    default:
      return { key: 'sliders', tone: 'green' };
  }
}

/** Build the tinted, rounded icon tile shown at the start of each category row. */
function categoryIconTile(id: string): HTMLElement {
  const { key, tone } = categoryIcon(id);
  const tile = el('span', { class: `cc-cat__icon cc-cat__icon--${tone}`, attrs: { 'aria-hidden': 'true' } });
  tile.innerHTML = CATEGORY_ICON_SVG[key] ?? CATEGORY_ICON_SVG.sliders!;
  return tile;
}

/* -------------------------------------------------------------------------- */
/* URL safety                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Return `raw` if it is a safe link target, else `null`. Scheme-less (relative)
 * URLs are allowed as-is; absolute URLs must use `http`/`https`. This rejects
 * `javascript:`, `data:`, and other dangerous schemes.
 *
 * @param raw - The candidate URL from config.
 * @returns The safe URL, or `null` if it must not be rendered.
 */
export function safeUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(v);
  if (scheme) {
    const name = (scheme[1] as string).toLowerCase();
    if (name !== 'http' && name !== 'https') return null;
  }
  return v;
}

/* -------------------------------------------------------------------------- */
/* Powered-by mark                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The "Powered by Consentful" logo image, resolved for the banner's theme so it
 * stays legible on both light and dark surfaces. The default wordmark is dark ink
 * for light backgrounds; {@link brandLightLogoUrl} is the light variant for dark
 * backgrounds.
 *
 * - `light` → the dark-ink wordmark (matches the light palette).
 * - `dark`  → the light wordmark (matches the always-dark palette).
 * - `auto`  → a `<picture>` defaulting to the dark-ink wordmark, swapping to the
 *   light wordmark under `prefers-color-scheme: dark` — mirroring how the `auto`
 *   palette flips with the visitor's system preference (see `styles.ts`).
 *
 * @param mode - The resolved {@link ThemeMode} from the active theme.
 * @returns An `<img>` (explicit modes) or `<picture>` (auto) node.
 */
function poweredByLogo(mode: ThemeMode): HTMLElement {
  const imgAttrs = { alt: POWERED_BY_NAME, loading: 'lazy', decoding: 'async' } as const;
  if (mode === 'auto') {
    return el('picture', { class: 'cc-powered__pic' }, [
      el('source', {
        attrs: { srcset: brandLightLogoUrl(), media: '(prefers-color-scheme:dark)' },
      }),
      el('img', { class: 'cc-powered__logo', attrs: { src: brandLogoUrl(), ...imgAttrs } }),
    ]);
  }
  const src = mode === 'dark' ? brandLightLogoUrl() : brandLogoUrl();
  return el('img', { class: 'cc-powered__logo', attrs: { src, ...imgAttrs } });
}

/**
 * The full "Powered by Consentful" credit block (label + linked wordmark), shared
 * by the banner and the preferences modal so the credit is identical in both. An
 * optional {@link extraClass} lets a surface tweak placement (e.g. the modal
 * centres it in its footer) without duplicating the markup.
 *
 * @param mode - The resolved {@link ThemeMode} for logo selection.
 * @param extraClass - Extra class appended to the `.cc-powered` wrapper, or empty.
 * @returns The credit `<div>` node.
 */
function poweredByCredit(mode: ThemeMode, extraClass = ''): HTMLElement {
  return el('div', { class: extraClass ? `cc-powered ${extraClass}` : 'cc-powered' }, [
    el(
      'a',
      {
        class: 'cc-powered__link',
        href: POWERED_BY_URL,
        attrs: { rel: 'noopener', target: '_blank', 'aria-label': POWERED_BY_LABEL },
      },
      [el('span', { class: 'cc-powered__by', text: 'Powered by' }), poweredByLogo(mode)],
    ),
  ]);
}

/* -------------------------------------------------------------------------- */
/* Focus management                                                           */
/* -------------------------------------------------------------------------- */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** All keyboard-focusable elements inside `container`, in DOM order. */
function focusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Trap Tab/Shift+Tab focus inside `container`, cycling at both ends. Returns a
 * cleanup function that removes the listener.
 */
function trapFocus(container: HTMLElement): () => void {
  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') return;
    const items = focusables(container);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0] as HTMLElement;
    const last = items[items.length - 1] as HTMLElement;
    const active = container.ownerDocument.activeElement;
    if (e.shiftKey && (active === first || !container.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  container.addEventListener('keydown', onKeydown as EventListener);
  return () => container.removeEventListener('keydown', onKeydown as EventListener);
}

/* -------------------------------------------------------------------------- */
/* Controller type                                                            */
/* -------------------------------------------------------------------------- */

/** Options for {@link mountBanner}. */
export interface MountOptions {
  /**
   * The consent API to drive. Defaults to installing (and attaching to
   * `window.CookieConsent`) a fresh one via {@link installConsentApi}.
   */
  api?: CookieConsentApi;
  /** Parent to append the UI to (defaults to `document.body`). */
  container?: HTMLElement;
  /**
   * Whether to render the initial consent banner. When omitted, falls back to
   * the internal {@link needsReconsent} check. `boot()` passes the geo-aware
   * {@link shouldShowBanner} verdict so region / Do-Not-Track policy is honoured
   * (e.g. don't prompt a non-EU visitor under `eu-only`). When `false`, only the
   * floating re-open button is shown (if a decision exists and it's enabled).
   */
  autoShow?: boolean;
  /**
   * `true` when `boot()` auto-applied a Global Privacy Control opt-out this load.
   * When set (and `behavior.gpcShowBadge` is on) a small, self-dismissing
   * confirmation badge is shown so the visitor can see their signal was honoured.
   */
  gpcHonored?: boolean;
}

/** Imperative handle returned by {@link mountBanner}. */
export interface BannerController {
  /** The scoped root element that contains all banner UI. */
  readonly root: HTMLElement;
  /** Show the consent banner (the initial prompt). */
  openBanner(): void;
  /** Hide the consent banner without recording a choice. */
  closeBanner(): void;
  /** Open the preferences modal, moving focus into it. */
  openPreferences(trigger?: HTMLElement | null): void;
  /** Close the preferences modal, restoring focus to its trigger. */
  closePreferences(): void;
  /** Tear down all DOM and listeners. */
  destroy(): void;
}

/* -------------------------------------------------------------------------- */
/* Mount                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Build, inject, and wire the banner UI, returning an imperative controller.
 *
 * On mount it renders the appropriate initial view: the consent banner when a
 * decision is still required, otherwise the floating re-open button (when the
 * author enabled it). All buttons call through the {@link CookieConsentApi}, so
 * persistence, Consent Mode signalling, and script unblocking happen for free.
 *
 * @param config - The active configuration.
 * @param options - Optional API/container overrides (see {@link MountOptions}).
 * @returns A {@link BannerController} for programmatic open/close/destroy.
 */
export function mountBanner(config: CookieConsentConfig, options: MountOptions = {}): BannerController {
  const api = options.api ?? installConsentApi(config);
  const parent = options.container ?? document.body;

  // Loud in development if the author's theme fails WCAG AA — we sell compliance.
  // Stripped from the production bundle (see __CC_DEV__) to keep it lean.
  if (typeof __CC_DEV__ === 'undefined' || __CC_DEV__) assertThemeContrast(config);

  injectStyles(config);

  // Localize the copy to the visitor's browser language (Pro multi-language).
  // With no translations authored this returns the base copy unchanged.
  const s = localizeStrings(config.strings, detectLanguages());
  // A centered `modal` banner is a blocking dialog that requires a choice.
  const isModalBanner = config.banner.layout === 'modal';
  const cleanups: Array<() => void> = [];

  /* -------------------- root + shared overlay -------------------- */

  const root = el('div', { class: ROOT_CLASS, attrs: { 'data-cc-root': '' } });
  const overlay = el('div', { class: 'cc-overlay', attrs: { hidden: '' } });

  /* ---------------------------- banner -------------------------- */

  const titleId = 'cc-title';
  const messageId = 'cc-message';

  const title = el('h2', { class: 'cc-banner__title', id: titleId, text: s.title });
  const message = el('p', { class: 'cc-banner__message', id: messageId, text: s.message });

  // Text column: heading, body, then the "Manage preferences" + policy links.
  const text = el('div', { class: 'cc-banner__text' }, [title, message]);

  // Links row: "Manage preferences" (accent) and the privacy policy (muted),
  // separated by a hairline divider — mirroring the design's footer link pair.
  const links = el('div', { class: 'cc-banner__links' });
  if (config.banner.showPreferencesButton) {
    links.append(
      el('button', {
        class: 'cc-banner__manage',
        type: 'button',
        text: s.customize,
        on: { click: (e) => openPreferences(e.currentTarget as HTMLElement) },
      }),
    );
  }

  // Privacy-policy link (validated scheme; trusted label as text). Rendered as a
  // muted link so it stays available for compliance without fighting the design.
  const policyHref = safeUrl(s.privacyPolicyUrl);
  if (policyHref) {
    if (links.childElementCount > 0) {
      links.append(el('span', { class: 'cc-banner__sep', text: '|', attrs: { 'aria-hidden': 'true' } }));
    }
    links.append(
      el('a', {
        class: 'cc-banner__policy',
        href: policyHref,
        text: s.privacyPolicyLabel,
        attrs: { rel: 'noopener', target: '_blank' },
      }),
    );
  }
  if (links.childElementCount > 0) text.append(links);

  const actions = el('div', { class: 'cc-banner__actions' });
  if (config.banner.showRejectButton) {
    actions.append(
      el('button', {
        class: 'cc-btn cc-btn--secondary',
        type: 'button',
        text: s.rejectAll,
        on: { click: () => api.rejectAll() },
      }),
    );
  }
  actions.append(
    el('button', {
      class: 'cc-btn cc-btn--primary',
      type: 'button',
      text: s.acceptAll,
      on: { click: () => api.acceptAll() },
    }),
  );

  // Decorative cookie-with-shield hero: a tinted disc holding the brand mark,
  // set off from the copy by a hairline divider. Purely cosmetic (empty alt), so
  // a load failure never disturbs the layout.
  const figure = el('div', { class: 'cc-banner__figure', attrs: { 'aria-hidden': 'true' } }, [
    el('span', { class: 'cc-banner__disc' }, [
      el('img', {
        class: 'cc-banner__mark',
        attrs: { src: cookieMarkUrl(), alt: '', loading: 'lazy', decoding: 'async' },
      }),
    ]),
  ]);

  const bannerInner = el('div', { class: 'cc-banner__inner' }, [figure, text, actions]);

  // The "Powered by" credit is shown on EVERY tier — white-label no longer hides
  // it. Only the author-config `poweredByHidden` flag can suppress it.
  if (!config.strings.poweredByHidden) {
    bannerInner.append(poweredByCredit(config.theme.mode));
  }

  const banner = el(
    'div',
    {
      class: `cc-banner cc-banner--${config.banner.layout} cc-pos-${config.banner.position}`,
      attrs: {
        // A blocking banner is a true modal dialog; a dismissable bar is a region.
        role: isModalBanner ? 'dialog' : 'region',
        ...(isModalBanner ? { 'aria-modal': 'true' } : {}),
        'aria-labelledby': titleId,
        'aria-describedby': messageId,
        hidden: '',
      },
    },
    [bannerInner],
  );

  // A dismiss "×" in the corner — only on a non-blocking banner (a blocking modal
  // offers no dismiss path until the visitor makes a choice). Dismissing records
  // no consent; the floating button can reopen the prompt later.
  if (!isModalBanner) {
    banner.append(
      el('button', {
        class: 'cc-banner__close',
        type: 'button',
        text: '×',
        attrs: { 'aria-label': 'Close' },
        on: { click: () => closeBanner() },
      }),
    );
  }

  /* ------------------------ preferences modal ------------------- */

  const prefsTitleId = 'cc-prefs-title';

  const prefsBody = el('div', { class: 'cc-modal__body' });
  const checkboxes = new Map<string, HTMLInputElement>();
  // Per-vendor switches, keyed by ManagedScript id (Phase 4.2 preference center).
  const vendorInputs = new Map<string, HTMLInputElement>();

  // Full preference center (Phase 4.2): `showVendors` lists the scripts each
  // category gates; `perVendorToggles` additionally gives each one its own
  // switch. Both are off by default, so the modal keeps its simple shape.
  const showVendors = config.preferenceCenter.showVendors;
  const perVendorToggles = showVendors && config.preferenceCenter.perVendorToggles;

  config.categories.forEach((category: ConsentCategory) => {
    const strings = s.categories[category.id];
    const label = strings?.label ?? category.label;
    const description = strings?.description ?? category.description;
    const descId = `cc-cat-${category.id}-desc`;

    // Label row: the name, plus an "Always on" badge for required categories
    // (mirrors the design). The badge is decorative next to the static ON control.
    const head = el('div', { class: 'cc-cat__head' }, [el('span', { class: 'cc-cat__label', text: label })]);
    if (category.required) {
      head.append(el('span', { class: 'cc-cat__always', text: 'Always on' }));
    }
    const textCol = el('div', { class: 'cc-cat__text' }, [
      head,
      el('p', { class: 'cc-cat__desc', id: descId, text: description }),
    ]);

    let control: HTMLElement;
    let categoryInput: HTMLInputElement | null = null;
    if (category.required) {
      // Required categories are always on — show a static "ON" pill.
      control = el('span', {
        class: 'cc-cat__on',
        text: 'ON',
        attrs: { 'aria-label': `${label}: always on` },
      });
    } else {
      const inputId = `cc-cat-${category.id}`;
      const input = el('input', {
        id: inputId,
        type: 'checkbox',
        attrs: { 'aria-describedby': descId },
      });
      // Pre-check per the author's opt-out default (the attribute only sets
      // defaultChecked; the property is what we read back on save).
      input.checked = category.defaultEnabled;
      checkboxes.set(category.id, input);
      categoryInput = input;

      const track = el('span', { class: 'cc-switch__track', attrs: { 'aria-hidden': 'true' } });
      control = el('label', { class: 'cc-switch', attrs: { for: inputId, 'aria-label': label } }, [input, track]);
    }

    const catRow = el('div', { class: 'cc-cat' }, [categoryIconTile(category.id), textCol, control]);
    const catBlock = el('div', { class: 'cc-cat-block' }, [catRow]);

    // Per-vendor list: the individual services this category gates. Only config
    // scripts (which carry ids) are listed; markup placeholders stay category-gated.
    if (showVendors) {
      const vendors = config.scripts.filter((sc) => sc.category === category.id);
      if (vendors.length > 0) {
        const list = el('div', { class: 'cc-cat__vendors' }, [
          el('div', { class: 'cc-cat__vendors-h', text: s.vendorsHeading }),
        ]);
        const catVendorInputs: HTMLInputElement[] = [];
        for (const v of vendors) {
          const meta = v.purpose.trim() || v.provider.trim();
          const vText = el('div', { class: 'cc-vendor__text' }, [
            el('div', { class: 'cc-vendor__name', text: v.name }),
            ...(meta ? [el('p', { class: 'cc-vendor__meta', text: meta })] : []),
          ]);

          let vControl: HTMLElement;
          if (perVendorToggles && !category.required) {
            const vId = `cc-vendor-${v.id}`;
            const vInput = el('input', { id: vId, type: 'checkbox', attrs: { 'aria-label': v.name } });
            vInput.checked = true; // vendors are allowed by default within a granted category
            vendorInputs.set(v.id, vInput);
            catVendorInputs.push(vInput);
            const vTrack = el('span', { class: 'cc-switch__track', attrs: { 'aria-hidden': 'true' } });
            vControl = el('label', { class: 'cc-switch cc-switch--sm', attrs: { for: vId } }, [vInput, vTrack]);
          } else {
            // Transparency-only: a static marker, no toggle.
            vControl = el('span', { class: 'cc-vendor__dot', attrs: { 'aria-hidden': 'true' } });
          }
          list.append(el('div', { class: 'cc-vendor' }, [vText, vControl]));
        }

        // A vendor can only run if its category is granted, so mirror the
        // category switch onto its vendor switches (disabled while the category
        // is off), keeping the UI honest about what a per-vendor choice can do.
        if (categoryInput && catVendorInputs.length > 0) {
          const cInput = categoryInput;
          const syncVendors = (): void => {
            for (const vi of catVendorInputs) vi.disabled = !cInput.checked;
          };
          cInput.addEventListener('change', syncVendors);
          syncVendors();
        }
        catBlock.append(list);
      }
    }

    prefsBody.append(catBlock);
  });

  const savePreferences = (): void => {
    const granted: string[] = [];
    for (const [id, input] of checkboxes) {
      if (input.checked) granted.push(id);
    }
    // Carry per-vendor decisions when the preference center exposed them. The
    // switch reflects the visitor's vendor preference; the category gates whether
    // it matters, so we record the switch value as-is.
    let vendors: Record<string, boolean> | undefined;
    if (vendorInputs.size > 0) {
      vendors = {};
      for (const [id, input] of vendorInputs) vendors[id] = input.checked;
    }
    api.accept(granted, 'custom', vendors);
  };

  // Verifiable-receipt download — the visible proof of Consentful's consent
  // receipts. Only meaningful once a decision has been recorded, so it starts
  // hidden and is revealed by `syncReceiptControl()` whenever a receipt exists.
  const receiptButton = el('button', {
    class: 'cc-receipt-btn',
    type: 'button',
    on: { click: () => api.downloadReceipt() },
  }, [
    el('span', { class: 'cc-receipt-btn__icon', text: '↓', attrs: { 'aria-hidden': 'true' } }),
    el('span', { text: s.downloadReceipt }),
  ]);
  const receiptRow = el('div', { class: 'cc-modal__receipt', attrs: { hidden: '' } }, [receiptButton]);

  /** Reveal the receipt control only when a stored, exportable receipt exists. */
  const syncReceiptControl = (): void => {
    receiptRow.hidden = api.exportReceipt() == null;
  };

  // Footer note (left): an info glyph, a reassurance line, and the policy /
  // manage links — mirroring the design. The links echo the banner's pair.
  const noteLinks = el('div', { class: 'cc-modal__note-links' });
  if (policyHref) {
    noteLinks.append(
      el('a', {
        class: 'cc-modal__note-link',
        href: policyHref,
        text: s.privacyPolicyLabel,
        attrs: { rel: 'noopener', target: '_blank' },
      }),
    );
  }
  noteLinks.append(el('span', { class: 'cc-modal__note-sep', text: '|', attrs: { 'aria-hidden': 'true' } }));
  noteLinks.append(
    el('button', {
      class: 'cc-modal__note-link',
      type: 'button',
      text: s.customize,
      // Already inside the preference center; nudge focus to the first control.
      on: { click: () => (focusables(prefsBody)[0] ?? prefsBody).focus() },
    }),
  );

  const infoIcon = el('span', { class: 'cc-modal__info', attrs: { 'aria-hidden': 'true' } });
  infoIcon.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>';

  const footerNote = el('div', { class: 'cc-modal__note' }, [
    infoIcon,
    el('div', { class: 'cc-modal__note-text' }, [
      el('span', { class: 'cc-modal__note-line', text: 'You can change your preferences at any time.' }),
      noteLinks,
    ]),
  ]);

  const footerActions = el('div', { class: 'cc-modal__actions' }, [
    el('button', {
      class: 'cc-btn cc-btn--secondary',
      type: 'button',
      text: s.savePreferences,
      on: { click: savePreferences },
    }),
    el('button', {
      class: 'cc-btn cc-btn--primary',
      type: 'button',
      text: s.acceptAll,
      on: { click: () => api.acceptAll() },
    }),
  ]);

  const prefsFooter = el('div', { class: 'cc-modal__footer' }, [footerNote, footerActions]);

  // Mirror the banner's "Powered by Consentful" credit in the modal, on its own
  // full-width row beneath the footer actions. Suppressed by the same author flag.
  if (!config.strings.poweredByHidden) {
    prefsFooter.append(poweredByCredit(config.theme.mode, 'cc-powered--modal'));
  }

  const prefsHeadingBlock = el('div', { class: 'cc-modal__heading' }, [
    el('h2', { class: 'cc-modal__title', id: prefsTitleId, text: 'Privacy preferences' }),
    el('p', {
      class: 'cc-modal__subtitle',
      text: 'Choose which cookies to allow. You can update your preferences anytime from here.',
    }),
  ]);

  const prefsFigure = el('span', { class: 'cc-modal__figure', attrs: { 'aria-hidden': 'true' } }, [
    el('img', {
      class: 'cc-modal__mark',
      attrs: { src: settingsCookieMarkUrl(), alt: '', loading: 'lazy', decoding: 'async' },
    }),
  ]);

  const prefsHeader = el('div', { class: 'cc-modal__header' }, [
    prefsFigure,
    prefsHeadingBlock,
    el('button', {
      class: 'cc-modal__close',
      type: 'button',
      text: '×',
      attrs: { 'aria-label': 'Close preferences' },
      on: { click: () => closePreferences() },
    }),
  ]);

  const prefsModal = el(
    'div',
    {
      class: 'cc-modal',
      attrs: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': prefsTitleId,
        tabindex: '-1',
        hidden: '',
      },
    },
    [prefsHeader, prefsBody, receiptRow, prefsFooter],
  );

  /* -------------------- floating re-open button ----------------- */

  // A compact round button carrying the Consentful brand mark (not a generic
  // cookie icon). `s.customize` becomes the accessible label so screen readers
  // still announce "Manage preferences", and doubles as the hover tooltip.
  const fab = el(
    'button',
    {
      class: `cc-fab cc-fab-${config.advanced.floatingButtonPosition}`,
      type: 'button',
      attrs: {
        'aria-haspopup': 'dialog',
        'aria-label': s.customize,
        title: s.customize,
        hidden: '',
      },
      on: { click: (e) => openPreferences(e.currentTarget as HTMLElement) },
    },
    [
      el('img', {
        class: 'cc-fab__mark',
        attrs: { src: logoMarkUrl(), alt: '', loading: 'lazy', decoding: 'async' },
      }),
    ],
  );

  /* ------------------- GPC "opt-out honored" badge -------------- */

  // A small, self-dismissing confirmation shown when boot() auto-applied a
  // Global Privacy Control opt-out. It carries `role="status"` + `aria-live`
  // so assistive tech announces it once, then fades away on its own.
  const showGpcBadge = options.gpcHonored === true && config.behavior.gpcShowBadge;
  const gpcBadge = el(
    'div',
    {
      class: `cc-gpc-badge cc-fab-${config.advanced.floatingButtonPosition}`,
      attrs: { role: 'status', 'aria-live': 'polite', hidden: '' },
    },
    [
      el('span', { class: 'cc-gpc-badge__check', text: '✓', attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'cc-gpc-badge__text', text: 'Global Privacy Control honored' }),
    ],
  );

  root.append(overlay, banner, prefsModal, fab, gpcBadge);
  parent.append(root);

  /* --------------------------- view state ----------------------- */

  /** Element focus should return to when the preferences modal closes. */
  let prefsReturnFocus: HTMLElement | null = null;
  /** Active focus-trap cleanup for whichever modal is open. */
  let releaseTrap: (() => void) | null = null;

  const overlayNeeded = (): boolean =>
    isModalBanner || (config.banner.overlay && !banner.hidden) || !prefsModal.hidden;

  const syncOverlay = (): void => {
    overlay.hidden = !overlayNeeded();
  };

  function openBanner(): void {
    banner.hidden = false;
    fab.hidden = true;
    syncOverlay();
    if (isModalBanner) {
      // A blocking banner is modal: trap focus and pull it in.
      releaseTrap?.();
      releaseTrap = trapFocus(banner);
      focusables(banner)[0]?.focus();
    }
  }

  function closeBanner(): void {
    banner.hidden = true;
    if (isModalBanner) {
      releaseTrap?.();
      releaseTrap = null;
    }
    syncOverlay();
  }

  function openPreferences(trigger?: HTMLElement | null): void {
    prefsReturnFocus = trigger ?? (root.ownerDocument.activeElement as HTMLElement | null);
    // Reflect whether a downloadable receipt exists right now (a decision may have
    // been recorded — or withdrawn — since the modal was last opened).
    syncReceiptControl();
    // The preferences modal always sits above the banner while open.
    releaseTrap?.();
    prefsModal.hidden = false;
    syncOverlay();
    releaseTrap = trapFocus(prefsModal);
    (focusables(prefsModal)[0] ?? prefsModal).focus();
  }

  function closePreferences(): void {
    prefsModal.hidden = true;
    releaseTrap?.();
    releaseTrap = null;
    syncOverlay();
    // If the blocking banner is still up, re-arm its trap; else restore focus.
    if (isModalBanner && !banner.hidden) {
      releaseTrap = trapFocus(banner);
      focusables(banner)[0]?.focus();
    } else {
      prefsReturnFocus?.focus();
    }
    prefsReturnFocus = null;
  }

  function showFloatingButton(): void {
    fab.hidden = !config.advanced.floatingButton;
  }

  /* ----------------------------- Esc key ------------------------ */

  // Esc closes an open preferences modal — but never a blocking modal that
  // requires a choice (there is no dismiss path until the visitor decides).
  const onEsc = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    if (isModalBanner) return;
    if (!prefsModal.hidden) {
      e.preventDefault();
      closePreferences();
    }
  };
  root.ownerDocument.addEventListener('keydown', onEsc as EventListener);
  cleanups.push(() => root.ownerDocument.removeEventListener('keydown', onEsc as EventListener));

  /* --------------------- external event wiring ------------------ */

  // `window.CookieConsent.openPreferences()` dispatches this; honour it so any
  // host-site "cookie settings" control can reopen the modal.
  const onOpenPrefs = (): void => openPreferences(null);
  window.addEventListener('cookieconsent:openpreferences', onOpenPrefs as EventListener);
  cleanups.push(() => window.removeEventListener('cookieconsent:openpreferences', onOpenPrefs as EventListener));

  // When a choice is recorded (here or elsewhere), retire the banner/modal and
  // surface the floating re-open button — honouring `hideAfterChoice`. A blocking
  // modal ALWAYS closes on a decision (there is no other dismiss path, so keeping
  // it open would trap the visitor); only a non-modal banner respects the setting.
  const onChange = (_e: Event): void => {
    // A decision (or withdrawal) may have just created/removed the receipt.
    syncReceiptControl();
    if (config.behavior.hideAfterChoice || isModalBanner) {
      closeBanner();
      if (!prefsModal.hidden) closePreferences();
      showFloatingButton();
    }
    // Optionally reload so newly-consented tags re-evaluate from a clean page.
    // Only ever runs for a genuine post-mount user decision (this listener is
    // attached at mount, after the boot-time DNT/stored-decision reconciliation),
    // so it can never loop on the initial applied state.
    if (config.behavior.reloadOnChange) {
      try {
        window.location.reload();
      } catch {
        /* reload unavailable (non-browser host) — ignore */
      }
    }
  };
  window.addEventListener('cookieconsent:change', onChange as EventListener);
  cleanups.push(() => window.removeEventListener('cookieconsent:change', onChange as EventListener));

  /* --------------------------- initial view --------------------- */

  const initialState: ConsentState | null = api.getState();
  const wantBanner = options.autoShow ?? needsReconsent(config, initialState);
  if (wantBanner) {
    openBanner();
  } else if (shouldShowFloatingButton(config, initialState)) {
    showFloatingButton();
  }

  // Surface the GPC confirmation badge (only when boot honoured an opt-out and
  // the author kept it on). It auto-dismisses so it never lingers as clutter.
  if (showGpcBadge) {
    gpcBadge.hidden = false;
    const timer = setTimeout(() => {
      gpcBadge.hidden = true;
    }, 6000);
    cleanups.push(() => clearTimeout(timer));
  }

  /* ----------------------------- destroy ------------------------ */

  function destroy(): void {
    releaseTrap?.();
    releaseTrap = null;
    for (const cleanup of cleanups) cleanup();
    root.remove();
  }

  return {
    root,
    openBanner,
    closeBanner,
    openPreferences,
    closePreferences,
    destroy,
  };
}

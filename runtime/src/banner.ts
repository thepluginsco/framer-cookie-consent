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

import type { CookieConsentConfig, ConsentCategory } from '@framer-cookie-consent/shared';
import { installConsentApi, type CookieConsentApi, type ConsentState } from './consent-state.ts';
import { needsReconsent, shouldShowFloatingButton } from './geo.ts';
import { injectStyles, ROOT_CLASS, assertThemeContrast } from './styles.ts';
import { localizeStrings, detectLanguages } from './i18n.ts';

/**
 * Build-time flag, replaced by a literal via esbuild `define`. `false` in the
 * production bundle so the dev-only contrast assertion (and its helper chain) is
 * dead-code-eliminated and tree-shaken out. Undefined under the test runner
 * (bare identifier), where `typeof` keeps the check safe and the assertion runs.
 */
declare const __CC_DEV__: boolean | undefined;

/** Vendor credit URL rendered in the (non-white-label) "Powered by" link. */
const POWERED_BY_URL = 'https://www.framer.com/';
/** Vendor credit label. */
const POWERED_BY_LABEL = 'Powered by Cookie Consent';

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

  if (config.banner.showPreferencesButton) {
    text.append(
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
    text.append(
      el('a', {
        class: 'cc-banner__policy',
        href: policyHref,
        text: s.privacyPolicyLabel,
        attrs: { rel: 'noopener', target: '_blank' },
      }),
    );
  }

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

  const bannerInner = el('div', { class: 'cc-banner__inner' }, [text, actions]);

  // White-label: the "Powered by" credit shows UNLESS entitled to hide it.
  // The license is authoritative; `poweredByHidden` is an author convenience.
  if (!config.license.whiteLabel && !config.strings.poweredByHidden) {
    bannerInner.append(
      el('div', { class: 'cc-powered' }, [
        el('a', { href: POWERED_BY_URL, text: POWERED_BY_LABEL, attrs: { rel: 'noopener', target: '_blank' } }),
      ]),
    );
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

  /* ------------------------ preferences modal ------------------- */

  const prefsTitleId = 'cc-prefs-title';

  const prefsBody = el('div', { class: 'cc-modal__body' });
  const checkboxes = new Map<string, HTMLInputElement>();

  config.categories.forEach((category: ConsentCategory) => {
    const strings = s.categories[category.id];
    const label = strings?.label ?? category.label;
    const description = strings?.description ?? category.description;
    const descId = `cc-cat-${category.id}-desc`;

    const textCol = el('div', { class: 'cc-cat__text' }, [
      el('div', { class: 'cc-cat__label', text: label }),
      el('p', { class: 'cc-cat__desc', id: descId, text: description }),
    ]);

    let control: HTMLElement;
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

      const track = el('span', { class: 'cc-switch__track', attrs: { 'aria-hidden': 'true' } });
      control = el('label', { class: 'cc-switch', attrs: { for: inputId, 'aria-label': label } }, [input, track]);
    }

    prefsBody.append(el('div', { class: 'cc-cat' }, [textCol, control]));
  });

  const savePreferences = (): void => {
    const granted: string[] = [];
    for (const [id, input] of checkboxes) {
      if (input.checked) granted.push(id);
    }
    api.accept(granted);
  };

  const prefsFooter = el('div', { class: 'cc-modal__footer' }, [
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

  const prefsHeader = el('div', { class: 'cc-modal__header' }, [
    el('h2', { class: 'cc-modal__title', id: prefsTitleId, text: 'Privacy preferences' }),
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
    [prefsHeader, prefsBody, prefsFooter],
  );

  /* -------------------- floating re-open button ----------------- */

  const fab = el('button', {
    class: `cc-fab cc-fab-${config.advanced.floatingButtonPosition}`,
    type: 'button',
    text: s.customize,
    attrs: { 'aria-haspopup': 'dialog', hidden: '' },
    on: { click: (e) => openPreferences(e.currentTarget as HTMLElement) },
  });

  root.append(overlay, banner, prefsModal, fab);
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

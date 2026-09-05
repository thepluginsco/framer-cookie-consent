/**
 * Script-blocking engine — the part that makes the plugin genuinely compliant
 * rather than cosmetic. Tracking scripts ship in an INERT form and are only
 * upgraded to executable ones once the visitor has consented to their category.
 *
 * Two authoring channels are supported, both gated identically:
 *
 * 1. Markup placeholders on the published site — a tracker is marked
 *    `type="text/plain"` so the browser never runs it, tagged with the category
 *    that unblocks it:
 *
 *    ```html
 *    <script type="text/plain" data-cc-category="analytics"
 *            data-cc-src="https://example.com/a.js" async></script>
 *    <script type="text/plain" data-cc-category="marketing">pixel();</script>
 *    ```
 *
 * 2. Entries in {@link CookieConsentConfig.scripts}, so designers can add
 *    trackers through the plugin UI without editing markup.
 *
 * Decision logic ({@link classify}) is pure and kept separate from the DOM
 * mutations, so both halves are independently testable. This module is
 * dependency-free and SSR-safe: every DOM access is guarded so importing it in
 * a non-browser context is a harmless no-op.
 */

import type { CookieConsentConfig, ManagedScript } from '@framer-cookie-consent/shared';
import { onConsentChange, readConsent, DEFAULT_COOKIE_NAME, type ConsentState } from './consent-state.ts';

/* -------------------------------------------------------------------------- */
/* Contract constants                                                         */
/* -------------------------------------------------------------------------- */

/** The inert MIME type the browser refuses to execute — how trackers are parked. */
export const INERT_SCRIPT_TYPE = 'text/plain';
/** Attribute naming the consent category that unblocks a placeholder. */
export const CATEGORY_ATTR = 'data-cc-category';
/** Attribute holding the deferred `src` for an external placeholder script. */
export const SRC_ATTR = 'data-cc-src';
/** Optional attribute overriding the real `type` applied on activation (e.g. `module`). */
export const REAL_TYPE_ATTR = 'data-cc-type';
/** Marker stamped on scripts this engine has activated (idempotency + debugging). */
export const ACTIVATED_ATTR = 'data-cc-activated';
/** Attribute carrying a {@link ManagedScript.id} on config-injected scripts. */
export const SCRIPT_ID_ATTR = 'data-cc-script-id';

/** CSS selector matching every not-yet-activated markup placeholder. */
const PLACEHOLDER_SELECTOR = `script[type="${INERT_SCRIPT_TYPE}"][${CATEGORY_ATTR}]`;

/* -------------------------------------------------------------------------- */
/* Pure decision logic                                                        */
/* -------------------------------------------------------------------------- */

/** The granted/denied split of a consent decision. */
export interface ClassifiedConsent {
  /** Ids of categories the visitor currently grants. */
  granted: string[];
  /** Ids of categories the visitor currently denies. */
  denied: string[];
}

/**
 * Split a consent state into granted vs denied category ids. Pure — it only
 * reads `state.categories` and allocates fresh arrays, so it is trivially
 * unit-testable and never touches the DOM.
 *
 * @param state - The current consent decision.
 * @returns The granted and denied category id lists.
 */
export function classify(state: ConsentState): ClassifiedConsent {
  const granted: string[] = [];
  const denied: string[] = [];
  for (const [id, ok] of Object.entries(state.categories)) {
    (ok === true ? granted : denied).push(id);
  }
  return { granted, denied };
}

/* -------------------------------------------------------------------------- */
/* DOM operations                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Convert one `type="text/plain"` placeholder into a real, executable
 * `<script>` and swap it into place. Attributes are copied (preserving
 * `async`/`defer`), `data-cc-src` becomes the real `src`, and inline bodies are
 * carried over verbatim. Replacing the node in place preserves document order.
 *
 * For an external script with neither `async` nor `defer`, `async` is forced
 * off: dynamically-inserted scripts are async by default, which would break
 * dependent trackers that rely on in-order execution.
 *
 * @param placeholder - The inert placeholder element to upgrade.
 * @returns The new executable script element, or `null` if `placeholder` was
 * not an inert placeholder (already activated / wrong type).
 */
function activatePlaceholder(placeholder: HTMLScriptElement): HTMLScriptElement | null {
  if (placeholder.getAttribute('type') !== INERT_SCRIPT_TYPE) return null;
  const doc = placeholder.ownerDocument;
  const real = doc.createElement('script');

  // Copy every attribute except the ones we translate or that would keep it inert.
  for (const attr of Array.from(placeholder.attributes)) {
    const name = attr.name.toLowerCase();
    if (name === 'type' || name === SRC_ATTR) continue;
    real.setAttribute(attr.name, attr.value);
  }

  // Restore the intended executable type only if explicitly requested.
  const realType = placeholder.getAttribute(REAL_TYPE_ATTR);
  if (realType) real.setAttribute('type', realType);
  else real.removeAttribute('type');

  const src = placeholder.getAttribute(SRC_ATTR);
  if (src) {
    real.src = src;
    if (!placeholder.hasAttribute('async') && !placeholder.hasAttribute('defer')) {
      real.async = false; // keep dependent trackers in document order
    }
  } else {
    real.text = placeholder.textContent ?? '';
  }

  real.setAttribute(ACTIVATED_ATTR, '');
  placeholder.replaceWith(real);
  return real;
}

/**
 * Build a real executable `<script>` from a {@link ManagedScript} config entry.
 * `src` entries load an external URL (honouring `async`); `inline` entries run
 * the provided code body.
 */
function buildConfigScript(doc: Document, script: ManagedScript): HTMLScriptElement {
  const el = doc.createElement('script');
  if (script.type === 'src') {
    el.src = script.value;
    el.async = script.async;
  } else {
    el.text = script.value;
  }
  el.setAttribute(CATEGORY_ATTR, script.category);
  el.setAttribute(SCRIPT_ID_ATTR, script.id);
  el.setAttribute(ACTIVATED_ATTR, '');
  return el;
}

/**
 * Collect every inert placeholder at or inside an element (in document order).
 * Used by the {@link MutationObserver} to gate late-injected embeds.
 */
function collectPlaceholders(el: Element): HTMLScriptElement[] {
  const out: HTMLScriptElement[] = [];
  if (typeof el.matches === 'function' && el.matches(PLACEHOLDER_SELECTOR)) {
    out.push(el as HTMLScriptElement);
  }
  if (typeof el.querySelectorAll === 'function') {
    for (const n of Array.from(el.querySelectorAll(PLACEHOLDER_SELECTOR))) {
      out.push(n as HTMLScriptElement);
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Engine                                                                     */
/* -------------------------------------------------------------------------- */

/** The imperative surface of the script-blocking engine. */
export interface ScriptBlocker {
  /**
   * Reconcile the DOM with a consent decision: record which categories are
   * granted, then activate every placeholder and config script for those
   * categories. Also wires up the {@link MutationObserver} and the
   * {@link onConsentChange} subscription on first call. Idempotent — re-running
   * with the same state never double-injects or double-executes.
   */
  applyConsent(state: ConsentState): void;
  /**
   * Activate every not-yet-activated script (markup placeholders + config
   * entries) for a single category — but ONLY if that category is currently
   * granted; otherwise this is a no-op. Activation happens in document order.
   * @returns the number of scripts activated.
   */
  activateCategory(categoryId: string): number;
  /** Stop observing the DOM and unsubscribe from consent changes. Idempotent. */
  disconnect(): void;
}

/**
 * Create a script-blocking engine bound to a config. Nothing is activated until
 * {@link ScriptBlocker.applyConsent} is called. State is held in the closure
 * (not module-level), so multiple instances/tests never interfere.
 *
 * @param config - The active configuration (source of {@link CookieConsentConfig.scripts}).
 * @returns A {@link ScriptBlocker} instance.
 */
export function createScriptBlocker(config: CookieConsentConfig): ScriptBlocker {
  /** Categories currently granted — the single gate every activation checks. */
  let granted = new Set<string>();
  /** Ids of config scripts already injected, so re-runs never duplicate them. */
  const injected = new Set<string>();
  let observer: MutationObserver | null = null;
  let unsubscribe: (() => void) | null = null;

  const doc = (): Document | null => (typeof document !== 'undefined' ? document : null);

  /** Activate placeholders (document order) whose category passes the predicate. */
  function activatePlaceholders(accept: (category: string) => boolean): number {
    const d = doc();
    if (!d) return 0;
    let count = 0;
    // querySelectorAll returns nodes in document order, preserving script order.
    for (const node of Array.from(d.querySelectorAll(PLACEHOLDER_SELECTOR))) {
      const el = node as HTMLScriptElement;
      const category = el.getAttribute(CATEGORY_ATTR);
      if (category && accept(category) && activatePlaceholder(el)) count += 1;
    }
    return count;
  }

  /** Inject config scripts (array order) whose category passes the predicate. */
  function injectConfigScripts(accept: (category: string) => boolean): number {
    const d = doc();
    if (!d) return 0;
    const parent = d.head || d.documentElement;
    if (!parent) return 0;
    let count = 0;
    for (const script of config.scripts) {
      if (injected.has(script.id) || !accept(script.category)) continue;
      injected.add(script.id);
      parent.appendChild(buildConfigScript(d, script));
      count += 1;
    }
    return count;
  }

  /** Activate everything currently granted (both channels), in a stable order. */
  function activateGranted(): void {
    activatePlaceholders((c) => granted.has(c));
    injectConfigScripts((c) => granted.has(c));
  }

  /** Gate late-injected placeholders the same way, honouring current grants. */
  function handleMutations(mutations: MutationRecord[]): void {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (node.nodeType !== 1) continue; // ELEMENT_NODE only
        for (const placeholder of collectPlaceholders(node as Element)) {
          const category = placeholder.getAttribute(CATEGORY_ATTR);
          if (category && granted.has(category)) activatePlaceholder(placeholder);
        }
      }
    }
  }

  function ensureObserver(): void {
    if (observer) return;
    const d = doc();
    if (!d || typeof MutationObserver === 'undefined') return;
    const target = d.documentElement || d;
    observer = new MutationObserver(handleMutations);
    observer.observe(target, { childList: true, subtree: true });
  }

  function ensureSubscription(): void {
    if (unsubscribe) return;
    unsubscribe = onConsentChange((state) => {
      granted = new Set(classify(state).granted);
      activateGranted();
    });
  }

  return {
    applyConsent(state: ConsentState): void {
      granted = new Set(classify(state).granted);
      ensureObserver();
      ensureSubscription();
      activateGranted();
    },

    activateCategory(categoryId: string): number {
      // Compliance invariant: never activate a category that isn't granted.
      if (!granted.has(categoryId)) return 0;
      return (
        activatePlaceholders((c) => c === categoryId) +
        injectConfigScripts((c) => c === categoryId)
      );
    },

    disconnect(): void {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  };
}

/**
 * Convenience bootstrap for the runtime: create a blocker, read any existing
 * consent decision, and apply it immediately (starting the observer and the
 * consent-change subscription). When no prior decision exists, nothing is
 * activated but the engine is live, so a later grant unblocks scripts at once.
 *
 * @param config - The active configuration.
 * @param cookieName - Consent cookie name (defaults to {@link DEFAULT_COOKIE_NAME}).
 * @returns The live {@link ScriptBlocker}.
 */
export function installScriptBlocker(
  config: CookieConsentConfig,
  cookieName: string = DEFAULT_COOKIE_NAME,
): ScriptBlocker {
  const blocker = createScriptBlocker(config);
  const prior = readConsent(config, cookieName);
  const state: ConsentState = prior ?? {
    version: config.behavior.reconsentVersion,
    timestamp: Date.now(),
    categories: {},
  };
  blocker.applyConsent(state);
  return blocker;
}

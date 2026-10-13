/**
 * Embed blocking: third-party iframes (YouTube, Vimeo, TikTok, Instagram, X,
 * Facebook, Spotify, Google Maps, …) set cookies as soon as they load, so they
 * are held behind consent just like tracking scripts.
 *
 * A blocked iframe stays in the page at its own size (no DOM nodes are added or
 * removed, so framework-rendered pages such as Framer's React tree are not
 * disturbed). Its `src` is parked in `data-cc-src` and a small click-to-load
 * placeholder is shown through `srcdoc`. The embed loads when the visitor
 * consents to its category, or when they click "Load content" on that one
 * embed.
 *
 * Two channels, mirroring the script blocker:
 *
 * 1. Markup — always honoured:
 *    `<iframe data-cc-src="https://…" data-cc-category="marketing"></iframe>`
 * 2. Automatic — with `behavior.blockEmbeds` on, iframes from known embed
 *    providers are detected (including ones added later) and gated under
 *    `behavior.embedCategory`.
 *
 * Iframes already in the page's HTML can start loading before any script runs;
 * the markup form is the airtight option for those.
 */

import type { CookieConsentConfig } from '@framer-cookie-consent/shared';
import { onConsentChange, readConsent, DEFAULT_COOKIE_NAME } from './consent-state.ts';
import { classify, CATEGORY_ATTR, SRC_ATTR, ACTIVATED_ATTR } from './script-blocker.ts';

/** Known embed providers: `[pattern over host + path, display name]`. */
const PROVIDERS: Array<[RegExp, string]> = [
  [/^(www\.|m\.)?youtube(-nocookie)?\.com\/embed/, 'YouTube'],
  [/^player\.vimeo\.com\//, 'Vimeo'],
  [/^(www\.)?tiktok\.com\/(embed|player)/, 'TikTok'],
  [/^(www\.)?instagram\.com\/.*embed/, 'Instagram'],
  [/^(platform|syndication)\.twitter\.com\//, 'X'],
  [/^(www\.)?facebook\.com\/(plugins|v[\d.]+\/plugins)\//, 'Facebook'],
  [/^open\.spotify\.com\/embed/, 'Spotify'],
  [/^(www\.|maps\.)?google\.[a-z.]+\/maps/, 'Google Maps'],
  [/^w\.soundcloud\.com\//, 'SoundCloud'],
  [/^(www\.)?loom\.com\/embed/, 'Loom'],
  [/^(www\.)?dailymotion\.com\/embed|^geo\.dailymotion\.com\//, 'Dailymotion'],
  [/^(player|clips)\.twitch\.tv\//, 'Twitch'],
  [/^fast\.wistia\.(net|com)\/embed/, 'Wistia'],
  [/^(www\.)?linkedin\.com\/embed/, 'LinkedIn'],
  [/^assets\.pinterest\.com\/ext/, 'Pinterest'],
];

/** The known provider an embed URL belongs to, or `null`. Pure. */
export function embedProvider(src: string): string | null {
  const path = src.trim().replace(/^(https?:)?\/\//i, '').toLowerCase();
  for (const [re, name] of PROVIDERS) if (re.test(path)) return name;
  return null;
}

/** Display name for any embed URL: the provider, else its host. Pure. */
function serviceName(src: string): string {
  return embedProvider(src) || src.replace(/^(https?:)?\/\//i, '').split(/[/?#]/)[0] || '';
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The placeholder document shown inside a blocked iframe. Pure. */
export function placeholderHtml(text: string, button: string, accent: string): string {
  const a = /^#[0-9a-f]{3,8}$/i.test(accent) ? accent : '#4b23d3';
  return (
    '<!doctype html><meta charset="utf-8"><style>' +
    'html,body{height:100%;margin:0}' +
    'body{display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:16px;' +
    'background:#f3f4f6;color:#1f2937;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center}' +
    '@media (prefers-color-scheme:dark){body{background:#1f2937;color:#e5e7eb}}' +
    `button{margin-top:12px;border:0;border-radius:8px;padding:9px 16px;background:${a};color:#fff;` +
    'font:inherit;font-size:13px;font-weight:600;cursor:pointer}' +
    `</style><div><div>${esc(text)}</div><button type="button">${esc(button)}</button></div>`
  );
}

/** The live embed blocker; {@link EmbedBlocker.disconnect} stops it. */
export interface EmbedBlocker {
  /** Swap in the visitor's localized copy (re-renders shown placeholders). */
  setStrings(s: EmbedStrings): void;
  disconnect(): void;
}

/** The copy a placeholder uses. */
export interface EmbedStrings {
  embedBlocked: string;
  embedLoad: string;
}

/**
 * Start blocking embeds for a config: gate what is in the page now, watch for
 * new or re-pointed iframes, and load embeds as their category is granted.
 */
export function installEmbedBlocker(
  config: CookieConsentConfig,
  strings: EmbedStrings = config.strings,
  cookieName: string = DEFAULT_COOKIE_NAME,
): EmbedBlocker {
  if (typeof document === 'undefined') return { setStrings() {}, disconnect() {} };
  const auto = config.behavior.blockEmbeds;
  const autoCategory = config.behavior.embedCategory || 'marketing';
  const prior = readConsent(config, cookieName);
  let granted = new Set(prior ? classify(prior).granted : []);

  /** Load one blocked iframe (by consent or by the visitor's click). */
  function load(f: HTMLIFrameElement): void {
    const src = f.getAttribute(SRC_ATTR);
    f.setAttribute(ACTIVATED_ATTR, '');
    // srcdoc wins while present, so set src first, then drop srcdoc to navigate.
    if (src) f.setAttribute('src', src);
    f.removeAttribute('srcdoc');
  }

  /** Gate one iframe if it needs it (idempotent). */
  function gate(f: HTMLIFrameElement): void {
    if (f.hasAttribute(ACTIVATED_ATTR)) return;
    const src = f.getAttribute('src') || '';
    let category = f.getAttribute(CATEGORY_ATTR);
    const parked = f.getAttribute(SRC_ATTR);
    if (!category) {
      if (!auto || !src || !embedProvider(src)) return;
      category = autoCategory;
      f.setAttribute(CATEGORY_ATTR, category);
    }
    if (granted.has(category)) {
      if (parked || f.hasAttribute('srcdoc')) load(f);
      return;
    }
    const target = src && !/^about:/i.test(src) ? src : parked;
    if (!target) return;
    if (!f.hasAttribute('srcdoc')) {
      render(f, target);
      f.addEventListener('load', () => {
        if (f.hasAttribute(ACTIVATED_ATTR)) return;
        try {
          f.contentDocument?.querySelector('button')?.addEventListener('click', () => load(f));
        } catch {
          /* not reachable: the placeholder simply stays */
        }
      });
    }
    // With srcdoc present, changing src never navigates.
    f.setAttribute(SRC_ATTR, target);
    f.removeAttribute('src');
  }

  function render(f: HTMLIFrameElement, target: string): void {
    f.srcdoc = placeholderHtml(
      strings.embedBlocked.replace(/\{service\}/g, serviceName(target)),
      strings.embedLoad,
      config.theme.accent,
    );
  }

  const scan = (root: ParentNode): void => {
    for (const f of Array.from(root.querySelectorAll('iframe'))) gate(f);
  };

  const observer =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver((records) => {
          for (const r of records) {
            if (r.type === 'attributes') {
              if ((r.target as Element).tagName === 'IFRAME') gate(r.target as HTMLIFrameElement);
              continue;
            }
            for (const n of Array.from(r.addedNodes)) {
              if (n.nodeType !== 1) continue;
              if ((n as Element).tagName === 'IFRAME') gate(n as HTMLIFrameElement);
              else scan(n as Element);
            }
          }
        });
  observer?.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  });
  scan(document);

  const unsubscribe = onConsentChange((state) => {
    granted = new Set(classify(state).granted);
    scan(document);
  });

  return {
    setStrings(s) {
      if (s.embedBlocked === strings.embedBlocked && s.embedLoad === strings.embedLoad) return;
      strings = s;
      for (const f of Array.from(document.querySelectorAll('iframe[srcdoc]'))) {
        const t = f.getAttribute(SRC_ATTR);
        if (t && !f.hasAttribute(ACTIVATED_ATTR)) render(f as HTMLIFrameElement, t);
      }
    },
    disconnect() {
      observer?.disconnect();
      unsubscribe();
    },
  };
}

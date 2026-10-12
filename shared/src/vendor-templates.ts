/**
 * Vendor templates — managed scripts built from a tag id instead of pasted code.
 *
 * WordPress.org does not allow plugins to save arbitrary JavaScript or CSS, so
 * the WordPress editor never asks for a script URL or snippet: the site owner
 * picks a known vendor, types only its id (e.g. `G-ABC123`), and the loader URL
 * is generated here. The WordPress plugin's PHP mirrors {@link VENDOR_TEMPLATES}
 * (`consentful_allowed_script_url`) and drops any managed script whose URL is not
 * one of these, so a hand-edited request cannot store anything else.
 */

import { TRACKER_CATALOG, type TrackerCategoryId } from './tracker-scan.js';

/** A known vendor whose blockable loader is generated from its id. */
export interface VendorTemplate {
  /** Tracker catalog id (e.g. `ga4`). */
  id: string;
  /** Display name (e.g. `Google Analytics 4`). */
  name: string;
  /** Display host (e.g. `googletagmanager.com`). */
  provider: string;
  /** Suggested consent category. */
  category: TrackerCategoryId;
  /** Format the id must match, or `null` when the loader takes no id. */
  idPattern: RegExp | null;
  /** Example id shown as the input placeholder (`''` when no id is needed). */
  idExample: string;
  /** Build the loader URL from a valid id. */
  url: (id: string) => string;
}

/** Id formats per vendor. A vendor not listed here loads a fixed, id-free library. */
const ID_FORMATS: Record<string, { pattern: RegExp; example: string }> = {
  ga4: { pattern: /^G-[A-Z0-9]{4,20}$/, example: 'G-ABC123XYZ' },
  gtm: { pattern: /^GTM-[A-Z0-9]{4,12}$/, example: 'GTM-ABC1234' },
  'google-ads': { pattern: /^AW-[0-9]{4,15}$/, example: 'AW-123456789' },
  hotjar: { pattern: /^[0-9]{4,12}$/, example: '1234567' },
  clarity: { pattern: /^[a-z0-9]{6,20}$/, example: 'abcdef1234' },
  intercom: { pattern: /^[a-z0-9]{6,20}$/, example: 'abc12345' },
};

/** Every catalog tracker that has a generated loader, in catalog order. */
export const VENDOR_TEMPLATES: readonly VendorTemplate[] = TRACKER_CATALOG.flatMap((sig) => {
  const loader = sig.loader;
  if (!loader) return [];
  const format = ID_FORMATS[sig.id];
  return [
    {
      id: sig.id,
      name: sig.name,
      provider: sig.provider,
      category: sig.category,
      idPattern: format ? format.pattern : null,
      idExample: format ? format.example : '',
      url: (id: string) => loader(format ? id : ''),
    },
  ];
});

/**
 * The loader URL for `vendor` with `id`, or `null` when the id is missing or
 * malformed (so nothing outside the template can be produced).
 */
export function vendorScriptUrl(vendor: VendorTemplate, id: string): string | null {
  const trimmed = id.trim();
  if (vendor.idPattern) {
    if (!vendor.idPattern.test(trimmed)) return null;
    return vendor.url(trimmed);
  }
  return vendor.url('');
}

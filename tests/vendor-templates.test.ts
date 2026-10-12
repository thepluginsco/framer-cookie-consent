import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { VENDOR_TEMPLATES, vendorScriptUrl } from '../shared/src/vendor-templates';

const byId = (id: string) => VENDOR_TEMPLATES.find((v) => v.id === id)!;

/** The PHP allowlist in the WordPress plugin, read as JS regexes. */
const phpPatterns = (() => {
  const php = readFileSync(resolve(__dirname, '../apps/wordpress-plugin/plugin/consentful/consentful.php'), 'utf8');
  return [...php.matchAll(/'#(\^https:[^#]+)#D'/g)].map((m) => new RegExp(m[1]!));
})();

describe('vendor templates', () => {
  it('builds the loader URL from a valid id', () => {
    expect(vendorScriptUrl(byId('ga4'), ' G-ABC123 ')).toBe('https://www.googletagmanager.com/gtag/js?id=G-ABC123');
    expect(vendorScriptUrl(byId('hotjar'), '1234567')).toBe('https://static.hotjar.com/c/hotjar-1234567.js?sv=6');
  });

  it('rejects malformed ids, so no other URL can be produced', () => {
    expect(vendorScriptUrl(byId('ga4'), '')).toBeNull();
    expect(vendorScriptUrl(byId('ga4'), 'G-1&x=<script>')).toBeNull();
    expect(vendorScriptUrl(byId('clarity'), '../evil')).toBeNull();
  });

  it('loads id-free libraries without an id', () => {
    expect(vendorScriptUrl(byId('meta-pixel'), '')).toBe('https://connect.facebook.net/en_US/fbevents.js');
  });

  it('every generated URL passes the WordPress PHP allowlist', () => {
    expect(phpPatterns.length).toBeGreaterThan(0);
    for (const v of VENDOR_TEMPLATES) {
      const url = vendorScriptUrl(v, v.idExample)!;
      expect(url, v.id).not.toBeNull();
      expect(phpPatterns.some((p) => p.test(url)), url).toBe(true);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  buildLoaderHtml,
  cleanCustomCss,
  cleanFontFamily,
  cleanInlineScript,
  isPlaceholderLink,
  isPublicHttpsUrl,
  isSafeColor,
  isSafeLink,
  isSafeScriptUrl,
  sanitizeEndpoint,
  sanitizeForPublish,
  upgradeLink,
  toPublishedConfig,
  type CookieConsentConfig,
  type ManagedScript,
} from '../shared/src/index';

const script = (over: Partial<ManagedScript>): ManagedScript => ({
  id: 's1', name: 'Tag', provider: '', tagId: '', purpose: '', category: 'analytics',
  type: 'src', value: 'https://www.googletagmanager.com/gtag/js?id=G-1', async: true, ...over,
});

const paid = (over: Partial<CookieConsentConfig> = {}): CookieConsentConfig => ({
  ...DEFAULT_CONFIG,
  license: { ...DEFAULT_CONFIG.license, tier: 'pro' as CookieConsentConfig['license']['tier'] },
  ...over,
});

describe('publish sanitizer', () => {
  it('leaves a valid config unchanged', () => {
    const c = paid({ scripts: [script({}), script({ id: 's2', type: 'inline', value: 'window.x=1;' })] });
    expect(sanitizeForPublish(c)).toEqual(c);
  });

  it('accepts only safe links', () => {
    expect(isSafeLink('https://example.com/privacy')).toBe(true);
    expect(isSafeLink('/privacy')).toBe(true);
    expect(isSafeLink('#cookies')).toBe(true);
    expect(isSafeLink('mailto:dpo@example.com')).toBe(true);
    expect(isSafeLink('javascript:alert(1)')).toBe(false);
    expect(isSafeLink('data:text/html,<b>')).toBe(false);
    expect(isSafeLink('//evil.example')).toBe(false);
  });

  it('only allows https script URLs', () => {
    expect(isSafeScriptUrl('https://cdn.example.com/a.js')).toBe(true);
    expect(isSafeScriptUrl('http://cdn.example.com/a.js')).toBe(false);
    expect(isSafeScriptUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeScriptUrl('https://x.com/"><script>')).toBe(false);
  });

  it('unwraps a pasted <script> wrapper and rejects other markup', () => {
    expect(cleanInlineScript('<script>gtag("js")</script>')).toBe('gtag("js")');
    expect(cleanInlineScript('<script src="https://x.com/a.js"></script>')).toBeNull();
    expect(cleanInlineScript('a();</script><img src=x onerror=alert(1)>')).toBeNull();
    expect(cleanInlineScript('   ')).toBeNull();
  });

  it('drops unsafe managed scripts and keeps valid ones', () => {
    const out = sanitizeForPublish(paid({
      scripts: [
        script({ id: 'ok' }),
        script({ id: 'bad-url', value: 'javascript:alert(1)' }),
        script({ id: 'bad-inline', type: 'inline', value: '<iframe src=x></iframe>' }),
      ],
    }));
    expect(out.scripts.map((s) => s.id)).toEqual(['ok']);
  });

  it('validates colours and fonts interpolated into the stylesheet', () => {
    expect(isSafeColor('#2F6FED')).toBe(true);
    expect(isSafeColor('rgb(10, 20, 30)')).toBe(true);
    expect(isSafeColor('red;}body{display:none')).toBe(false);
    expect(cleanFontFamily('Inter;}body{x:y}')).toBe('Interbodyx:y');
    const out = sanitizeForPublish(paid({ theme: { ...DEFAULT_CONFIG.theme, accent: 'red}*{x:y' } }));
    expect(out.theme.accent).toBe('#2F6FED');
  });

  it('constrains custom CSS', () => {
    expect(cleanCustomCss('</style><script>x</script>')).not.toContain('<');
    expect(cleanCustomCss('.a{width:expression(alert(1))}')).not.toMatch(/expression\s*\(/i);
    expect(cleanCustomCss('.a{background:url(javascript:alert(1))}')).not.toMatch(/javascript/i);
  });

  it('scopes every custom CSS rule to the banner', () => {
    expect(cleanCustomCss('.cc-btn{color:red}')).toBe('.cc-root .cc-btn{color:red}');
    expect(cleanCustomCss('.cc-root .cc-title{font-weight:800}')).toBe('.cc-root .cc-title{font-weight:800}');
    expect(cleanCustomCss('body{display:none}')).toBe('.cc-root{display:none}');
    expect(cleanCustomCss('*,a:is(.x,.y){color:red}')).toBe('.cc-root *,.cc-root a:is(.x,.y){color:red}');
    expect(cleanCustomCss('@media (max-width:600px){.cc-banner{padding:8px}}')).toBe(
      '@media (max-width:600px){.cc-root .cc-banner{padding:8px}}',
    );
    expect(cleanCustomCss('@keyframes pulse{from{opacity:0}to{opacity:1}}')).toBe('@keyframes pulse{from{opacity:0}to{opacity:1}}');
  });

  it('blocks every way custom CSS could load from elsewhere', () => {
    expect(cleanCustomCss('.a{background:url(https://x.com/a.png)}')).toBe('.cc-root .a{background:none}');
    expect(cleanCustomCss('.a{background:url("http://x.com/a.png")}')).toBe('.cc-root .a{background:none}');
    expect(cleanCustomCss('@import url(https://x.com/a.css);.a{color:red}')).toBe('.cc-root .a{color:red}');
    expect(cleanCustomCss('@import "https://x.com/a.css";.a{color:red}')).toBe('.cc-root .a{color:red}');
    expect(cleanCustomCss('@font-face{font-family:x;src:url(https://x.com/f.woff2)}.a{color:red}')).toBe('.cc-root .a{color:red}');
    expect(cleanCustomCss('.a{background:image-set("https://x.com/a.png" 1x)}')).toBe('.cc-root .a{background:none}');
    // A CSS escape (`u\72l` = `url`) can't smuggle a remote URL past the filter.
    expect(cleanCustomCss('.a{background:u\\72l(https://x.com/a.png)}')).not.toMatch(/url\(https:/);
    expect(cleanCustomCss('.a{background:url(data:image/png;base64,AAAA)}')).toBe('.cc-root .a{background:url(data:image/png;base64,AAAA)}');
  });

  it('is applied to every published config and loader', () => {
    const c = paid({
      strings: { ...DEFAULT_CONFIG.strings, privacyPolicyUrl: 'javascript:alert(1)' },
      advanced: { ...DEFAULT_CONFIG.advanced, customCss: '</style><b>' },
    });
    expect(toPublishedConfig(c).strings.privacyPolicyUrl).toBe('');
    const html = buildLoaderHtml(c);
    expect(html).not.toContain('javascript:alert');
    expect(html).not.toContain('</style>');
  });
  it('drops a template placeholder privacy link so the banner omits it', () => {
    expect(isPlaceholderLink('https://yoursite.com/privacy')).toBe(true);
    expect(isPlaceholderLink('https://www.yourdomain.com')).toBe(true);
    expect(isPlaceholderLink('https://acme.com/privacy')).toBe(false);
    const c = paid({ strings: { ...DEFAULT_CONFIG.strings, privacyPolicyUrl: 'https://yoursite.com/privacy' } });
    expect(toPublishedConfig(c).strings.privacyPolicyUrl).toBe('');
    const real = paid({ strings: { ...DEFAULT_CONFIG.strings, privacyPolicyUrl: 'https://acme.com/privacy' } });
    expect(toPublishedConfig(real).strings.privacyPolicyUrl).toBe('https://acme.com/privacy');
  });

  it('has no placeholder privacy link by default', () => {
    expect(DEFAULT_CONFIG.strings.privacyPolicyUrl).toBe('');
  });

  it('only accepts https:// URLs on a public host', () => {
    expect(isPublicHttpsUrl('https://consent-analytics.acme.workers.dev')).toBe(true);
    expect(isPublicHttpsUrl('http://consent-analytics.acme.workers.dev')).toBe(false);
    expect(isPublicHttpsUrl('https://localhost:8787')).toBe(false);
    expect(isPublicHttpsUrl('https://127.0.0.1/stats')).toBe(false);
    expect(isPublicHttpsUrl('https://10.0.0.5')).toBe(false);
    expect(isPublicHttpsUrl('https://[::1]/')).toBe(false);
    expect(isPublicHttpsUrl('https://api.acme.local')).toBe(false);
    expect(isPublicHttpsUrl('https://user:pass@acme.com')).toBe(false);
    expect(isPublicHttpsUrl('https://intranet')).toBe(false);
  });

  it('rejects insecure and non-production privacy links, upgrading http to https', () => {
    expect(isSafeLink('http://acme.com/privacy')).toBe(false);
    expect(isSafeLink('https://localhost/privacy')).toBe(false);
    expect(upgradeLink(' http://acme.com/privacy ')).toBe('https://acme.com/privacy');
    const http = paid({ strings: { ...DEFAULT_CONFIG.strings, privacyPolicyUrl: 'http://acme.com/privacy' } });
    expect(toPublishedConfig(http).strings.privacyPolicyUrl).toBe('https://acme.com/privacy');
    const local = paid({ strings: { ...DEFAULT_CONFIG.strings, privacyPolicyUrl: 'https://localhost:3000/privacy' } });
    expect(toPublishedConfig(local).strings.privacyPolicyUrl).toBe('');
  });

  it('drops insecure or non-production service endpoints at publish', () => {
    expect(sanitizeEndpoint('')).toBe('');
    expect(sanitizeEndpoint(' https://geo.acme.workers.dev ')).toBe('https://geo.acme.workers.dev');
    const c = paid({
      geo: { ...DEFAULT_CONFIG.geo, endpoint: 'http://geo.acme.com' },
      analytics: { ...DEFAULT_CONFIG.analytics, endpoint: 'https://localhost:8787' },
      receipts: { ...DEFAULT_CONFIG.receipts, endpoint: 'https://receipts.acme.com' },
    });
    const out = sanitizeForPublish(c);
    expect(out.geo.endpoint).toBe('');
    expect(out.analytics.endpoint).toBe('');
    expect(out.receipts.endpoint).toBe('https://receipts.acme.com');
  });
});

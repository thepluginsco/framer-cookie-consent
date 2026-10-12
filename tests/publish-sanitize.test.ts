import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  buildLoaderHtml,
  cleanCustomCss,
  cleanFontFamily,
  cleanInlineScript,
  isSafeColor,
  isSafeLink,
  isSafeScriptUrl,
  sanitizeForPublish,
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
    expect(cleanCustomCss('.a{color:red}')).toBe('.a{color:red}');
    expect(cleanCustomCss('</style><script>x</script>')).not.toContain('<');
    expect(cleanCustomCss('.a{width:expression(alert(1))}')).not.toMatch(/expression\s*\(/i);
    expect(cleanCustomCss('.a{background:url(javascript:alert(1))}')).not.toMatch(/javascript/i);
    expect(cleanCustomCss('.a{background:url("http://x.com/a.png")}')).toBe('.a{background:none}');
    expect(cleanCustomCss('.a{background:url(https://x.com/a.png)}')).toBe('.a{background:url(https://x.com/a.png)}');
    expect(cleanCustomCss('@import url(http://x.com/a.css);.a{}')).toBe('.a{}');
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
});

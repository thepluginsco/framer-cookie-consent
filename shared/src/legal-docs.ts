/**
 * Bundled legal-doc generator (Phase 4.3).
 *
 * A pure, dependency-free engine that turns a {@link CookieConsentConfig} — the
 * SAME config the banner runs on — into human-readable **legal documents**: a
 * Cookie Policy and a compact, cookie-focused Privacy Policy, as Markdown the
 * author can copy or download. This is Termly's wedge, done the ∅-infra way: no
 * account, no server, no phone-home. The banner config is already the source of
 * truth for *what* the site does with cookies, so the policy is derived from it
 * and can never drift from the actual banner.
 *
 * Design rules (mirror {@link ./config-schema.ts} and {@link ./tracker-scan.ts}):
 * - NO external dependencies and NO DOM. Pure string functions, so they run in
 *   the plugin, the App shells, and Node tests unchanged.
 * - PURE: never mutate the input config; deterministic for a given input (no
 *   `Date.now()` inside — the effective date is passed in), so trivially tested.
 * - HONEST: the output is a template generated from configuration, not legal
 *   advice. Every document carries a review disclaimer, and the generator never
 *   invents facts it cannot derive from the config (it leaves bracketed
 *   placeholders for the author to fill instead).
 *
 * The generator DERIVES, it does not fabricate: category names/descriptions come
 * from the config's own strings, the services table comes from the author's
 * {@link ManagedScript} rows, and the "how consent works" section is read off
 * the real {@link BehaviorConfig} (consent model, GPC, Do-Not-Track, expiry,
 * receipts) — so the policy always matches how the banner actually behaves.
 */

import type {
  CookieConsentConfig,
  ConsentCategory,
  ManagedScript,
  ConsentModeSignal,
} from './config-schema.js';
import { TRACKER_CATALOG } from './tracker-scan.js';

/* -------------------------------------------------------------------------- */
/* Inputs & outputs                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Site-level facts the generator cannot read from the banner config. Every field
 * is optional; a missing one becomes a clearly-bracketed placeholder in the
 * output (e.g. `[Your Company]`) rather than a fabricated value, so the author
 * knows exactly what still needs filling in.
 */
export interface LegalDocInput {
  /** Website / product name shown to visitors (e.g. `"Acme"`). */
  siteName?: string;
  /** Legal entity operating the site (defaults to {@link siteName}). */
  entityName?: string;
  /** Public site URL (e.g. `"https://acme.com"`). */
  siteUrl?: string;
  /** Contact email for privacy / data requests. */
  contactEmail?: string;
  /**
   * Effective date, as a display string (e.g. `"2026-09-19"` or
   * `"19 September 2026"`). PASSED IN so the generator stays pure/deterministic;
   * empty → a `[Effective date]` placeholder.
   */
  effectiveDate?: string;
}

/** One generated legal document. */
export interface GeneratedDoc {
  /** Document heading (e.g. `"Cookie Policy"`). */
  title: string;
  /** Suggested download filename (e.g. `"cookie-policy.md"`). */
  filename: string;
  /** The document body as Markdown. */
  markdown: string;
}

/** Both generated documents. */
export interface GeneratedLegalDocs {
  cookiePolicy: GeneratedDoc;
  privacyPolicy: GeneratedDoc;
}

/* -------------------------------------------------------------------------- */
/* Vendor enrichment (from the tracker catalog)                               */
/* -------------------------------------------------------------------------- */

/**
 * Canonical privacy-policy URLs for the well-known vendors in
 * {@link TRACKER_CATALOG}, keyed by the catalog's `vendor` field. Used to add a
 * "more info" link to a recognised service in the cookie table. Conservative —
 * only stable, first-party policy pages; an unrecognised vendor simply gets no
 * link (never a guessed one).
 */
export const VENDOR_POLICY_URLS: Readonly<Record<string, string>> = {
  Google: 'https://policies.google.com/privacy',
  Meta: 'https://www.facebook.com/privacy/policy',
  TikTok: 'https://www.tiktok.com/legal/privacy-policy',
  LinkedIn: 'https://www.linkedin.com/legal/privacy-policy',
  X: 'https://x.com/en/privacy',
  Pinterest: 'https://policy.pinterest.com/en/privacy-policy',
  Hotjar: 'https://www.hotjar.com/legal/policies/privacy/',
  Microsoft: 'https://privacy.microsoft.com/en-us/privacystatement',
  Twilio: 'https://www.twilio.com/en-us/legal/privacy',
  Mixpanel: 'https://mixpanel.com/legal/privacy-policy/',
  Plausible: 'https://plausible.io/privacy',
  Intercom: 'https://www.intercom.com/legal/privacy',
};

/** Lookup of a catalog entry by its display host (`provider`), lowercased. */
const CATALOG_BY_PROVIDER: ReadonlyMap<string, (typeof TRACKER_CATALOG)[number]> = new Map(
  TRACKER_CATALOG.map((t) => [t.provider.toLowerCase(), t] as const),
);

/**
 * Resolve a managed script to `{ vendor, policyUrl }` using the tracker catalog,
 * matching by provider host first, then by a case-insensitive name match. Returns
 * empty strings when unknown — the generator falls back to the author-entered
 * provider and adds no link.
 */
function vendorInfoFor(script: ManagedScript): { vendor: string; policyUrl: string } {
  const byProvider = script.provider ? CATALOG_BY_PROVIDER.get(script.provider.toLowerCase()) : undefined;
  const byName =
    byProvider ??
    (script.name
      ? TRACKER_CATALOG.find((t) => t.name.toLowerCase() === script.name.toLowerCase())
      : undefined);
  const vendor = byName?.vendor ?? '';
  const policyUrl = vendor ? VENDOR_POLICY_URLS[vendor] ?? '' : '';
  return { vendor, policyUrl };
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Escape the Markdown table cell separator so vendor text can't break the row. */
function cell(value: string): string {
  return (value || '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

/** A non-empty trimmed value, or the given bracketed placeholder. */
function orPlaceholder(value: string | undefined, placeholder: string): string {
  const v = (value ?? '').trim();
  return v.length > 0 ? v : placeholder;
}

/** Plain-language purpose for a Consent Mode signal, for the category summaries. */
const SIGNAL_PURPOSE: Readonly<Record<ConsentModeSignal, string>> = {
  ad_storage: 'advertising',
  ad_user_data: 'sharing data with advertising partners',
  ad_personalization: 'personalised advertising',
  analytics_storage: 'analytics and measurement',
  functionality_storage: 'site functionality',
  personalization_storage: 'personalisation',
  security_storage: 'security and fraud prevention',
};

/** Human-joined list ("a", "a and b", "a, b and c"). */
function humanList(items: string[]): string {
  const xs = items.filter(Boolean);
  if (xs.length === 0) return '';
  if (xs.length === 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1] ?? ''}`;
}

/** The visitor-facing label/description for a category (config strings win). */
function categoryStrings(config: CookieConsentConfig, cat: ConsentCategory): { label: string; description: string } {
  const override = config.strings.categories[cat.id];
  return {
    label: (override?.label || cat.label || cat.id).trim(),
    description: (override?.description || cat.description || '').trim(),
  };
}

/* -------------------------------------------------------------------------- */
/* Shared sections                                                            */
/* -------------------------------------------------------------------------- */

/** The review disclaimer stamped on every generated document. */
const DISCLAIMER =
  '> **Note:** This document was generated from your cookie-banner configuration ' +
  'as a starting template. It is not legal advice. Review it with a qualified ' +
  'professional and adjust it to your actual data practices before publishing.';

/**
 * Describe, in prose, how consent is obtained and can be changed — read straight
 * off the real {@link BehaviorConfig}, so it always matches the banner.
 */
function consentMechanicsParagraphs(config: CookieConsentConfig): string[] {
  const { behavior, advanced, receipts } = config;
  const out: string[] = [];

  if (behavior.consentModel === 'opt-in') {
    out.push(
      'We ask for your consent before setting any non-essential cookies. Until you ' +
        'accept, only strictly necessary cookies are used, and all other tracking ' +
        'scripts are blocked.',
    );
  } else if (behavior.consentModel === 'opt-out') {
    out.push(
      'Non-essential cookies covered by your default preferences may be set when you ' +
        'first arrive. You can opt out at any time using the controls described below, ' +
        'and we will stop the corresponding cookies.',
    );
  } else {
    out.push(
      'The way we ask for consent adapts to your location: in regions that require ' +
        'prior consent (such as the EU/EEA, the UK, Switzerland and California) no ' +
        'non-essential cookies are set until you accept; elsewhere, default ' +
        'preferences may apply and you can opt out at any time.',
    );
  }

  const controls: string[] = [];
  if (advanced.floatingButton) {
    controls.push('the persistent cookie-settings button shown on every page');
  } else {
    controls.push('reopening the cookie preferences from the banner');
  }
  out.push(
    `You can review or change your choices at any time by ${humanList(controls)}. ` +
      (behavior.consentExpiryDays > 0
        ? `We remember your decision for ${behavior.consentExpiryDays} days, after which we ask again.`
        : 'We ask for your decision again on each new session.'),
  );

  const honored: string[] = [];
  if (behavior.respectGpc) {
    honored.push(
      'a Global Privacy Control (GPC) signal from your browser as an opt-out of the ' +
        'sale or sharing of personal information',
    );
  }
  if (behavior.respectDoNotTrack) {
    honored.push('a Do Not Track signal from your browser as a rejection of non-essential cookies');
  }
  if (honored.length > 0) {
    out.push(`We also honour ${humanList(honored)}.`);
  }

  if (receipts.enabled) {
    out.push(
      'Each time you make a choice we create a timestamped record of it, which you can ' +
        'download for your records from the cookie preferences.',
    );
  }

  return out;
}

/**
 * The category summary list + the per-service table, shared by both documents.
 * Categories with no visible purpose are still listed; the necessary category is
 * always described as required.
 */
function categoriesAndServices(config: CookieConsentConfig): string {
  const lines: string[] = [];

  lines.push('### Categories of cookies we use', '');
  for (const cat of config.categories) {
    const { label, description } = categoryStrings(config, cat);
    const requiredNote = cat.required ? ' _(always active — required for the site to work)_' : '';
    const purposes = humanList(
      (cat.signals || [])
        .map((s) => SIGNAL_PURPOSE[s])
        .filter((v, i, a) => v && a.indexOf(v) === i),
    );
    const desc = description || (purposes ? `Used for ${purposes}.` : '');
    lines.push(`- **${label}**${requiredNote}${desc ? ` — ${desc}` : ''}`);
  }
  lines.push('');

  const scripts = config.scripts;
  lines.push('### Services and tracking technologies', '');
  if (scripts.length === 0) {
    lines.push(
      'Beyond the strictly necessary cookies required to operate the site, we do not ' +
        'currently load any third-party tracking services through this banner. If that ' +
        'changes, this policy and the banner will be updated together.',
      '',
    );
    return lines.join('\n');
  }

  const catLabelById = new Map(config.categories.map((c) => [c.id, categoryStrings(config, c).label] as const));
  lines.push('| Service | Provider | Category | Purpose |', '| --- | --- | --- | --- |');
  for (const s of scripts) {
    const info = vendorInfoFor(s);
    const providerText = info.policyUrl
      ? `[${cell(s.provider || info.vendor || s.name)}](${info.policyUrl})`
      : cell(s.provider || info.vendor || '—');
    const purpose = s.purpose?.trim() || (info.vendor ? `${info.vendor} service` : 'See provider documentation');
    const name = cell(s.name || s.provider || 'Managed script') + (s.tagId ? ` (${cell(s.tagId)})` : '');
    const catLabel = catLabelById.get(s.category) ?? s.category;
    lines.push(`| ${name} | ${providerText} | ${cell(catLabel)} | ${cell(purpose)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/* -------------------------------------------------------------------------- */
/* Cookie Policy                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Generate a Cookie Policy from the banner config. Pure and deterministic.
 *
 * @param config - The active {@link CookieConsentConfig}.
 * @param input  - Site-level facts the config cannot supply (name, contact, …).
 * @returns The document `{ title, filename, markdown }`.
 */
export function generateCookiePolicy(
  config: CookieConsentConfig,
  input: LegalDocInput = {},
): GeneratedDoc {
  const site = orPlaceholder(input.siteName, '[Your Website]');
  const entity = orPlaceholder(input.entityName || input.siteName, '[Your Company]');
  const effective = orPlaceholder(input.effectiveDate, '[Effective date]');

  const md: string[] = [];
  md.push('# Cookie Policy', '');
  md.push(`_Effective date: ${effective}_`, '');
  md.push(DISCLAIMER, '');
  md.push(
    `This Cookie Policy explains how ${entity} ("we", "us") uses cookies and similar ` +
      `technologies on ${site} and how you can control them.`,
    '',
  );

  md.push('## What are cookies?', '');
  md.push(
    'Cookies are small text files placed on your device when you visit a website. ' +
      'They are widely used to make sites work, to remember your preferences, and to ' +
      'provide reporting information. Similar technologies such as local storage and ' +
      'tracking pixels are covered by this policy too.',
    '',
  );

  md.push('## How we ask for your consent', '');
  for (const p of consentMechanicsParagraphs(config)) md.push(p, '');

  md.push('## The cookies we use', '');
  md.push(categoriesAndServices(config));

  md.push('## Contact', '');
  md.push(
    `If you have questions about this Cookie Policy or your choices, contact us at ` +
      `${orPlaceholder(input.contactEmail, '[contact email]')}.`,
    '',
  );

  return { title: 'Cookie Policy', filename: 'cookie-policy.md', markdown: md.join('\n').trimEnd() + '\n' };
}

/* -------------------------------------------------------------------------- */
/* Privacy Policy (cookie-focused)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Generate a compact, cookie-focused Privacy Policy from the banner config.
 *
 * This deliberately covers ONLY the tracking/cookies dimension the banner
 * governs — the part the config can honestly describe — and leaves the wider
 * data-processing sections (what personal data you collect, legal bases,
 * retention, third-party sharing beyond trackers, data-subject rights procedures)
 * as clearly-marked placeholders for the author. It is a scaffold, not a
 * substitute for a full privacy policy. Pure and deterministic.
 */
export function generatePrivacyPolicy(
  config: CookieConsentConfig,
  input: LegalDocInput = {},
): GeneratedDoc {
  const site = orPlaceholder(input.siteName, '[Your Website]');
  const entity = orPlaceholder(input.entityName || input.siteName, '[Your Company]');
  const effective = orPlaceholder(input.effectiveDate, '[Effective date]');
  const contact = orPlaceholder(input.contactEmail, '[contact email]');

  const md: string[] = [];
  md.push('# Privacy Policy', '');
  md.push(`_Effective date: ${effective}_`, '');
  md.push(DISCLAIMER, '');
  md.push(
    `${entity} ("we", "us") operates ${site}. This policy describes how we handle ` +
      'personal information, with a focus on cookies and tracking technologies. ' +
      'Sections marked _[to complete]_ should be filled in to reflect your full data ' +
      'practices.',
    '',
  );

  md.push('## Information we collect _[to complete]_', '');
  md.push(
    'Describe the personal information you collect directly (for example account ' +
      'details, form submissions, support requests) and why. The cookie-based ' +
      'collection is detailed in the section below.',
    '',
  );

  md.push('## Cookies and tracking', '');
  for (const p of consentMechanicsParagraphs(config)) md.push(p, '');
  md.push(categoriesAndServices(config));

  md.push('## Sharing your information _[to complete]_', '');
  md.push(
    'The recognised third-party services above receive data as part of their function. ' +
      'List any other recipients (processors, analytics providers, payment providers) ' +
      'and the safeguards that apply to international transfers.',
    '',
  );

  md.push('## Your rights _[to complete]_', '');
  md.push(
    'Depending on where you live, you may have rights to access, correct, delete or ' +
      'port your personal information, and to object to or restrict certain processing. ' +
      'Describe how a visitor can exercise these rights. You can change your cookie ' +
      'choices at any time as described above.',
    '',
  );

  md.push('## Contact', '');
  md.push(`For any privacy request or question, contact us at ${contact}.`, '');

  return { title: 'Privacy Policy', filename: 'privacy-policy.md', markdown: md.join('\n').trimEnd() + '\n' };
}

/* -------------------------------------------------------------------------- */
/* Convenience                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Generate both the Cookie Policy and the (cookie-focused) Privacy Policy in one
 * call. Pure; a thin wrapper over {@link generateCookiePolicy} and
 * {@link generatePrivacyPolicy}.
 */
export function generateLegalDocs(
  config: CookieConsentConfig,
  input: LegalDocInput = {},
): GeneratedLegalDocs {
  return {
    cookiePolicy: generateCookiePolicy(config, input),
    privacyPolicy: generatePrivacyPolicy(config, input),
  };
}

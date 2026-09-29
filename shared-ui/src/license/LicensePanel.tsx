/**
 * The License panel — identical on every platform (Framer, Webflow, WordPress,
 * Shopify, Wix, universal embed).
 *
 * Licensing is a portal concern: the user pastes a license key and the editor
 * activates the site's DOMAIN against it (a seat) via {@link useLicense}; the
 * published runtime then unlocks on its own by verifying a domain-scoped token
 * at boot. Hosts that can't detect their live domain (e.g. the universal embed,
 * or a site not yet published) let the user type it.
 */

import { useEffect, useState } from "react"

import { PORTAL_DASHBOARD_URL, type LicenseTier } from "@framer-cookie-consent/shared"

import type { ConsentfulModel } from "../model"
import { T } from "../tokens"
import { Button, Card, Eyebrow, Icon } from "../ui"
import { useLicense, type LicenseStatus } from "./use-license"

const STATUS_PILL: Record<LicenseStatus, { color: string; bg: string }> = {
  trial: { color: T.ink3, bg: T.sunken },
  validating: { color: "#3d5680", bg: T.accentSoft },
  active: { color: T.successText, bg: T.successSoft },
  invalid: { color: T.danger, bg: T.dangerSoft },
  offline: { color: T.warn, bg: T.warnSoft },
}

const TIER_LABEL: Record<LicenseTier, string> = {
  trial: "Free",
  lifetime: "Lifetime",
  pro: "Pro",
  agency: "Agency",
}

/** Every paid plan unlocks all of these (flat gating); plans differ only by site count. */
const PRO_FEATURES = [
  { label: "Every layout, theme & custom CSS", description: "Cards, modals, your colours — not just the basic bar." },
  { label: "Remove “Powered by Consentful”", description: "Hide the credit on your banner." },
  { label: "Geo-targeting", description: "Auto opt-in / opt-out by visitor region." },
  { label: "Multi-language banners", description: "Serve the banner in the visitor's language." },
  { label: "Preference center & A/B testing", description: "Per-vendor toggles and consent-rate experiments." },
  { label: "Consent analytics", description: "See accept / reject rates over time." },
] as const

function statusPillText(status: LicenseStatus, tier: LicenseTier): string {
  switch (status) {
    case "active":
      return `${TIER_LABEL[tier]} · Active`
    case "validating":
      return "Activating…"
    case "invalid":
      return "Not activated"
    case "offline":
      return "Offline · last status"
    default:
      return "Not activated"
  }
}

const inputStyle = (busy: boolean, mono: boolean) => ({
  flex: 1,
  minWidth: 0,
  height: T.control,
  boxSizing: "border-box" as const,
  padding: `0 ${T.controlPadX}px`,
  border: `1px solid ${T.border}`,
  borderRadius: T.rMd,
  background: busy ? T.sunken : T.surface,
  fontFamily: mono ? T.mono : "inherit",
  fontSize: 12,
  color: T.ink,
  outline: "none",
})

export function LicensePanel({ m }: { m: ConsentfulModel }) {
  void m
  const lic = useLicense()
  const licensed = lic.status === "active"
  /** Activated on a paid plan (Free keys activate too, but unlock nothing). */
  const paid = licensed && lic.tier !== "trial"
  const busy = lic.status === "validating"

  const [draft, setDraft] = useState(lic.key)
  useEffect(() => {
    setDraft(lic.key)
  }, [lic.key])

  const [domainDraft, setDomainDraft] = useState(lic.domain ?? "")
  useEffect(() => {
    if (lic.domain) setDomainDraft(lic.domain)
  }, [lic.domain])

  const pill = STATUS_PILL[lic.status]
  const activateNow = () => {
    if (!lic.domainFromHost && domainDraft.trim()) lic.setDomain(domainDraft)
    void lic.enterKey(draft)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: "-.01em" }}>License key</div>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".02em", padding: "4px 10px", borderRadius: T.rPill, color: pill.color, background: pill.bg }}>
            {statusPillText(lic.status, lic.tier)}
          </span>
        </div>

        {!lic.domainFromHost ? (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: T.ink2, marginBottom: 6 }}>Site domain</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder="example.com"
                value={domainDraft}
                disabled={busy}
                onChange={(e) => setDomainDraft(e.target.value)}
                onBlur={() => !licensed && domainDraft.trim() && lic.setDomain(domainDraft)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && licensed && domainDraft.trim()) void lic.bindDomain(domainDraft)
                }}
                style={inputStyle(busy, false)}
              />
              {licensed ? (
                <Button variant="secondary" disabled={busy || !domainDraft.trim()} onClick={() => void lic.bindDomain(domainDraft)}>
                  Save domain
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="CNSNT-XXXX-XXXX-XXXX"
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim() && !busy) activateNow()
            }}
            style={inputStyle(busy, true)}
          />
          {licensed ? (
            <Button variant="secondary" onClick={() => void lic.removeKey()}>Remove</Button>
          ) : (
            <Button variant="dark" loading={busy} disabled={!draft.trim()} onClick={activateNow}>
              {busy ? "Activating…" : "Activate"}
            </Button>
          )}
        </div>

        {lic.message ? (
          <div style={{ fontSize: 11.5, color: lic.status === "invalid" ? T.danger : lic.status === "offline" ? T.warn : T.ink3, marginTop: 9, lineHeight: 1.5 }}>
            {lic.message}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: T.ink4, marginTop: 9, lineHeight: 1.5 }}>
            {licensed
              ? lic.isDev
                ? `Preview domain ${lic.domain ?? ""} — runs the full banner free. Add your real domain on the dashboard (or activate again after publishing to it).`
                : paid
                  ? `Activated for ${lic.domain ?? "this site"} and all its subdomains. Your live site unlocks automatically — the key is never shown on the page.`
                  : `Free plan activated for ${lic.domain ?? "this site"}: your live site shows the basic banner with the Consentful credit. Upgrade to unlock the full design.`
              : `Your live site shows no banner until its domain is activated — get a free key at consentful.theplugins.co and paste it here. Preview domains (*.framer.website, *.webflow.io, localhost…) always show the banner.`}
          </div>
        )}

        {licensed ? (
          <button type="button" onClick={() => void lic.refresh()} style={{ marginTop: 10, border: "none", background: "transparent", color: T.accentText, fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>
            Re-check now
          </button>
        ) : null}
      </Card>

      <Card style={{ padding: "6px 16px 12px" }}>
        <Eyebrow style={{ margin: "13px 0 4px" }}>{paid ? `${TIER_LABEL[lic.tier]} unlocks` : "Unlock with any paid plan"}</Eyebrow>
        {PRO_FEATURES.map((f, i) => (
          <div key={f.label} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: i < PRO_FEATURES.length - 1 ? `1px solid ${T.hairline}` : "none", opacity: paid ? 1 : 0.62 }}>
            <Icon name={paid ? "check_circle" : "lock"} size={18} color={paid ? T.accent : "#b9bec6"} style={{ marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{f.label}</div>
              <div style={{ fontSize: 11, color: T.ink3, marginTop: 1, lineHeight: 1.4 }}>{f.description}</div>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 11, fontSize: 11.5, color: T.ink3 }}>
          <Icon name="devices" size={16} color={T.ink4} />
          {paid && lic.maxSites !== null
            ? `${lic.maxSites} ${lic.maxSites === 1 ? "site" : "sites"} on your plan · any platform`
            : "Free 1 site · Solo 1 · Studio 5 · Agency 25 · Lifetime 3 — any platform"}
        </div>
      </Card>

      <a
        href={paid ? `${PORTAL_DASHBOARD_URL}/licenses` : licensed ? `${PORTAL_DASHBOARD_URL}/pricing` : `${PORTAL_DASHBOARD_URL}/signup`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: T.control, borderRadius: T.rLg, background: paid ? T.surface : "linear-gradient(150deg,#6a3cf0,#4b23d3)", color: paid ? T.ink : "#fff", border: paid ? `1px solid ${T.border}` : "none", fontSize: 13.5, fontWeight: 700, textDecoration: "none", boxShadow: paid ? "none" : `0 6px 16px ${T.accent}44` }}
      >
        <Icon name={paid ? "settings" : licensed ? "shopping_bag" : "key"} size={18} color={paid ? T.ink3 : "#fff"} />
        {paid ? "Manage your sites" : licensed ? "Upgrade to Pro" : "Get a free key"}
      </a>
    </div>
  )
}

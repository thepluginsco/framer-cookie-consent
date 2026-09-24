/**
 * The Framer License panel — host-injected into the shared Consentful shell.
 *
 * Licensing is a portal concern: the user pastes a license key and the plugin
 * activates the site's published DOMAIN against it (a seat) via
 * {@link useLicense}; the published runtime then unlocks on its own by verifying
 * a domain-scoped token at boot. This panel is the Framer-side surface for that
 * activation. The shell renders it through `host.LicensePanel` when
 * `host.showLicenseTab` is true.
 */

import { useEffect, useState } from "react"

import { PORTAL_DASHBOARD_URL, type LicenseTier } from "@framer-cookie-consent/shared"
import { Button, Card, Eyebrow, Icon, T, type ConsentfulModel } from "@framer-cookie-consent/shared-ui"

import { useLicense, type LicenseStatus } from "../hooks/useLicense"
import { LICENSE_FEATURES, hasFeature } from "../lib/entitlements"

const STATUS_PILL: Record<LicenseStatus, { color: string; bg: string }> = {
  trial: { color: T.ink3, bg: T.sunken },
  validating: { color: "#3d5680", bg: T.accentSoft },
  active: { color: T.successText, bg: T.successSoft },
  invalid: { color: T.danger, bg: T.dangerSoft },
  offline: { color: T.warn, bg: T.warnSoft },
}

const TIER_LABEL: Record<LicenseTier, string> = {
  trial: "Free trial",
  lifetime: "Lifetime",
  pro: "Pro",
  agency: "Agency",
}

function statusPillText(status: LicenseStatus, tier: LicenseTier): string {
  switch (status) {
    case "active":
      return `${TIER_LABEL[tier]} · Active`
    case "validating":
      return "Activating…"
    case "invalid":
      return "Invalid key"
    case "offline":
      return "Offline · last status"
    default:
      return "Free plan"
  }
}

export function FramerLicensePanel({ m }: { m: ConsentfulModel }) {
  void m
  const lic = useLicense()
  const licensed = lic.status === "active"
  const busy = lic.status === "validating"

  const [draft, setDraft] = useState(lic.key)
  useEffect(() => {
    setDraft(lic.key)
  }, [lic.key])

  const pill = STATUS_PILL[lic.status]

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: "-.01em" }}>License key</div>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".02em", padding: "4px 10px", borderRadius: T.rPill, color: pill.color, background: pill.bg }}>
            {statusPillText(lic.status, lic.tier)}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim() && !busy) void lic.enterKey(draft)
            }}
            style={{ flex: 1, minWidth: 0, height: T.control, boxSizing: "border-box", padding: `0 ${T.controlPadX}px`, border: `1px solid ${T.border}`, borderRadius: T.rMd, background: busy ? T.sunken : T.surface, fontFamily: T.mono, fontSize: 12, color: T.ink, outline: "none" }}
          />
          {licensed ? (
            <Button variant="secondary" onClick={() => void lic.removeKey()}>Remove</Button>
          ) : (
            <Button variant="dark" loading={busy} disabled={!draft.trim()} onClick={() => void lic.enterKey(draft)}>
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
              ? lic.domain
                ? `Activated for ${lic.domain}. Your live site unlocks automatically — no key is exposed on the page.`
                : "Activated. Your live site unlocks automatically — no key is exposed on the page."
              : lic.domain
                ? `Paste your license key to activate ${lic.domain}. Buy a key on the portal, then activate here.`
                : "Publish your site, then paste your license key here to activate its domain."}
          </div>
        )}

        {licensed ? (
          <button type="button" onClick={() => void lic.refresh()} style={{ marginTop: 10, border: "none", background: "transparent", color: T.accentText, fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>
            Re-activate now
          </button>
        ) : null}
      </Card>

      <Card style={{ padding: "6px 16px 12px" }}>
        <Eyebrow style={{ margin: "13px 0 4px" }}>{licensed ? `${TIER_LABEL[lic.tier]} unlocks` : "Unlock with a license"}</Eyebrow>
        {LICENSE_FEATURES.map((f, i) => {
          const on = hasFeature(lic.tier, f.key)
          return (
            <div key={f.key} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: i < LICENSE_FEATURES.length - 1 ? `1px solid ${T.hairline}` : "none", opacity: on ? 1 : 0.62 }}>
              <Icon name={on ? "check_circle" : "lock"} size={18} color={on ? T.accent : "#b9bec6"} style={{ marginTop: 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{f.label}</div>
                <div style={{ fontSize: 11, color: T.ink3, marginTop: 1, lineHeight: 1.4 }}>{f.description}</div>
              </div>
            </div>
          )
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 11, fontSize: 11.5, color: T.ink3 }}>
          <Icon name="devices" size={16} color={T.ink4} />
          {lic.entitlements.maxSites === Infinity ? "Unlimited sites" : `${lic.entitlements.maxSites} ${lic.entitlements.maxSites === 1 ? "site" : "sites"}`}
        </div>
      </Card>

      <a
        href={PORTAL_DASHBOARD_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: T.control, borderRadius: T.rLg, background: licensed ? T.surface : "linear-gradient(150deg,#6a3cf0,#4b23d3)", color: licensed ? T.ink : "#fff", border: licensed ? `1px solid ${T.border}` : "none", fontSize: 13.5, fontWeight: 700, textDecoration: "none", boxShadow: licensed ? "none" : `0 6px 16px ${T.accent}44` }}
      >
        <Icon name={licensed ? "settings" : "shopping_bag"} size={18} color={licensed ? T.ink3 : "#fff"} />
        {licensed ? "Manage your license" : "Buy a license"}
      </a>
    </div>
  )
}

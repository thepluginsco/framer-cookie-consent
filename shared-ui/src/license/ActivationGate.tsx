/**
 * ActivationGate — the full-window license screen every Consentful editor shows
 * until the site is activated (the LingoLens / MediaGrabber pattern). Nothing
 * of the editor renders behind it: a free or paid key must be activated for
 * this site's domain first. Free keys come from signing up on the portal.
 *
 * It drives the shell's own {@link useLicense} instance (passed in), so a
 * successful activation unlocks the shell immediately.
 */

import { useEffect, useState } from "react"
import { PORTAL_DASHBOARD_URL } from "@framer-cookie-consent/shared"

import logoUrl from "../assets/logo.png"
import { T } from "../tokens"
import { Button, Icon } from "../ui"
import type { LicenseApi } from "./use-license"

const STEPS: Array<[string, string]> = [
  ["Create a free account", "Sign up on the Consentful dashboard — no card needed."],
  ["Copy your license key", "Your free key is issued right after sign-up (paid plans work too)."],
  ["Paste it here", "Enter the key below, with your site's domain if it isn't detected."],
  ["Activate", "One key = one site on Free. Upgrade any time for more sites and Pro."],
]

const fieldStyle = (disabled: boolean, mono: boolean) => ({
  width: "100%",
  height: 40,
  boxSizing: "border-box" as const,
  padding: "0 12px",
  border: `1px solid ${T.border}`,
  borderRadius: T.rMd,
  background: disabled ? T.sunken : T.surface,
  fontFamily: mono ? T.mono : "inherit",
  fontSize: 13,
  color: T.ink,
  outline: "none",
})

export function ActivationGate({ lic }: { lic: LicenseApi }) {
  const busy = lic.status === "validating"
  const [key, setKey] = useState(lic.key)
  const [domain, setDomain] = useState(lic.domain ?? "")
  const [showSteps, setShowSteps] = useState(false)
  useEffect(() => {
    if (lic.domain && !domain) setDomain(lic.domain)
  }, [lic.domain, domain])

  const needsDomain = !lic.domainFromHost
  const canSubmit = !!key.trim() && (!needsDomain || !!domain.trim()) && !busy
  const submit = () => {
    if (!canSubmit) return
    if (needsDomain) lic.setDomain(domain)
    void lic.enterKey(key)
  }
  const error = lic.status === "invalid" || lic.status === "offline" ? lic.message : null

  return (
    <div
      className="cf-app"
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "auto",
        background: T.ground,
        fontFamily: T.sans,
        color: T.ink,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div aria-hidden style={{ height: 3, background: T.iris, flex: "0 0 auto" }} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 20px" }}>
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 18,
            boxShadow: T.shLg,
            padding: "28px 28px 24px",
          }}
        >
          <img src={logoUrl} alt="Consentful by The Plugins Company" style={{ height: 44, width: "auto", display: "block", margin: "0 auto 18px" }} />
          <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-.02em", textAlign: "center", margin: 0 }}>
            Activate Consentful
          </h1>
          <p style={{ fontSize: 12.5, color: T.ink3, textAlign: "center", lineHeight: 1.5, margin: "6px 0 20px" }}>
            Every site needs a license key — Free or paid. Your key stays in the editor and is never shown on your site.
          </p>

          {needsDomain ? (
            <label style={{ display: "block", marginBottom: 12 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: T.ink2, marginBottom: 6 }}>Site domain</div>
              <input
                type="text"
                placeholder="example.com"
                value={domain}
                disabled={busy}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                style={fieldStyle(busy, false)}
              />
            </label>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: T.ink2, marginBottom: 12 }}>
              <Icon name="language" size={16} color={T.ink4} />
              Activating <strong style={{ color: T.ink }}>{lic.domain}</strong>
            </div>
          )}

          <label style={{ display: "block" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: T.ink2, marginBottom: 6 }}>License key</div>
            <input
              type="text"
              placeholder="CNSNT-XXXX-XXXX-XXXX"
              value={key}
              disabled={busy}
              autoFocus
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              style={fieldStyle(busy, true)}
            />
          </label>

          {error ? (
            <div style={{ fontSize: 12, color: lic.status === "offline" ? T.warn : T.danger, lineHeight: 1.5, marginTop: 10 }}>{error}</div>
          ) : (
            <div style={{ fontSize: 11, color: T.ink4, lineHeight: 1.5, marginTop: 10 }}>
              Preview domains (*.framer.website, *.webflow.io, localhost…) activate free without using a site.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18 }}>
            <Button variant="primary" size="lg" full loading={busy} disabled={!canSubmit} onClick={submit}>
              {busy ? "Activating…" : "Activate"}
            </Button>
            <Button variant="secondary" size="lg" full icon="key" onClick={() => setShowSteps(true)}>
              Get a free license key
            </Button>
          </div>
        </div>
      </div>
      <div style={{ textAlign: "center", fontSize: 10.5, color: T.ink4, padding: "0 0 14px" }}>
        © Consentful · The Plugins Company
      </div>

      {showSteps && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Get your license key"
          onClick={() => setShowSteps(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 380, maxHeight: "100%", overflowY: "auto", boxSizing: "border-box", background: T.surface, borderRadius: 16, boxShadow: T.shLg, padding: 22 }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-.01em", marginBottom: 14 }}>Get your license key</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {STEPS.map(([title, body], i) => (
                <div key={title} style={{ display: "flex", gap: 11 }}>
                  <div
                    style={{
                      flex: "0 0 auto",
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: T.accent,
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{title}</div>
                    <div style={{ fontSize: 11.5, color: T.ink3, lineHeight: 1.45, marginTop: 1 }}>{body}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <a
                href={`${PORTAL_DASHBOARD_URL}/signup`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: T.control,
                  borderRadius: T.rMd,
                  background: "linear-gradient(150deg,#6a3cf0,#4b23d3)",
                  color: "#fff",
                  fontSize: 12.5,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Create free account
              </a>
              <Button variant="secondary" onClick={() => setShowSteps(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

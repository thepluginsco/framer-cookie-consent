/**
 * The live preview — a mock browser rendering the banner (or preferences
 * dialog) exactly as configured. Rendered inside the shell's slide-over drawer,
 * so it fills its container's width and reflects layout, position, theme,
 * accent, radius, overlay and copy live. Mirrors the runtime banner design
 * (see runtime/src/banner.ts + styles.ts): a cookie hero, sectioned modal,
 * tinted per-category icon tiles.
 */

import type { CSSProperties } from "react"

import logoUrl from "./assets/logo.png"
import cookieUrl from "./assets/cookie.png"
import settingsCookieUrl from "./assets/settings-cookie.png"
import { T } from "./tokens"
import { Icon, Segmented, Toggle } from "./ui"
import type { Cfg } from "./model"

export type PreviewMode = "banner" | "prefs"

/** Tinted icon tile spec per well-known category (matches the runtime modal). */
const CAT_TILE: Record<string, { glyph: string; bg: string; fg: string }> = {
  necessary: { glyph: "lock", bg: "#eef0f4", fg: "#6b7280" },
  analytics: { glyph: "bar_chart", bg: "#e6efff", fg: "#3b7bf6" },
  marketing: { glyph: "campaign", bg: "#f1e9ff", fg: "#8b5cf6" },
  preferences: { glyph: "tune", bg: "#e4f6ec", fg: "#1ba565" },
}
const catTile = (id: string) => CAT_TILE[id] ?? { glyph: "tune", bg: "#e4f6ec", fg: "#1ba565" }

export function PreviewPane({
  cfg,
  mode,
  onMode,
  onToggleCat,
}: {
  cfg: Cfg
  mode: PreviewMode
  onMode: (m: PreviewMode) => void
  onToggleCat: (id: string) => void
}) {
  const A = cfg.accent
  const dark = cfg.theme === "dark"
  const bBg = dark ? "#16181d" : "#ffffff"
  const bText = dark ? "#f4f5f7" : "#191b1f"
  const bSub = dark ? "#a9adb6" : "#6b7078"
  const bBorder = dark ? "#2c2f37" : "#eceef2"
  const rejBorder = dark ? "#3a3d45" : "#e2e4ea"
  const isBar = cfg.layout === "bar"
  const isModal = cfg.layout === "modal"
  const p = cfg.position
  const spanning = isModal || p === "center" || p === "bottom-center"

  const pos: CSSProperties = {}
  if (isBar) Object.assign(pos, { left: 0, right: 0, bottom: 0 })
  else if (isModal) Object.assign(pos, { left: 14, right: 14, top: "50%", transform: "translateY(-50%)" })
  else {
    pos.bottom = 14
    if (p === "bottom-left") pos.left = 14
    else if (p === "bottom-right") pos.right = 14
    else if (p === "bottom-center") Object.assign(pos, { left: 14, right: 14 })
    else if (p === "center") Object.assign(pos, { left: 14, right: 14, top: "50%", bottom: "auto", transform: "translateY(-50%)" })
  }

  const bannerStyle: CSSProperties = {
    position: "absolute",
    ...pos,
    zIndex: 2,
    background: bBg,
    borderRadius: isBar ? 0 : Math.max(cfg.radius, 12),
    border: `1px solid ${bBorder}`,
    boxShadow: isBar ? "0 -6px 20px rgba(23,28,45,.12)" : "0 18px 44px rgba(23,28,45,.24)",
    padding: isBar ? "13px 16px" : "16px 16px 14px",
    maxWidth: isBar || spanning ? "none" : 300,
    fontFamily: T.sans,
  }

  const discStyle = (size: number): CSSProperties => ({
    position: "relative",
    flex: "0 0 auto",
    width: size,
    height: size,
    borderRadius: "50%",
    background: "radial-gradient(circle at 32% 30%,#eef2ff,#e6ebff)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  })

  const btnBase: CSSProperties = { padding: "9px 15px", borderRadius: Math.min(cfg.radius, 11), fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }
  const acceptStyle: CSSProperties = { ...btnBase, background: A, color: "#fff", border: "1px solid transparent", boxShadow: `0 5px 13px ${A}33`, flex: 1 }
  const rejectStyle: CSSProperties = { ...btnBase, background: bBg, color: bText, border: `1px solid ${rejBorder}`, flex: 1 }
  const linkSep: CSSProperties = { color: bBorder, fontSize: 11 }
  const manageStyle: CSSProperties = { fontSize: 11, fontWeight: 700, color: A, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }
  const policyStyle: CSSProperties = { fontSize: 11, color: bSub, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }
  const showOverlay = mode === "banner" ? cfg.overlay || isModal : true

  const poweredBy = (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, lineHeight: 1 }}>
      <span style={{ fontSize: 7.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: bSub }}>Powered by</span>
      <img src={logoUrl} alt="Consentful" style={{ height: 14, width: "auto", display: "block" }} />
    </div>
  )

  const prefsPanelStyle: CSSProperties = {
    position: "absolute",
    left: 14,
    right: 14,
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 3,
    background: bBg,
    borderRadius: Math.max(cfg.radius, 14),
    boxShadow: "0 20px 58px rgba(23,28,45,.3)",
    border: `1px solid ${bBorder}`,
    overflow: "hidden",
    fontFamily: T.sans,
  }
  const prefsAcceptStyle: CSSProperties = { flex: 1, padding: 9, borderRadius: 9, background: A, color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer", border: "none", boxShadow: `0 5px 13px ${A}33` }
  const prefsSaveStyle: CSSProperties = { flex: 1, padding: 9, border: `1px solid ${rejBorder}`, borderRadius: 9, background: bBg, color: bText, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: 16 }}>
      <Segmented
        value={mode}
        onChange={onMode}
        track="#e8eaef"
        options={[
          { value: "banner", label: "Banner" },
          { value: "prefs", label: "Preferences" },
        ]}
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          marginTop: 13,
          borderRadius: T.rXl,
          overflow: "hidden",
          background: "#fff",
          border: `1px solid ${T.border}`,
          display: "flex",
          flexDirection: "column",
          boxShadow: T.shMd,
        }}
      >
        {/* Browser chrome */}
        <div
          style={{
            height: 32,
            flex: "0 0 auto",
            background: "#f1f2f5",
            borderBottom: "1px solid #e6e8ed",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 12px",
          }}
        >
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#f2726a" }} />
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#f3c14f" }} />
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#57c661" }} />
          <div
            style={{
              flex: 1,
              height: 17,
              background: "#fff",
              borderRadius: 6,
              marginLeft: 7,
              display: "flex",
              alignItems: "center",
              padding: "0 8px",
            }}
          >
            <span style={{ fontSize: 9, color: T.ink4, fontFamily: T.mono }}>yoursite.com</span>
          </div>
        </div>

        {/* Page + banner */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#fbfcfd" }}>
          <div style={{ padding: 15 }}>
            <div
              style={{
                height: 74,
                borderRadius: 10,
                background: "repeating-linear-gradient(45deg,#e9ebef,#e9ebef 7px,#eff1f4 7px,#eff1f4 14px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontFamily: T.mono, fontSize: 9, color: "#a7acb5", letterSpacing: ".04em" }}>hero image</span>
            </div>
            <div style={{ height: 12, width: "65%", background: "#e4e6ec", borderRadius: 5, marginTop: 15 }} />
            <div style={{ height: 8, width: "92%", background: "#eceef2", borderRadius: 5, marginTop: 10 }} />
            <div style={{ height: 8, width: "84%", background: "#eceef2", borderRadius: 5, marginTop: 6 }} />
            <div style={{ height: 8, width: "60%", background: "#eceef2", borderRadius: 5, marginTop: 6 }} />
            <div style={{ display: "flex", gap: 11, marginTop: 16 }}>
              <div style={{ flex: 1, height: 48, borderRadius: 9, background: "repeating-linear-gradient(45deg,#edeff3,#edeff3 6px,#f3f4f7 6px,#f3f4f7 12px)" }} />
              <div style={{ flex: 1, height: 48, borderRadius: 9, background: "repeating-linear-gradient(45deg,#edeff3,#edeff3 6px,#f3f4f7 6px,#f3f4f7 12px)" }} />
            </div>
          </div>

          {showOverlay ? <div style={{ position: "absolute", inset: 0, background: "rgba(15,18,28,.45)", zIndex: 1 }} /> : null}

          {mode === "banner" ? (
            <div style={bannerStyle}>
              {/* Dismiss × (non-blocking layouts) */}
              {!isModal ? <Icon name="close" size={15} color={bSub} style={{ position: "absolute", top: 10, right: 11, cursor: "pointer" }} /> : null}

              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                {/* Cookie hero + divider */}
                <div style={{ display: "flex", alignItems: "center", flex: "0 0 auto", paddingRight: 13, borderRight: `1px solid ${bBorder}` }}>
                  <div style={discStyle(isBar ? 46 : 58)}>
                    <img src={cookieUrl} alt="" style={{ width: isBar ? 40 : 50, height: isBar ? 40 : 50, objectFit: "contain", filter: "drop-shadow(0 5px 8px rgba(23,28,45,.16))" }} />
                  </div>
                </div>

                {/* Copy */}
                <div style={{ flex: "1 1 150px", minWidth: 140 }}>
                  <div style={{ fontSize: isBar ? 14 : 15.5, fontWeight: 800, color: bText, letterSpacing: "-.02em", paddingRight: isBar ? 40 : 16 }}>{cfg.heading}</div>
                  {!isBar ? <div style={{ fontSize: 11, color: bSub, marginTop: 5, lineHeight: 1.5 }}>{cfg.body}</div> : null}
                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: isBar ? 4 : 9 }}>
                    <span style={manageStyle}>{cfg.manageLabel}</span>
                    <span style={linkSep}>|</span>
                    <span style={policyStyle}>Privacy Policy</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flex: isBar ? "0 0 auto" : "1 1 100%", marginTop: isBar ? 0 : 2 }}>
                  <button type="button" style={rejectStyle}>{cfg.rejectLabel}</button>
                  <button type="button" style={acceptStyle}>{cfg.acceptLabel}</button>
                </div>
              </div>

              {/* Powered-by credit */}
              {isBar ? (
                <div style={{ position: "absolute", top: 8, right: 12 }}>{poweredBy}</div>
              ) : (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 11 }}>{poweredBy}</div>
              )}
            </div>
          ) : (
            <div style={prefsPanelStyle}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 16px 12px" }}>
                <div style={discStyle(46)}>
                  <img src={settingsCookieUrl} alt="" style={{ width: 39, height: 39, objectFit: "contain", filter: "drop-shadow(0 4px 7px rgba(23,28,45,.16))" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: bText, letterSpacing: "-.02em" }}>Privacy preferences</div>
                  <div style={{ fontSize: 10.5, color: bSub, marginTop: 4, lineHeight: 1.45 }}>Choose which cookies to allow. You can update your preferences anytime from here.</div>
                </div>
                <Icon name="close" size={17} color={bSub} style={{ cursor: "pointer", marginTop: -1 }} />
              </div>

              {/* Category cards */}
              <div style={{ maxHeight: 176, overflow: "auto", padding: "2px 16px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
                {cfg.categories.map((c) => {
                  const tile = catTile(c.id)
                  return (
                    <div
                      key={c.id}
                      style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 12px", border: `1px solid ${bBorder}`, borderRadius: 12 }}
                    >
                      <div style={{ flex: "0 0 auto", width: 34, height: 34, borderRadius: 10, background: tile.bg, color: tile.fg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name={tile.glyph} size={18} color={tile.fg} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: bText }}>{c.name}</span>
                          {c.locked ? (
                            <span style={{ fontSize: 9, fontWeight: 700, color: "#3b7bf6", background: "#e6efff", padding: "1px 7px", borderRadius: 20 }}>Always on</span>
                          ) : null}
                        </div>
                        {c.desc ? <div style={{ fontSize: 10.5, color: bSub, marginTop: 2, lineHeight: 1.4 }}>{c.desc}</div> : null}
                      </div>
                      {c.locked ? (
                        <div style={{ position: "relative", flex: "0 0 auto", width: 44, height: 24, borderRadius: 20, background: rejBorder }}>
                          <div style={{ position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(23,28,45,.22)" }} />
                        </div>
                      ) : (
                        <Toggle on={c.enabled} accent={A} onClick={() => onToggleCat(c.id)} size="sm" />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "12px 16px 15px", borderTop: `1px solid ${bBorder}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 7, flex: "1 1 150px", minWidth: 0 }}>
                  <Icon name="info" size={15} color={bSub} style={{ marginTop: 1 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, color: bSub, lineHeight: 1.4 }}>You can change your preferences at any time.</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3 }}>
                      <span style={policyStyle}>Privacy Policy</span>
                      <span style={linkSep}>|</span>
                      <span style={manageStyle}>{cfg.manageLabel}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
                  <button type="button" style={prefsSaveStyle}>{cfg.saveLabel}</button>
                  <button type="button" style={prefsAcceptStyle}>{cfg.acceptLabel}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 12, fontSize: 10.5, color: T.ink4 }}>
        <Icon name="bolt" size={13} />
        Updates live as you edit
      </div>
    </div>
  )
}

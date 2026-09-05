/**
 * The live preview — a mock browser rendering the banner (or preferences
 * dialog) exactly as configured. Rendered inside the shell's slide-over drawer,
 * so it fills its container's width and reflects layout, position, theme,
 * accent, radius, overlay and copy live.
 */

import type { CSSProperties } from "react"

import logoUrl from "./assets/logo.png"
import { T } from "./tokens"
import { Icon, Segmented, Toggle } from "./ui"
import type { Cfg } from "./model"

export type PreviewMode = "banner" | "prefs"

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
  else if (isModal) Object.assign(pos, { left: 16, right: 16, top: "50%", transform: "translateY(-50%)" })
  else {
    pos.bottom = 16
    if (p === "bottom-left") pos.left = 16
    else if (p === "bottom-right") pos.right = 16
    else if (p === "bottom-center") Object.assign(pos, { left: 16, right: 16 })
    else if (p === "center") Object.assign(pos, { left: 16, right: 16, top: "50%", bottom: "auto", transform: "translateY(-50%)" })
  }

  const bannerStyle: CSSProperties = {
    position: "absolute",
    ...pos,
    zIndex: 2,
    background: bBg,
    borderRadius: isBar ? 0 : cfg.radius,
    border: `1px solid ${bBorder}`,
    boxShadow: isBar ? "0 -6px 20px rgba(23,28,45,.12)" : "0 18px 44px rgba(23,28,45,.24)",
    padding: 15,
    maxWidth: isBar || spanning ? "none" : 232,
    // The banner renders in the Consentful brand font — Plus Jakarta Sans — the
    // same face the runtime applies on the live site (self-hosted in the plugin).
    fontFamily: T.sans,
  }
  const innerStyle: CSSProperties = isBar ? { display: "flex", alignItems: "center", gap: 16 } : { display: "block" }
  const textColStyle: CSSProperties = isBar ? { flex: 1, minWidth: 0 } : {}
  // Bar keeps the credit pinned top-right, so reserve a little room on that
  // layout's title; card/modal show the credit as a footer and need none.
  const headingStyle: CSSProperties = { fontSize: 13.5, fontWeight: 800, color: bText, letterSpacing: "-.01em", paddingRight: isBar ? 44 : 0 }
  const bodyStyle: CSSProperties = { fontSize: 11, color: bSub, marginTop: 5, lineHeight: 1.5, display: isBar ? "none" : "block" }
  const manageStyle: CSSProperties = { display: "inline-block", marginTop: isBar ? 4 : 9, fontSize: 11, fontWeight: 700, color: A, cursor: "pointer" }
  const btnBase: CSSProperties = { padding: "8px 13px", borderRadius: Math.min(cfg.radius, 10), fontSize: 11.5, fontWeight: 700, cursor: "pointer", border: "none", whiteSpace: "nowrap" }
  const btnRowStyle: CSSProperties = isBar ? { display: "flex", gap: 8, flex: "0 0 auto" } : { display: "flex", gap: 8, marginTop: 12 }
  const acceptStyle: CSSProperties = { ...btnBase, background: A, color: "#fff", flex: isBar ? "0 0 auto" : 1 }
  const rejectStyle: CSSProperties = { ...btnBase, background: "transparent", color: bText, border: `1px solid ${rejBorder}`, flex: isBar ? "0 0 auto" : 1 }
  const showOverlay = mode === "banner" ? cfg.overlay || isModal : true

  const prefsPanelStyle: CSSProperties = {
    position: "absolute",
    left: 18,
    right: 18,
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 3,
    background: "#fff",
    borderRadius: Math.max(cfg.radius, 12),
    boxShadow: "0 18px 54px rgba(23,28,45,.3)",
    border: "1px solid #eceef2",
    padding: 16,
    fontFamily: T.sans,
  }
  const prefsAcceptStyle: CSSProperties = { flex: 1, padding: 9, borderRadius: 8, background: A, color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer", border: "none" }

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

          {showOverlay ? <div style={{ position: "absolute", inset: 0, background: "rgba(15,18,28,.4)", zIndex: 1 }} /> : null}

          {mode === "banner" ? (
            <div style={bannerStyle}>
              {/* Bar layout keeps the credit pinned in the corner, out of the row. */}
              {isBar ? (
                <div style={{ position: "absolute", top: 9, right: 12, display: "inline-flex", alignItems: "center", gap: 4, lineHeight: 1, zIndex: 1 }}>
                  <span style={{ fontSize: 7, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: bSub }}>Powered by</span>
                  <img src={logoUrl} alt="Consentful" style={{ height: 14, width: "auto", display: "block" }} />
                </div>
              ) : null}
              <div style={innerStyle}>
                <div style={textColStyle}>
                  <div style={headingStyle}>{cfg.heading}</div>
                  <div style={bodyStyle}>{cfg.body}</div>
                  <span style={manageStyle}>{cfg.manageLabel}</span>
                </div>
                <div style={btnRowStyle}>
                  <button type="button" style={rejectStyle}>{cfg.rejectLabel}</button>
                  <button type="button" style={acceptStyle}>{cfg.acceptLabel}</button>
                </div>
              </div>
              {/* Card / modal: the credit is a right-aligned footer under the actions. */}
              {!isBar ? (
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: 12 }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5, lineHeight: 1 }}>
                    <span style={{ fontSize: 7.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: bSub }}>Powered by</span>
                    <img src={logoUrl} alt="Consentful" style={{ height: 15, width: "auto", display: "block" }} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div style={prefsPanelStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: "#22252b" }}>Privacy preferences</div>
                <Icon name="close" size={18} color={T.ink4} style={{ cursor: "pointer" }} />
              </div>
              <div style={{ maxHeight: 168, overflow: "auto", margin: "0 -2px" }}>
                {cfg.categories.map((c) => (
                  <div
                    key={c.id}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 2px", borderBottom: "1px solid #f0f1f4" }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#22252b" }}>{c.name}</div>
                    </div>
                    {c.locked ? (
                      <span style={{ fontSize: 9, fontWeight: 800, color: "#8a8f98", background: "#f0f1f4", padding: "2px 7px", borderRadius: 20 }}>
                        ON
                      </span>
                    ) : (
                      <Toggle on={c.enabled} accent={A} onClick={() => onToggleCat(c.id)} size="sm" />
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 13 }}>
                <button
                  type="button"
                  style={{ flex: 1, padding: 9, border: "1px solid #e2e4ea", borderRadius: 8, background: "#fff", color: "#42464e", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
                >
                  {cfg.saveLabel}
                </button>
                <button type="button" style={prefsAcceptStyle}>{cfg.acceptLabel}</button>
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

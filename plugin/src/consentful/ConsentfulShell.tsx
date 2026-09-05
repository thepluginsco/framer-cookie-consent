/**
 * The Consentful editor shell (820×640, Framer-native refined).
 *
 * A fixed header, a nav rail with the plan card, a full-width panel column, and
 * a thin status footer. The live preview is a slide-over drawer summoned from
 * the header rather than a permanent third column, so panels get the full width
 * of the window. All persistent edits flow through the model.
 */

import { useEffect, useState } from "react"

import { canSetPluginData, getPluginData, setPluginData } from "../lib/framer"
import { RUNTIME_VERSION } from "../lib/runtimeCdn"
import { useCustomCodeDisabled } from "../hooks/useCustomCodeStatus"
import { T, focusRing } from "./tokens"
import { Icon, HoverButton, Button, Spinner } from "./ui"
import { useConsentful } from "./model"
import {
  BehaviorPanel,
  CategoriesPanel,
  ConsentPanel,
  InsightsPanel,
  LicensePanel,
  PublishPanel,
  ScriptsPanel,
  StylePanel,
  TextPanel,
} from "./panels"
import { PreviewPane, type PreviewMode } from "./preview"
import { AddCategoryModal, AddScriptModal, Onboarding } from "./modals"

type TabId = "categories" | "behavior" | "consent" | "scripts" | "theme" | "insights" | "license" | "preview"

const TABS: Array<[TabId, string, string]> = [
  ["categories", "Categories", "category"],
  ["behavior", "Behavior", "tune"],
  ["consent", "Consent Mode", "verified_user"],
  ["scripts", "Scripts", "code"],
  ["theme", "Theme", "palette"],
  ["insights", "Insights", "query_stats"],
  ["license", "License", "workspace_premium"],
  ["preview", "Publish", "rocket_launch"],
]

const TITLES: Record<TabId, [string, string]> = {
  categories: ["Categories", "Define the consent groups shown to visitors and the signals each controls."],
  behavior: ["Behavior", "Control when the banner appears and how long a choice is remembered."],
  consent: ["Consent Mode", "Configure the Google Consent Mode v2 signals broadcast to your tags."],
  scripts: ["Scripts", "Manage third-party tags that stay blocked until consent is given."],
  theme: ["Theme", "Match the banner to your brand — colour, layout and shape — and write its copy."],
  insights: ["Insights", "See how visitors respond to your banner — accept, reject and grant rates."],
  license: ["License", "Activate your key to unlock Pro features across all your sites."],
  preview: ["Publish", "Review what's added to your site — it stays in sync automatically."],
}

const ONBOARDING_KEY = "consentful.onboarded"

export function ConsentfulShell() {
  const m = useConsentful()
  const codeDisabled = useCustomCodeDisabled()

  const [tab, setTab] = useState<TabId>("categories")
  const [previewMode, setPreviewMode] = useState<PreviewMode>("banner")
  const [previewOpen, setPreviewOpen] = useState(false)
  const [modal, setModal] = useState<null | "category" | "script">(null)

  const [onboarding, setOnboarding] = useState(false)
  const [onbStep, setOnbStep] = useState(0)

  // Show onboarding once (first run), tracked in plugin data.
  useEffect(() => {
    let active = true
    getPluginData(ONBOARDING_KEY)
      .then((seen) => {
        if (active && seen == null) setOnboarding(true)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  // Escape closes the preview drawer.
  useEffect(() => {
    if (!previewOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [previewOpen])

  const finishOnboarding = () => {
    setOnboarding(false)
    if (canSetPluginData()) setPluginData(ONBOARDING_KEY, "1").catch(() => {})
  }

  // Note: saving IS syncing. `useSettings` persists the config AND re-injects the
  // site loader in the same debounced step (see hooks/useSettings.ts), so there is
  // no separate publish/sync action — editing keeps the site's custom code current.
  // Going live still needs Framer's own Publish (a plugin can't trigger that).

  const isPro = m.cfg.plan === "pro"
  const saving = m.status === "saving" || m.status === "dirty" || m.status === "loading"
  const errored = m.status === "error"
  const [title, desc] = TITLES[tab]

  return (
    <div
      className="cf-app"
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        background: T.ground,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: T.sans,
        color: T.ink,
      }}
    >
      {/* ===== HEADER ===== */}
      <header
        style={{
          height: 52,
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px",
          borderBottom: `1px solid ${T.border}`,
          background: T.surface,
          zIndex: 30,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 30,
              height: 30,
              flex: "0 0 auto",
              borderRadius: 9,
              background: "linear-gradient(155deg,#5b9bff,#2f6fed)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 6px rgba(47,111,237,.4), inset 0 0 0 1px rgba(47,111,237,.28)",
            }}
          >
            <Icon name="cookie" size={18} color="#fff" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.15, color: T.ink }}>
              Consentful
            </div>
            <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, lineHeight: 1.2 }}>GDPR &amp; Cookie Consent</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <SaveStatus saving={saving} errored={errored} error={m.error} />
          <div style={{ width: 1, height: 20, background: T.border }} />
          <PreviewToggle open={previewOpen} onClick={() => setPreviewOpen((v) => !v)} />
          <HoverButton
            title="Setup guide"
            ariaLabel="Setup guide"
            onClick={() => {
              setOnbStep(0)
              setOnboarding(true)
            }}
            base={{
              width: T.control,
              height: T.control,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: T.rMd,
              border: `1px solid ${T.border}`,
              background: T.surface,
              cursor: "pointer",
              color: T.ink3,
              boxShadow: T.shSm,
            }}
            hover={{ background: T.sunken, color: T.ink }}
          >
            <Icon name="help" size={18} />
          </HoverButton>
        </div>
      </header>

      {/* ===== BODY ===== */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        {/* RAIL */}
        <nav
          style={{
            width: 196,
            flex: "0 0 196px",
            background: T.ground,
            borderRight: `1px solid ${T.border}`,
            display: "flex",
            flexDirection: "column",
            padding: "10px 10px 12px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {TABS.map(([id, label, icon]) => (
              <NavItem key={id} icon={icon} label={label} active={tab === id} onClick={() => setTab(id)} />
            ))}
          </div>
          <div style={{ flex: 1 }} />
          {isPro ? <ProBadge /> : <UpgradeCard onClick={() => setTab("license")} />}
        </nav>

        {/* PANEL */}
        <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: T.surface }}>
          <div style={{ padding: "16px 22px 14px", borderBottom: `1px solid ${T.hairline}`, flex: "0 0 auto" }}>
            <h1 style={{ fontSize: 16.5, fontWeight: 800, letterSpacing: "-.02em", margin: 0, color: T.ink }}>{title}</h1>
            <p style={{ fontSize: 12.5, color: T.ink3, margin: "3px 0 0", lineHeight: 1.45, maxWidth: 520 }}>{desc}</p>
          </div>
          <div key={tab} className="cf-panel-scroll" style={{ flex: 1, overflowY: "auto", padding: "18px 22px 28px", animation: "cfPanelIn .22s ease-out" }}>
            {tab === "categories" && <CategoriesPanel m={m} onAddCategory={() => setModal("category")} />}
            {tab === "behavior" && <BehaviorPanel m={m} />}
            {tab === "consent" && <ConsentPanel m={m} />}
            {tab === "scripts" && <ScriptsPanel m={m} onAddScript={() => setModal("script")} />}
            {tab === "theme" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <StylePanel m={m} />
                <TextPanel m={m} />
              </div>
            )}
            {tab === "insights" && <InsightsPanel m={m} />}
            {tab === "license" && <LicensePanel m={m} />}
            {tab === "preview" && <PublishPanel m={m} />}
          </div>
        </main>

        {/* PREVIEW DRAWER */}
        {previewOpen && (
          <>
            <div
              onClick={() => setPreviewOpen(false)}
              style={{ position: "absolute", inset: 0, background: "rgba(19,23,32,.28)", zIndex: 39, animation: "cfBackdropIn .18s ease-out" }}
            />
            <aside
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                right: 0,
                width: 384,
                background: T.ground,
                borderLeft: `1px solid ${T.border}`,
                boxShadow: T.shLg,
                zIndex: 40,
                display: "flex",
                flexDirection: "column",
                animation: "cfDrawerIn .26s cubic-bezier(.22,1,.36,1)",
              }}
            >
              <div
                style={{
                  height: 48,
                  flex: "0 0 auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 12px 0 16px",
                  borderBottom: `1px solid ${T.border}`,
                  background: T.surface,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="visibility" size={17} color={T.accentText} />
                  <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-.01em", color: T.ink }}>Live preview</span>
                </div>
                <HoverButton
                  ariaLabel="Close preview"
                  onClick={() => setPreviewOpen(false)}
                  base={{
                    width: 30,
                    height: 30,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    background: "transparent",
                    borderRadius: T.rSm,
                    cursor: "pointer",
                    color: T.ink3,
                  }}
                  hover={{ background: T.sunken, color: T.ink }}
                >
                  <Icon name="close" size={19} />
                </HoverButton>
              </div>
              <PreviewPane cfg={m.cfg} mode={previewMode} onMode={setPreviewMode} onToggleCat={m.toggleCat} />
            </aside>
          </>
        )}
      </div>

      {/* ===== FOOTER ===== */}
      <footer
        style={{
          height: 30,
          flex: "0 0 auto",
          borderTop: `1px solid ${T.border}`,
          background: T.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          zIndex: 30,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: T.ink3, fontWeight: 600 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: codeDisabled ? T.danger : "#3fbf6a",
              boxShadow: codeDisabled ? "0 0 0 3px rgba(214,69,69,.16)" : "0 0 0 3px rgba(63,191,106,.16)",
            }}
          />
          {codeDisabled ? "Custom code disabled" : "Custom code enabled"}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.ink4 }}>runtime {RUNTIME_VERSION} · jsDelivr</div>
      </footer>

      {/* ===== OVERLAYS ===== */}
      {onboarding && (
        <Onboarding
          m={m}
          step={onbStep}
          onBack={() => setOnbStep((s) => Math.max(0, s - 1))}
          onNext={() => (onbStep >= 4 ? finishOnboarding() : setOnbStep((s) => Math.min(4, s + 1)))}
          onSkip={finishOnboarding}
        />
      )}
      {modal === "category" && <AddCategoryModal m={m} onClose={() => setModal(null)} />}
      {modal === "script" && <AddScriptModal m={m} onClose={() => setModal(null)} />}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Header pieces                                                               */
/* -------------------------------------------------------------------------- */

function SaveStatus({ saving, errored, error }: { saving: boolean; errored: boolean; error: string | null }) {
  if (errored) {
    return (
      <span
        title={error ?? undefined}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 11.5,
          fontWeight: 700,
          color: T.danger,
          background: T.dangerSoft,
          padding: "5px 10px 5px 8px",
          borderRadius: T.rPill,
          whiteSpace: "nowrap",
        }}
      >
        <Icon name="error" size={15} />
        Couldn’t save
      </span>
    )
  }
  if (saving) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11.5,
          fontWeight: 700,
          color: T.ink2,
          background: T.sunken,
          padding: "5px 11px 5px 9px",
          borderRadius: T.rPill,
          whiteSpace: "nowrap",
        }}
      >
        <Spinner size={11} />
        Saving…
      </span>
    )
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11.5,
        fontWeight: 700,
        color: T.successText,
        background: T.successSoft,
        padding: "5px 10px 5px 8px",
        borderRadius: T.rPill,
        whiteSpace: "nowrap",
      }}
    >
      <Icon name="check_circle" size={15} color={T.success} />
      Saved
    </span>
  )
}

function PreviewToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <HoverButton
      title="Toggle live preview"
      onClick={onClick}
      base={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: T.control,
        padding: "0 12px",
        borderRadius: T.rMd,
        border: `1px solid ${open ? T.accentBorder : T.border}`,
        background: open ? T.accentSoft : T.surface,
        color: open ? T.accentText : T.ink2,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        boxShadow: open ? "none" : T.shSm,
        transition: "background .15s, color .15s, border-color .15s",
      }}
      hover={open ? { background: "#e5edfd" } : { background: T.sunken, color: T.ink }}
    >
      <Icon name={open ? "visibility" : "visibility"} size={17} />
      Preview
    </HoverButton>
  )
}

/* -------------------------------------------------------------------------- */
/* Rail pieces                                                                 */
/* -------------------------------------------------------------------------- */

function NavItem({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  const [over, setOver] = useState(false)
  const [focus, setFocus] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setOver(true)}
      onMouseLeave={() => setOver(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 11,
        padding: "8px 10px",
        border: "none",
        borderRadius: T.rMd,
        background: active ? "#e4edfd" : over ? "rgba(19,23,32,.05)" : "transparent",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        transition: "background .13s",
        boxShadow: focus ? focusRing : active ? "inset 0 0 0 1px #c7dbfb" : "none",
      }}
    >
      <Icon name={icon} size={19} color={active ? T.accent : T.ink3} />
      <span
        style={{
          fontSize: 12.5,
          fontWeight: active ? 700 : 600,
          color: active ? T.accentText : T.ink2,
          letterSpacing: "-.01em",
        }}
      >
        {label}
      </span>
    </button>
  )
}

function UpgradeCard({ onClick }: { onClick: () => void }) {
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: T.rXl,
        padding: 13,
        boxShadow: T.shSm,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
        <Icon name="workspace_premium" size={16} color="#c9932a" />
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".05em", color: T.ink3 }}>FREE PLAN</span>
      </div>
      <div style={{ fontSize: 11, color: T.ink3, lineHeight: 1.5, marginBottom: 11 }}>
        Unlock accurate geo-targeting, A/B copy and unlimited domains.
      </div>
      <Button variant="primary" full icon="bolt" onClick={onClick}>
        Upgrade to Pro
      </Button>
    </div>
  )
}

function ProBadge() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "linear-gradient(155deg,#fff,#fbf7ec)",
        border: "1px solid #f0e6cf",
        borderRadius: T.rXl,
        padding: "11px 13px",
        boxShadow: T.shSm,
      }}
    >
      <Icon name="workspace_premium" size={18} color="#c9932a" />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#8a6a1e", letterSpacing: "-.01em" }}>Pro active</div>
        <div style={{ fontSize: 10.5, color: "#b08a3c", fontWeight: 600 }}>All features unlocked</div>
      </div>
    </div>
  )
}

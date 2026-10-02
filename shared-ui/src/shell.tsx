/**
 * The Consentful editor shell (820×640, Framer-native refined).
 *
 * A fixed header, a nav rail with the plan card, a full-width panel column, and
 * a thin status footer. The live preview is a slide-over drawer summoned from
 * the header rather than a permanent third column, so panels get the full width
 * of the window. All persistent edits flow through the model.
 */

import { useEffect, useState } from "react"
import type { CSSProperties } from "react"

import logoUrl from "./assets/logo.png"
import { useHost } from "./host"
import { T, focusRing } from "./tokens"
import { Button, Icon, HoverButton, Spinner } from "./ui"
import { useConsentful } from "./model"
import { LicensePanel } from "./license/LicensePanel"
import { useLicense } from "./license/use-license"
import { ActivationGate } from "./license/ActivationGate"
import { useSettingsContext } from "./settings-context"
import { markPublished, setPublishedSnapshot, usePublishState, type HostPublisher } from "./publish-state"
import {
  BehaviorPanel,
  CategoriesPanel,
  ConsentPanel,
  InsightsPanel,
  PublishPanel,
  ScriptsPanel,
  StylePanel,
  TextPanel,
} from "./panels"
import { PreviewPane, type PreviewMode } from "./preview"
import { AddCategoryModal, AddScriptModal, ScanTrackersModal, Onboarding } from "./modals"

type TabId = "categories" | "behavior" | "consent" | "scripts" | "theme" | "insights" | "license" | "preview"

type NavItemDef = [TabId, string, string]

const NAV_GROUPS: Array<{ label: string; items: NavItemDef[] }> = [
  {
    label: "Set up",
    items: [
      ["categories", "Categories", "category"],
      ["behavior", "Behavior", "tune"],
      ["consent", "Consent Mode", "verified_user"],
      ["scripts", "Scripts", "code"],
    ],
  },
  {
    label: "Customize",
    items: [["theme", "Theme", "palette"]],
  },
  {
    label: "Manage",
    items: [
      ["insights", "Insights", "query_stats"],
      ["license", "License", "workspace_premium"],
      ["preview", "Publish", "rocket_launch"],
    ],
  },
]

const TITLES: Record<TabId, [string, string]> = {
  categories: ["Categories", "Define the consent groups shown to visitors and the signals each controls."],
  behavior: ["Behavior", "Control when the banner appears and how long a choice is remembered."],
  consent: ["Consent Mode", "Configure the Google Consent Mode v2 signals broadcast to your tags."],
  scripts: ["Scripts", "Manage third-party tags that stay blocked until consent is given."],
  theme: ["Theme", "Match the banner to your brand — colour, layout and shape — and write its copy."],
  insights: ["Insights", "See how visitors respond to your banner — accept, reject and grant rates."],
  license: ["License", "Activate this site with your free or paid key — the live banner only shows once activated."],
  preview: ["Publish", "Review what's added to your site — it stays in sync automatically."],
}

const ONBOARDING_KEY = "consentful.onboarded"

/** Takes a subtree out of focus/click reach (`inert` isn't in React 18's types). */
const LOCKED = { inert: "" } as object

export function ConsentfulShell() {
  const host = useHost()
  const m = useConsentful()
  const codeDisabled = host.useCodeDisabled()
  // `host` is fixed for the app's lifetime, so this optional hook is called
  // unconditionally-or-never — the order of hooks never changes.
  const readOnlyNotice = host.useReadOnlyNotice ? host.useReadOnlyNotice() : null
  // Re-verify a saved license once on start-up (relocks a lapsed plan). This is
  // also the instance the activation gate drives, so activating unlocks at once.
  const lic = useLicense({ autoCheck: true })

  const [tab, setTab] = useState<TabId>("categories")
  const [previewMode, setPreviewMode] = useState<PreviewMode>("banner")
  const [previewOpen, setPreviewOpen] = useState(false)
  const [modal, setModal] = useState<null | "category" | "script" | "scan">(null)

  const [onboarding, setOnboarding] = useState(false)
  const [onbStep, setOnbStep] = useState(0)

  // Header context: which site this is and whether it's live. Both reads are
  // always allowed; failures leave the pill hidden rather than blocking the UI.
  const [siteName, setSiteName] = useState<string | null>(null)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    host.getSiteName()
      .then((name) => {
        if (active) setSiteName(name || null)
      })
      .catch(() => {})
    host.getLiveSiteUrl()
      .then((url) => {
        if (active) setLiveUrl(url)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [host])

  // What's live right now (publish-button hosts only) — drives the header's
  // "Unpublished changes" state. Unknown (offline / not connected) hides it.
  useEffect(() => {
    if (!host.publisher) return
    let active = true
    host.publisher
      .loadPublished()
      .then((live) => {
        if (active) setPublishedSnapshot(live)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [host])

  // Show onboarding once (first run), tracked in the host's data store.
  useEffect(() => {
    let active = true
    host.data.get(ONBOARDING_KEY)
      .then((seen) => {
        if (active && seen == null) setOnboarding(true)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [host])

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
    if (host.data.canSet()) host.data.set(ONBOARDING_KEY, "1").catch(() => {})
  }

  // Note: saving IS syncing. `useSettings` persists the config AND re-injects the
  // site loader in the same debounced step (see hooks/useSettings.ts), so there is
  // no separate publish/sync action — editing keeps the site's custom code current.
  // Going live still needs Framer's own Publish (a plugin can't trigger that).

  const isPro = m.cfg.plan === "pro"
  const saving = m.status === "saving" || m.status === "dirty" || m.status === "loading"
  const errored = m.status === "error"
  const readOnly = readOnlyNotice !== null
  const [title, desc] = TITLES[tab]
  // The Publish tab describes how *this* platform ships, so its subtitle is
  // host-owned (Framer auto-syncs; the embed copies; Wix/Webflow/WP install).
  const panelDesc = tab === "preview" ? host.publishSubtitle : desc

  // Activation gate (LingoLens / MediaGrabber pattern): no editor UI until this
  // site has an activated key. A key is only saved once the portal accepts it,
  // and a rejected re-check clears it, so "has a key" means "activated". Wait
  // for the saved config first so an activated site never flashes the gate.
  if (host.showLicenseTab && m.status === "loading" && !lic.key) {
    return (
      <div className="cf-app" style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.ground }}>
        <Spinner />
      </div>
    )
  }
  if (host.showLicenseTab && !lic.key) {
    if (!readOnlyNotice) return <ActivationGate lic={lic} />
    return (
      <div className="cf-app" style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: T.ground }}>
        <ReadOnlyNotice message={readOnlyNotice} />
        {/* Activating saves the key to the project, so it is unavailable too. */}
        <div aria-disabled {...LOCKED} style={{ flex: 1, minHeight: 0, overflow: "hidden", opacity: 0.5, pointerEvents: "none" }}>
          <ActivationGate lic={lic} />
        </div>
      </div>
    )
  }

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
          position: "relative",
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
        {/* Signature: a whisper of the logo's iridescence under the whole bar. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: -1,
            height: 2,
            background: T.iris,
            opacity: 0.9,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", minWidth: 0, gap: 12 }}>
          <img
            src={logoUrl}
            alt="Consentful by The Plugins Company"
            style={{ height: 38, width: "auto", display: "block", flex: "0 0 auto" }}
          />
          {siteName && (
            <>
              <div style={{ width: 1, height: 22, background: T.border, flex: "0 0 auto" }} />
              <SitePill name={siteName} liveUrl={liveUrl} />
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <SaveStatus saving={saving} errored={errored} error={m.error} readOnly={readOnly} />
          <div style={{ width: 1, height: 20, background: T.border }} />
          <PreviewToggle open={previewOpen} onClick={() => setPreviewOpen((v) => !v)} />
          {host.publisher ? (
            <span aria-disabled={readOnly} {...(readOnly ? LOCKED : {})} style={readOnly ? { opacity: 0.5, pointerEvents: "none" } : undefined}>
              <HeaderPublish publisher={host.publisher} onNeedsSetup={() => setTab("preview")} />
            </span>
          ) : null}
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

      {readOnlyNotice && <ReadOnlyNotice message={readOnlyNotice} />}

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
          <div style={{ display: "flex", flexDirection: "column", gap: 13, overflowY: "auto", minHeight: 0, flex: "0 1 auto", margin: "0 -4px", padding: "0 4px" }}>
            {NAV_GROUPS.map((group) => (
              <div key={group.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: ".09em",
                    textTransform: "uppercase",
                    color: T.ink4,
                    padding: "0 10px 3px",
                  }}
                >
                  {group.label}
                </div>
                {group.items
                  .filter(([id]) => id !== "license" || host.showLicenseTab)
                  .map(([id, label, icon]) => (
                    <NavItem key={id} icon={icon} label={label} active={tab === id} onClick={() => setTab(id)} />
                  ))}
              </div>
            ))}
          </div>
          <div style={{ flex: "1 0 12px" }} />
          {isPro ? <ProBadge /> : <UpgradeCard onClick={() => setTab("license")} />}
        </nav>

        {/* PANEL */}
        <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: T.surface }}>
          <div style={{ padding: "16px 22px 14px", borderBottom: `1px solid ${T.hairline}`, flex: "0 0 auto" }}>
            <h1 style={{ fontSize: 16.5, fontWeight: 800, letterSpacing: "-.02em", margin: 0, color: T.ink }}>{title}</h1>
            <p style={{ fontSize: 12.5, color: T.ink3, margin: "3px 0 0", lineHeight: 1.45, maxWidth: 520 }}>{panelDesc}</p>
          </div>
          <div key={tab} className="cf-panel-scroll" style={{ flex: 1, overflowY: "auto", padding: "18px 22px 28px", animation: "cfPanelIn .22s ease-out" }}>
            {/* Without permission to save, every editing, saving and publishing
                control is switched off up front (the notice above says why); the
                tabs stay readable. */}
            <div aria-disabled={readOnly} {...(readOnly ? LOCKED : {})} style={readOnly ? { opacity: 0.55, pointerEvents: "none", userSelect: "none" } : undefined}>
            {tab === "categories" && <CategoriesPanel m={m} onAddCategory={() => setModal("category")} />}
            {tab === "behavior" && <BehaviorPanel m={m} />}
            {tab === "consent" && <ConsentPanel m={m} />}
            {tab === "scripts" && <ScriptsPanel m={m} onAddScript={() => setModal("script")} onScan={() => setModal("scan")} />}
            {tab === "theme" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <StylePanel m={m} />
                <TextPanel m={m} />
              </div>
            )}
            {tab === "insights" && <InsightsPanel m={m} />}
            {tab === "license" && (host.LicensePanel ? <host.LicensePanel m={m} /> : <LicensePanel m={m} />)}
            {tab === "preview" && <PublishPanel m={m} />}
            </div>
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
          {codeDisabled ? host.footerStatus.bad : host.footerStatus.ok}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.ink4 }}>{host.footerNote}</div>
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
      {modal === "scan" && <ScanTrackersModal m={m} onClose={() => setModal(null)} />}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Header pieces                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A persistent bar under the header for users who can't save (e.g. a Framer
 * viewer without the custom-code permission). It names what's missing and what
 * to do, so a blocked save never looks like a generic failure.
 */
function ReadOnlyNotice({ message }: { message: string }) {
  return (
    <div
      role="status"
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "9px 14px",
        background: T.dangerSoft,
        borderBottom: `1px solid ${T.border}`,
        color: T.ink,
        fontSize: 11.5,
        lineHeight: 1.5,
        fontWeight: 600,
      }}
    >
      <Icon name="lock" size={15} color={T.danger} style={{ marginTop: 1, flex: "0 0 auto" }} />
      <span>{message}</span>
    </div>
  )
}

function SaveStatus({
  saving,
  errored,
  error,
  readOnly,
}: {
  saving: boolean
  errored: boolean
  error: string | null
  readOnly: boolean
}) {
  if (readOnly) {
    return (
      <span
        title={error ?? undefined}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 11.5,
          fontWeight: 700,
          color: T.ink2,
          background: T.sunken,
          padding: "5px 10px 5px 8px",
          borderRadius: T.rPill,
          whiteSpace: "nowrap",
        }}
      >
        <Icon name="lock" size={14} />
        View only
      </span>
    )
  }
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
        animation: "cfPop .28s cubic-bezier(.22,1,.36,1)",
      }}
    >
      <Icon name="check_circle" size={15} color={T.success} />
      Saved
    </span>
  )
}

function SitePill({ name, liveUrl }: { name: string; liveUrl: string | null }) {
  const [over, setOver] = useState(false)
  const live = liveUrl != null
  const inner = (
    <>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          flex: "0 0 auto",
          background: live ? "#3fbf6a" : T.ink4,
          boxShadow: live ? "0 0 0 3px rgba(63,191,106,.16)" : "none",
        }}
      />
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: T.ink,
          letterSpacing: "-.01em",
          maxWidth: 168,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, color: live ? T.successText : T.ink4, flex: "0 0 auto" }}>
        {live ? "Live" : "Draft"}
      </span>
      {live && <Icon name="open_in_new" size={13} color={over ? T.accentText : T.ink4} style={{ flex: "0 0 auto" }} />}
    </>
  )
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    height: 30,
    padding: "0 11px",
    borderRadius: T.rPill,
    border: `1px solid ${over && live ? T.accentBorder : T.border}`,
    background: over && live ? T.accentSoft : T.sunken,
    textDecoration: "none",
    cursor: live ? "pointer" : "default",
    transition: "background .15s, border-color .15s",
    minWidth: 0,
  }
  if (live) {
    return (
      <a
        href={liveUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open ${name} — ${liveUrl}`}
        style={base}
        onMouseEnter={() => setOver(true)}
        onMouseLeave={() => setOver(false)}
      >
        {inner}
      </a>
    )
  }
  return (
    <span title={`${name} — not published yet`} style={base}>
      {inner}
    </span>
  )
}

/**
 * Header publish control for hosts with an explicit publish step (WordPress,
 * Webflow, Wix): a status pill ("Unpublished changes" / "Not published" /
 * "Live") and a one-click Publish. When the host can't publish in one click
 * (site not connected yet), it opens the Publish tab instead.
 */
function HeaderPublish({ publisher, onNeedsSetup }: { publisher: HostPublisher; onNeedsSetup: () => void }) {
  const { config } = useSettingsContext()
  const state = usePublishState(config)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<{ ok: boolean; warning?: boolean; text: string } | null>(null)
  // Stable per host (the publisher object never changes), so calling it here is
  // a normal unconditional hook call.
  const blocker = publisher.useLiveBlocker?.() ?? null

  // Results fade after a few seconds; warnings stay until the next publish or
  // until the blocker clears (e.g. the merchant turned the app embed on).
  useEffect(() => {
    if (!flash || flash.warning) return
    const t = window.setTimeout(() => setFlash(null), 4000)
    return () => window.clearTimeout(t)
  }, [flash])
  useEffect(() => {
    if (flash?.warning && !blocker) setFlash(null)
  }, [flash, blocker])

  const publish = async () => {
    setBusy(true)
    setFlash(null)
    try {
      const r = await publisher.publish(config)
      if (r.ok) markPublished(config)
      if (r.needsSetup) onNeedsSetup()
      setFlash({ ok: r.ok, ...(r.warning ? { warning: true } : {}), text: r.message })
    } catch (err) {
      setFlash({ ok: false, text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  const pill: { text: string; color: string; bg: string; icon: string; action?: boolean } | null = flash
    ? flash.warning
      ? { text: flash.text, color: T.warn, bg: T.warnSoft, icon: "warning", action: true }
      : { text: flash.text, color: flash.ok ? T.successText : T.danger, bg: flash.ok ? T.successSoft : T.dangerSoft, icon: flash.ok ? "check_circle" : "error" }
    : !state.known
      ? null
      : state.dirty
        ? {
            text: state.diff === "never" ? "Not published" : state.diff === "outdated" ? "Runtime update available" : "Unpublished changes",
            color: T.warn,
            bg: T.warnSoft,
            icon: state.diff === "outdated" ? "system_update_alt" : "pending",
          }
        : blocker
          ? { text: blocker, color: T.warn, bg: T.warnSoft, icon: "visibility_off", action: true }
          : { text: "Live", color: T.successText, bg: T.successSoft, icon: "check_circle" }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {pill ? (
        <span
          title={pill.action ? `${pill.text} — open the Publish tab to fix` : pill.text}
          role={pill.action ? "button" : undefined}
          tabIndex={pill.action ? 0 : undefined}
          onClick={pill.action ? onNeedsSetup : undefined}
          onKeyDown={pill.action ? (e) => { if (e.key === "Enter" || e.key === " ") onNeedsSetup() } : undefined}
          style={{
            cursor: pill.action ? "pointer" : undefined,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            maxWidth: 220,
            height: 26,
            padding: "0 10px",
            borderRadius: T.rPill,
            background: pill.bg,
            color: pill.color,
            fontSize: 11.5,
            fontWeight: 700,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <Icon name={pill.icon} size={15} color={pill.color} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{pill.text}</span>
        </span>
      ) : null}
      <Button
        variant="primary"
        icon="rocket_launch"
        title="Publish your banner to the live site"
        loading={busy}
        onClick={() => void publish()}
      >
        Publish
      </Button>
    </div>
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
      hover={open ? { background: "#e6ddfc" } : { background: T.sunken, color: T.ink }}
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
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 11,
        padding: "8px 10px",
        border: "none",
        borderRadius: T.rMd,
        background: active ? T.accentSoft : over ? "rgba(19,23,32,.05)" : "transparent",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        transition: "background .13s",
        boxShadow: focus ? focusRing : active ? `inset 0 0 0 1px ${T.accentBorder}` : "none",
      }}
    >
      {active && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 3,
            top: "50%",
            width: 3,
            height: 16,
            marginTop: -8,
            borderRadius: T.rPill,
            background: T.accent,
            transformOrigin: "center",
            animation: "cfBarIn .2s cubic-bezier(.22,1,.36,1)",
          }}
        />
      )}
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
        position: "relative",
        overflow: "hidden",
        // Never squeezed by a short window — the nav list above scrolls instead,
        // otherwise overflow:hidden clips the button and the rounded corners.
        flexShrink: 0,
        background: T.indigoSurface,
        borderRadius: T.rXl,
        padding: 14,
        boxShadow: `${T.shMd}, inset 0 0 0 1px rgba(255,255,255,.06)`,
      }}
    >
      {/* Iridescent glow — the logo's cookie, blooming from the corner. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -46,
          right: -34,
          width: 118,
          height: 118,
          borderRadius: "50%",
          background: T.iris,
          filter: "blur(14px)",
          opacity: 0.55,
        }}
      />
      {/* A single sheen sweeps across once when the card first appears. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: 46,
          background: "linear-gradient(90deg,transparent,rgba(255,255,255,.22),transparent)",
          animation: "cfSheen 1.15s cubic-bezier(.22,1,.36,1) .45s both",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 8px",
            borderRadius: T.rPill,
            background: "rgba(255,255,255,.1)",
            marginBottom: 9,
          }}
        >
          <Icon name="bolt" size={13} color="#fdf3cf" />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", color: "#efeafe" }}>FREE PLAN</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: "-.01em", marginBottom: 5 }}>
          Unlock everything
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.72)", lineHeight: 1.5, marginBottom: 12 }}>
          Every banner design, geo-targeting, A/B testing and more.
        </div>
        <HoverButton
          onClick={onClick}
          base={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            width: "100%",
            height: T.control,
            borderRadius: T.rMd,
            border: "none",
            background: T.iris,
            backgroundSize: "220% 220%",
            backgroundPosition: "0% 50%",
            color: T.indigo,
            fontSize: 12.5,
            fontWeight: 800,
            letterSpacing: "-.01em",
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(0,0,0,.25)",
            transition: "background-position .6s ease, filter .15s",
          }}
          hover={{ backgroundPosition: "100% 50%", filter: "brightness(1.04)" }}
        >
          <Icon name="workspace_premium" size={16} color={T.indigo} />
          Upgrade to Pro
        </HoverButton>
      </div>
    </div>
  )
}

function ProBadge() {
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: T.surface,
        border: `1px solid ${T.accentBorder}`,
        borderRadius: T.rXl,
        padding: "11px 13px",
        boxShadow: T.shSm,
      }}
    >
      <div
        aria-hidden
        style={{ position: "absolute", inset: 0, background: T.irisSoft, opacity: 0.5 }}
      />
      <div
        style={{
          position: "relative",
          width: 30,
          height: 30,
          flex: "0 0 auto",
          borderRadius: 9,
          background: T.iris,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,.05)",
        }}
      >
        <Icon name="workspace_premium" size={17} color={T.indigo} />
      </div>
      <div style={{ position: "relative", minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: T.indigo, letterSpacing: "-.01em" }}>Pro active</div>
        <div style={{ fontSize: 10.5, color: T.accentText, fontWeight: 600 }}>All features unlocked</div>
      </div>
    </div>
  )
}

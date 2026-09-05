/**
 * Consentful overlays: add-category, add-script, the 5-step onboarding guide,
 * and the publish-success dialog. Framer-native refined — tokened surfaces,
 * accessible dialogs (Escape + backdrop dismiss), and one authored rise on open.
 */

import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

import { RUNTIME_VERSION } from "../lib/runtimeCdn"
import { getLiveSiteUrl } from "../lib/framer"
import type { ScriptType } from "../types"
import { T, focusRing } from "./tokens"
import { Icon, Segmented, Toggle, HoverButton, Button } from "./ui"
import { catColor, type Cfg, type ConsentfulModel } from "./model"

const SWATCHES = ["#2F6FED", "#6366F1", "#16A34A", "#0EA5E9", "#F97316", "#111827"]

/* -------------------------------------------------------------------------- */
/* Shared modal shell + inputs                                                */
/* -------------------------------------------------------------------------- */

function Backdrop({
  z = 70,
  onClose,
  closeOnBackdrop = true,
  children,
}: {
  z?: number
  onClose?: () => void
  closeOnBackdrop?: boolean
  children: ReactNode
}) {
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      ref={backdropRef}
      onMouseDown={(e) => {
        if (closeOnBackdrop && onClose && e.target === backdropRef.current) onClose()
      }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: z,
        background: T.overlay,
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        animation: "cfBackdropIn .18s ease-out",
      }}
    >
      {children}
    </div>
  )
}

function Dialog({ width = 424, children }: { width?: number; children: ReactNode }) {
  return (
    <div
      style={{
        width,
        maxWidth: "100%",
        maxHeight: "100%",
        background: T.surface,
        borderRadius: T.rModal,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: T.shXl,
        animation: "cfDialogIn .28s cubic-bezier(.22,1,.36,1)",
      }}
    >
      {children}
    </div>
  )
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 16px 18px", borderBottom: `1px solid ${T.hairline}`, flex: "0 0 auto" }}>
      <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-.02em", color: T.ink }}>{title}</div>
      <HoverButton
        ariaLabel="Close"
        onClick={onClose}
        base={{ width: 30, height: 30, border: "none", background: "transparent", borderRadius: T.rSm, cursor: "pointer", color: T.ink3, display: "flex", alignItems: "center", justifyContent: "center" }}
        hover={{ background: T.sunken, color: T.ink }}
      >
        <Icon name="close" size={19} />
      </HoverButton>
    </div>
  )
}

function ModalFooter({ onCancel, submitLabel, canSubmit, onSubmit }: { onCancel: () => void; submitLabel: string; canSubmit: boolean; onSubmit: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "13px 18px", borderTop: `1px solid ${T.hairline}`, background: T.ground, flex: "0 0 auto" }}>
      <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      <Button variant="primary" disabled={!canSubmit} onClick={onSubmit}>{submitLabel}</Button>
    </div>
  )
}

function FocusInput({
  value,
  onChange,
  placeholder,
  mono,
  autoFocus,
  onEnter,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
  autoFocus?: boolean
  onEnter?: () => void
}) {
  const [f, setF] = useState(false)
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          e.preventDefault()
          onEnter()
        }
      }}
      onFocus={() => setF(true)}
      onBlur={() => setF(false)}
      style={{
        width: "100%",
        boxSizing: "border-box",
        height: T.control,
        padding: `0 ${T.controlPadX}px`,
        border: `1px solid ${T.border}`,
        borderRadius: T.rMd,
        fontSize: mono ? 12 : 13,
        fontFamily: mono ? T.mono : T.sans,
        color: T.ink,
        background: T.surface,
        outline: "none",
        ...(f ? { borderColor: T.accent, boxShadow: focusRing } : null),
      }}
    />
  )
}

function ModalLabel({ children }: { children: ReactNode }) {
  return <label style={{ fontSize: 12, fontWeight: 700, color: T.ink2, marginBottom: 6, display: "block" }}>{children}</label>
}

/** A monospace textarea for pasting an inline tracking snippet. */
function InlineCodeInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [f, setF] = useState(false)
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={4}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setF(true)}
      onBlur={() => setF(false)}
      style={{
        width: "100%",
        boxSizing: "border-box",
        padding: "9px 12px",
        border: `1px solid ${T.border}`,
        borderRadius: T.rMd,
        fontSize: 12,
        fontFamily: T.mono,
        lineHeight: 1.5,
        color: T.ink,
        background: T.surface,
        outline: "none",
        resize: "vertical",
        ...(f ? { borderColor: T.accent, boxShadow: focusRing } : null),
      }}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Add category                                                               */
/* -------------------------------------------------------------------------- */

const SIGNAL_OPTS = ["analytics_storage", "ad_storage", "ad_user_data", "ad_personalization", "functionality_storage", "personalization_storage"]

export function AddCategoryModal({ m, onClose }: { m: ConsentfulModel; onClose: () => void }) {
  const [name, setName] = useState("")
  const [desc, setDesc] = useState("")
  const [signals, setSignals] = useState<string[]>([])
  const [required, setRequired] = useState(false)
  const canSubmit = name.trim().length > 0

  const toggleSignal = (sig: string) => setSignals((s) => (s.includes(sig) ? s.filter((x) => x !== sig) : [...s, sig]))

  const submit = () => {
    if (!canSubmit) return
    m.createCategory({ name, desc, signals, required })
    onClose()
  }

  return (
    <Backdrop onClose={onClose}>
      <Dialog>
        <ModalHeader title="New category" onClose={onClose} />
        <div style={{ padding: 18, overflowY: "auto", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 15 }}>
          <div>
            <ModalLabel>Name</ModalLabel>
            <FocusInput value={name} onChange={setName} placeholder="e.g. Social media" autoFocus onEnter={submit} />
          </div>
          <div>
            <ModalLabel>Description</ModalLabel>
            <FocusInput value={desc} onChange={setDesc} placeholder="What this category is used for…" onEnter={submit} />
          </div>
          <div>
            <ModalLabel>Consent Mode signals</ModalLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {SIGNAL_OPTS.map((sig) => {
                const active = signals.includes(sig)
                return (
                  <div
                    key={sig}
                    role="button"
                    onClick={() => toggleSignal(sig)}
                    style={{
                      fontFamily: T.mono,
                      fontSize: 10.5,
                      padding: "6px 9px",
                      borderRadius: T.rChip,
                      cursor: "pointer",
                      border: active ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                      color: active ? T.accentText : T.ink3,
                      background: active ? T.accentSoft : T.surface,
                      transition: "all .12s",
                    }}
                  >
                    {sig}
                  </div>
                )
              })}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 2 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>Required</div>
              <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 2, lineHeight: 1.4 }}>Visitors can't opt out of this category.</div>
            </div>
            <Toggle on={required} onClick={() => setRequired((v) => !v)} />
          </div>
        </div>
        <ModalFooter onCancel={onClose} submitLabel="Add category" canSubmit={canSubmit} onSubmit={submit} />
      </Dialog>
    </Backdrop>
  )
}

/* -------------------------------------------------------------------------- */
/* Add managed script                                                         */
/* -------------------------------------------------------------------------- */

export function AddScriptModal({ m, onClose }: { m: ConsentfulModel; onClose: () => void }) {
  const choices = (() => {
    const optional = m.cfg.categories.filter((c) => !c.locked)
    return optional.length ? optional : m.cfg.categories
  })()
  const [name, setName] = useState("")
  const [type, setType] = useState<ScriptType>("src")
  const [url, setUrl] = useState("")
  const [code, setCode] = useState("")
  const [id, setId] = useState("")
  const [cat, setCat] = useState(choices[0]?.id ?? "analytics")
  const value = type === "src" ? url : code
  const canSubmit = name.trim().length > 0 && value.trim().length > 0

  const submit = () => {
    if (!canSubmit) return
    m.createScript({ name, type, value, id, cat })
    onClose()
  }

  return (
    <Backdrop onClose={onClose}>
      <Dialog>
        <ModalHeader title="Add managed script" onClose={onClose} />
        <div style={{ padding: 18, overflowY: "auto", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 15 }}>
          <div>
            <ModalLabel>Name</ModalLabel>
            <FocusInput value={name} onChange={setName} placeholder="e.g. LinkedIn Insight Tag" autoFocus onEnter={submit} />
          </div>
          <div>
            <ModalLabel>Delivery</ModalLabel>
            <Segmented
              value={type}
              onChange={(v) => setType(v)}
              options={[
                { value: "src", label: "External URL" },
                { value: "inline", label: "Inline code" },
              ]}
            />
          </div>
          {type === "src" ? (
            <div>
              <ModalLabel>Script URL</ModalLabel>
              <FocusInput value={url} onChange={setUrl} placeholder="https://snap.licdn.com/li.lms-analytics/insight.min.js" mono onEnter={submit} />
              <div style={{ fontSize: 11, color: T.ink4, marginTop: 6, lineHeight: 1.5 }}>
                The full URL of the tag's script. It stays blocked until the visitor consents to the category below.
              </div>
            </div>
          ) : (
            <div>
              <ModalLabel>Inline code</ModalLabel>
              <InlineCodeInput value={code} onChange={setCode} placeholder={"!function(){/* pixel init */}();"} />
              <div style={{ fontSize: 11, color: T.ink4, marginTop: 6, lineHeight: 1.5 }}>
                Runs verbatim once consent is given — paste the snippet the vendor gives you (without the surrounding{" "}
                <span style={{ fontFamily: T.mono, fontSize: 10.5 }}>&lt;script&gt;</span> tags).
              </div>
            </div>
          )}
          <div>
            <ModalLabel>
              Tag ID <span style={{ color: T.ink4, fontWeight: 600 }}>(optional)</span>
            </ModalLabel>
            <FocusInput value={id} onChange={setId} placeholder="1234567" mono onEnter={submit} />
          </div>
          <div>
            <ModalLabel>Blocked until consent to</ModalLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {choices.map((c) => {
                const col = catColor(c.id)
                const active = cat === c.id
                return (
                  <div
                    key={c.id}
                    role="button"
                    onClick={() => setCat(c.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11.5,
                      fontWeight: 700,
                      padding: "7px 12px",
                      borderRadius: T.rPill,
                      cursor: "pointer",
                      border: active ? `1.5px solid ${col}` : `1px solid ${T.border}`,
                      color: active ? col : T.ink3,
                      background: active ? `${col}12` : T.surface,
                      transition: "all .12s",
                    }}
                  >
                    {c.name}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <ModalFooter onCancel={onClose} submitLabel="Add script" canSubmit={canSubmit} onSubmit={submit} />
      </Dialog>
    </Backdrop>
  )
}

/* -------------------------------------------------------------------------- */
/* Onboarding                                                                  */
/* -------------------------------------------------------------------------- */

const STEPS = [
  { icon: "waving_hand", title: "Welcome to Consentful", sub: "Add a privacy-compliant cookie banner to your Framer site in under a minute. Let’s set up the essentials together." },
  { icon: "public", title: "Where are your visitors?", sub: "This sets who sees the consent banner by default — you can fine-tune it anytime." },
  { icon: "verified_user", title: "Google Consent Mode v2", sub: "Broadcast consent signals to your Google tags. Recommended if you use GA4, Ads or Tag Manager." },
  { icon: "palette", title: "Make it yours", sub: "Pick an accent and layout. Everything stays editable in the Style tab." },
  { icon: "rocket_launch", title: "You’re all set", sub: "Consentful is ready. Review the live preview, then publish whenever you like." },
]

const REGION_DEFS: Array<[Cfg["showWhen"], string, string, string]> = [
  ["all", "Everywhere", "Show the banner to every visitor", "language"],
  ["eea", "EU / EEA only", "Recommended for GDPR compliance", "flag"],
  ["geo", "By custom region", "Advanced — configure later", "map"],
]

export function Onboarding({
  m,
  step,
  onBack,
  onNext,
  onSkip,
}: {
  m: ConsentfulModel
  step: number
  onBack: () => void
  onNext: () => void
  onSkip: () => void
}) {
  const { cfg } = m
  const ob = STEPS[step] ?? STEPS[0]!
  const isLast = step === 4

  return (
    <Backdrop z={60} onClose={onSkip} closeOnBackdrop={false}>
      <Dialog width={452}>
        {/* top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 14px 0", flex: "0 0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 20, height: 20, borderRadius: 6, background: "linear-gradient(155deg,#5b9bff,#2f6fed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="cookie" size={13} color="#fff" />
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".05em", color: T.ink4 }}>SETUP</span>
          </div>
          <HoverButton
            onClick={onSkip}
            base={{ display: "flex", alignItems: "center", gap: 3, border: "none", background: "transparent", color: T.ink3, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "5px 8px", borderRadius: T.rSm }}
            hover={{ background: T.sunken, color: T.ink }}
          >
            Skip
            <Icon name="close" size={15} />
          </HoverButton>
        </div>

        <div style={{ padding: "12px 34px 12px", textAlign: "center", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
          <div style={{ width: 58, height: 58, margin: "2px auto 16px", borderRadius: 17, background: "linear-gradient(155deg,#5b9bff,#2f6fed)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 10px 24px rgba(47,111,237,.34)" }}>
            <Icon name={ob.icon} size={28} color="#fff" />
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.02em", color: T.ink }}>{ob.title}</div>
          <div style={{ fontSize: 12.5, color: T.ink3, lineHeight: 1.55, margin: "7px auto 0", maxWidth: 340 }}>{ob.sub}</div>

          {step === 1 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 20 }}>
              {REGION_DEFS.map(([val, label, d, icon]) => {
                const active = cfg.showWhen === val
                return (
                  <div
                    key={val}
                    role="button"
                    onClick={() => m.set("showWhen", val)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: 13,
                      borderRadius: T.rLg,
                      cursor: "pointer",
                      textAlign: "left",
                      border: active ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                      background: active ? T.accentSoft : T.surface,
                      transition: "all .15s",
                    }}
                  >
                    <Icon name={icon} size={21} color={active ? T.accent : T.ink4} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{label}</div>
                      <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 1 }}>{d}</div>
                    </div>
                    <Icon name="check_circle" size={20} color={T.accent} style={{ opacity: active ? 1 : 0, transition: "opacity .15s" }} />
                  </div>
                )
              })}
            </div>
          ) : null}

          {step === 2 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, padding: 14, border: `1px solid ${T.border}`, borderRadius: T.rLg, textAlign: "left" }}>
              <div style={{ width: 38, height: 38, flex: "0 0 auto", borderRadius: T.rMd, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="verified_user" size={20} color={T.accent} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Enable Consent Mode v2</div>
                <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 1 }}>Signals default to denied until consent.</div>
              </div>
              <Toggle on={cfg.consentMode} onClick={() => m.toggle("consentMode")} />
            </div>
          ) : null}

          {step === 3 ? (
            <div style={{ marginTop: 20, textAlign: "left" }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".07em", color: T.ink4, marginBottom: 11 }}>ACCENT</div>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 18 }}>
                {SWATCHES.map((col) => (
                  <div
                    key={col}
                    role="button"
                    aria-label={col}
                    onClick={() => m.set("accent", col)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: T.rMd,
                      background: col,
                      cursor: "pointer",
                      boxShadow: cfg.accent.toLowerCase() === col.toLowerCase() ? `0 0 0 2px #fff, 0 0 0 4px ${col}` : "0 0 0 1px rgba(16,24,40,.1)",
                      transition: "box-shadow .15s",
                    }}
                  />
                ))}
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".07em", color: T.ink4, marginBottom: 11 }}>LAYOUT</div>
              <Segmented
                value={cfg.layout}
                onChange={(v) => m.set("layout", v)}
                options={[
                  { value: "card", label: "Floating card" },
                  { value: "bar", label: "Bottom bar" },
                  { value: "modal", label: "Center modal" },
                ]}
              />
            </div>
          ) : null}

          {step === 4 ? (
            <div style={{ marginTop: 20, border: `1px solid ${T.border}`, borderRadius: T.rLg, overflow: "hidden", textAlign: "left" }}>
              {(
                [
                  ["Show banner", { all: "Everywhere", eea: "EU / EEA only", geo: "By custom region" }[cfg.showWhen]],
                  ["Consent Mode v2", cfg.consentMode ? "Enabled" : "Off"],
                  ["Layout", { card: "Floating card", bar: "Bottom bar", modal: "Center modal" }[cfg.layout]],
                  ["Categories", `${cfg.categories.length} groups`],
                ] as Array<[string, string]>
              ).map(([label, value], i) => (
                <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderTop: i === 0 ? "none" : `1px solid ${T.hairline}` }}>
                  <span style={{ fontSize: 12, color: T.ink3, fontWeight: 600 }}>{label}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderTop: `1px solid ${T.hairline}`, background: T.ground, flex: "0 0 auto" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{ width: i === step ? 22 : 7, height: 7, borderRadius: T.rPill, background: i === step ? T.accent : "#d6dae1", transition: "all .25s cubic-bezier(.22,1,.36,1)" }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 ? <Button variant="secondary" onClick={onBack}>Back</Button> : null}
            <Button variant="primary" onClick={onNext} iconRight={isLast ? "check" : "arrow_forward"}>
              {isLast ? "Finish setup" : "Continue"}
            </Button>
          </div>
        </div>
      </Dialog>
    </Backdrop>
  )
}

/* -------------------------------------------------------------------------- */
/* Publish success                                                            */
/* -------------------------------------------------------------------------- */

export function PublishSuccess({ m, onClose }: { m: ConsentfulModel; onClose: () => void }) {
  const { cfg } = m

  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    getLiveSiteUrl().then((url) => {
      if (active) setLiveUrl(url)
    })
    return () => {
      active = false
    }
  }, [])

  const liveHost = liveUrl ? liveUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") : null

  const summary: Array<[string, string]> = [
    ["Region", { all: "Everywhere", eea: "EU / EEA only", geo: "By region" }[cfg.showWhen]],
    ["Consent Mode v2", cfg.consentMode ? "On" : "Off"],
    ["Categories", `${cfg.categories.length} groups`],
    ["Runtime", RUNTIME_VERSION],
  ]

  return (
    <Backdrop z={80} onClose={onClose}>
      <Dialog width={412}>
        <div style={{ padding: "34px 32px 8px", textAlign: "center", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
          <div style={{ width: 66, height: 66, margin: "0 auto 18px", borderRadius: 20, background: "linear-gradient(155deg,#34d17f,#16a34a)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 12px 26px rgba(22,163,74,.4)" }}>
            <Icon name="check" size={34} color="#fff" />
          </div>
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.02em", color: T.ink }}>You're live!</div>
          <div style={{ fontSize: 12.5, color: T.ink3, lineHeight: 1.55, margin: "8px auto 0", maxWidth: 300 }}>
            Consentful is now active on{" "}
            <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.ink2 }}>{liveHost ?? "your site"}</span>. Visitors will see your banner on their next visit.
          </div>
          <div style={{ marginTop: 20, border: `1px solid ${T.border}`, borderRadius: T.rLg, overflow: "hidden", textAlign: "left" }}>
            {summary.map(([label, value], i) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderTop: i === 0 ? "none" : `1px solid ${T.hairline}` }}>
                <span style={{ fontSize: 12, color: T.ink3, fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, padding: "18px 32px 24px", flex: "0 0 auto" }}>
          <HoverButton
            title={liveUrl ? liveUrl : "Publish your site in Framer to get a live URL"}
            onClick={liveUrl ? () => window.open(liveUrl, "_blank", "noopener,noreferrer") : undefined}
            base={{
              flex: 1,
              height: T.control,
              border: `1px solid ${T.border}`,
              borderRadius: T.rLg,
              background: T.surface,
              color: liveUrl ? T.ink2 : T.ink4,
              fontSize: 13,
              fontWeight: 700,
              cursor: liveUrl ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
            hover={liveUrl ? { background: T.sunken, color: T.ink } : undefined}
          >
            <Icon name="open_in_new" size={17} />
            View live site
          </HoverButton>
          <div style={{ flex: 1, display: "flex" }}>
            <Button variant="dark" full onClick={onClose}>Done</Button>
          </div>
        </div>
      </Dialog>
    </Backdrop>
  )
}

/**
 * The eight Consentful tab panels (the main column). Each reads and mutates
 * configuration through the {@link ConsentfulModel}. Framer-native refined:
 * tokens from {@link T}, brand-blue chrome, category colour kept semantic.
 */

import { useEffect, useState } from "react"
import type { CSSProperties } from "react"

import { useLicense, type LicenseStatus } from "../hooks/useLicense"
import { LICENSE_FEATURES, hasFeature } from "../lib/entitlements"
import { PRODUCT_URL, isConfigured } from "../lib/licenseConfig"
import { RUNTIME_VERSION } from "../lib/runtimeCdn"
import type { LicenseTier } from "../types"
import { T, focusRing, tint } from "./tokens"
import { Button, Card, Eyebrow, Icon, Segmented, Stepper, Toggle, HoverButton, Spinner } from "./ui"
import {
  catColor,
  catIcon,
  CAT_NAME,
  scriptHost,
  languageName,
  COMMON_LANGUAGES,
  type ConsentfulModel,
  type LocalizableFieldKey,
} from "./model"

/* -------------------------------------------------------------------------- */
/* Shared field primitives                                                    */
/* -------------------------------------------------------------------------- */

const INPUT_BASE: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  border: `1px solid ${T.border}`,
  borderRadius: T.rMd,
  fontSize: 13,
  color: T.ink,
  background: T.surface,
  outline: "none",
  transition: "border-color .15s, box-shadow .15s",
  lineHeight: 1.5,
  fontFamily: T.sans,
}

const MONO: CSSProperties = { fontFamily: T.mono, fontSize: 12 }

function TextInput({
  value,
  onChange,
  placeholder,
  mono,
  multiline,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
  multiline?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const style: CSSProperties = {
    ...INPUT_BASE,
    ...(multiline ? { minHeight: 80, padding: "9px 12px" } : { height: T.control, padding: `0 ${T.controlPadX}px` }),
    ...(mono ? MONO : null),
    ...(focused ? { borderColor: T.accent, boxShadow: focusRing } : null),
  }
  const common = {
    value,
    placeholder,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style,
  }
  return multiline ? <textarea rows={3} {...common} /> : <input type="text" {...common} />
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 12, fontWeight: 700, color: T.ink2, marginBottom: 6, display: "block" }}>{children}</label>
  )
}

/** A row: title + description on the left, control on the right. */
function Row({
  title,
  desc,
  children,
  border = true,
}: {
  title: string
  desc: string
  children: React.ReactNode
  border?: boolean
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "13px 0",
        borderBottom: border ? `1px solid ${T.hairline}` : "none",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{title}</div>
        <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 2, lineHeight: 1.45 }}>{desc}</div>
      </div>
      {children}
    </div>
  )
}

function DashedAdd({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <HoverButton
      onClick={onClick}
      base={{
        marginTop: 2,
        height: T.control,
        padding: "0 14px",
        border: `1.5px dashed ${T.border2}`,
        borderRadius: T.rXl,
        background: T.surface,
        color: T.ink2,
        fontSize: 12.5,
        fontWeight: 700,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        width: "100%",
        transition: "border-color .15s, color .15s, background .15s",
      }}
      hover={{ borderColor: T.accent, color: T.accentText, background: T.accentSoft }}
    >
      <Icon name="add" size={18} />
      {label}
    </HoverButton>
  )
}

function EmptyState({
  icon,
  title,
  desc,
  children,
}: {
  icon: string
  title: string
  desc: string
  children?: React.ReactNode
}) {
  return (
    <div
      style={{
        border: `1.5px dashed ${T.border2}`,
        borderRadius: T.rXl,
        padding: "30px 20px",
        textAlign: "center",
        background: T.surface,
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          margin: "0 auto 13px",
          borderRadius: T.rLg,
          background: T.sunken,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={24} color={T.ink4} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{title}</div>
      <div style={{ fontSize: 12, color: T.ink3, marginTop: 5, lineHeight: 1.5, maxWidth: 340, margin: "5px auto 0" }}>{desc}</div>
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

export function CategoriesPanel({ m, onAddCategory }: { m: ConsentfulModel; onAddCategory: () => void }) {
  const { cfg } = m
  const optionalCount = cfg.categories.filter((c) => !c.locked).length
  const presetChips = (["analytics", "marketing", "preferences"] as const)
    .filter((id) => !cfg.categories.some((c) => c.id === id))
    .map((id) => ({ id, label: CAT_NAME[id]!, icon: catIcon(id) }))

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {cfg.categories.map((c) => {
        const col = catColor(c.id)
        return (
          <div key={c.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rXl, padding: 15, boxShadow: T.shSm }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  flex: "0 0 auto",
                  borderRadius: T.rMd,
                  background: tint(col, "18"),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={catIcon(c.id)} size={20} color={col} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: "-.01em" }}>{c.name}</span>
                  {c.locked ? (
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 800,
                        letterSpacing: ".05em",
                        color: T.ink3,
                        background: T.sunken,
                        padding: "2px 7px",
                        borderRadius: T.rPill,
                      }}
                    >
                      ALWAYS ON
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: 12, color: T.ink3, marginTop: 3, lineHeight: 1.45 }}>{c.desc}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10 }}>
                  {c.signals.map((sig) => (
                    <span
                      key={sig}
                      style={{
                        fontFamily: T.mono,
                        fontSize: 10,
                        color: col,
                        background: tint(col, "16"),
                        padding: "3px 7px",
                        borderRadius: T.rChip,
                        fontWeight: 500,
                      }}
                    >
                      {sig}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ flex: "0 0 auto", paddingTop: 3 }}>
                {c.locked ? (
                  <Icon name="lock" size={19} color="#c2c6ce" />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Toggle on={c.enabled} onClick={() => m.toggleCat(c.id)} />
                    <HoverButton
                      ariaLabel={`Delete ${c.name}`}
                      onClick={() => m.deleteCat(c.id)}
                      base={{
                        width: 26,
                        height: 26,
                        border: "none",
                        background: "transparent",
                        borderRadius: T.rChip,
                        cursor: "pointer",
                        color: "#c2c6ce",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      hover={{ background: T.dangerSoft, color: T.danger }}
                    >
                      <Icon name="close" size={17} />
                    </HoverButton>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {optionalCount === 0 ? (
        <EmptyState
          icon="category"
          title="No optional categories yet"
          desc="Give visitors granular choice over their data. Start from a preset:"
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 16 }}>
            {presetChips.map((p) => (
              <HoverButton
                key={p.id}
                onClick={() => m.addPreset(p.id)}
                base={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 13px",
                  border: `1px solid ${T.border}`,
                  borderRadius: T.rPill,
                  background: T.surface,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                  color: T.ink2,
                  boxShadow: T.shSm,
                }}
                hover={{ borderColor: T.accent, color: T.accentText, background: T.accentSoft }}
              >
                <Icon name={p.icon} size={17} color={catColor(p.id)} />
                {p.label}
              </HoverButton>
            ))}
          </div>
          <button
            type="button"
            onClick={onAddCategory}
            style={{ marginTop: 15, border: "none", background: "transparent", color: T.accentText, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            or create a custom category
          </button>
        </EmptyState>
      ) : (
        <DashedAdd label="Add category" onClick={onAddCategory} />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Behavior                                                                    */
/* -------------------------------------------------------------------------- */

const SHOW_WHEN_HINT: Record<string, string> = {
  all: "The banner appears for every visitor, worldwide.",
  eea: "Only visitors detected in the EU / EEA see the banner; others get analytics by default.",
  geo: "Show based on a custom region rule — configurable with Pro.",
}

export function BehaviorPanel({ m }: { m: ConsentfulModel }) {
  const { cfg } = m
  const toggles = [
    { key: "respectDNT" as const, label: 'Respect "Do Not Track"', desc: "Skip the banner and deny all when the browser signals DNT." },
    { key: "hideAfter" as const, label: "Hide after a choice", desc: "Remove the banner once the visitor has decided." },
    { key: "reloadOnChange" as const, label: "Reload on change", desc: "Refresh the page when consent changes so tags re-evaluate." },
  ]
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <Eyebrow style={{ marginBottom: 11 }}>When to show</Eyebrow>
        <Segmented
          value={cfg.showWhen}
          onChange={(v) => m.set("showWhen", v)}
          options={[
            { value: "all", label: "Everywhere" },
            { value: "eea", label: "EU / EEA" },
            { value: "geo", label: "By region" },
          ]}
        />
        <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 11, lineHeight: 1.5 }}>{SHOW_WHEN_HINT[cfg.showWhen]}</div>
      </Card>

      <GeoEndpointCard m={m} />

      <Card>
        <Eyebrow style={{ marginBottom: 12 }}>Consent lifetime</Eyebrow>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>Remember a choice for</div>
            <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 2, lineHeight: 1.4 }}>After this, the banner is shown again.</div>
          </div>
          <Stepper
            value={`${cfg.expiryDays} days`}
            onDec={() => m.set("expiryDays", Math.max(30, cfg.expiryDays - 30))}
            onInc={() => m.set("expiryDays", Math.min(730, cfg.expiryDays + 30))}
          />
        </div>
      </Card>

      <Card style={{ padding: "6px 16px 8px" }}>
        <Eyebrow style={{ margin: "13px 0 2px" }}>Privacy signals</Eyebrow>
        {toggles.map((t, i) => (
          <Row key={t.key} title={t.label} desc={t.desc} border={i < toggles.length - 1}>
            <Toggle on={cfg[t.key]} onClick={() => m.toggle(t.key)} />
          </Row>
        ))}
      </Card>

      <Card style={{ padding: "6px 16px 14px" }}>
        <Eyebrow style={{ margin: "13px 0 2px" }}>Reopen button</Eyebrow>
        <Row
          title="Floating cookie-settings button"
          desc="Show a small persistent button so visitors can reopen preferences and withdraw consent at any time — recommended for GDPR."
          border={cfg.floatingButton}
        >
          <Toggle on={cfg.floatingButton} onClick={() => m.toggle("floatingButton")} />
        </Row>
        {cfg.floatingButton ? (
          <div style={{ paddingTop: 12 }}>
            <Segmented
              value={cfg.floatingButtonPos}
              onChange={(v) => m.set("floatingButtonPos", v)}
              options={[
                { value: "bottom-left", label: "Btm left" },
                { value: "bottom-right", label: "Btm right" },
                { value: "top-left", label: "Top left" },
                { value: "top-right", label: "Top right" },
              ]}
            />
          </div>
        ) : null}
      </Card>
    </div>
  )
}

/** Accurate geo-targeting endpoint (Pro). Free plans see a locked upsell. */
function GeoEndpointCard({ m }: { m: ConsentfulModel }) {
  const { cfg } = m
  const isPro = cfg.plan === "pro"
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Eyebrow>Accurate geo-targeting</Eyebrow>
        {isPro ? null : <ProChip />}
      </div>
      <div style={{ fontSize: 11.5, color: T.ink3, lineHeight: 1.5, marginBottom: isPro ? 11 : 0 }}>
        By default the banner infers region from the visitor's time zone — instant and free, but fooled by VPNs and
        travel. Point it at a geo endpoint to use the visitor's real country instead.
      </div>
      {isPro ? (
        <>
          <TextInput
            value={cfg.geoEndpoint}
            onChange={(v) => m.set("geoEndpoint", v.trim())}
            placeholder="https://consent-geo.your-worker.workers.dev"
            mono
          />
          <div style={{ fontSize: 11, color: T.ink4, marginTop: 7, lineHeight: 1.5 }}>
            Deploy the free Cloudflare Worker in{" "}
            <span style={{ fontFamily: T.mono, fontSize: 10.5 }}>runtime/cloudflare-worker/</span> and paste its URL.
            Leave blank to use the free heuristic. Applies to “EU / EEA” and “By region” modes.
          </div>
        </>
      ) : null}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Consent Mode                                                                */
/* -------------------------------------------------------------------------- */

const SIGNAL_ROWS: Array<[string, string]> = [
  ["analytics_storage", "analytics"],
  ["ad_storage", "marketing"],
  ["ad_user_data", "marketing"],
  ["ad_personalization", "marketing"],
  ["functionality_storage", "preferences"],
  ["security_storage", "necessary"],
]

export function ConsentPanel({ m }: { m: ConsentfulModel }) {
  const { cfg } = m
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: "-.01em" }}>Google Consent Mode v2</div>
          <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 3, lineHeight: 1.5 }}>
            Emit consent signals to Google tags. We never load Google scripts for you — we only broadcast the state.
          </div>
        </div>
        <Toggle on={cfg.consentMode} onClick={() => m.toggle("consentMode")} />
      </Card>

      {!cfg.consentMode ? (
        <EmptyState
          icon="gpp_maybe"
          title="Consent Mode is off"
          desc="No signals are broadcast while it's off. Turn it on to sync consent with your Google tags."
        >
          <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
            <Button variant="dark" onClick={() => m.toggle("consentMode")} icon="bolt">
              Enable Consent Mode
            </Button>
          </div>
        </EmptyState>
      ) : (
        <>
          <Card>
            <Eyebrow style={{ marginBottom: 4 }}>Default signal states</Eyebrow>
            <div style={{ fontSize: 11.5, color: T.ink3, lineHeight: 1.5, marginBottom: 8 }}>
              Every signal starts denied, then flips to granted per the visitor's choice.
            </div>
            {SIGNAL_ROWS.map(([sig, catId], i) => {
              const granted = catId === "necessary"
              const col = catColor(catId)
              return (
                <div
                  key={sig}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 0",
                    borderBottom: i < SIGNAL_ROWS.length - 1 ? `1px solid ${T.hairline}` : "none",
                  }}
                >
                  <span style={{ flex: 1, fontFamily: T.mono, fontSize: 11.5, color: T.ink2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sig}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: col, background: tint(col, "16"), padding: "3px 8px", borderRadius: T.rChip, flex: "0 0 auto" }}>
                    {CAT_NAME[catId]}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: ".02em",
                      color: granted ? T.success : T.ink3,
                      background: granted ? T.successSoft : T.sunken,
                      padding: "3px 8px",
                      borderRadius: T.rChip,
                      width: 58,
                      textAlign: "center",
                      flex: "0 0 auto",
                    }}
                  >
                    {granted ? "Granted" : "Denied"}
                  </span>
                </div>
              )
            })}
          </Card>

          <Card style={{ padding: "6px 16px 8px" }}>
            <Eyebrow style={{ margin: "13px 0 2px" }}>Advanced</Eyebrow>
            <Row title="Wait for update" desc="Delay before tags read the default state.">
              <Stepper
                value={`${cfg.waitForUpdate} ms`}
                onDec={() => m.set("waitForUpdate", Math.max(0, cfg.waitForUpdate - 100))}
                onInc={() => m.set("waitForUpdate", Math.min(2000, cfg.waitForUpdate + 100))}
              />
            </Row>
            <Row title="URL passthrough" desc="Preserve ad click IDs across pages when cookies are denied.">
              <Toggle on={cfg.urlPassthrough} onClick={() => m.toggle("urlPassthrough")} />
            </Row>
            <div style={{ padding: "13px 0 6px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>Load Google tag for me (optional)</div>
              <div style={{ fontSize: 11.5, color: T.ink3, margin: "2px 0 9px", lineHeight: 1.45 }}>
                Enter a Google tag id and we'll load gtag.js — blocked until consent. Leave blank if you add your tag in
                Scripts instead.
              </div>
              <TextInput
                value={cfg.googleTagId}
                onChange={(v) => m.set("googleTagId", v)}
                placeholder="G-XXXXXXXXXX"
                mono
              />
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Scripts                                                                     */
/* -------------------------------------------------------------------------- */

export function ScriptsPanel({ m, onAddScript }: { m: ConsentfulModel; onAddScript: () => void }) {
  const { cfg } = m
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, background: T.accentSoft, border: `1px solid ${T.accentBorder}`, borderRadius: T.rLg, padding: "12px 13px" }}>
        <Icon name="info" size={18} color={T.accent} style={{ marginTop: 1 }} />
        <div style={{ fontSize: 11.5, color: "#3d5680", lineHeight: 1.5 }}>
          Listed tags stay blocked until the visitor consents to their category. Scripts tagged{" "}
          <span style={{ fontFamily: T.mono, fontSize: 10.5, background: "#e0ebfe", padding: "1px 5px", borderRadius: 4 }}>type="text/plain"</span>{" "}
          are detected automatically.
        </div>
      </div>

      {cfg.scripts.map((s, i) => {
        const col = catColor(s.cat)
        const catLabel = cfg.categories.find((c) => c.id === s.cat)?.name ?? CAT_NAME[s.cat] ?? s.cat
        // Show the host for a `src` script, "inline snippet" for inline code,
        // then the tag id when one was supplied.
        const source = s.type === "inline" ? "inline snippet" : scriptHost(s) || "—"
        const detail = s.id ? `${source} · ${s.id}` : source
        return (
          <div
            key={`${s.name}-${i}`}
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rLg, padding: "12px 13px", display: "flex", alignItems: "center", gap: 12, boxShadow: T.shSm }}
          >
            <div style={{ width: 36, height: 36, flex: "0 0 auto", borderRadius: T.rMd, background: T.sunken, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="code" size={19} color={T.ink3} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{s.name}</div>
              <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.ink4, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {detail}
              </div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: col, background: tint(col, "16"), padding: "4px 9px", borderRadius: T.rPill, flex: "0 0 auto" }}>
              {catLabel}
            </span>
            <HoverButton
              ariaLabel={`Delete ${s.name}`}
              onClick={() => m.deleteScript(i)}
              base={{ width: 28, height: 28, border: "none", background: "transparent", borderRadius: T.rSm, cursor: "pointer", color: "#c2c6ce", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}
              hover={{ background: T.dangerSoft, color: T.danger }}
            >
              <Icon name="delete" size={18} />
            </HoverButton>
          </div>
        )
      })}

      {cfg.scripts.length === 0 ? (
        <EmptyState icon="code_off" title="No managed scripts" desc="Tags you add in Framer are auto-detected and blocked. Add one here to control it manually." />
      ) : null}

      <DashedAdd label="Add managed script" onClick={onAddScript} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Style                                                                       */
/* -------------------------------------------------------------------------- */

const SWATCHES = ["#2F6FED", "#6366F1", "#16A34A", "#0EA5E9", "#F97316", "#111827"]
const POS_OPTS: Array<[string, string]> = [
  ["bottom-left", "Bottom left"],
  ["bottom-right", "Bottom right"],
  ["bottom-center", "Bottom center"],
  ["center", "Center"],
]

export function StylePanel({ m }: { m: ConsentfulModel }) {
  const { cfg } = m
  const A = cfg.accent // banner accent — legitimately used to preview banner colour
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <Eyebrow style={{ marginBottom: 11 }}>Theme</Eyebrow>
        <Segmented
          value={cfg.theme}
          onChange={(v) => m.set("theme", v)}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "auto", label: "Auto" },
          ]}
        />
      </Card>

      <Card>
        <Eyebrow style={{ marginBottom: 12 }}>Accent colour</Eyebrow>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 15 }}>
          <label style={{ position: "relative", width: T.control, height: T.control, borderRadius: T.rMd, overflow: "hidden", cursor: "pointer", boxShadow: `0 0 0 1px rgba(16,24,40,.1)`, flex: "0 0 auto", display: "block" }}>
            <input
              type="color"
              value={A}
              onChange={(e) => m.set("accent", e.target.value)}
              style={{ position: "absolute", top: -8, left: -8, width: 58, height: 58, border: "none", padding: 0, background: "none", cursor: "pointer" }}
            />
          </label>
          <input
            type="text"
            value={A}
            onChange={(e) => m.set("accent", e.target.value)}
            style={{ flex: 1, height: T.control, boxSizing: "border-box", fontFamily: T.mono, fontSize: 13, color: T.ink, background: T.sunken, border: `1px solid ${T.border}`, padding: `0 ${T.controlPadX}px`, borderRadius: T.rMd, textTransform: "uppercase", outline: "none" }}
          />
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", color: T.ink4, marginBottom: 9 }}>PRESETS</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
      </Card>

      <Card>
        <Eyebrow style={{ marginBottom: 11 }}>Layout</Eyebrow>
        <div style={{ marginBottom: 15 }}>
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
        <Eyebrow style={{ marginBottom: 10 }}>Position</Eyebrow>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {POS_OPTS.map(([val, label]) => {
            const active = cfg.position === val && cfg.layout === "card"
            const dot: CSSProperties = { position: "absolute", borderRadius: 3, background: active ? A : "#c5c9d1", width: "42%", height: "22%" }
            if (val === "bottom-left") Object.assign(dot, { left: "10%", bottom: "13%" })
            else if (val === "bottom-right") Object.assign(dot, { right: "10%", bottom: "13%" })
            else if (val === "bottom-center") Object.assign(dot, { left: "29%", bottom: "13%" })
            else Object.assign(dot, { left: "29%", top: "39%" })
            return (
              <div
                key={val}
                role="button"
                onClick={() => {
                  m.set("position", val as never)
                  if (cfg.layout !== "card") m.set("layout", "card")
                }}
              >
                <div style={{ position: "relative", height: 48, borderRadius: T.rSm, background: T.sunken, border: active ? `1.5px solid ${A}` : `1px solid ${T.border}`, cursor: "pointer", transition: "all .15s" }}>
                  <div style={dot} />
                </div>
                <div style={{ fontSize: 11, marginTop: 6, textAlign: "center", color: active ? T.ink : T.ink3, fontWeight: active ? 700 : 500 }}>{label}</div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Eyebrow>Corner radius</Eyebrow>
          <span style={{ fontFamily: T.mono, fontSize: 12, color: T.ink2 }}>{cfg.radius}px</span>
        </div>
        <input type="range" min={0} max={28} value={cfg.radius} onChange={(e) => m.set("radius", parseInt(e.target.value, 10))} style={{ width: "100%", accentColor: A, height: 4, cursor: "pointer" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "15px 0 3px", marginTop: 8, borderTop: `1px solid ${T.hairline}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>Dim the page behind</div>
            <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 2, lineHeight: 1.45 }}>Adds a backdrop overlay to focus attention.</div>
          </div>
          <Toggle on={cfg.overlay} onClick={() => m.toggle("overlay")} />
        </div>
      </Card>

      <CustomCssCard m={m} />
    </div>
  )
}

/** Raw CSS override (Pro). Appended last so it wins over the generated styles. */
function CustomCssCard({ m }: { m: ConsentfulModel }) {
  const { cfg } = m
  const isPro = cfg.plan === "pro"
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Eyebrow>Custom CSS</Eyebrow>
        {isPro ? null : <ProChip />}
      </div>
      <div style={{ fontSize: 11.5, color: T.ink3, lineHeight: 1.5, marginBottom: isPro ? 11 : 0 }}>
        Fine-tune the banner with your own CSS — appended last so it overrides the generated styles. Target the{" "}
        <span style={{ fontFamily: T.mono, fontSize: 10.5 }}>.cc-*</span> classes.
      </div>
      {isPro ? (
        <TextInput
          value={cfg.customCss}
          onChange={(v) => m.set("customCss", v)}
          placeholder={".cc-banner { box-shadow: 0 8px 40px rgba(0,0,0,.18); }"}
          multiline
          mono
        />
      ) : null}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Text                                                                        */
/* -------------------------------------------------------------------------- */

/** Localizable copy fields, in display order (privacy URL is handled separately). */
const TEXT_FIELDS: Array<{ key: LocalizableFieldKey; label: string; multiline?: boolean }> = [
  { key: "heading", label: "Banner heading" },
  { key: "body", label: "Banner body", multiline: true },
  { key: "acceptLabel", label: "“Accept all” button" },
  { key: "rejectLabel", label: "“Reject all” button" },
  { key: "manageLabel", label: "“Manage preferences” link" },
  { key: "saveLabel", label: "“Save choices” button" },
]

export function TextPanel({ m }: { m: ConsentfulModel }) {
  const { cfg } = m
  const isPro = cfg.plan === "pro"
  // "" = the default/base copy; a locale code = editing that translation.
  const [locale, setLocale] = useState("")
  // If the selected locale was removed, fall back to the base copy.
  const editingLocale = locale && cfg.languages.includes(locale) ? locale : ""

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      <LanguageBar m={m} isPro={isPro} editing={editingLocale} onSelect={setLocale} />

      {TEXT_FIELDS.map((f) => {
        const base = cfg[f.key] as string
        const editingBase = editingLocale === ""
        const value = editingBase ? base : m.localeValue(editingLocale, f.key)
        return (
          <div key={f.key}>
            <Label>{f.label}</Label>
            <TextInput
              value={value}
              onChange={(v) =>
                editingBase ? m.set(f.key as never, v as never) : m.setLocaleValue(editingLocale, f.key, v)
              }
              {...(editingBase ? {} : { placeholder: base })}
              multiline={!!f.multiline}
            />
          </div>
        )
      })}

      {/* The privacy URL is shared across locales (a URL, not copy). */}
      {editingLocale === "" ? (
        <div>
          <Label>Privacy policy URL</Label>
          <TextInput value={cfg.privacyUrl} onChange={(v) => m.set("privacyUrl", v)} mono />
        </div>
      ) : (
        <div style={{ fontSize: 11, color: T.ink4, lineHeight: 1.5 }}>
          Empty fields fall back to the default copy. The privacy policy URL is shared across all languages —
          edit it on the default tab.
        </div>
      )}
    </div>
  )
}

/** The language selector row: default + added locales + add/remove (Pro-gated). */
function LanguageBar({
  m,
  isPro,
  editing,
  onSelect,
}: {
  m: ConsentfulModel
  isPro: boolean
  editing: string
  onSelect: (code: string) => void
}) {
  const { cfg } = m
  const [adding, setAdding] = useState(false)

  if (!isPro) {
    return (
      <div>
        <Label>Language</Label>
        <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", border: `1px solid ${T.border}`, borderRadius: T.rMd, background: T.sunken }}>
          <Icon name="public" size={18} color={T.ink3} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.ink }}>English (default)</span>
          <ProChip />
        </div>
        <div style={{ fontSize: 11, color: T.ink4, marginTop: 6 }}>
          Add more languages with Pro — the banner auto-detects the visitor's locale and shows the right copy.
        </div>
      </div>
    )
  }

  const available = COMMON_LANGUAGES.filter(([code]) => !cfg.languages.includes(code))

  const chip = (code: string, label: string) => {
    const active = editing === code
    return (
      <div
        key={code || "default"}
        role="button"
        onClick={() => onSelect(code)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          borderRadius: T.rPill,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          border: active ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
          color: active ? T.accentText : T.ink2,
          background: active ? T.accentSoft : T.surface,
        }}
      >
        {code === "" ? <Icon name="star" size={14} color={active ? T.accent : T.ink4} /> : null}
        {label}
        {code !== "" ? (
          <span
            role="button"
            aria-label={`Remove ${label}`}
            onClick={(e) => {
              e.stopPropagation()
              if (editing === code) onSelect("")
              m.removeLanguage(code)
            }}
            style={{ display: "inline-flex", marginLeft: 1, color: active ? T.accent : T.ink4 }}
          >
            <Icon name="close" size={14} />
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Label>Languages</Label>
        <span style={{ fontSize: 11, color: T.ink4 }}>Editing: {editing === "" ? "Default" : languageName(editing)}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center" }}>
        {chip("", "Default")}
        {cfg.languages.map((code) => chip(code, languageName(code)))}
        {available.length > 0 ? (
          adding ? (
            <select
              autoFocus
              defaultValue=""
              onChange={(e) => {
                const code = e.target.value
                if (code) {
                  m.addLanguage(code)
                  onSelect(code)
                }
                setAdding(false)
              }}
              onBlur={() => setAdding(false)}
              style={{ height: 30, borderRadius: T.rPill, border: `1px solid ${T.accent}`, padding: "0 8px", fontSize: 12, fontWeight: 700, color: T.ink, background: T.surface, cursor: "pointer" }}
            >
              <option value="" disabled>
                Choose a language…
              </option>
              {available.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          ) : (
            <HoverButton
              onClick={() => setAdding(true)}
              base={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: T.rPill, border: `1.5px dashed ${T.border2}`, background: T.surface, color: T.ink2, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              hover={{ borderColor: T.accent, color: T.accentText, background: T.accentSoft }}
            >
              <Icon name="add" size={15} />
              Add language
            </HoverButton>
          )
        ) : null}
      </div>
    </div>
  )
}

function ProChip() {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 800, letterSpacing: ".04em", color: "#c9932a", background: T.warnSoft, padding: "3px 8px", borderRadius: T.rPill }}>
      <Icon name="lock" size={12} color="#c9932a" />
      PRO
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* License                                                                     */
/* -------------------------------------------------------------------------- */

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
      return "Checking…"
    case "invalid":
      return "Invalid key"
    case "offline":
      return "Offline · last verified"
    default:
      return "Free plan"
  }
}

export function LicensePanel({ m }: { m: ConsentfulModel }) {
  void m
  const lic = useLicense()
  const licensed = lic.status === "active"
  const busy = lic.status === "validating"

  const [draft, setDraft] = useState(lic.key)
  useEffect(() => {
    setDraft(lic.key)
  }, [lic.key])

  const pill = STATUS_PILL[lic.status]
  const configured = isConfigured()

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!configured ? (
        <div style={{ display: "flex", gap: 10, background: T.warnSoft, border: `1px solid ${T.warn}33`, borderRadius: T.rLg, padding: "12px 13px" }}>
          <Icon name="build" size={18} color={T.warn} style={{ marginTop: 1 }} />
          <div style={{ fontSize: 11.5, color: "#7a5b12", lineHeight: 1.5 }}>
            Licensing isn't wired up yet — set your Lemon Squeezy store &amp; product ids
            (via <span style={{ fontFamily: T.mono, fontSize: 10.5 }}>VITE_LS_*</span> env vars or{" "}
            <span style={{ fontFamily: T.mono, fontSize: 10.5 }}>lib/licenseConfig.ts</span>). Until then every key
            stays on the free trial.
          </div>
        </div>
      ) : null}
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
              {busy ? "Checking…" : "Activate"}
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
              ? "Verified against Lemon Squeezy and cached on-device — it keeps working offline and re-checks weekly."
              : "Paste the key from your Lemon Squeezy receipt. Validated on-device — no account or server needed."}
          </div>
        )}

        {licensed ? (
          <button type="button" onClick={() => void lic.refresh()} style={{ marginTop: 10, border: "none", background: "transparent", color: T.accentText, fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>
            Re-check now
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

      {!licensed ? (
        <a
          href={PRODUCT_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: T.control, borderRadius: T.rLg, background: "linear-gradient(155deg,#5b9bff,#2f6fed)", color: "#fff", fontSize: 13.5, fontWeight: 700, textDecoration: "none", boxShadow: `0 6px 16px ${T.accent}44` }}
        >
          <Icon name="shopping_bag" size={18} />
          Buy a license
        </a>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Insights (consent analytics — Pro)                                          */
/* -------------------------------------------------------------------------- */

/** One day's aggregate as returned by the analytics Worker. */
interface DayStat {
  total: number
  accept: number
  reject: number
  custom: number
  categories: Record<string, { granted: number; seen: number }>
}

interface StatsResponse {
  days: Record<string, DayStat>
}

/** Summed totals across the fetched window. */
interface Totals {
  total: number
  accept: number
  reject: number
  custom: number
  categories: Record<string, { granted: number; seen: number }>
}

function sumDays(stats: StatsResponse): Totals {
  const totals: Totals = { total: 0, accept: 0, reject: 0, custom: 0, categories: {} }
  for (const day of Object.values(stats.days)) {
    totals.total += day.total || 0
    totals.accept += day.accept || 0
    totals.reject += day.reject || 0
    totals.custom += day.custom || 0
    for (const [id, c] of Object.entries(day.categories || {})) {
      const acc = totals.categories[id] || { granted: 0, seen: 0 }
      acc.granted += c.granted || 0
      acc.seen += c.seen || 0
      totals.categories[id] = acc
    }
  }
  return totals
}

const pct = (n: number, d: number): number => (d > 0 ? Math.round((n / d) * 100) : 0)

export function InsightsPanel({ m }: { m: ConsentfulModel }) {
  const { cfg } = m
  const isPro = cfg.plan === "pro"
  const endpoint = cfg.analyticsEndpoint.trim()

  const [state, setState] = useState<"idle" | "loading" | "error" | "ok">("idle")
  const [totals, setTotals] = useState<Totals | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!isPro || !endpoint) {
      setState("idle")
      setTotals(null)
      return
    }
    let active = true
    setState("loading")
    const base = endpoint.replace(/\/+$/, "")
    fetch(`${base}/stats?days=30`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<StatsResponse>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (!active) return
        setTotals(sumDays(data))
        setState("ok")
      })
      .catch(() => {
        if (active) setState("error")
      })
    return () => {
      active = false
    }
  }, [isPro, endpoint, nonce])

  if (!isPro) {
    return (
      <EmptyState
        icon="query_stats"
        title="Consent analytics is a Pro feature"
        desc="See how many visitors accept, reject or customize — and which categories they allow — over time. Anonymous and cookie-free."
      >
        <div style={{ marginTop: 16 }}>
          <ProChip />
        </div>
      </EmptyState>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <Eyebrow style={{ marginBottom: 8 }}>Analytics endpoint</Eyebrow>
        <TextInput
          value={cfg.analyticsEndpoint}
          onChange={(v) => m.set("analyticsEndpoint", v.trim())}
          placeholder="https://consent-analytics.your-worker.workers.dev"
          mono
        />
        <div style={{ fontSize: 11, color: T.ink4, marginTop: 7, lineHeight: 1.5 }}>
          Deploy the free Worker in{" "}
          <span style={{ fontFamily: T.mono, fontSize: 10.5 }}>runtime/cloudflare-worker/</span> (analytics) and paste
          its URL. The runtime sends an anonymous accept/reject event per decision — no cookies, no IP, no visitor id.
        </div>
      </Card>

      {!endpoint ? (
        <EmptyState icon="insights" title="No data yet" desc="Add your analytics endpoint above to start collecting anonymous consent rates." />
      ) : state === "loading" ? (
        <Card style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 28, color: T.ink3, fontSize: 13 }}>
          <Spinner size={14} /> Loading last 30 days…
        </Card>
      ) : state === "error" ? (
        <EmptyState icon="cloud_off" title="Couldn't reach the endpoint" desc="Check the URL is your deployed analytics Worker and that it's reachable.">
          <div style={{ marginTop: 14 }}>
            <Button variant="secondary" icon="refresh" onClick={() => setNonce((n) => n + 1)}>
              Try again
            </Button>
          </div>
        </EmptyState>
      ) : totals && totals.total > 0 ? (
        <InsightsDashboard m={m} totals={totals} onRefresh={() => setNonce((n) => n + 1)} />
      ) : (
        <EmptyState icon="hourglass_empty" title="No decisions recorded yet" desc="Once visitors interact with your banner, their anonymous choices show up here (last 30 days).">
          <div style={{ marginTop: 14 }}>
            <Button variant="secondary" icon="refresh" onClick={() => setNonce((n) => n + 1)}>
              Refresh
            </Button>
          </div>
        </EmptyState>
      )}
    </div>
  )
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rLg, padding: "12px 13px", boxShadow: T.shSm }}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", color }}>{value}</div>
      <div style={{ fontSize: 11, color: T.ink3, fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  )
}

function InsightsDashboard({ m, totals, onRefresh }: { m: ConsentfulModel; totals: Totals; onRefresh: () => void }) {
  const { cfg } = m
  const catName = (id: string) => cfg.categories.find((c) => c.id === id)?.name ?? CAT_NAME[id] ?? id
  return (
    <>
      <div style={{ display: "flex", gap: 10 }}>
        <StatTile label="Decisions" value={String(totals.total)} color={T.ink} />
        <StatTile label="Accept rate" value={`${pct(totals.accept, totals.total)}%`} color={T.success} />
        <StatTile label="Reject rate" value={`${pct(totals.reject, totals.total)}%`} color={T.danger} />
        <StatTile label="Customized" value={`${pct(totals.custom, totals.total)}%`} color={T.accent} />
      </div>

      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Eyebrow>Grant rate by category</Eyebrow>
          <HoverButton
            ariaLabel="Refresh"
            onClick={onRefresh}
            base={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${T.border}`, background: T.surface, borderRadius: T.rSm, cursor: "pointer", color: T.ink3 }}
            hover={{ background: T.sunken, color: T.ink }}
          >
            <Icon name="refresh" size={16} />
          </HoverButton>
        </div>
        {Object.keys(totals.categories).length === 0 ? (
          <div style={{ fontSize: 12, color: T.ink3 }}>No optional-category data yet.</div>
        ) : (
          Object.entries(totals.categories).map(([id, c], i, arr) => {
            const rate = pct(c.granted, c.seen)
            const col = catColor(id)
            return (
              <div key={id} style={{ padding: "9px 0", borderBottom: i < arr.length - 1 ? `1px solid ${T.hairline}` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{catName(id)}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 12, color: T.ink2 }}>{rate}%</span>
                </div>
                <div style={{ height: 7, borderRadius: 4, background: T.sunken, overflow: "hidden" }}>
                  <div style={{ width: `${rate}%`, height: "100%", background: col, borderRadius: 4, transition: "width .3s" }} />
                </div>
              </div>
            )
          })
        )}
        <div style={{ fontSize: 10.5, color: T.ink4, marginTop: 12, lineHeight: 1.5 }}>
          Last 30 days · anonymous, aggregated counts · no cookies or personal data collected.
        </div>
      </Card>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Publish                                                                     */
/* -------------------------------------------------------------------------- */

export function PublishPanel({ m, publishing, onPublish }: { m: ConsentfulModel; publishing: boolean; onPublish: () => void }) {
  void m
  const checklist = ["Configuration is valid", `Runtime pinned to ${RUNTIME_VERSION}`, "Consent Mode signals default to denied"]
  const injectList = [
    { icon: "data_object", title: "Consent loader in <head>", desc: "A small inline script sets defaults before any tag fires." },
    { icon: "shield", title: "Consent Mode defaults", desc: "All signals start denied for full compliance." },
    { icon: "cloud_download", title: "Runtime via jsDelivr", desc: "~12 KB gzipped, deferred so it never blocks your page." },
  ]
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: T.successSoft, border: `1px solid ${T.successBorder}`, borderRadius: T.rXl, padding: "15px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Icon name="task_alt" size={20} color={T.success} />
          <span style={{ fontSize: 14, fontWeight: 700, color: T.successText, letterSpacing: "-.01em" }}>Ready to publish</span>
        </div>
        {checklist.map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12, color: "#2f6a48" }}>
            <Icon name="check_circle" size={16} color={T.success} />
            {i}
          </div>
        ))}
      </div>

      <Card>
        <Eyebrow style={{ marginBottom: 8 }}>What gets added to your site</Eyebrow>
        {injectList.map((i, idx) => (
          <div key={i.title} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0", borderBottom: idx < injectList.length - 1 ? `1px solid ${T.hairline}` : "none" }}>
            <Icon name={i.icon} size={18} color={T.ink3} style={{ marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{i.title}</div>
              <div style={{ fontSize: 11, color: T.ink3, marginTop: 1, lineHeight: 1.4 }}>{i.desc}</div>
            </div>
          </div>
        ))}
      </Card>

      <HoverButton
        onClick={publishing ? undefined : onPublish}
        base={{
          height: T.control,
          border: "none",
          borderRadius: T.rXl,
          background: "linear-gradient(155deg,#5b9bff,#2f6fed)",
          color: "#fff",
          fontSize: 13.5,
          fontWeight: 700,
          cursor: publishing ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          boxShadow: `0 6px 16px ${T.accent}44`,
          opacity: publishing ? 0.9 : 1,
          width: "100%",
          transition: "filter .15s",
        }}
        hover={publishing ? undefined : { filter: "brightness(1.06)" }}
      >
        {publishing ? (
          <span style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,.5)", borderTopColor: "#fff", display: "inline-block", animation: "cfspin .7s linear infinite" }} />
        ) : (
          <Icon name="rocket_launch" size={19} />
        )}
        {publishing ? "Publishing…" : "Publish to site"}
      </HoverButton>
    </div>
  )
}

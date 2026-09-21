/**
 * Shared inline-styled primitives for the Consentful UI. Framer-native refined:
 * every control draws from {@link T} (tokens.ts), themes its own focus ring, and
 * has explicit hover / disabled states. Public API is unchanged from the port
 * plus a first-class {@link Button}.
 */

import { useState } from "react"
import type { CSSProperties, ReactNode } from "react"

import { T, focusRing } from "./tokens"

/* -------------------------------------------------------------------------- */
/* Icon                                                                       */
/* -------------------------------------------------------------------------- */

/** A Material Symbols Rounded glyph (set by ligature name). */
export function Icon({
  name,
  size = 20,
  color = "currentColor",
  style,
}: {
  name: string
  size?: number
  color?: string
  style?: CSSProperties
}) {
  return (
    <span className="cf-icon" style={{ fontSize: size, color, ...style }}>
      {name}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Toggle                                                                      */
/* -------------------------------------------------------------------------- */

/** Pill switch. `accent` fills the track when on (brand for chrome). */
export function Toggle({
  on,
  accent = T.accent,
  onClick,
  size = "md",
}: {
  on: boolean
  accent?: string
  onClick: () => void
  size?: "md" | "sm"
}) {
  const [focus, setFocus] = useState(false)
  const w = size === "sm" ? 32 : 40
  const h = size === "sm" ? 19 : 23
  const knob = size === "sm" ? 15 : 19
  const travel = size === "sm" ? 13 : 17
  return (
    <div
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        width: w,
        height: h,
        borderRadius: T.rPill,
        background: on ? accent : "#d4d8df",
        position: "relative",
        transition: "background .18s ease",
        flex: "0 0 auto",
        cursor: "pointer",
        boxShadow: focus ? focusRing : on ? `inset 0 0 0 1px rgba(0,0,0,.04)` : "inset 0 0 0 1px rgba(0,0,0,.03)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: 2,
          width: knob,
          height: knob,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 2px rgba(16,24,40,.3), 0 1px 3px rgba(16,24,40,.12)",
          transform: on ? `translateX(${travel}px)` : "translateX(0)",
          transition: "transform .2s cubic-bezier(.22,1,.36,1)",
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Segmented control                                                          */
/* -------------------------------------------------------------------------- */

export interface SegOption<T extends string> {
  value: T
  label: string
}

/** Sliding segmented control (theme / layout / show-when / preview mode). */
export function Segmented<V extends string>({
  value,
  options,
  onChange,
  track = T.sunken,
  fontSize = 12,
}: {
  value: V
  options: readonly SegOption<V>[]
  onChange: (value: V) => void
  track?: string
  fontSize?: number
}) {
  return (
    <div style={{ display: "flex", gap: 3, background: track, padding: 3, borderRadius: T.rMd }}>
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <div
            key={opt.value}
            role="button"
            tabIndex={0}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onChange(opt.value)
              }
            }}
            style={{
              flex: 1,
              height: T.control - 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 8px",
              fontSize,
              fontWeight: active ? 700 : 600,
              borderRadius: T.rChip,
              cursor: "pointer",
              color: active ? T.ink : T.ink3,
              background: active ? T.surface : "transparent",
              boxShadow: active ? "0 1px 2px rgba(16,24,40,.1), 0 0 0 1px rgba(16,24,40,.04)" : "none",
              transition: "color .15s, background .15s",
              userSelect: "none",
            }}
          >
            {opt.label}
          </div>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Stepper                                                                     */
/* -------------------------------------------------------------------------- */

/** The −/value/+ stepper used for expiry days and wait-for-update. */
export function Stepper({ value, onDec, onInc }: { value: string; onDec: () => void; onInc: () => void }) {
  const btn: CSSProperties = {
    width: 27,
    height: 27,
    border: "none",
    background: T.surface,
    borderRadius: T.rSm,
    cursor: "pointer",
    color: T.ink2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: T.shSm,
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        height: T.control,
        boxSizing: "border-box",
        border: `1px solid ${T.border}`,
        borderRadius: T.rMd,
        padding: 3,
        background: T.sunken,
        flex: "0 0 auto",
      }}
    >
      <HoverButton ariaLabel="Decrease" onClick={onDec} base={btn} hover={{ color: T.ink, background: "#fff" }}>
        <Icon name="remove" size={17} />
      </HoverButton>
      <div
        style={{
          minWidth: 66,
          textAlign: "center",
          fontFamily: T.mono,
          fontSize: 12.5,
          fontWeight: 500,
          color: T.ink,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <HoverButton ariaLabel="Increase" onClick={onInc} base={btn} hover={{ color: T.ink, background: "#fff" }}>
        <Icon name="add" size={17} />
      </HoverButton>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Hover-aware button                                                         */
/* -------------------------------------------------------------------------- */

/** A `<button>` that merges `hover` styles while pointer/focus is over it. */
export function HoverButton({
  base,
  hover,
  onClick,
  children,
  title,
  ariaLabel,
  type = "button",
}: {
  base: CSSProperties
  hover?: CSSProperties | undefined
  onClick?: (() => void) | undefined
  children: ReactNode
  title?: string
  ariaLabel?: string
  type?: "button" | "submit"
}) {
  const [over, setOver] = useState(false)
  return (
    <button
      type={type}
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      onMouseEnter={() => setOver(true)}
      onMouseLeave={() => setOver(false)}
      onFocus={() => setOver(true)}
      onBlur={() => setOver(false)}
      style={over && hover ? { ...base, ...hover } : base}
    >
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Button — the primary action primitive                                      */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dark"
type ButtonSize = "sm" | "md" | "lg"

/** First-class button with variants, sizes, optional icon and loading state. */
export function Button({
  children,
  onClick,
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  loading,
  disabled,
  full,
  title,
  type = "button",
}: {
  children?: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: string
  iconRight?: string
  loading?: boolean
  disabled?: boolean
  full?: boolean
  title?: string
  type?: "button" | "submit"
}) {
  const [over, setOver] = useState(false)
  const pad = size === "lg" ? "0 18px" : size === "sm" ? "0 11px" : "0 14px"
  const height = size === "sm" ? 32 : T.control
  const font = size === "lg" ? 13.5 : size === "sm" ? 12 : 12.5
  const isDisabled = disabled || loading

  const palette: Record<ButtonVariant, { base: CSSProperties; hover: CSSProperties }> = {
    primary: {
      base: { background: T.accent, color: "#fff", border: "none", boxShadow: `0 1px 2px rgba(16,24,40,.12), 0 2px 6px ${T.accent}3a` },
      hover: { background: T.accentHover },
    },
    secondary: {
      base: { background: T.surface, color: T.ink2, border: `1px solid ${T.border}`, boxShadow: T.shSm },
      hover: { background: T.sunken, color: T.ink, borderColor: T.border2 },
    },
    ghost: {
      base: { background: "transparent", color: T.ink2, border: "none" },
      hover: { background: T.sunken, color: T.ink },
    },
    danger: {
      base: { background: T.dangerSoft, color: T.danger, border: "none" },
      hover: { background: "#f6dcda" },
    },
    dark: {
      base: { background: T.ink, color: "#fff", border: "none", boxShadow: T.shSm },
      hover: { background: "#000" },
    },
  }
  const v = palette[variant]

  return (
    <button
      type={type}
      title={title}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      onMouseEnter={() => setOver(true)}
      onMouseLeave={() => setOver(false)}
      onFocus={() => setOver(true)}
      onBlur={() => setOver(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        height,
        padding: pad,
        width: full ? "100%" : "auto",
        borderRadius: T.rMd,
        fontSize: font,
        fontWeight: 700,
        fontFamily: T.sans,
        letterSpacing: "-.01em",
        cursor: isDisabled ? "default" : "pointer",
        whiteSpace: "nowrap",
        transition: "background .15s, color .15s, border-color .15s, filter .15s",
        opacity: isDisabled && !loading ? 0.55 : 1,
        ...v.base,
        ...(over && !isDisabled ? v.hover : null),
      }}
    >
      {loading ? (
        <Spinner color={variant === "primary" || variant === "dark" ? "#fff" : T.ink2} />
      ) : icon ? (
        <Icon name={icon} size={size === "lg" ? 19 : 17} />
      ) : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={size === "lg" ? 19 : 17} /> : null}
    </button>
  )
}

/** Inline spinner matching the runtime's `cfspin` keyframe. */
export function Spinner({ color = T.accent, size = 15 }: { color?: string; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: "2px solid rgba(150,160,175,.35)",
        borderTopColor: color,
        display: "inline-block",
        animation: "cfspin .7s linear infinite",
        flex: "0 0 auto",
      }}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Card + section eyebrow (recurring shells)                                  */
/* -------------------------------------------------------------------------- */

/** White rounded card wrapper used across panels. */
export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: T.rXl,
        padding: "15px 16px",
        boxShadow: T.shSm,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** Uppercase muted section label. */
export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: ".07em",
        textTransform: "uppercase",
        color: T.ink4,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

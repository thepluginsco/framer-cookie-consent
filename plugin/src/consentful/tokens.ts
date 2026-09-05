/**
 * Consentful design tokens — the single source of truth for the redesigned
 * plugin UI. "Framer-native, refined": a crisp light surface, a disciplined
 * neutral ramp, one confident brand blue for the plugin's own chrome, and a
 * 4px spacing grid. The banner's own accent (`cfg.accent`) is a separate,
 * user-owned colour used only where the UI represents the banner (preview,
 * accent picker); the plugin chrome never adopts it, so choosing an orange
 * banner never turns the editor orange.
 */

export const T = {
  /* Brand — the plugin's own chrome accent (fixed, not the banner accent). */
  accent: "#2f6fed",
  accentHover: "#2861d8",
  accentActive: "#1f52c4",
  accentText: "#1d5bd6", // accent used as small text on white (≥4.5:1)
  accentSoft: "#eef3fe", // tinted fill behind active nav / info
  accentBorder: "#cfe0fd",

  /* Ink — text ramp, all ≥4.5:1 on white except `ink4` (icons/decoration). */
  ink: "#17191e",
  ink2: "#545b67",
  ink3: "#6b7280",
  ink4: "#98a0aa",

  /* Surfaces. */
  surface: "#ffffff",
  ground: "#f4f5f8", // app background behind panels
  sunken: "#f6f7f9", // inputs, tracks, insets
  overlay: "rgba(19,23,32,.44)",

  /* Lines. */
  border: "#e6e8ee",
  border2: "#dbdee5",
  hairline: "#f0f1f4",

  /* Semantic. */
  success: "#17914d",
  successText: "#12703c",
  successSoft: "#e9faf0",
  successBorder: "#c6f0d6",
  warn: "#b26a00",
  warnSoft: "#fdf4e1",
  danger: "#d64545",
  dangerSoft: "#fbeaea",

  /* Controls — one canonical height so every button and single-line input
     lines up. Multi-line textareas and the toggle switch are the exceptions. */
  control: 36,
  controlPadX: 12,

  /* Radii. */
  rChip: 7,
  rSm: 8,
  rMd: 10,
  rLg: 12,
  rXl: 14,
  rModal: 18,
  rPill: 999,

  /* Elevation — every shadow carries offset + soft blur (never a flat halo). */
  shSm: "0 1px 2px rgba(16,24,40,.06)",
  shMd: "0 6px 16px -6px rgba(16,24,40,.12)",
  shLg: "0 16px 40px -12px rgba(16,24,40,.18)",
  shXl: "0 28px 70px -20px rgba(16,24,40,.30)",

  /* Type. */
  sans: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const

/** Focus ring used on interactive chrome (keyboard + input focus). */
export const focusRing = `0 0 0 3px ${T.accent}33`

/** A translucent tint of any hex colour (for category fills, accent washes). */
export const tint = (hex: string, alpha = "18"): string => `${hex}${alpha}`

# Consentful landing — image prompts (ChatGPT Images)

The page runs complete without these: the mascot is drawn in CSS and every motion
scene is code. These images are **upgrades** for the brand moments. Paste each JSON
block into ChatGPT Images as-is. Save the outputs into `design/landing/img/` with
the filename given, and tell me when they're in — I'll wire them in.

Brand reference used by every prompt:
- Mascot = the Consentful cookie mark: a soft, slightly irregular rounded blob,
  iridescent pastel skin (pink `#f7cbe4` → peach `#fbdcc4` → cream `#fdf3cf` →
  mint `#c9edd6` → lavender `#d9d2f6`), a clean deep-indigo `#2a0e6e` outline,
  two tall rounded-rectangle indigo eyes with a small white highlight, no mouth.
- Chrome accent indigo-violet `#4b23d3`, night `#10052b`, font Plus Jakarta Sans.

---

## 1. `mascot-hero.png` — 3D mascot (replaces the CSS mascot in the final CTA and the hub core)

```json
{
  "task": "3D character render for a SaaS brand mascot",
  "output": { "filename": "mascot-hero.png", "size": "1024x1024", "background": "transparent", "format": "png" },
  "subject": {
    "character": "Consentful cookie mascot",
    "shape": "soft, slightly irregular rounded blob, like a squishy marshmallow cookie, wider at the top, subtle organic wobble in the silhouette, no limbs",
    "skin": {
      "material": "smooth soft-touch vinyl with a pearlescent iridescent sheen",
      "gradient_stops_hex": ["#f7cbe4", "#fbdcc4", "#fdf3cf", "#c9edd6", "#d9d2f6"],
      "gradient_direction": "diagonal, top-left pink to bottom-right lavender, with a gentle conic swirl"
    },
    "outline": "thin clean deep indigo #2a0e6e rim, like a toy's painted edge line",
    "face": {
      "eyes": "two tall rounded-rectangle eyes in deep indigo #2a0e6e, set slightly above center and close together, each with one small crisp white specular highlight at upper-left",
      "mouth": "none",
      "expression": "calm, friendly, trustworthy, slightly curious"
    },
    "pose": "floating, three-quarter view turned 10 degrees to the left, very slight tilt"
  },
  "lighting": "soft studio key light from upper-left, gentle rim light in lavender #d9d2f6 from behind right, soft ambient occlusion, no harsh shadows",
  "camera": { "lens": "85mm", "angle": "eye level", "framing": "centered, mascot fills 70% of frame, generous transparent padding" },
  "style": "premium 3D toy render, Pixar-meets-Apple product shot, clean, minimal, high detail, subsurface softness",
  "avoid": ["text", "logos", "mouth", "arms or legs", "busy background", "blue tones", "hard black shadows", "noise", "watermark"]
}
```

## 2. `mascot-poses.png` — 4-pose sheet (engine section, lifetime card, 404/empty states)

```json
{
  "task": "character pose sheet for a SaaS brand mascot",
  "output": { "filename": "mascot-poses.png", "size": "1536x1024", "background": "transparent", "format": "png" },
  "layout": "4 poses in a single row, evenly spaced, same scale, same lighting, no labels",
  "character": {
    "name": "Consentful cookie mascot",
    "shape": "soft irregular rounded blob, no limbs except where a pose specifies small stubby nubs",
    "skin": "pearlescent iridescent vinyl, gradient #f7cbe4 → #fbdcc4 → #fdf3cf → #c9edd6 → #d9d2f6",
    "outline": "thin deep indigo #2a0e6e rim",
    "eyes": "two tall rounded-rectangle deep indigo #2a0e6e eyes with a small white highlight; no mouth"
  },
  "poses": [
    { "id": "guard", "description": "holding a small rounded shield in indigo-violet #4b23d3 with a white check mark, standing firm, eyes determined" },
    { "id": "lock", "description": "hugging a chunky rounded padlock in indigo-violet #4b23d3, the padlock is closed, eyes content" },
    { "id": "wave", "description": "one small stubby nub raised in a friendly wave, body leaning slightly, eyes happy (slightly squinted)" },
    { "id": "peek", "description": "peeking up from the bottom edge of the frame, only the top half and eyes visible, curious" }
  ],
  "lighting": "soft studio key light upper-left, lavender rim light, soft contact shadow under each pose",
  "style": "premium 3D toy render, clean, minimal, consistent across all four poses",
  "avoid": ["text", "labels", "mouth", "background scenery", "blue tones", "harsh shadows", "watermark"]
}
```

## 3. `og-image.png` — social card (link previews, `og:image`)

```json
{
  "task": "social share card for a SaaS landing page",
  "output": { "filename": "og-image.png", "size": "1200x630", "format": "png" },
  "background": {
    "base": "very light warm white #faf9ff",
    "accent": "large soft iridescent glow blob in the right third, gradient #f7cbe4, #fbdcc4, #fdf3cf, #c9edd6, #d9d2f6, heavily blurred",
    "texture": "subtle dot grid in #e2e4ec, fading out toward the edges"
  },
  "composition": {
    "left_60_percent": {
      "wordmark": "Consentful — bold geometric sans (Plus Jakarta Sans ExtraBold style), color #4b23d3",
      "headline": "Real cookie consent for every website.",
      "headline_style": "extra-bold, tight letter spacing, near-black #17191e, two lines",
      "subline": "Blocks trackers until consent · Google Consent Mode v2 · Framer, Webflow, WordPress, Shopify, Wix",
      "subline_style": "medium weight, #545b67, one or two lines"
    },
    "right_40_percent": {
      "mascot": "the Consentful cookie mascot (iridescent pastel blob, deep indigo #2a0e6e outline, two tall indigo eyes with white highlights, no mouth) floating in 3D",
      "prop": "a small floating white cookie-consent card beside it with three pill buttons, the rightmost filled #4b23d3"
    }
  },
  "typography_rules": "render text exactly as written, crisp, correctly spelled, left-aligned, generous margins of 72px",
  "style": "clean premium SaaS brand art, lots of whitespace",
  "avoid": ["extra text", "misspellings", "blue", "stock photos", "people", "watermark"]
}
```

## 4. `iris-texture.png` — soft iridescent background (final CTA band, lifetime card)

```json
{
  "task": "abstract brand background texture",
  "output": { "filename": "iris-texture.png", "size": "2400x1000", "format": "png" },
  "content": "flowing, silky iridescent gradient like light on a pearl or soap film, soft folds and gentle ripples, no hard edges",
  "palette_hex": ["#f7cbe4", "#fbdcc4", "#fdf3cf", "#c9edd6", "#d9d2f6"],
  "accents": "very faint hints of indigo-violet #4b23d3 only in the deepest folds, under 5% of the image",
  "lighting": "diffuse, bright, high-key, low contrast so dark indigo text stays readable on top",
  "style": "minimal, premium, calm, photographic macro of holographic foil softened",
  "avoid": ["text", "objects", "people", "noise", "strong saturation", "blue", "watermark"]
}
```

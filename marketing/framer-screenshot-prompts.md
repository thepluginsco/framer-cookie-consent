# Consentful — Framer Marketplace screenshot prompts (1600×1200)

Five image prompts for the Framer listing only. Framer's Media step recommends **1600 × 1200 px
(4:3)**. The first image is also the thumbnail in the Marketplace grid.

## What live plugins do (studied 2026-10-02)

| Plugin | Link | Images | Size | Cover style |
|---|---|---|---|---|
| ShieldPage | https://www.framer.com/marketplace/plugins/shieldpage/ | 2 | 1000×750 | Plain grey canvas, plugin name + one line, two real plugin windows |
| Semflow | https://www.framer.com/marketplace/plugins/semflow/ | 4 | 1000×750 | Dark canvas, one headline, real plugin window below |
| SEO Toolkit | https://www.framer.com/marketplace/plugins/seo-toolkit/ | 4 | 1000×750 | Logo + three-line headline left, real plugin window right |
| Accessibility Checker | https://www.framer.com/marketplace/plugins/accessibility-checker/ | 4 | 1200×900 | Logo + name on top, real UI with a few callout chips |
| FramerForms | https://www.framer.com/marketplace/plugins/framerforms/ | 4 | 1000×750 | Solid brand colour, wordmark, one enlarged real UI panel |
| Password Protect | https://www.framer.com/marketplace/plugins/password-protect/ | 2 | 1000×750 | Brand gradient, one real plugin window, no headline |
| Framer Commerce | https://www.framer.com/marketplace/plugins/framer-commerce/ | — | — | Paid plugin billed off-platform; pricing explained in the description |
| Lantis | https://www.framer.com/marketplace/plugins/lantis-translate-your-site/ | video | — | Paid plugin billed off-platform; price in the first line |

Patterns worth copying:

1. **4:3, two to four images.** Nobody uses seven.
2. **The cover shows the real plugin window**, at a size where its text is readable in the grid.
3. **One short headline at most**, often just the plugin name. No paragraph copy, no feature lists.
4. **One flat or softly graded background.** No 3D blobs, no multiple overlapping glows.
5. **Short names**: "ShieldPage", "Semflow", "SEO Toolkit" — not "Name — Keyword & Keyword".

Where our first set differed: the UI was re-drawn by the image model instead of being the real
capture, each image carried a headline plus a sub-line plus a logo lock-up, and there were seven.

## Rules for every prompt

- Attach the named capture from `store-assets/ui/` and `logo.png`. The model must place the capture
  **unchanged**. If any pixel of UI text comes back altered, generate the canvas only (delete the UI
  from the prompt) and composite the real PNG on top — or ask Claude to composite it.
- Text on the canvas is limited to what the prompt lists. Nothing else.
- Claims must match `consentful-portal/packages/config/src/pricing.ts` and `marketing.ts`. The free
  plan is the **bottom-bar** banner; card and modal layouts, themes and the preference center are
  paid. Images 4 and 5 show paid features and carry a small "Paid plans" chip for that reason.
- No Framer, Google or Meta logos. Their names may appear as plain text only.

Design tokens: canvas `#F4F2FB`; indigo-violet `#4B23D3`; deep ink `#2A0E6E`; grey `#6B7280`;
Plus Jakarta Sans (ExtraBold 800 headlines, Medium 500 sub-lines); corners 20px; one shadow
`0 30px 60px rgba(75,35,211,0.18)`.

---

## 1/5 — Cover (grid thumbnail)

Input: `ui-05b-editor-theme-preview.png` (1640×1280), `logo.png`

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot": "ui-05b-editor-theme-preview.png — the real Consentful plugin window with its live banner preview open",
      "logo": "logo.png — the Consentful logo",
      "usage_rule": "Place the supplied plugin screenshot EXACTLY as provided: identical pixels, text, colours and proportions. Do not redraw, re-typeset, restyle, crop inside it or add anything to it. Only scale it uniformly, round its outer corners to 20px and add the one shadow described."
    },
    "scene": {
      "description": "A 4:3 Framer Marketplace cover image. One flat, very light lavender canvas (#F4F2FB) with no shapes, blobs, glows or gradients. Top-centre: the supplied Consentful logo, 56px tall. Directly under it, one centred headline in deep indigo (#2A0E6E). Below the headline, centred, the supplied plugin window at about 1180px wide, its lower 12% running off the bottom edge of the canvas. Nothing else.",
      "subject": "The real Consentful plugin window",
      "setting": "Flat single-colour marketing canvas",
      "action": "static"
    },
    "style": {
      "primary": "minimal product cover, flat canvas composited with a real screenshot",
      "rendering_quality": "pixel-crisp UI at native sharpness",
      "surface_textures": "perfectly flat, no noise or grain",
      "lighting": "none; depth only from one soft violet-tinted shadow (0 30px 60px rgba(75,35,211,0.18)) under the plugin window"
    },
    "technical": {
      "camera": { "focal_length": "orthographic", "aperture": "n/a", "depth_of_field": "everything sharp", "angle": "straight-on, no tilt, no 3D rotation" },
      "resolution": "exactly 4:3, composed for 1600x1200 with an 80px safe margin left, right and top",
      "rendering": "sRGB, clean anti-aliasing"
    },
    "composition": {
      "perspective": "flat 2D: canvas > shadow > plugin window",
      "framing": "vertical stack, everything centred on the vertical axis",
      "subject_placement": "logo top at y=80; headline baseline around y=250; plugin window top edge at y=330",
      "ui_elements": "1) Logo, centred, 56px tall, unaltered. 2) Headline, centred, one line: 'Cookie consent for Framer' — Plus Jakarta Sans ExtraBold 64px, #2A0E6E, with the word 'Framer' in #4B23D3. No sub-line. No other text anywhere on the canvas."
    },
    "quality": {
      "include": ["pixel-exact real screenshot", "readable plugin text at thumbnail size", "generous empty space", "single flat background", "precise centring"],
      "avoid": ["redrawn or altered UI", "garbled or invented text", "extra headlines, sub-lines or bullets", "blobs, orbs, waves or multiple glows", "3D tilt or device mockups", "any third-party logos", "blue brand colour", "stickers, arrows or emoji"]
    },
    "reference_standard": "The ShieldPage and Semflow covers on the Framer Marketplace"
  }
}
```

## 2/5 — The banner on a site (free bottom-bar design)

Input: `ui-01c-banner-bar.png` (2880×1800)

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot": "ui-01c-banner-bar.png — a real web page with the real Consentful bottom-bar banner",
      "usage_rule": "Place the supplied page screenshot EXACTLY as provided. Do not redraw or edit anything inside it. Only scale uniformly, mask into the browser frame and add the shadow."
    },
    "scene": {
      "description": "A 4:3 Marketplace image. Flat light lavender canvas (#F4F2FB), no decoration. A minimal light browser window (three small neutral-grey dots, 1px #E3DFF2 border, 20px corners) fills the lower 72% of the canvas, 1440px wide and centred, showing the supplied page screenshot unaltered with the cookie banner bar across its bottom. Above the window, one left-aligned headline.",
      "subject": "The real banner bar on a real page",
      "setting": "Flat canvas with an abstracted browser window",
      "action": "static — first visit"
    },
    "style": {
      "primary": "minimal product screenshot on a flat canvas",
      "rendering_quality": "pixel-crisp",
      "surface_textures": "flat",
      "lighting": "one soft violet-tinted shadow under the browser window"
    },
    "technical": {
      "camera": { "focal_length": "orthographic", "aperture": "n/a", "depth_of_field": "everything sharp", "angle": "straight-on" },
      "resolution": "exactly 4:3, composed for 1600x1200 with an 80px safe margin",
      "rendering": "sRGB"
    },
    "composition": {
      "perspective": "flat 2D",
      "framing": "headline band on top (about 22% of height), browser window below",
      "subject_placement": "browser window horizontally centred, bottom edge 80px above the canvas edge",
      "ui_elements": "Headline, left-aligned at x=80, one line: 'Trackers stay off until visitors agree.' — Plus Jakarta Sans ExtraBold 56px, #2A0E6E. No sub-line, no logo, no other text."
    },
    "quality": {
      "include": ["pixel-exact real screenshot", "legible banner text", "calm empty space"],
      "avoid": ["redrawn banner", "invented buttons", "outline rings or arrows", "blobs or glows", "third-party logos", "extra text"]
    },
    "reference_standard": "Linear and Stripe product screenshots"
  }
}
```

## 3/5 — Script blocking

Input: `ui-04-editor-scripts.png` (1640×1280)

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot": "ui-04-editor-scripts.png — the real Scripts tab listing trackers and the consent category each one waits for",
      "usage_rule": "Place the supplied screenshot EXACTLY as provided. Only scale uniformly, round the outer corners to 20px and add the shadow."
    },
    "scene": {
      "description": "A 4:3 Marketplace image. Flat light lavender canvas (#F4F2FB). One left-aligned headline at the top. Below it, the supplied plugin window, 1240px wide, centred, its bottom edge running 60px off the canvas.",
      "subject": "The real Scripts tab",
      "setting": "Flat canvas",
      "action": "static"
    },
    "style": { "primary": "minimal product screenshot on a flat canvas", "rendering_quality": "pixel-crisp", "surface_textures": "flat", "lighting": "one soft violet-tinted shadow under the window" },
    "technical": {
      "camera": { "focal_length": "orthographic", "aperture": "n/a", "depth_of_field": "everything sharp", "angle": "straight-on" },
      "resolution": "exactly 4:3, composed for 1600x1200 with an 80px safe margin",
      "rendering": "sRGB"
    },
    "composition": {
      "perspective": "flat 2D",
      "framing": "headline band on top, plugin window below",
      "subject_placement": "window top edge at y=250",
      "ui_elements": "Headline, left-aligned at x=80, one line: 'Choose which scripts wait for consent.' — Plus Jakarta Sans ExtraBold 56px, #2A0E6E. No other text."
    },
    "quality": {
      "include": ["pixel-exact real screenshot", "readable script names", "empty space"],
      "avoid": ["redrawn UI", "tracker logos", "extra text", "decoration of any kind"]
    },
    "reference_standard": "The SEO Toolkit listing images on the Framer Marketplace"
  }
}
```

## 4/5 — Google Consent Mode v2

Input: `ui-07-editor-consent-mode.png` (1640×1280)

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot": "ui-07-editor-consent-mode.png — the real Consent Mode tab showing each Google signal and its default state",
      "usage_rule": "Place the supplied screenshot EXACTLY as provided. Only scale uniformly, round the outer corners to 20px and add the shadow."
    },
    "scene": {
      "description": "A 4:3 Marketplace image, same layout as image 3: flat light lavender canvas (#F4F2FB), one left-aligned headline on top, the supplied plugin window 1240px wide below it, bottom edge 60px off the canvas.",
      "subject": "The real Consent Mode tab",
      "setting": "Flat canvas",
      "action": "static"
    },
    "style": { "primary": "minimal product screenshot on a flat canvas", "rendering_quality": "pixel-crisp", "surface_textures": "flat", "lighting": "one soft violet-tinted shadow under the window" },
    "technical": {
      "camera": { "focal_length": "orthographic", "aperture": "n/a", "depth_of_field": "everything sharp", "angle": "straight-on" },
      "resolution": "exactly 4:3, composed for 1600x1200 with an 80px safe margin",
      "rendering": "sRGB"
    },
    "composition": {
      "perspective": "flat 2D",
      "framing": "headline band on top, plugin window below",
      "subject_placement": "window top edge at y=250",
      "ui_elements": "Headline, left-aligned at x=80, one line: 'Google Consent Mode v2, built in.' — Plus Jakarta Sans ExtraBold 56px, #2A0E6E, with 'Consent Mode v2' in #4B23D3. Text only — no Google logo. No other text."
    },
    "quality": {
      "include": ["pixel-exact real screenshot", "readable signal names", "empty space"],
      "avoid": ["redrawn UI", "Google logo or colours", "extra text", "decoration"]
    },
    "reference_standard": "The Semflow listing images on the Framer Marketplace"
  }
}
```

## 5/5 — Design and preference center (paid plans)

Inputs: `ui-01b-banner-card.png` (transparent, 1336×620), `ui-02b-preference-center-card.png`
(transparent, 1272×1800)

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot_primary": "ui-02b-preference-center-card.png — the real preference center dialog (transparent background)",
      "ui_screenshot_secondary": "ui-01b-banner-card.png — the real floating banner card (transparent background)",
      "usage_rule": "Place BOTH supplied cards EXACTLY as provided. Never redraw or edit them. Only scale uniformly, layer them and add shadows."
    },
    "scene": {
      "description": "A 4:3 Marketplace image. Flat light lavender canvas (#F4F2FB). On the right, the preference center dialog, about 560px wide, vertically centred. To its left and slightly lower, the banner card, about 620px wide, overlapping the dialog's left edge by 60px and sitting behind it. Top-left: one two-line headline and, under it, one small chip.",
      "subject": "The real preference center and the real banner card",
      "setting": "Flat canvas, two floating UI cards",
      "action": "static"
    },
    "style": { "primary": "minimal product screenshot on a flat canvas", "rendering_quality": "pixel-crisp", "surface_textures": "flat", "lighting": "two soft violet-tinted shadows, the front card's slightly stronger" },
    "technical": {
      "camera": { "focal_length": "orthographic", "aperture": "n/a", "depth_of_field": "both cards fully sharp", "angle": "straight-on, no rotation" },
      "resolution": "exactly 4:3, composed for 1600x1200 with an 80px safe margin",
      "rendering": "sRGB"
    },
    "composition": {
      "perspective": "flat 2D: canvas > banner card > preference center",
      "framing": "text top-left, cards occupying the right two-thirds",
      "subject_placement": "preference center right edge 80px from the canvas edge",
      "ui_elements": "1) Headline, left-aligned at x=80, y=110, two lines: 'Your design.' / 'Their choice, service by service.' — Plus Jakarta Sans ExtraBold 52px, #2A0E6E. 2) Chip under the headline: text 'Paid plans', Plus Jakarta Sans SemiBold 18px, #4B23D3 on #EFEAFE, 1px #DCD1FB border, fully rounded. No other text."
    },
    "quality": {
      "include": ["pixel-exact real UI cards", "readable toggles and labels", "clear front/back layering", "empty space"],
      "avoid": ["redrawn UI", "invented toggles", "blurred back card", "tracker or platform logos", "extra text", "decoration"]
    },
    "reference_standard": "The Accessibility Checker listing images on the Framer Marketplace"
  }
}
```

# Consentful v0.1.22 — store graphics prompts (Framer, Webflow, WordPress.org)

New listing images for the v0.1.22 release. They add the features that shipped since the last
set (October 1): **embed blocking** and **29 built-in languages**. The core images are refreshed
on the current UI.

Every prompt follows the same method as `framer-screenshot-prompts.md`. Attach the named **real
capture** and `logo.png` (repo root), then paste the JSON. The image model may only build the
canvas around the capture. It must never redraw the UI. If any UI text comes back changed,
generate the canvas only (delete the UI from the prompt) and lay the real PNG on top in
Figma/Canva.

## Captures (all real, taken 2026-10-23 on runtime v0.1.22)

Re-run with `marketing/store-assets/capture.mjs` (instructions in its header).

| Folder | What | Used by |
|---|---|---|
| `store-assets/ui/` | Banner on the Fernway demo site (2880×1800) + the **Framer** editor (1640×1280) | Framer; banner shots shared by all |
| `store-assets/ui-webflow/` | The **Webflow** editor: Webflow wording, no Framer copy | Webflow |
| `store-assets/ui-wordpress/` | The **WordPress** editor (dev harness; footer reads "Preview only") | WordPress.org |

New captures in this round:

- `ui/ui-13-embed-blocked-on-site.png`: a YouTube film on the demo site held behind "Load content"
- `ui/ui-13b-embed-placeholder.png`: the placeholder alone
- `ui/ui-14-banner-french.png`: the same banner shown to a French visitor ("Tout accepter")
- `ui*/ui-15-editor-embeds.png`: Scripts tab, "Block embeds until consent" on, "Unblocked by: Marketing"
- `ui*/ui-16-editor-languages.png`: Theme tab, Languages: Default · French · German · Spanish

## Rules for every image

- **Claims must match the plans.** Embed blocking, script blocking and Consent Mode are on
  **every plan**. Languages, card/modal layouts, themes and the preference center are **paid**:
  those images carry a small "Paid plans" chip.
- **Logos:** no Framer, Webflow, WordPress, Google, Meta or YouTube logos anywhere. Names may
  appear only as plain text, and only where the prompt lists them.
- **Webflow:** use only `ui-webflow/` editor captures. Webflow's reviewers flagged Framer copy, so
  no Framer wording may appear in a Webflow image. The form's copy checker also rejects the word
  "staging" and asks for a non-affiliation line when Google/Meta are named in the listing text.
- **Design tokens:** canvas `#F4F2FB`; indigo-violet `#4B23D3`; deep ink `#2A0E6E`; grey
  `#6B7280`; chip `#EFEAFE` with a `#DCD1FB` border; Plus Jakarta Sans (ExtraBold 800 headlines,
  Medium 500 sub-lines); 20px corners; one shadow `0 30px 60px rgba(75,35,211,0.18)`. No blue, no
  blobs, at most one headline and one sub-line per image.

## Sizes

| Store | Size | Count |
|---|---|---|
| Framer Marketplace | 1600×1200 (4:3), first image = grid thumbnail | 5 |
| Webflow Apps | 1280×846 (the size used in the October submission; confirm on the form). Total attachments under 4 MB | 5 |
| WordPress.org | Screenshots: the raw captures, no canvas (section C). Banner 1544×500 + 772×250 | 5 + banner |

---

# A. Framer (1600×1200)

## A1/5: Cover

Input: `ui/ui-05b-editor-theme-preview.png`, `logo.png`

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot": "ui-05b-editor-theme-preview.png — the real Consentful plugin window with its live banner preview open",
      "logo": "logo.png — the Consentful logo",
      "usage_rule": "Place the supplied plugin screenshot EXACTLY as provided: identical pixels, text, colours and proportions. Do not redraw, re-typeset, restyle or add anything to it. Only scale it uniformly, round its outer corners to 20px and add the one shadow described."
    },
    "scene": {
      "description": "A 4:3 Framer Marketplace cover. One flat, very light lavender canvas (#F4F2FB), no shapes, glows or gradients. Top-centre: the Consentful logo, 56px tall. Under it, one centred headline in deep indigo (#2A0E6E). Below, centred, the supplied plugin window about 1180px wide, its lower 12% running off the bottom edge.",
      "subject": "The real Consentful plugin window",
      "setting": "Flat branded canvas",
      "action": "static"
    },
    "style": { "primary": "minimal product screenshot on a flat canvas", "rendering_quality": "pixel-crisp, UI text legible at grid-thumbnail size", "surface_textures": "flat", "lighting": "one soft violet-tinted shadow under the window" },
    "technical": {
      "camera": { "focal_length": "orthographic", "aperture": "n/a", "depth_of_field": "everything sharp", "angle": "straight-on, no tilt" },
      "resolution": "exactly 4:3, composed for 1600x1200 with an 80px safe margin",
      "rendering": "sRGB"
    },
    "composition": {
      "perspective": "flat 2D: canvas > window",
      "framing": "logo and headline in the top 26%, window below",
      "subject_placement": "window horizontally centred",
      "ui_elements": "1) Logo, top-centre, 56px tall, unaltered. 2) Headline, centred, one line: 'Cookie consent that blocks trackers.' Plus Jakarta Sans ExtraBold 58px, #2A0E6E. No other text."
    },
    "quality": {
      "include": ["pixel-exact real UI", "legible UI text", "calm whitespace", "brand-accurate #4B23D3"],
      "avoid": ["redrawn UI", "garbled text", "3D device mockups", "blobs or glows", "platform or tracker logos", "extra text"]
    },
    "reference_standard": "SEO Toolkit and Semflow covers on the Framer Marketplace"
  }
}
```

## A2/5: NEW — Embed blocking

Input: `ui/ui-13-embed-blocked-on-site.png`

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot": "ui-13-embed-blocked-on-site.png — a real shop page where an embedded YouTube film is held behind a 'Load content' placeholder, with the real cookie banner bottom-right",
      "usage_rule": "Place the supplied page screenshot EXACTLY as provided. Do not redraw or edit anything inside it — not the placeholder text, not the banner. Only scale uniformly, mask into the browser frame and add the shadow."
    },
    "scene": {
      "description": "A 4:3 Marketplace image. Flat light lavender canvas (#F4F2FB). A minimal light browser window (three small neutral-grey dots, 1px #E3DFF2 border, 20px corners), 1440px wide and centred, fills the lower 72% and shows the supplied page unaltered. One thin indigo-violet (#4B23D3) 2px rounded outline ring sits just outside the grey 'Load content' video placeholder on the left of the page, with no arrow or label. Above the window, a headline and a sub-line, left-aligned.",
      "subject": "A blocked YouTube embed and the cookie banner on a real page",
      "setting": "Flat canvas with an abstracted browser window",
      "action": "static — first visit, the video waits for consent"
    },
    "style": { "primary": "minimal product screenshot on a flat canvas", "rendering_quality": "pixel-crisp", "surface_textures": "flat", "lighting": "one soft violet-tinted shadow under the browser window" },
    "technical": {
      "camera": { "focal_length": "orthographic", "aperture": "n/a", "depth_of_field": "everything sharp", "angle": "straight-on" },
      "resolution": "exactly 4:3, composed for 1600x1200 with an 80px safe margin",
      "rendering": "sRGB"
    },
    "composition": {
      "perspective": "flat 2D: canvas > window > outline ring",
      "framing": "text band on top (about 24% of height), browser window below",
      "subject_placement": "window horizontally centred, bottom edge 80px above the canvas edge; eye path headline → ring → placeholder",
      "ui_elements": "1) Headline, left-aligned at x=80, one line: 'Videos and maps wait for consent.' Plus Jakarta Sans ExtraBold 54px, #2A0E6E. 2) Sub-line under it, one line: 'YouTube, Vimeo, Google Maps and more stay blocked until visitors agree.' Plus Jakarta Sans Medium 22px, #6B7280. No other text."
    },
    "quality": {
      "include": ["pixel-exact real screenshot", "legible 'Load content' button", "legible banner text", "calm empty space"],
      "avoid": ["a YouTube logo or play button drawn on the placeholder", "redrawn banner", "invented buttons", "arrows", "blobs or glows", "extra text"]
    },
    "reference_standard": "Linear and Stripe product screenshots"
  }
}
```

## A3/5: NEW — 29 languages (paid)

Inputs: `ui/ui-14-banner-french.png` (primary), `ui/ui-16-editor-languages.png` (secondary)

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot_primary": "ui-14-banner-french.png — a real page with the real cookie banner shown in French ('Tout refuser', 'Tout accepter')",
      "ui_screenshot_secondary": "ui-16-editor-languages.png — the real plugin window, Theme tab, with the Languages row: Default, French, German, Spanish, + Add language",
      "usage_rule": "Place BOTH supplied screenshots EXACTLY as provided. Never redraw, translate or edit them. Only scale uniformly, crop the secondary as described, layer them and add shadows."
    },
    "scene": {
      "description": "A 4:3 Marketplace image. Flat light lavender canvas (#F4F2FB). Right two-thirds: a minimal light browser window (three grey dots, 1px #E3DFF2 border, 20px corners) about 1060px wide showing the French banner page unaltered. Overlapping its lower-left corner and in front: a rounded 20px card cropped from the secondary screenshot showing ONLY its 'Languages' row of chips (Default, French, German, Spanish, Add language), about 640px wide, with a white background and a soft shadow. Top-left: headline, sub-line and a 'Paid plans' chip.",
      "subject": "The banner in the visitor's language, and the language chips that set it up",
      "setting": "Flat canvas, browser window plus one floating crop",
      "action": "static"
    },
    "style": { "primary": "minimal product screenshot on a flat canvas", "rendering_quality": "pixel-crisp", "surface_textures": "flat", "lighting": "two soft violet-tinted shadows, the front card's slightly stronger" },
    "technical": {
      "camera": { "focal_length": "orthographic", "aperture": "n/a", "depth_of_field": "everything sharp", "angle": "straight-on, no rotation" },
      "resolution": "exactly 4:3, composed for 1600x1200 with an 80px safe margin",
      "rendering": "sRGB"
    },
    "composition": {
      "perspective": "flat 2D: canvas > browser window > languages card",
      "framing": "text top-left, visuals on the right and bottom",
      "subject_placement": "browser window right edge 80px from the canvas edge; languages card bottom edge 80px above the canvas edge",
      "ui_elements": "1) Headline, left-aligned at x=80, two lines: 'Speaks your' / 'visitor's language.' Plus Jakarta Sans ExtraBold 54px, #2A0E6E. 2) Sub-line: '29 languages built in, picked automatically.' Medium 22px, #6B7280. 3) Chip: 'Paid plans', SemiBold 18px, #4B23D3 on #EFEAFE, 1px #DCD1FB border, fully rounded. No other text, no flags."
    },
    "quality": {
      "include": ["pixel-exact real UI", "legible French banner text", "legible chips", "clear layering"],
      "avoid": ["country flags", "translated or re-typed UI", "redrawn chips", "speech bubbles", "globe icons", "extra text"]
    },
    "reference_standard": "Accessibility Checker listing images on the Framer Marketplace"
  }
}
```

## A4/5: Script blocking + Consent Mode

Input: `ui/ui-04-editor-scripts.png`

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot": "ui-04-editor-scripts.png — the real plugin window, Scripts tab: embed blocking on, Google Analytics 4 (Analytics) and Meta Pixel (Marketing) listed as managed scripts",
      "usage_rule": "Place the supplied plugin screenshot EXACTLY as provided. Do not redraw or edit anything in it. Only scale uniformly, round its corners to 20px and add the shadow."
    },
    "scene": {
      "description": "A 4:3 Marketplace image. Flat light lavender canvas (#F4F2FB). The supplied plugin window, about 1180px wide, sits on the right and bleeds 60px off the right edge, vertically centred. Left column: headline and sub-line.",
      "subject": "The real Scripts tab",
      "setting": "Flat canvas",
      "action": "static"
    },
    "style": { "primary": "minimal product screenshot on a flat canvas", "rendering_quality": "pixel-crisp", "surface_textures": "flat", "lighting": "one soft violet-tinted shadow" },
    "technical": {
      "camera": { "focal_length": "orthographic", "aperture": "n/a", "depth_of_field": "everything sharp", "angle": "straight-on" },
      "resolution": "exactly 4:3, composed for 1600x1200 with an 80px safe margin",
      "rendering": "sRGB"
    },
    "composition": {
      "perspective": "flat 2D",
      "framing": "left text column about 30%, window about 70%",
      "subject_placement": "window vertically centred",
      "ui_elements": "1) Headline, left-aligned at x=80, three lines: 'Trackers' / 'stay off until' / 'visitors agree.' Plus Jakarta Sans ExtraBold 52px, #2A0E6E. 2) Sub-line, max three lines: 'Script blocking and Google Consent Mode v2 on every plan.' Medium 21px, #6B7280. No other text."
    },
    "quality": {
      "include": ["pixel-exact real UI", "legible script names and categories", "whitespace"],
      "avoid": ["Google or Meta logos", "redrawn UI", "extra text", "decoration"]
    },
    "reference_standard": "SEO Toolkit listing on the Framer Marketplace"
  }
}
```

## A5/5: Design and preference center (paid)

Inputs: `ui/ui-02b-preference-center-card.png`, `ui/ui-01b-banner-card.png` (both transparent)

Use **prompt 5/5 in `framer-screenshot-prompts.md`** unchanged. It still matches the product,
and both cards were re-captured today.

---

# B. Webflow (1280×846)

Same canvas, tokens and rules as Framer, recomposed for the wider 1280×846 frame. Only
`ui-webflow/` editor captures may be used.

## B1/5: Cover

Input: `ui-webflow/ui-05b-editor-theme-preview.png`, `logo.png`

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot": "ui-webflow/ui-05b-editor-theme-preview.png — the real Consentful app panel with its live banner preview open",
      "logo": "logo.png — the Consentful logo",
      "usage_rule": "Place the supplied app screenshot EXACTLY as provided: identical pixels, text, colours and proportions. Do not redraw or add anything. Only scale uniformly, round its outer corners to 18px and add the shadow."
    },
    "scene": {
      "description": "A wide app-store cover. Flat very light lavender canvas (#F4F2FB), no decoration. Left column: logo, headline, sub-line. Right: the supplied app panel about 760px wide, vertically centred, bleeding 40px off the right edge.",
      "subject": "The real Consentful app panel",
      "setting": "Flat branded canvas",
      "action": "static"
    },
    "style": { "primary": "minimal product screenshot on a flat canvas", "rendering_quality": "pixel-crisp", "surface_textures": "flat", "lighting": "one soft violet-tinted shadow" },
    "technical": {
      "camera": { "focal_length": "orthographic", "aperture": "n/a", "depth_of_field": "everything sharp", "angle": "straight-on" },
      "resolution": "landscape, composed for 1280x846 with a 64px safe margin",
      "rendering": "sRGB"
    },
    "composition": {
      "perspective": "flat 2D",
      "framing": "left text column about 38%, panel about 62%",
      "subject_placement": "panel vertically centred",
      "ui_elements": "1) Logo top-left at x=64, y=64, 40px tall, unaltered. 2) Headline, left-aligned, three lines: 'Cookie consent' / 'that actually' / 'blocks trackers.' Plus Jakarta Sans ExtraBold 46px, #2A0E6E. 3) Sub-line: 'Design it in the Designer, publish in one click.' Medium 19px, #6B7280. No other text."
    },
    "quality": {
      "include": ["pixel-exact real UI", "legible UI text", "whitespace"],
      "avoid": ["any platform logo", "redrawn UI", "3D mockups", "blobs or glows", "extra text"]
    },
    "reference_standard": "Featured apps on the Webflow Apps marketplace"
  }
}
```

## B2/5: NEW — Embed blocking

Input: `ui/ui-13-embed-blocked-on-site.png`

Use **A2** with these changes: `"resolution": "landscape, composed for 1280x846 with a 64px safe
margin"`; browser window 1150px wide filling the lower 70%; headline 44px at x=64; sub-line 19px.
Text stays the same.

## B3/5: NEW — 29 languages (paid)

Inputs: `ui/ui-14-banner-french.png`, `ui-webflow/ui-16-editor-languages.png`

Use **A3** with the secondary input swapped to `ui-webflow/ui-16-editor-languages.png` and:
`"resolution": "landscape, composed for 1280x846 with a 64px safe margin"`; browser window 820px
wide; languages card 520px wide; headline 44px at x=64; sub-line 19px; chip 16px.

## B4/5: Script blocking

Input: `ui-webflow/ui-04-editor-scripts.png`

Use **A4** with the input swapped to `ui-webflow/ui-04-editor-scripts.png` and:
`"resolution": "landscape, composed for 1280x846 with a 64px safe margin"`; panel 800px wide;
headline 44px; sub-line 19px.

## B5/5: Google Consent Mode v2

Input: `ui-webflow/ui-07-editor-consent-mode.png`

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot": "ui-webflow/ui-07-editor-consent-mode.png — the real app panel, Consent Mode tab, with the Google Consent Mode v2 signals denied by default",
      "usage_rule": "Place the supplied screenshot EXACTLY as provided. Do not redraw or edit it. Only scale uniformly, round corners to 18px and add the shadow."
    },
    "scene": {
      "description": "Flat light lavender canvas (#F4F2FB). The supplied panel on the right, about 800px wide, vertically centred, bleeding 40px off the right edge. Left column: headline and sub-line.",
      "subject": "The real Consent Mode tab",
      "setting": "Flat canvas",
      "action": "static"
    },
    "style": { "primary": "minimal product screenshot on a flat canvas", "rendering_quality": "pixel-crisp", "surface_textures": "flat", "lighting": "one soft violet-tinted shadow" },
    "technical": {
      "camera": { "focal_length": "orthographic", "aperture": "n/a", "depth_of_field": "everything sharp", "angle": "straight-on" },
      "resolution": "landscape, composed for 1280x846 with a 64px safe margin",
      "rendering": "sRGB"
    },
    "composition": {
      "perspective": "flat 2D",
      "framing": "left text column about 34%, panel about 66%",
      "subject_placement": "panel vertically centred",
      "ui_elements": "1) Headline, left-aligned at x=64, three lines: 'Consent Mode v2,' / 'denied until' / 'they choose.' Plus Jakarta Sans ExtraBold 44px, #2A0E6E. 2) Sub-line: 'Ad and analytics signals update the moment a visitor decides.' Medium 19px, #6B7280. No other text."
    },
    "quality": {
      "include": ["pixel-exact real UI", "legible signal names", "whitespace"],
      "avoid": ["Google logo", "redrawn toggles", "extra text", "decoration"]
    },
    "reference_standard": "Featured apps on the Webflow Apps marketplace"
  }
}
```

---

# C. WordPress.org

WordPress.org shows screenshots at any size, with a caption under each. Two options:

- **Designed images** (like the current set): generate A1–A4 above at 1600×1200, swapping in
  `ui-wordpress/` editor captures wherever an editor capture is used.
- **Plain product screenshots:** upload the raw captures below. No canvas, no headline.

Either way, save them as `screenshot-1.png` … `screenshot-5.png` in `../consentful-svn/assets/`,
replacing the current four, and set the readme's `== Screenshots ==` captions to match the
order. The current readme still has the four old captions; tell me when the images are ready and
I'll update both readmes. Suggested order and captions:

1. `ui/ui-01-banner-on-site.png` — The banner on a live site. Trackers stay off until the visitor chooses.
2. `ui/ui-13-embed-blocked-on-site.png` — Embed blocking: a YouTube video waits behind "Load content" until the visitor allows it.
3. `ui/ui-14-banner-french.png` — The banner in the visitor's language (29 languages built in, paid plans).
4. `ui-wordpress/ui-04-editor-scripts.png` — Scripts tab: embed blocking and the trackers that wait for consent.
5. `ui-wordpress/ui-07-editor-consent-mode.png` — Consent Mode tab: Google Consent Mode v2 signals, denied by default.

## C1: Plugin banner (1544×500, export 772×250 too)

Input: `ui/ui-01b-banner-card.png` (transparent), `logo.png`

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot": "ui-01b-banner-card.png — the real Consentful cookie banner card on a transparent background",
      "logo": "logo.png — the Consentful logo",
      "usage_rule": "Place the supplied banner card EXACTLY as provided. Do not redraw or edit it. Only scale uniformly and add the shadow."
    },
    "scene": {
      "description": "A very wide plugin-directory header banner. Flat very light lavender canvas (#F4F2FB) with one soft iris gradient band (118°, #F7CBE4 → #FBDCC4 → #FDF3CF → #C9EDD6 → #D9D2F6) behind the right third only. Left: logo and one headline. Right: the supplied banner card about 640px wide, vertically centred, slightly overlapping the gradient band.",
      "subject": "The real Consentful banner card",
      "setting": "Flat branded header",
      "action": "static"
    },
    "style": { "primary": "minimal brand header", "rendering_quality": "pixel-crisp", "surface_textures": "flat", "lighting": "one soft violet-tinted shadow under the card" },
    "technical": {
      "camera": { "focal_length": "orthographic", "aperture": "n/a", "depth_of_field": "everything sharp", "angle": "straight-on" },
      "resolution": "exactly 1544x500, everything important inside a centred 1400x420 safe area (it is also shown at 772x250)",
      "rendering": "sRGB"
    },
    "composition": {
      "perspective": "flat 2D: canvas > gradient band > card",
      "framing": "text left half, card right half",
      "subject_placement": "card vertically centred, right edge 80px from the canvas edge",
      "ui_elements": "1) Logo at x=80, y=96, 52px tall, unaltered. 2) Headline under it, two lines: 'Cookie consent that' / 'actually blocks trackers.' Plus Jakarta Sans ExtraBold 52px, #2A0E6E. No other text."
    },
    "quality": {
      "include": ["pixel-exact real banner card", "legible at 772x250", "brand-accurate colours"],
      "avoid": ["WordPress logo", "redrawn banner", "small text", "extra text", "busy background"]
    },
    "reference_standard": "Calm, flat SaaS brand headers in the style of Linear and Stripe"
  }
}
```

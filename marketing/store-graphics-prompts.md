# Consentful — Store Graphics JSON Prompts

> Companion to `LAUNCH.md` ("Screenshots to capture"). Seven image-generation prompts covering the
> six store screenshots plus one cover tile, for the Framer Marketplace, Webflow Apps, Shopify App
> Store and Wix App Market. Same method as MediaGrabber Pro: every prompt takes a **real UI
> capture** as an input image and tells the model to place it unchanged. The AI generates only the
> marketing canvas around it (background, frame, shadow, headline). It must **never** redraw,
> invent or "improve" the UI.

## 0. How to use

**Step 1: the real UI is already captured** in `store-assets/ui/` (2× PNGs, section 1 lists them).
To re-capture after a UI change, run `store-assets/capture.mjs` (instructions in its header).

**Step 2: generate.** In ChatGPT, attach the input screenshot(s) and the logo named in the prompt,
then paste the JSON. ChatGPT returns a fixed landscape ratio (3:2), not an exact pixel size, so
every prompt keeps a 72px safe margin: generate landscape, then crop/export to the store's size.

**Step 3: check the result against the real capture.** Image models often alter small UI text. If
*anything* inside the UI changed, use the **safe fallback**: delete the UI from the prompt, keep
the empty frame, generate the canvas only, and drop the real PNG on top in Figma/Canva. Set the
headline there too, in Plus Jakarta Sans. Store reviewers reject screenshots that misrepresent
the product.

**Compliance (all shots):** the demo site is the fictional "Fernway" page in
`store-assets/demo-site/` (CSS-only, no photos). Show no Framer, Webflow, Shopify, Wix, Google or
Meta logos anywhere on the canvas. Platform and tracker names may appear only as plain text.

**Sizes.** Master canvas is **1600×900 (16:9)**, which is Shopify's stated screenshot size
(`LAUNCH.md` §9; app icon 1200×1200). Confirm the exact sizes for Framer, Webflow and Wix on each
submission form before exporting; the layouts crop cleanly to 4:3 and 16:10 because the text
column and the UI both sit inside the safe margin.

## Locked design system (same across every graphic)

| Token | Value |
|---|---|
| Primary indigo-violet | `#4B23D3` · hover `#3F1CB8` · tint `#EFEAFE` · tint border `#DCD1FB` |
| Deep ink (headlines) | `#2A0E6E` on light · body `#17191E` · secondary `#6B7280` |
| Light canvas | `#F4F5F8` with a soft `#EFEAFE` radial glow |
| Iris gradient (signature, use sparingly) | 118° `#F7CBE4` → `#FBDCC4` → `#FDF3CF` → `#C9EDD6` → `#D9D2F6` |
| Dark canvas (cover tile) | `#2B1178` |
| Brand green (credits only) | `#0FAE66` |
| Type | Plus Jakarta Sans. Headline ExtraBold 800, subline Medium 500 |
| Radius / shadow | 14–20px corners, soft violet-tinted shadow `0 30px 60px rgba(75,35,211,0.18)` |
| Layout | left text column (~38%), right real UI (~62%), 72px outer margins |
| Brand lock-up | top-left: `logo.png` (repo root), the full Consentful logo, 40px tall, unaltered |

Never use blue as a brand colour. The iris gradient appears at most once per graphic.

## 1. Asset map

| # | Graphic | Input capture(s) in `store-assets/ui/` |
|---|---|---|
| 1 | Hero: the banner on a site | `ui-01-banner-on-site.png` (2880×1800) |
| 2 | Preference center | `ui-02b-preference-center-card.png` (transparent, 1272×1800) + `ui-01b-banner-card.png` (transparent, 1336×620) |
| 3 | Google Consent Mode v2 | `ui-07-editor-consent-mode.png` + `ui-03-editor-categories.png` |
| 4 | Script blocking | `ui-04-editor-scripts.png` |
| 5 | Design it your way | `ui-05b-editor-theme-preview.png` + `ui-01c-banner-bar.png` |
| 6 | Publish | `ui-06-editor-publish.png` |
| 7 | Cover / promo tile | `ui-01b-banner-card.png` |

All editor captures are 1640×1280 (the real 820×640 editor window at 2×). Spare captures for
alternates: `ui-02-preference-center.png` (on the site), `ui-05-editor-theme.png`,
`ui-05c-editor-preview-preferences.png`, `ui-08-editor-behavior.png`, `ui-09-editor-insights.png`
(empty state), `ui-10-activation-gate.png`, `ui-11-onboarding.png`, `ui-12-editor-license.png`.

---

## Prompt 1/7: Hero "The banner on a site"

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot": "ui-01-banner-on-site.png — a real web page with the real Consentful cookie banner in its bottom-right corner",
      "logo": "logo.png — the Consentful logo for the top-left lock-up",
      "usage_rule": "Place the supplied page screenshot EXACTLY as provided — same pixels, text, colours and proportions. Do not redraw, re-typeset, translate, or add/remove anything inside it. Only scale it uniformly, mask it into the browser frame, and add the shadow described."
    },
    "scene": {
      "description": "A clean 16:9 app-store screenshot for a cookie consent product. Very light cool-grey canvas (#F4F5F8) with a large, soft violet radial glow (#EFEAFE) behind the right half. On the right, a minimal light browser window (frameless chrome, three small neutral-grey dots, thin #E6E8EE border, 16px corners) shows the supplied page screenshot unaltered: a warm, calm ceramics shop page with the real cookie banner sitting in its bottom-right corner. The window bleeds about 60px off the right edge. A single thin indigo-violet (#4B23D3) rounded outline ring, 2px, sits just outside the cookie banner to draw the eye to it, with no arrow and no label. The left column holds the logo at top, then a bold two-line headline in deep indigo (#2A0E6E) with the words 'actually blocks trackers' in indigo-violet (#4B23D3), and a grey (#6B7280) supporting line. Calm, precise, trustworthy; palette strictly cool-white, indigo-violet and grey around the screenshot.",
      "subject": "The real cookie banner on a real page (supplied screenshot), framed in a browser window",
      "setting": "Flat branded marketing canvas with an abstracted browser window",
      "action": "static — banner showing on first visit"
    },
    "style": {
      "primary": "commercial product marketing graphic, flat vector canvas composited with a real screenshot",
      "rendering_quality": "high-resolution, pixel-crisp UI",
      "surface_textures": "perfectly flat surfaces, no noise or grain",
      "lighting": "no scene lighting; depth only from one soft violet-tinted ambient shadow under the browser window"
    },
    "technical": {
      "camera": {
        "focal_length": "orthographic, no perspective",
        "aperture": "n/a — graphic",
        "depth_of_field": "deep — everything sharp",
        "angle": "straight-on, flat front view, no tilt or 3D rotation"
      },
      "resolution": "landscape, composed for a 1600x900 (16:9) crop with 72px safe margins",
      "rendering": "sRGB, clean anti-aliasing, no grain, UI kept at native sharpness"
    },
    "composition": {
      "perspective": "flat 2D layering: canvas > glow > browser window > outline ring",
      "framing": "split layout — left text column ~38% width, right browser window ~62%",
      "subject_placement": "browser window vertically centred at ~78% of canvas height; eye path goes headline → outline ring → banner",
      "ui_elements": "1) Top-left: the supplied Consentful logo, 40px tall, unaltered. 2) Headline, left-aligned, vertically centred: line 1 'The cookie banner that' line 2 'actually blocks trackers.' Plus Jakarta Sans ExtraBold 54px, line-height 1.1, #2A0E6E, with 'actually blocks trackers' in #4B23D3. 3) Subline, 20px Medium #6B7280, max 2 lines: 'GDPR and CCPA ready, with Google Consent Mode v2 built in.' No other text anywhere."
    },
    "quality": {
      "include": ["pixel-exact real screenshot", "crisp legible banner text", "generous whitespace", "precise alignment grid", "subtle violet-tinted shadow", "brand-accurate #4B23D3", "premium SaaS store screenshot", "balanced split composition"],
      "avoid": ["redrawn or altered banner", "misspelled or garbled text", "invented buttons", "any platform or tracker logos", "blue brand colour", "3D tilted device mockups", "heavy gradients or neon glow", "stock-photo people", "arrows, stickers or emoji", "cluttered background"]
    },
    "reference_standard": "Linear, Raycast and Stripe product marketing screenshots; featured app-store listing style"
  }
}
```

---

## Prompt 2/7: "Preference center"

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot_primary": "ui-02b-preference-center-card.png — the real Consentful preference center dialog (transparent background)",
      "ui_screenshot_secondary": "ui-01b-banner-card.png — the real Consentful banner card (transparent background)",
      "logo": "logo.png",
      "usage_rule": "Place BOTH supplied cards EXACTLY as provided — identical pixels, text, toggles and colours. Never redraw, re-typeset or edit them. Only scale uniformly, layer them and add shadows."
    },
    "scene": {
      "description": "A clean 16:9 app-store screenshot. Light canvas #F4F5F8 with a soft violet glow #EFEAFE centred behind the right side. Two real UI cards float on the right with soft violet-tinted shadows and no browser window: the tall preference center dialog in front, showing category toggles and the individual services under them, and, peeking out behind its lower-left edge and about 25% smaller, the banner card. Left column: logo, bold headline in deep indigo #2A0E6E with 'service by service' in indigo-violet #4B23D3, grey subline, and two small tint chips. Minimal, confident, premium; palette cool-white, indigo-violet, grey.",
      "subject": "The real preference center dialog with the real banner card behind it",
      "setting": "Flat branded canvas, floating UI cards",
      "action": "static — a visitor choosing which categories and services to allow"
    },
    "style": {
      "primary": "commercial product marketing graphic composited with real UI screenshots",
      "rendering_quality": "high-resolution, pixel-crisp UI",
      "surface_textures": "flat, noise-free",
      "lighting": "no scene lighting; stacked soft shadows give two layers of depth, the front card's shadow stronger"
    },
    "technical": {
      "camera": {
        "focal_length": "orthographic, no perspective",
        "aperture": "n/a — graphic",
        "depth_of_field": "deep — both cards fully sharp, no blur on the back card",
        "angle": "straight-on, no rotation"
      },
      "resolution": "landscape, composed for a 1600x900 (16:9) crop with 72px safe margins",
      "rendering": "sRGB, clean anti-aliasing, no grain"
    },
    "composition": {
      "perspective": "flat layered cards: banner card (back) > preference center (front)",
      "framing": "split layout — text ~40% left, stacked cards ~60% right",
      "subject_placement": "preference center centred in the right area at ~86% of canvas height; banner card overlapped by ~40% at its lower-left; eye path headline → toggles → banner",
      "ui_elements": "1) Top-left: the supplied Consentful logo, 40px tall. 2) Headline: line 1 'Visitors choose,' line 2 'service by service.' ExtraBold 54px, line-height 1.1, #2A0E6E; 'service by service' in #4B23D3. 3) Subline 20px Medium #6B7280: 'A full preference center with per-service toggles and a downloadable consent receipt.' 4) Two chips below, 12px gap: 'Nothing pre-ticked' and 'Reject all next to Accept all' — #EFEAFE fill, 1px #DCD1FB border, #4B23D3 SemiBold 15px text, 999px radius. No other added text."
    },
    "quality": {
      "include": ["pixel-exact real dialog", "legible toggle labels", "clean layered depth", "brand indigo-violet accents", "crisp chips", "balanced composition", "premium minimal aesthetic"],
      "avoid": ["altered or redrawn dialog", "changed toggle states", "garbled text", "tracker or platform logos", "blurred back card", "3D tilt", "heavy glow", "extra icons"]
    },
    "reference_standard": "Apple feature-page UI callouts; Raycast store screenshots"
  }
}
```

---

## Prompt 3/7: "Google Consent Mode v2"

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot_primary": "ui-07-editor-consent-mode.png — the real Consentful editor, Consent Mode tab, listing each signal with its default state",
      "ui_screenshot_secondary": "ui-03-editor-categories.png — the real Consentful editor, Categories tab",
      "logo": "logo.png",
      "usage_rule": "Place BOTH supplied editor screenshots EXACTLY as provided — identical pixels, text and colours. Never redraw or edit them. Only scale uniformly, round the outer corners to 16px, layer them and add shadows."
    },
    "scene": {
      "description": "A clean 16:9 app-store screenshot. Light canvas #F4F5F8 with a soft violet glow #EFEAFE behind the right side. Two real editor windows float on the right as cards with 16px corners and thin #E6E8EE borders: the Consent Mode window in front, showing a list of consent signals each marked Denied or Granted, and behind it, offset up and to the right by about 70px and slightly smaller, the Categories window. Left column: logo, headline in deep indigo #2A0E6E with 'Consent Mode v2' in indigo-violet #4B23D3, grey subline. Orderly, technical, reassuring; palette cool-white, indigo-violet, grey.",
      "subject": "The real Consent Mode settings with the Categories panel behind",
      "setting": "Flat branded canvas, two floating editor windows",
      "action": "static — signals default to denied until the visitor chooses"
    },
    "style": {
      "primary": "commercial product marketing graphic composited with real UI screenshots",
      "rendering_quality": "high-resolution, pixel-crisp UI",
      "surface_textures": "flat, noise-free",
      "lighting": "no scene lighting; soft violet-tinted shadows under each window, the front one stronger"
    },
    "technical": {
      "camera": {
        "focal_length": "orthographic, no perspective",
        "aperture": "n/a — graphic",
        "depth_of_field": "deep — everything sharp",
        "angle": "straight-on"
      },
      "resolution": "landscape, composed for a 1600x900 (16:9) crop with 72px safe margins",
      "rendering": "sRGB, clean anti-aliasing, no grain"
    },
    "composition": {
      "perspective": "flat layers: canvas > glow > Categories window > Consent Mode window",
      "framing": "split layout — text ~36% left, windows ~64% right, the back window bleeding ~40px off the right edge",
      "subject_placement": "front window at ~74% of canvas height, vertically centred; eye path headline → signal list",
      "ui_elements": "1) Top-left: the supplied Consentful logo, 40px tall. 2) Headline: line 1 'Google Consent Mode v2,' line 2 'built in.' ExtraBold 54px, line-height 1.1, #2A0E6E; 'Consent Mode v2' in #4B23D3. 3) Subline 20px Medium #6B7280: 'Signals start denied before Google tags load and update the moment a visitor chooses.' No other added text."
    },
    "quality": {
      "include": ["pixel-exact real editor UI", "legible signal names", "clean layered depth", "tidy alignment", "brand indigo-violet accents", "generous whitespace", "premium productivity aesthetic"],
      "avoid": ["altered or redrawn UI", "garbled signal names", "the Google logo or any Google branding", "invented settings", "3D perspective", "cluttered layout", "emoji"]
    },
    "reference_standard": "Linear changelog visuals; Notion feature screenshots"
  }
}
```

---

## Prompt 4/7: "Script blocking"

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot": "ui-04-editor-scripts.png — the real Consentful editor, Scripts tab, with two managed trackers listed",
      "logo": "logo.png",
      "usage_rule": "Place the supplied editor screenshot EXACTLY as provided — same pixels, text, icons and colours. Do not redraw, re-typeset, recolour, or add/remove UI. Only scale uniformly, round the outer corners to 16px and add the shadow described."
    },
    "scene": {
      "description": "A clean 16:9 app-store screenshot. Light canvas #F4F5F8 with a soft violet glow #EFEAFE behind the right side. On the right, the real editor window from the supplied screenshot floats as a card with 16px corners, a thin #E6E8EE border and a soft violet-tinted shadow, unaltered: a sidebar and a list of two tracking scripts, each tagged with its consent category. One small floating indigo-violet #4B23D3 pill callout with white text sits just left of the two script rows, overlapping the window edge. Left column: logo, bold headline in deep indigo #2A0E6E with 'until visitors agree' in indigo-violet #4B23D3, grey subline. Precise, calm, premium; palette cool-white, indigo-violet, grey.",
      "subject": "The real Scripts tab listing blocked trackers",
      "setting": "Flat branded canvas with one floating editor window",
      "action": "static — two trackers held back until consent"
    },
    "style": {
      "primary": "commercial product marketing graphic composited with a real UI screenshot",
      "rendering_quality": "high-resolution, pixel-crisp UI",
      "surface_textures": "flat, noise-free surfaces",
      "lighting": "no scene lighting; one soft violet-tinted ambient shadow under the window"
    },
    "technical": {
      "camera": {
        "focal_length": "orthographic, no perspective",
        "aperture": "n/a — graphic",
        "depth_of_field": "deep — everything sharp",
        "angle": "straight-on front view, no tilt"
      },
      "resolution": "landscape, composed for a 1600x900 (16:9) crop with 72px safe margins",
      "rendering": "sRGB, clean anti-aliasing, no grain"
    },
    "composition": {
      "perspective": "flat 2D layers: canvas > glow > editor window > callout pill",
      "framing": "split layout — text ~36% left, editor window ~64% right",
      "subject_placement": "editor window at ~80% of canvas height, vertically centred; callout pill level with the script rows; eye path headline → callout → script rows",
      "ui_elements": "1) Top-left: the supplied Consentful logo, 40px tall. 2) Headline: line 1 'Trackers stay off' line 2 'until visitors agree.' ExtraBold 54px, line-height 1.1, #2A0E6E; 'until visitors agree' in #4B23D3. 3) Subline 20px Medium #6B7280: 'Analytics and ad scripts are blocked until their category is allowed, then start with no page reload.' 4) Callout pill: #4B23D3 fill, 999px radius, white Plus Jakarta Sans SemiBold 15px text 'Blocked until consent'. No other added text."
    },
    "quality": {
      "include": ["pixel-exact real editor", "legible script names and tag ids", "one clear callout", "brand-accurate indigo-violet", "tidy alignment grid", "generous whitespace", "premium SaaS screenshot"],
      "avoid": ["redrawn or altered editor UI", "garbled text", "fake extra scripts", "Google or Meta logos", "more than one callout", "3D perspective mockups", "busy gradients", "emoji or clip-art"]
    },
    "reference_standard": "Notion and Linear feature screenshots; Figma Community cover style"
  }
}
```

---

## Prompt 5/7: "Design it your way"

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot_primary": "ui-05b-editor-theme-preview.png — the real Consentful editor, Theme tab, with the live preview drawer open",
      "ui_screenshot_secondary": "ui-01c-banner-bar.png — a real page with the real banner in its bottom-bar layout; use ONLY the bottom ~15% strip containing the bar",
      "logo": "logo.png",
      "usage_rule": "Place both supplied screenshots EXACTLY as provided — identical pixels, text and colours. Never redraw or edit them. Only scale uniformly, crop the secondary to the banner bar strip, round outer corners and add shadows."
    },
    "scene": {
      "description": "A clean 16:9 app-store screenshot. Light canvas #F4F5F8 with a soft violet glow #EFEAFE. On the right, the real editor window floats as a card with 16px corners and a thin #E6E8EE border, unaltered: theme controls on the left and a live preview of the banner on the right. Overlapping the window's bottom edge by about 30%, a wide, shallow strip cropped from the second screenshot shows the same banner as a full-width bottom bar, as its own card with 14px corners and a soft shadow. Behind the editor window's top-right corner, a single soft blurred blob of the iris gradient (pink #F7CBE4, peach #FBDCC4, cream #FDF3CF, mint #C9EDD6, lavender #D9D2F6) adds one touch of colour. Left column: logo, headline in deep indigo #2A0E6E with 'your brand' in indigo-violet #4B23D3, grey subline, three small tint chips.",
      "subject": "The real Theme tab with live preview, plus the real bar-layout banner",
      "setting": "Flat branded canvas, floating window and strip",
      "action": "static — styling the banner and seeing it update live"
    },
    "style": {
      "primary": "commercial product marketing graphic composited with real UI screenshots",
      "rendering_quality": "high-resolution, pixel-crisp UI",
      "surface_textures": "flat, noise-free; the iris blob is the only soft-blurred element",
      "lighting": "no scene lighting; soft shadows under the window and the strip"
    },
    "technical": {
      "camera": {
        "focal_length": "orthographic, no perspective",
        "aperture": "n/a — graphic",
        "depth_of_field": "deep — all UI sharp",
        "angle": "straight-on"
      },
      "resolution": "landscape, composed for a 1600x900 (16:9) crop with 72px safe margins",
      "rendering": "sRGB, smooth banding-free gradient, clean anti-aliasing, no grain"
    },
    "composition": {
      "perspective": "flat layers: canvas > iris blob > editor window > bar strip",
      "framing": "split layout — text ~36% left, UI ~64% right",
      "subject_placement": "editor window in the upper right at ~70% of canvas height; bar strip spans the window's width along its bottom edge; eye path headline → live preview → bar strip",
      "ui_elements": "1) Top-left: the supplied Consentful logo, 40px tall. 2) Headline: line 1 'Designed to match' line 2 'your brand.' ExtraBold 54px, line-height 1.1, #2A0E6E; 'your brand' in #4B23D3. 3) Subline 20px Medium #6B7280: 'Card, bar or modal. Your colours, corners and copy, previewed live as you edit.' 4) Three chips, 12px gap: 'Card', 'Bar', 'Modal' — #EFEAFE fill, 1px #DCD1FB border, #4B23D3 SemiBold 15px text, 999px radius. No other added text."
    },
    "quality": {
      "include": ["pixel-exact real editor and banner", "legible preview text", "one restrained iris accent", "clean layered depth", "brand indigo-violet", "generous whitespace", "premium design-tool aesthetic"],
      "avoid": ["altered or redrawn UI", "garbled text", "invented theme options", "rainbow gradients across the whole canvas", "platform logos", "3D tilt", "cluttered layout", "emoji"]
    },
    "reference_standard": "Framer and Figma feature-page visuals; Linear product shots"
  }
}
```

---

## Prompt 6/7: "Publish"

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot": "ui-06-editor-publish.png — the real Consentful editor, Publish tab, showing the 'Ready to publish' checklist and a 'Live' site pill in the header",
      "logo": "logo.png",
      "usage_rule": "Place the supplied editor screenshot EXACTLY as provided — same pixels, text, icons and colours. Do not redraw, re-typeset or add/remove UI. Only scale uniformly, round the outer corners to 16px and add the shadow described."
    },
    "scene": {
      "description": "A clean 16:9 app-store screenshot. Light canvas #F4F5F8 with a soft violet glow #EFEAFE behind the right side. On the right, the real editor window floats as a card with 16px corners, a thin #E6E8EE border and a soft violet-tinted shadow, unaltered: a green 'Ready to publish' checklist and a list of what gets added to the site. Left column: logo, bold headline in deep indigo #2A0E6E with 'one licence' in indigo-violet #4B23D3, grey subline, and a row of six small text-only chips naming the supported platforms. Confident, simple, finished; palette cool-white, indigo-violet, grey.",
      "subject": "The real Publish tab in its ready state",
      "setting": "Flat branded canvas with one floating editor window",
      "action": "static — configuration valid and synced to the site"
    },
    "style": {
      "primary": "commercial product marketing graphic composited with a real UI screenshot",
      "rendering_quality": "high-resolution, pixel-crisp UI",
      "surface_textures": "flat, noise-free",
      "lighting": "no scene lighting; one soft violet-tinted ambient shadow under the window"
    },
    "technical": {
      "camera": {
        "focal_length": "orthographic, no perspective",
        "aperture": "n/a — graphic",
        "depth_of_field": "deep — everything sharp",
        "angle": "straight-on"
      },
      "resolution": "landscape, composed for a 1600x900 (16:9) crop with 72px safe margins",
      "rendering": "sRGB, clean anti-aliasing, no grain"
    },
    "composition": {
      "perspective": "flat layers: canvas > glow > editor window",
      "framing": "split layout — text ~40% left, editor window ~60% right",
      "subject_placement": "editor window at ~80% of canvas height, vertically centred; eye path headline → green checklist",
      "ui_elements": "1) Top-left: the supplied Consentful logo, 40px tall. 2) Headline: line 1 'Every platform,' line 2 'one licence.' ExtraBold 54px, line-height 1.1, #2A0E6E; 'one licence' in #4B23D3. 3) Subline 20px Medium #6B7280: 'Free for one site. One licence covers your domain wherever it is built.' 4) Six text-only chips in two rows of three, 10px gap: 'Framer', 'Webflow', 'WordPress', 'Shopify', 'Wix', 'Any website' — white fill, 1px #E6E8EE border, #17191E SemiBold 15px text, 999px radius, NO logos or icons inside them. No other added text."
    },
    "quality": {
      "include": ["pixel-exact real editor", "legible checklist", "text-only platform chips", "brand-accurate indigo-violet", "tidy alignment", "generous whitespace", "premium SaaS screenshot"],
      "avoid": ["altered or redrawn UI", "garbled text", "any platform logos or brand marks", "invented platforms", "3D perspective", "busy gradients", "emoji"]
    },
    "reference_standard": "Vercel and Linear launch visuals"
  }
}
```

For a single-store upload, replace item 4 with one chip naming that platform and change the
headline to the store's own line from `LAUNCH.md` (for example "Design your banner inside Framer.").

---

## Prompt 7/7: Cover / promo tile

```json
{
  "prompt": {
    "reference_inputs": {
      "ui_screenshot": "ui-01b-banner-card.png — the real Consentful banner card (transparent background)",
      "logo": "logo.png — the Consentful logo; on the dark canvas render the wordmark in white and keep the cookie mark's own colours",
      "usage_rule": "Use the banner card EXACTLY as provided — no redrawing or retyping. Scale uniformly only. The brand name must dominate; the UI is a supporting visual."
    },
    "scene": {
      "description": "A bold 16:9 cover tile. Deep indigo background (#2B1178) with one large, soft, low-contrast iris-gradient glow (pink #F7CBE4, peach #FBDCC4, cream #FDF3CF, mint #C9EDD6, lavender #D9D2F6, at about 35% opacity) rising from the bottom-right corner. Left side: the Consentful logo, a large white headline and a short lavender tagline. Right side: the real banner card from the supplied screenshot, flat and unrotated, on its own white card with a soft deep-indigo shadow, bleeding slightly off the right edge. Instantly recognisable at thumbnail size; palette deep indigo, white, lavender, with the iris glow as the only colour.",
      "subject": "Brand lock-up plus the real banner card",
      "setting": "Solid deep-indigo branded tile",
      "action": "static"
    },
    "style": {
      "primary": "bold flat brand tile composited with a real UI card",
      "rendering_quality": "high-resolution, crisp at small size",
      "surface_textures": "flat; smooth glow with no banding",
      "lighting": "none; one soft shadow under the UI card"
    },
    "technical": {
      "camera": {
        "focal_length": "orthographic",
        "aperture": "n/a — graphic",
        "depth_of_field": "deep",
        "angle": "straight-on"
      },
      "resolution": "landscape, composed for a 1600x900 (16:9) crop; keep all text inside the central 1200x900 so a 4:3 crop also works",
      "rendering": "sRGB, dithered gradient to prevent banding, crisp anti-aliasing"
    },
    "composition": {
      "perspective": "flat",
      "framing": "split — brand ~48% left, banner card ~52% right bleeding ~60px off the right edge",
      "subject_placement": "brand block vertically centred with a 96px left margin; banner card vertically centred",
      "ui_elements": "1) The Consentful logo, 56px tall. 2) Headline 'Cookie consent, done right.' — Plus Jakarta Sans ExtraBold 64px, white, left-aligned, two lines. 3) Tagline 'Google Consent Mode v2 · real script blocking' — SemiBold 20px, #D9D2F6. No other text."
    },
    "quality": {
      "include": ["legible at thumbnail size", "strong deep-indigo field", "high white-on-indigo contrast", "pixel-exact banner card", "simple bold composition", "one restrained iris glow", "store-tile ready"],
      "avoid": ["tiny unreadable text", "more than one tagline", "altered banner", "rainbow gradient covering the canvas", "platform logos", "busy details", "3D tilt", "blue brand colour"]
    },
    "reference_standard": "Featured-app marquee tiles; Linear and Raycast brand covers"
  }
}
```

---

## Tweaks you might try

- **Per-store first screenshot:** re-run prompt 1 with the store's own headline from `LAUNCH.md`
  ("Design your cookie banner inside Framer.", and so on). The first image is what shows in search.
- **Shopify app icon (1200×1200):** use `logo-mark.png` centred on the `#2B1178` field from
  prompt 7, no text.
- **Dark set:** not yet. The dark banner's credit logo (`plugin/public/logo-light.png`) is missing
  from the repo and CDN, so dark-theme captures show a broken image. Add the asset first.

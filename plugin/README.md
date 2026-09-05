# Cookie Consent & GDPR — Framer plugin

The editor-side plugin. A designer configures the consent banner here; the
plugin serializes that config and writes a small loader into the site's
**custom code**, which boots the CDN-hosted runtime (`/runtime`) on the
published site.

Built on the official Framer plugin tooling (React + TypeScript + Vite,
`@framer/plugin` + `vite-plugin-framer`). It is part of the root npm workspace
and imports the consent config schema from the [`/shared`](../shared) workspace
so the plugin and runtime can never drift.

## Prerequisites

- Node.js ≥ 18
- Dependencies installed once from the repo root: `npm install`
- A Framer account with **Developer Tools** enabled
  (Framer → account/plugins settings → enable Developer Tools).

## Run the dev server

From the **repo root** (so the `shared` workspace resolves):

```bash
npm run --workspace plugin dev
```

Vite starts on **`https://localhost:5173`**. HTTPS is required by Framer and is
provided automatically by `vite-plugin-mkcert`, which installs a trusted local
certificate on first run (the generated cert lives in
`~/.vite-plugin-mkcert/`).

> First run only: if your browser has not trusted the local cert yet, open
> <https://localhost:5173> directly once and accept it, otherwise Framer cannot
> load the plugin over HTTPS.

## Open it inside Framer (local development)

This uses Framer's "Open Development Plugin" flow — it loads the plugin UI
straight from your local dev server, with hot reload.

1. Start the dev server (above) and leave it running.
2. Open a project in Framer (desktop app or the web editor).
3. Open the **Plugins** menu → **Developer Tools** → **Open Development
   Plugin**. (Equivalently, visit <https://framer.com/plugins/open> — the link
   the dev server prints on start — from within Framer.)
4. When prompted for the plugin URL, enter **`https://localhost:5173`** and
   open it. The plugin panel mounts inside the editor.

Edits to `src/**` hot-reload in the open panel. The panel's mode and size come
from [`framer.json`](./framer.json) and `framer.showUI(...)` in
[`src/App.tsx`](./src/App.tsx).

Docs: <https://www.framer.com/developers/plugins/introduction>

## Permissions & modes

Framer's permission model is **entirely runtime** — there is no permissions
field in `framer.json`. "Plugins can do only what the user can", so:

| Capability                                   | Framer method            | Requires permission |
| -------------------------------------------- | ------------------------ | ------------------- |
| Read project name/id                         | `getProjectInfo`         | No (always allowed) |
| Read the injected custom code + its state    | `getCustomCode` / subscribe | No               |
| **Write the loader into custom code**        | `setCustomCode`          | **Yes** (`setCustomCode`) |
| Read persisted config                        | `getPluginData`          | No                  |
| **Persist config**                           | `setPluginData`          | **Yes** (`setPluginData`) |

Write permissions map to the user's project role (Site Settings access). The
plugin checks them at runtime via `framer.isAllowedTo(...)` — see
[`src/lib/framer.ts`](./src/lib/framer.ts) (`canSetCustomCode`,
`canSetPluginData`), which throw a `FramerPermissionError` when denied.

`framer.json` declares `modes: ["canvas"]` — the plugin runs against the canvas
/ site-settings surface, which is where the custom-code and project APIs live.

### Custom code can be disabled by the user

Framer lets the user turn **off** custom code for a site in settings. A plugin
can detect this (`getCustomCode()[location].disabled`, exposed here as
`isCustomCodeDisabled` / `getCustomCodeDisabled`) and should warn the user that
the banner will not load. **We cannot re-enable custom code programmatically** —
only the user can, in Framer's settings.

## Scripts

| Script                                   | What it does                                  |
| ---------------------------------------- | --------------------------------------------- |
| `npm run --workspace plugin dev`         | Start the Vite dev server (HTTPS, hot reload) |
| `npm run --workspace plugin build`       | Production build to `dist/`                    |
| `npm run --workspace plugin preview`     | Preview the production build                    |
| `npm run --workspace plugin typecheck`   | Strict `tsc` type-check (no emit)              |
| `npm run --workspace plugin lint`        | ESLint                                          |
| `npm run --workspace plugin pack`        | Package the plugin (`framer-plugin-tools pack`) |

## Structure

```
plugin/
├─ framer.json              # Plugin manifest: id, name, modes, icon
├─ index.html               # Vite entry HTML
├─ vite.config.ts           # react + mkcert + vite-plugin-framer
├─ tsconfig.json            # Extends the repo-wide strict base; references ../shared
└─ src/
   ├─ main.tsx              # React root + Framer CSS
   ├─ App.tsx               # Plugin root (shell for now)
   ├─ App.css
   ├─ types.ts              # Re-exports the shared schema + UI-only types
   ├─ lib/
   │  ├─ framer.ts          # Typed wrapper around the Framer plugin API (implemented)
   │  ├─ customCode.ts      # Builds the loader HTML string (Prompt 11)
   │  └─ license.ts         # Lemon Squeezy client (Prompt 12)
   ├─ hooks/
   │  ├─ useSettings.ts     # Config load/save (later prompt)
   │  └─ useLicense.ts      # License state (later prompt)
   └─ components/           # Panel stubs (later prompts)
      ├─ CategoriesPanel.tsx
      ├─ StylePanel.tsx
      ├─ TextPanel.tsx
      ├─ BehaviorPanel.tsx
      ├─ ScriptsPanel.tsx
      ├─ LicensePanel.tsx
      └─ PreviewPane.tsx
```

# Consentful for WordPress — App shell (Phase 3.3)

The WordPress front-end for the shared consent engine. Two halves that split
along WordPress's credential boundary:

- **Admin bundle** (`src/` → built to `plugin/consentful/assets/`) — a
  framework-free authoring panel that runs inside wp-admin. Author the banner,
  preview the real runtime, optionally pre-fill trackers from your active
  plugins, and Publish. It holds no secret; it calls the site's REST API.
- **PHP plugin** (`plugin/consentful/`) — the credential-holding shell. It
  persists ONE option holding our loader block, echoes it verbatim on `wp_head`
  (a dumb printer), and exposes the option + `active_plugins` over a
  capability-gated REST namespace.

Everything consent-related is the **shared core** (`@framer-cookie-consent/shared`):
the loader written into `wp_head` is byte-identical to what Framer, the universal
embed and Webflow emit.

## How it maps to the core

| Core seam (`shared/src/wordpress.ts`) | Implemented here |
|---|---|
| `WordPressLoaderStore` (read/write the head option) | `src/rest-store.ts` (`WordPressRestStore`) over WP REST |
| `installWordPressLoader` / `removeWordPressLoader` | called by `src/app.ts` on Publish / Remove |
| `detectWordPressTrackers(active_plugins)` | `WordPressRestStore.detectTrackers()` → `src/config-form.ts` `mergeDetectedScripts` |
| `wp_head` printer (the "dumb printer") | `plugin/consentful/includes/class-consentful-head.php` |
| config authoring UI | `src/app.ts` (pure map in `src/config-form.ts`) |

## REST contract (the store)

All routes require `manage_options`; writes carry the `X-WP-Nonce` REST nonce.

```
GET  /wp-json/consentful/v1/head             → { head: string }
POST /wp-json/consentful/v1/head   { head }  → store the loader block (null clears)
GET  /wp-json/consentful/v1/config           → { config: string|null }
POST /wp-json/consentful/v1/config { config }→ store the authoring config (null clears)
GET  /wp-json/consentful/v1/active-plugins   → { plugins: string[] }
```

The `head` option is the rendered loader the front end prints on `wp_head`; the
`config` option is the authoring config the admin screen reloads on open
(load-on-mount), so it reopens on the live banner rather than a fresh default.
`config` is written alongside `head` on Publish and cleared on Remove.

## Build & package (needs your WordPress install)

The admin bundle is built into the PHP plugin so the plugin folder is what you
zip and install:

```bash
cd apps/wordpress-plugin
npm run build            # emits plugin/consentful/assets/consentful-admin.{js,css}
```

Then zip and install the plugin:

```bash
cd plugin
zip -r consentful.zip consentful
# Upload consentful.zip via wp-admin → Plugins → Add New → Upload Plugin
```

Activate it, then open **Settings → Consentful**, author the banner, and click
**Publish to site**. `npm run dev` runs the same UI standalone (preview only —
Publish is disabled without a WordPress REST endpoint).

## Security notes

- **Capability + nonce.** Every REST route checks `current_user_can('manage_options')`
  and writes require the WordPress REST nonce, so only a logged-in administrator
  can change what prints into `<head>`.
- **The stored block is printed unescaped**, on purpose: it is our own generated
  `<script>` loader (the shared engine's `buildLoaderHtml` output), not user
  free-text, and it can only have been written through the gated REST route —
  the same trust model as Framer/Webflow custom code. PHP never rebuilds or
  re-escapes it, so it can never drift from the other platforms.

## Follow-ons (not required to ship)

- **Persist the authored config**, not just the emitted loader, so the settings
  screen re-opens on the last-published values (today it seeds from defaults,
  like the Webflow Designer).
- **Portal licensing (2.2)** — parked to be done last; the runtime already gates
  banner presentation regardless of licensing, so the shell works without it.

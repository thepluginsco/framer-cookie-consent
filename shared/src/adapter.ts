/**
 * The platform adapter SEAM — the single, tiny contract every front-end
 * implements so the same engine (schema + {@link ./loader}) can drive Framer,
 * the universal `<script>` embed, Webflow, WordPress and Shopify.
 *
 * The whole platform-specific surface is two operations: read the host's
 * custom-code region, and write it back. Everything else — building the loader,
 * splicing ONLY our marker block, deciding whether a write is even needed — is
 * platform-neutral and lives here. A new platform is therefore a ~20-line
 * adapter, not a re-implementation.
 *
 * Adapter contract (verbatim from the expansion plan):
 *   read custom-code region → `upsertBlock(buildLoaderHtml(config))` → write back.
 */

import type { CookieConsentConfig } from "./config-schema.js";
import {
  buildLoaderHtml,
  hasBlock,
  stripBlock,
  upsertBlock,
  type BuildLoaderOptions,
} from "./loader.js";

/**
 * How a platform reads and writes the region of a published site where the
 * loader lives (Framer's `headStart` custom code, a WordPress `wp_head` option,
 * a Webflow site-wide head embed, …).
 *
 * Implementations own ONLY the host wiring and its permission model; they never
 * build or splice loader HTML themselves — {@link installLoader} /
 * {@link removeLoader} do that with the platform-neutral loader helpers.
 */
export interface PlatformAdapter {
  /**
   * Return the current HTML at the loader region, or `""` when the region is
   * empty/unset. May contain unrelated custom code the user placed there — the
   * splice helpers preserve it.
   */
  readLoaderRegion(): Promise<string>;

  /**
   * Write `html` back to the loader region. `null` means "clear the region
   * entirely" (nothing of ours or anyone else's remains). Implementations
   * surface their own permission errors by throwing.
   */
  writeLoaderRegion(html: string | null): Promise<void>;
}

/** Options for {@link installLoader}. */
export interface InstallLoaderOptions extends BuildLoaderOptions {}

/**
 * Build the loader for `config` and install it into the host via `adapter`,
 * replacing ONLY our marker block (or appending it) and leaving every other
 * line of custom code intact.
 *
 * Idempotent and churn-free: it reads the current region, computes the next
 * HTML, and skips the write entirely when nothing changed — so it is safe to
 * call on every debounced config edit.
 *
 * @returns `true` if it wrote (something changed), `false` if it was a no-op.
 */
export async function installLoader(
  adapter: PlatformAdapter,
  config: CookieConsentConfig,
  options: InstallLoaderOptions = {},
): Promise<boolean> {
  const block = buildLoaderHtml(config, options);
  const current = (await adapter.readLoaderRegion()) ?? "";
  const next = upsertBlock(current, block);
  if (next === current) return false;
  await adapter.writeLoaderRegion(next);
  return true;
}

/**
 * Remove ONLY our loader block from the host, preserving any other custom code
 * in the same region. Clears the region (`writeLoaderRegion(null)`) when nothing
 * else remains. A no-op (no write) when our block isn't present.
 *
 * @returns `true` if it wrote (our block was present), `false` otherwise.
 */
export async function removeLoader(adapter: PlatformAdapter): Promise<boolean> {
  const current = (await adapter.readLoaderRegion()) ?? "";
  if (!hasBlock(current)) return false;
  await adapter.writeLoaderRegion(stripBlock(current));
  return true;
}

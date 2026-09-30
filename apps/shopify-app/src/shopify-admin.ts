/**
 * Admin GraphQL access for the embedded Shopify app — no backend.
 *
 * Inside Shopify admin, App Bridge intercepts `fetch("shopify:admin/…")` and
 * attaches the session token (direct API access, enabled by
 * `[access.admin] embedded_app_direct_api_access = true` in shopify.app.toml).
 * Publishing writes two app-data metafields on the app's own `AppInstallation`
 * (no access scopes needed; `read_themes` is only for {@link ShopifyAdminClient.embedStatus}):
 *   - `consentful.loader` — the loader HTML the theme app embed prints, and
 *   - `consentful.config` — the published (license-free) config, for load-on-mount.
 *
 * `fetchImpl` is injectable so the request shapes are unit-testable.
 */

import {
  buildShopifyLoaderHtml,
  isShopifyEmbedEnabled,
  parse,
  serialize,
  SHOPIFY_CONFIG_KEY,
  SHOPIFY_LOADER_KEY,
  SHOPIFY_METAFIELD_NAMESPACE,
  toPublishedConfig,
  type CookieConsentConfig,
} from "@framer-cookie-consent/shared"

/** Admin API version used for direct API calls. */
export const ADMIN_API_VERSION = "2026-07"
/** App Bridge's direct-API endpoint for the Admin GraphQL API. */
export const ADMIN_GRAPHQL_URL = `shopify:admin/api/${ADMIN_API_VERSION}/graphql.json`

/** True when running inside Shopify admin with App Bridge loaded. */
export function inShopifyAdmin(): boolean {
  return typeof window !== "undefined" && typeof (window as { shopify?: unknown }).shopify === "object"
}

/** The store + installation context the app publishes into. */
export interface ShopContext {
  installationId: string
  /** `<store>.myshopify.com`. */
  myshopifyDomain: string
  /** The storefront's primary host (custom domain when set). */
  primaryHost: string
}

interface GqlResponse<T> {
  data?: T
  errors?: { message: string }[]
}

export class ShopifyAdminClient {
  private readonly doFetch: typeof fetch
  private readonly runtimeUrl: string | undefined

  constructor(options: { fetchImpl?: typeof fetch; runtimeUrl?: string } = {}) {
    // Bind: a bare `fetch` stored on `this` throws "Illegal invocation" when called as a method.
    this.doFetch = options.fetchImpl ?? fetch.bind(globalThis)
    this.runtimeUrl = options.runtimeUrl
  }

  private async gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await this.doFetch(ADMIN_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(variables ? { query, variables } : { query }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      throw new Error(`Shopify Admin API failed (${res.status}): ${detail}`)
    }
    const body = (await res.json()) as GqlResponse<T>
    if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "))
    if (!body.data) throw new Error("Shopify Admin API returned no data")
    return body.data
  }

  /** Resolve the app installation id and the store's domains. */
  async shopContext(): Promise<ShopContext> {
    const data = await this.gql<{
      currentAppInstallation: { id: string }
      shop: { myshopifyDomain: string; primaryDomain: { host: string } | null }
    }>(`{ currentAppInstallation { id } shop { myshopifyDomain primaryDomain { host } } }`)
    return {
      installationId: data.currentAppInstallation.id,
      myshopifyDomain: data.shop.myshopifyDomain,
      primaryHost: data.shop.primaryDomain?.host ?? data.shop.myshopifyDomain,
    }
  }

  /** Publish `config`: write the loader + published config metafields. */
  async publish(config: CookieConsentConfig): Promise<void> {
    const { installationId } = await this.shopContext()
    const loader = buildShopifyLoaderHtml(config, this.runtimeUrl ? { runtimeUrl: this.runtimeUrl } : {})
    const data = await this.gql<{
      metafieldsSet: { userErrors: { field: string[] | null; message: string }[] }
    }>(
      `mutation Publish($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) { userErrors { field message } }
      }`,
      {
        metafields: [
          {
            ownerId: installationId,
            namespace: SHOPIFY_METAFIELD_NAMESPACE,
            key: SHOPIFY_LOADER_KEY,
            type: "multi_line_text_field",
            value: loader,
          },
          {
            ownerId: installationId,
            namespace: SHOPIFY_METAFIELD_NAMESPACE,
            key: SHOPIFY_CONFIG_KEY,
            type: "json",
            value: serialize(toPublishedConfig(config)),
          },
        ],
      },
    )
    const errs = data.metafieldsSet.userErrors
    if (errs.length) throw new Error(errs.map((e) => e.message).join("; "))
  }

  /** Remove the banner: delete both metafields (the embed then renders nothing). */
  async remove(): Promise<void> {
    const { installationId } = await this.shopContext()
    const data = await this.gql<{
      metafieldsDelete: { userErrors: { field: string[] | null; message: string }[] }
    }>(
      `mutation Remove($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) { userErrors { field message } }
      }`,
      {
        metafields: [SHOPIFY_LOADER_KEY, SHOPIFY_CONFIG_KEY].map((key) => ({
          ownerId: installationId,
          namespace: SHOPIFY_METAFIELD_NAMESPACE,
          key,
        })),
      },
    )
    const errs = data.metafieldsDelete.userErrors
    if (errs.length) throw new Error(errs.map((e) => e.message).join("; "))
  }

  /**
   * Is our app embed switched on in the store's live (MAIN) theme? Reads
   * `config/settings_data.json` (needs the `read_themes` scope). Returns `null`
   * when it can't tell — no scope yet, no main theme, unreadable file.
   */
  async embedStatus(): Promise<boolean | null> {
    try {
      const data = await this.gql<{
        themes: {
          nodes: {
            files: {
              nodes: { body: { content?: string; contentBase64?: string } | null }[]
            } | null
          }[]
        }
      }>(
        `{ themes(first: 1, roles: [MAIN]) { nodes { files(filenames: ["config/settings_data.json"]) {
          nodes { body {
            ... on OnlineStoreThemeFileBodyText { content }
            ... on OnlineStoreThemeFileBodyBase64 { contentBase64 }
          } }
        } } } }`,
      )
      const body = data.themes.nodes[0]?.files?.nodes[0]?.body
      const text = body?.content ?? (body?.contentBase64 ? atob(body.contentBase64) : null)
      return text === null ? null : isShopifyEmbedEnabled(text)
    } catch {
      return null
    }
  }

  /** The last-published config, or null when nothing has been published. */
  async loadConfig(): Promise<CookieConsentConfig | null> {
    const data = await this.gql<{
      currentAppInstallation: { metafield: { value: string } | null }
    }>(
      `query Load($namespace: String!, $key: String!) {
        currentAppInstallation { metafield(namespace: $namespace, key: $key) { value } }
      }`,
      { namespace: SHOPIFY_METAFIELD_NAMESPACE, key: SHOPIFY_CONFIG_KEY },
    )
    const value = data.currentAppInstallation.metafield?.value
    return value ? parse(value) : null
  }
}

/**
 * Consentful — anonymous consent analytics Worker (Cloudflare).
 *
 * Keeps daily AGGREGATE counts of consent decisions so the plugin's Insights tab
 * can show accept/reject rates. It stores ONLY counters — no IPs, no cookies, no
 * visitor ids, no page URLs. Free tier (Workers + KV) is plenty.
 *
 * Two routes:
 *   POST /            — record one event  { type, categories:{id:0|1}, version }
 *   GET  /stats?days=30 — read the last N days of aggregates (for the dashboard)
 *
 * ── Deploy ────────────────────────────────────────────────────────────────
 *   1. Create a KV namespace:  `wrangler kv namespace create CONSENT_STATS`
 *      and put the returned id in wrangler.toml (see the [[kv_namespaces]] block).
 *   2. `wrangler deploy`.
 *   3. Paste the Worker URL into the plugin's Insights tab (Pro).
 *
 * NOTE ON ACCURACY: counters are read-modify-write in KV, which is eventually
 * consistent — under heavy concurrent traffic a few events may be undercounted.
 * That's an acceptable trade for a $0, zero-schema setup; rates stay meaningful.
 * For exact counts, swap KV for D1 (SQL upsert) — the routes stay the same.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });

/** UTC day key, e.g. "2026-09-04". */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/** A fresh, empty day bucket. */
function emptyDay() {
  return { total: 0, accept: 0, reject: 0, custom: 0, categories: {} };
}

export default {
  /**
   * @param {Request} request
   * @param {{ CONSENT_STATS: KVNamespace }} env
   */
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);

    // ---- Read aggregates for the dashboard ----
    if (request.method === "GET" && url.pathname === "/stats") {
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
      const keys = [];
      const now = new Date();
      for (let i = 0; i < days; i++) {
        const d = new Date(now);
        d.setUTCDate(now.getUTCDate() - i);
        keys.push(d.toISOString().slice(0, 10));
      }
      const entries = await Promise.all(
        keys.map(async (day) => {
          const raw = await env.CONSENT_STATS.get(`day:${day}`);
          return [day, raw ? JSON.parse(raw) : emptyDay()];
        }),
      );
      return json({ days: Object.fromEntries(entries) });
    }

    // ---- Record one consent event ----
    if (request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }
      const type = body && (body.type === "accept" || body.type === "reject" || body.type === "custom") ? body.type : null;
      if (!type) return json({ error: "bad type" }, 400);

      const key = `day:${today()}`;
      const raw = await env.CONSENT_STATS.get(key);
      const day = raw ? JSON.parse(raw) : emptyDay();
      day.total += 1;
      day[type] += 1;
      const cats = body.categories && typeof body.categories === "object" ? body.categories : {};
      for (const [id, granted] of Object.entries(cats)) {
        const c = day.categories[id] || { granted: 0, seen: 0 };
        c.seen += 1;
        if (granted === 1 || granted === true) c.granted += 1;
        day.categories[id] = c;
      }
      // 400-day TTL so old buckets self-expire; the dashboard only reads ~30.
      await env.CONSENT_STATS.put(key, JSON.stringify(day), { expirationTtl: 400 * 86400 });
      return json({ ok: true }, 202);
    }

    return json({ error: "not found" }, 404);
  },
};

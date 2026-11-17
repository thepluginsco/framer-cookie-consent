/**
 * The in-plugin upgrade sheet (plan §15 N5): plans → email code (guests) →
 * Dodo checkout in a new tab → "waiting for payment" → live. The paid key is
 * activated on this site automatically by the account provider; nothing to
 * copy or paste. Existing customers use the same sheet to sign in.
 */

import { useEffect, useState } from "react"

import { useHost } from "../host"
import { Backdrop, Dialog, ModalHeader } from "../modals"
import { T, focusRing } from "../tokens"
import { Button, Icon, Spinner } from "../ui"
import { AccountApiError, formatPrice, type PlansResponse, type AccountPlan } from "./account-client"
import { useAccount } from "./account-context"

/** Production sites per plan (mirrors the portal's plan limits). */
const SITES: Record<string, number> = { solo: 1, studio: 5, agency: 25, lifetime: 3 }
const sitesFor = (slug: string) => SITES[slug.split("-")[0] ?? ""] ?? null

const TAGLINE: Record<string, string> = {
  solo: "For one website",
  studio: "For freelancers",
  agency: "For agencies",
  lifetime: "Pay once, keep it",
}

function errText(e: unknown): string {
  return e instanceof AccountApiError ? e.message : "Something went wrong. Try again."
}

function Field({
  value,
  onChange,
  placeholder,
  mono,
  onEnter,
  inputMode,
  maxLength,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  mono?: boolean
  onEnter: () => void
  inputMode?: "email" | "numeric"
  maxLength?: number
}) {
  const [f, setF] = useState(false)
  return (
    <input
      autoFocus
      type={inputMode === "email" ? "email" : "text"}
      inputMode={inputMode}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          onEnter()
        }
      }}
      onFocus={() => setF(true)}
      onBlur={() => setF(false)}
      style={{
        width: "100%",
        boxSizing: "border-box",
        height: 40,
        padding: "0 12px",
        border: `1px solid ${T.border}`,
        borderRadius: T.rMd,
        fontSize: mono ? 18 : 13,
        letterSpacing: mono ? "6px" : "normal",
        fontFamily: mono ? T.mono : "inherit",
        color: T.ink,
        background: T.surface,
        outline: "none",
        ...(f ? { borderColor: T.accent, boxShadow: focusRing } : null),
      }}
    />
  )
}

function PlanRow({ plan, onPick, busy, strike }: { plan: AccountPlan; onPick: () => void; busy: boolean; strike?: number | null }) {
  const base = plan.slug.split("-")[0] ?? plan.slug
  const sites = sitesFor(plan.slug)
  const per = plan.type === "lifetime" ? "once" : plan.interval === "year" ? "/yr" : "/mo"
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={busy}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        textAlign: "left",
        padding: "11px 13px",
        borderRadius: T.rLg,
        border: `1px solid ${plan.highlighted ? T.accent : T.border}`,
        background: plan.highlighted ? T.accentSoft : T.surface,
        cursor: busy ? "wait" : "pointer",
        fontFamily: "inherit",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{plan.name.replace(/\s*\((monthly|yearly)\)/i, "")}</span>
          {plan.badge ? (
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".04em", color: T.accentText, background: T.surface, border: `1px solid ${T.accentBorder}`, padding: "1px 6px", borderRadius: T.rPill }}>
              {plan.badge.toUpperCase()}
            </span>
          ) : null}
        </div>
        <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>
          {TAGLINE[base] ?? ""}
          {sites !== null ? ` · ${sites} live ${sites === 1 ? "site" : "sites"}` : ""}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        {strike ? <div style={{ fontSize: 10.5, color: T.ink4, textDecoration: "line-through" }}>{formatPrice(strike, plan.currency)}</div> : null}
        <span style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{formatPrice(plan.priceInCents, plan.currency)}</span>
        <span style={{ fontSize: 11, color: T.ink3 }}> {per}</span>
      </div>
      <Icon name="chevron_right" size={18} color={T.ink4} />
    </button>
  )
}

export function UpgradeSheet() {
  const a = useAccount()
  const host = useHost()
  const [plans, setPlans] = useState<PlansResponse | null>(null)
  const [yearly, setYearly] = useState(true)
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [pending, setPending] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slow, setSlow] = useState(false)

  const open = !!a?.upgrade.open
  const stage = a?.upgrade.stage ?? "plans"

  // Fresh state each time the sheet opens; (re)load plans until they arrive.
  useEffect(() => {
    if (!open) return
    setError(null)
    setPending(null)
  }, [open])
  useEffect(() => {
    if (!open || !a || plans) return
    a.client
      .plans()
      .then((p) => {
        setPlans(p)
        setError(null)
      })
      .catch((e: unknown) => setError(errText(e)))
  }, [open, a, plans])

  useEffect(() => {
    setError(null)
    setSlow(false)
    if (stage !== "waiting") return
    const t = setTimeout(() => setSlow(true), 90_000)
    return () => clearTimeout(t)
  }, [stage])

  if (!a || !open) return null
  const { status, liveDomain } = a

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const pick = (slug: string) =>
    run(async () => {
      if (!a.signedIn) {
        setPending(slug)
        a.setStage("email")
        return
      }
      await a.checkout(slug)
    })

  const sendCode = () =>
    run(async () => {
      if (!email.trim()) throw new AccountApiError("INVALID_EMAIL", "Enter your email address.")
      await a.startEmail(email.trim())
      setCode("")
      a.setStage("code")
    })

  const verify = () =>
    run(async () => {
      const s = await a.verifyEmail(email.trim(), code)
      if (s.plan.paid) {
        // An existing customer: the provider activates their key on this site.
        a.setStage("done")
        return
      }
      if (pending) {
        const slug = pending
        setPending(null)
        await a.checkout(slug)
        return
      }
      a.setStage("plans")
    })

  const all = plans?.plans ?? []
  const shown = all.filter((p) => p.type === "lifetime" || (yearly ? p.interval === "year" : p.interval === "month"))
  const offer = plans?.offer?.active ? plans.offer : null
  const title =
    stage === "done"
      ? "You're live"
      : stage === "email" || stage === "code"
        ? pending
          ? "Sign in to check out"
          : "Sign in to Consentful"
        : liveDomain
          ? `Go live on ${liveDomain}`
          : "Upgrade Consentful"

  return (
    <Backdrop z={60} onClose={a.closeUpgrade}>
      <Dialog width={440}>
        <ModalHeader title={title} onClose={a.closeUpgrade} />
        <div style={{ padding: "16px 18px 18px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {stage === "plans" ? (
            <>
              <div style={{ fontSize: 12, color: T.ink3, lineHeight: 1.55 }}>
                {liveDomain ? (
                  <>
                    Free runs on {host.platformAddress ? <code>{host.platformAddress}</code> : "preview"} and staging addresses. On{" "}
                    <strong style={{ color: T.ink }}>{liveDomain}</strong> the banner stays hidden (trackers stay blocked) until you pick a plan.
                    Every plan also unlocks the full design and all Pro features.
                  </>
                ) : (
                  <>Every paid plan unlocks your live domain, the full design, your own wording and languages, geo-targeting and consent analytics. Plans differ only by site count.</>
                )}
              </div>

              {offer ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void pick(offer.planSlug)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: T.rLg, border: "none", background: "linear-gradient(150deg,#6a3cf0,#4b23d3)", color: "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                >
                  <Icon name="local_fire_department" size={22} color="#fff" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{offer.label}</div>
                    <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                      3 live sites, pay once · {offer.seatsLeft} of {offer.seatsTotal} left
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {plans?.regularLifetimeInCents ? <div style={{ fontSize: 10.5, opacity: 0.75, textDecoration: "line-through" }}>{formatPrice(plans.regularLifetimeInCents)}</div> : null}
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{formatPrice(offer.priceInCents)}</div>
                  </div>
                </button>
              ) : null}

              <div style={{ display: "flex", gap: 6, alignSelf: "flex-start", background: T.sunken, padding: 3, borderRadius: T.rPill }}>
                {[
                  ["Yearly", true],
                  ["Monthly", false],
                ].map(([label, y]) => (
                  <button
                    key={String(label)}
                    type="button"
                    onClick={() => setYearly(y as boolean)}
                    style={{ border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, padding: "5px 12px", borderRadius: T.rPill, background: yearly === y ? T.surface : "transparent", color: yearly === y ? T.ink : T.ink3, boxShadow: yearly === y ? "0 1px 2px rgba(16,24,40,.08)" : "none" }}
                  >
                    {String(label)}
                    {y ? " · 2 months free" : ""}
                  </button>
                ))}
              </div>

              {!plans && !error ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 18 }}>
                  <Spinner />
                </div>
              ) : null}
              {shown.map((p) => (
                <PlanRow key={p.slug} plan={p} busy={busy} onPick={() => void pick(p.slug)} />
              ))}

              <div style={{ fontSize: 11, color: T.ink4, lineHeight: 1.5 }}>
                Secure checkout by Dodo Payments opens in a new tab. Prices may be shown in your local currency. This plugin unlocks on its own once you've paid.
              </div>
            </>
          ) : null}

          {stage === "email" ? (
            <>
              <div style={{ fontSize: 12, color: T.ink3, lineHeight: 1.55 }}>
                {pending
                  ? "Your plan goes on your Consentful account, so you can use it on every site. We'll email you a 6-digit code, no password."
                  : "Already bought Consentful? Sign in with the email you paid with and your plan is applied to this site. No key to copy."}
              </div>
              <Field value={email} onChange={setEmail} placeholder="you@company.com" inputMode="email" onEnter={() => void sendCode()} />
              <Button variant="primary" full loading={busy} onClick={() => void sendCode()}>
                Email me a code
              </Button>
            </>
          ) : null}

          {stage === "code" ? (
            <>
              <div style={{ fontSize: 12, color: T.ink3, lineHeight: 1.55 }}>
                Enter the 6-digit code we sent to <strong style={{ color: T.ink }}>{email}</strong>. It expires in 10 minutes.
              </div>
              <Field value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} placeholder="000000" mono inputMode="numeric" maxLength={6} onEnter={() => void verify()} />
              <Button variant="primary" full loading={busy} disabled={code.length !== 6} onClick={() => void verify()}>
                {pending ? "Verify and continue to checkout" : "Verify"}
              </Button>
              <button type="button" onClick={() => a.setStage("email")} style={{ border: "none", background: "transparent", color: T.accentText, fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0, alignSelf: "flex-start" }}>
                Use a different email or resend
              </button>
            </>
          ) : null}

          {stage === "waiting" ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "14px 4px", textAlign: "center" }}>
              <Spinner size={26} />
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Waiting for your payment…</div>
              <div style={{ fontSize: 12, color: T.ink3, lineHeight: 1.55, maxWidth: 340 }}>
                Finish paying in the checkout tab. Consentful unlocks here on its own{liveDomain ? ` and activates ${liveDomain}` : ""}. You can keep this open.
              </div>
              {slow ? (
                <div style={{ fontSize: 11.5, color: T.warn, lineHeight: 1.5 }}>
                  Still waiting. If you've paid, click Check now. A receipt email means it went through.
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="secondary" onClick={() => a.setStage("plans")}>Back to plans</Button>
                <Button
                  variant="primary"
                  loading={busy}
                  onClick={() =>
                    void run(async () => {
                      const s = await a.refresh()
                      if (s?.plan.paid) a.setStage("done")
                      else setError("No payment yet. It can take a minute after you pay.")
                    })
                  }
                >
                  Check now
                </Button>
              </div>
            </div>
          ) : null}

          {stage === "done" ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "10px 4px", textAlign: "center" }}>
              <Icon name="verified" size={36} color={T.success} />
              <div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{status?.plan.name ?? "Your plan"} is active</div>
              <div style={{ fontSize: 12, color: T.ink3, lineHeight: 1.55, maxWidth: 340 }}>
                {liveDomain
                  ? `We're activating ${liveDomain} now. Update the banner on the Publish tab, then publish your site so the full banner goes live.`
                  : "Your Pro controls are unlocked on this site. Your key is saved on your account, so other sites only need a sign-in."}
              </div>
              <Button variant="primary" onClick={a.closeUpgrade}>Done</Button>
            </div>
          ) : null}

          {error ? <div style={{ fontSize: 11.5, color: T.danger, fontWeight: 600, lineHeight: 1.5 }}>{error}</div> : null}

          {stage === "plans" ? (
            <div style={{ borderTop: `1px solid ${T.hairline}`, paddingTop: 10, fontSize: 11.5, color: T.ink3 }}>
              {a.signedIn ? (
                <>Signed in as {status?.account?.email}</>
              ) : (
                <>
                  Already a customer?{" "}
                  <button type="button" onClick={() => { setPending(null); a.setStage("email") }} style={{ border: "none", background: "transparent", color: T.accentText, fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 11.5 }}>
                    Sign in
                  </button>{" "}
                  to apply your plan here.
                </>
              )}
            </div>
          ) : null}
        </div>
      </Dialog>
    </Backdrop>
  )
}

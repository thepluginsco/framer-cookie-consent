/**
 * The Webflow Designer Extension UI (Phase 3.2 App shell, browser half).
 *
 * A framework-free authoring panel that runs inside the Webflow Designer: author
 * the banner, preview the real runtime, then Publish it to the current site via
 * the Data Client Worker (which holds the OAuth token). All config logic lives in
 * {@link configFromForm} (pure + tested); this file is only DOM wiring + calling
 * {@link WebflowDataClient}.
 */

import { buildEmbedSnippet } from "@framer-cookie-consent/shared";
import { WebflowDataClient } from "./data-client.js";
import {
  configFromForm,
  defaultFormState,
  OPTIONAL_CATEGORY_IDS,
  type OptionalCategoryId,
  type ScriptFormState,
  type WebflowFormState,
} from "./config-form.js";
import { buildPreviewDocument } from "./preview.js";
import { currentSiteId, inDesigner } from "./webflow-host.js";

/* Worker base URL is baked at build time; falls back to a placeholder for dev. */
const WORKER_BASE =
  (import.meta.env?.VITE_WORKER_BASE as string | undefined) ??
  "https://consentful-webflow.example.workers.dev";

/* -------------------------------------------------------------------------- */
/* DOM helpers                                                                */
/* -------------------------------------------------------------------------- */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Partial<Record<string, string>> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, v);
  for (const c of children) node.append(c);
  return node;
}

function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const kids: (Node | string)[] = [el("span", { class: "cc-label" }, [label]), control];
  if (hint) kids.push(el("span", { class: "cc-hint" }, [hint]));
  return el("label", { class: "cc-field" }, kids);
}

function textInput(value: string, onInput: (v: string) => void, type = "text"): HTMLInputElement {
  const input = el("input", { class: "cc-input", type });
  input.value = value;
  input.addEventListener("input", () => onInput(input.value));
  return input;
}

function textarea(value: string, onInput: (v: string) => void, rows = 3): HTMLTextAreaElement {
  const ta = el("textarea", { class: "cc-input", rows: String(rows) });
  ta.value = value;
  ta.addEventListener("input", () => onInput(ta.value));
  return ta;
}

function select<T extends string>(
  value: T,
  options: readonly { value: T; label: string }[],
  onChange: (v: T) => void,
): HTMLSelectElement {
  const sel = el("select", { class: "cc-input" });
  for (const opt of options) {
    const o = el("option", { value: opt.value }, [opt.label]);
    if (opt.value === value) o.setAttribute("selected", "selected");
    sel.append(o);
  }
  sel.value = value;
  sel.addEventListener("change", () => onChange(sel.value as T));
  return sel;
}

function checkbox(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const box = el("input", { class: "cc-checkbox", type: "checkbox" }) as HTMLInputElement;
  box.checked = checked;
  box.addEventListener("change", () => onChange(box.checked));
  return el("label", { class: "cc-toggle" }, [box, el("span", {}, [label])]);
}

function section(title: string, body: HTMLElement): HTMLElement {
  return el("section", { class: "cc-section" }, [
    el("h2", { class: "cc-section__title" }, [title]),
    body,
  ]);
}

/* -------------------------------------------------------------------------- */
/* App                                                                        */
/* -------------------------------------------------------------------------- */

export function mountApp(root: HTMLElement): void {
  const state = defaultFormState();
  const client = new WebflowDataClient({ workerBase: WORKER_BASE });

  let siteId = "";
  let connected = false;

  const statusPill = el("span", { class: "cc-pill" }, ["Checking…"]);
  const siteInput = el("input", { class: "cc-input", type: "text", placeholder: "Webflow site id" }) as HTMLInputElement;
  const connectBtn = el("button", { class: "cc-btn", type: "button" }, ["Connect Webflow"]) as HTMLButtonElement;
  const installBtn = el("button", { class: "cc-btn cc-btn--primary", type: "button" }, ["Publish banner"]) as HTMLButtonElement;
  const removeBtn = el("button", { class: "cc-btn", type: "button" }, ["Remove"]) as HTMLButtonElement;
  const resultLine = el("p", { class: "cc-result" }, []);
  const previewFrame = el("iframe", { class: "cc-preview", title: "Banner preview" }) as HTMLIFrameElement;

  function setStatus(text: string, ok: boolean): void {
    statusPill.textContent = text;
    statusPill.className = `cc-pill ${ok ? "cc-pill--ok" : "cc-pill--warn"}`;
    installBtn.disabled = !ok || !siteId;
    removeBtn.disabled = !ok || !siteId;
  }

  async function refreshConnection(): Promise<void> {
    if (!siteId) {
      setStatus("No site selected", false);
      return;
    }
    try {
      connected = await client.isConnected(siteId);
      setStatus(connected ? "Connected" : "Not connected", connected);
    } catch {
      setStatus("Worker unreachable", false);
    }
  }

  function refreshPreview(): void {
    previewFrame.srcdoc = buildPreviewDocument(configFromForm(state));
  }

  connectBtn.addEventListener("click", () => {
    if (!siteId) siteId = siteInput.value.trim();
    if (!siteId) {
      resultLine.textContent = "Enter a site id first.";
      return;
    }
    client.connect(siteId);
    resultLine.textContent = "Complete the Webflow authorization, then re-check the connection.";
  });

  siteInput.addEventListener("input", () => {
    siteId = siteInput.value.trim();
    void refreshConnection();
  });

  installBtn.addEventListener("click", async () => {
    await run(installBtn, async () => {
      const r = await client.install(siteId, configFromForm(state));
      return r.changed
        ? `Published${r.published ? " + site published" : ""}.`
        : "No change — the banner was already up to date.";
    });
  });

  removeBtn.addEventListener("click", async () => {
    await run(removeBtn, async () => {
      const r = await client.remove(siteId);
      return r.changed ? "Banner removed." : "Nothing to remove.";
    });
  });

  async function run(btn: HTMLButtonElement, action: () => Promise<string>): Promise<void> {
    const original = btn.textContent ?? "";
    btn.disabled = true;
    btn.textContent = "Working…";
    try {
      resultLine.textContent = await action();
    } catch (err) {
      resultLine.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      btn.textContent = original;
      btn.disabled = false;
    }
  }

  const refresh = () => refreshPreview();

  root.append(
    buildHeader(),
    buildConnectionBar(statusPill, siteInput, connectBtn),
    el("div", { class: "cc-layout" }, [
      buildForm(state, refresh),
      el("div", { class: "cc-output" }, [
        el("div", { class: "cc-output__bar" }, [el("span", {}, ["Live preview"])]),
        previewFrame,
        el("div", { class: "cc-actions" }, [installBtn, removeBtn]),
        resultLine,
      ]),
    ]),
  );

  // Resolve the site from the Designer host when present; else expose the manual input.
  void (async () => {
    const hostSite = await currentSiteId();
    if (hostSite) {
      siteId = hostSite;
      siteInput.value = hostSite;
      siteInput.parentElement?.setAttribute("hidden", "hidden");
    }
    await refreshConnection();
  })();

  refreshPreview();
}

function buildHeader(): HTMLElement {
  return el("header", { class: "cc-header" }, [
    el("div", { class: "cc-header__brand" }, [
      el("span", { class: "cc-header__mark" }, ["◗"]),
      el("span", { class: "cc-header__name" }, ["Consentful for Webflow"]),
    ]),
    el("p", { class: "cc-header__tagline" }, [
      inDesigner()
        ? "Author your consent banner and publish it to this Webflow site."
        : "Preview mode — open inside the Webflow Designer to publish to a site.",
    ]),
  ]);
}

function buildConnectionBar(
  pill: HTMLElement,
  siteInput: HTMLInputElement,
  connectBtn: HTMLButtonElement,
): HTMLElement {
  return el("div", { class: "cc-connbar" }, [
    el("div", { class: "cc-connbar__status" }, ["Status: ", pill]),
    field("Site id", siteInput, "Auto-filled inside the Designer"),
    connectBtn,
  ]);
}

function buildForm(state: WebflowFormState, refresh: () => void): HTMLElement {
  const form = el("div", { class: "cc-form" });

  form.append(
    section(
      "Content",
      el("div", { class: "cc-grid" }, [
        field("Title", textInput(state.title, (v) => { state.title = v; refresh(); })),
        field("Message", textarea(state.message, (v) => { state.message = v; refresh(); })),
        field("Accept button", textInput(state.acceptAll, (v) => { state.acceptAll = v; refresh(); })),
        field("Reject button", textInput(state.rejectAll, (v) => { state.rejectAll = v; refresh(); })),
        field("Manage button", textInput(state.customize, (v) => { state.customize = v; refresh(); })),
        field("Save button", textInput(state.savePreferences, (v) => { state.savePreferences = v; refresh(); })),
        field("Privacy link label", textInput(state.privacyPolicyLabel, (v) => { state.privacyPolicyLabel = v; refresh(); })),
        field("Privacy policy URL", textInput(state.privacyPolicyUrl, (v) => { state.privacyPolicyUrl = v; refresh(); }, "url")),
      ]),
    ),
  );

  const catBody = el("div", { class: "cc-cats" }, [
    el("p", { class: "cc-hint" }, ["Strictly necessary is always included and always on."]),
  ]);
  const CAT_LABELS: Record<OptionalCategoryId, string> = {
    analytics: "Analytics",
    marketing: "Marketing",
    preferences: "Preferences",
  };
  for (const id of OPTIONAL_CATEGORY_IDS) {
    const cat = state.categories[id];
    catBody.append(
      el("div", { class: "cc-cat-row" }, [
        checkbox(CAT_LABELS[id], cat.enabled, (v) => { cat.enabled = v; refresh(); }),
        checkbox("On by default", cat.defaultOn, (v) => { cat.defaultOn = v; refresh(); }),
      ]),
    );
  }
  form.append(section("Categories", catBody));

  form.append(
    section(
      "Appearance",
      el("div", { class: "cc-grid" }, [
        field("Layout", select(state.layout, [
          { value: "card", label: "Card" },
          { value: "bar", label: "Bar" },
          { value: "modal", label: "Modal" },
        ], (v) => { state.layout = v; refresh(); })),
        field("Theme", select(state.themeMode, [
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
          { value: "auto", label: "Auto (system)" },
        ], (v) => { state.themeMode = v; refresh(); })),
        field("Accent colour", textInput(state.accent, (v) => { state.accent = v; refresh(); })),
      ]),
    ),
  );

  form.append(
    section(
      "Behavior",
      el("div", { class: "cc-grid" }, [
        field("Show banner to", select(state.showMode, [
          { value: "everywhere", label: "Everyone" },
          { value: "eu-only", label: "EU / EEA visitors only" },
        ], (v) => { state.showMode = v; refresh(); })),
        field("Consent model", select(state.consentModel, [
          { value: "opt-in", label: "Opt-in (GDPR)" },
          { value: "opt-out", label: "Opt-out (CCPA)" },
          { value: "auto", label: "Auto (by region)" },
        ], (v) => { state.consentModel = v; refresh(); })),
        el("div", { class: "cc-toggles" }, [
          checkbox("Respect Global Privacy Control (GPC)", state.respectGpc, (v) => { state.respectGpc = v; refresh(); }),
          checkbox("Enable Google Consent Mode v2", state.enableConsentMode, (v) => { state.enableConsentMode = v; refresh(); }),
        ]),
      ]),
    ),
  );

  form.append(section("Gated scripts", buildScriptsEditor(state, refresh)));
  return form;
}

function buildScriptsEditor(state: WebflowFormState, refresh: () => void): HTMLElement {
  const wrap = el("div", { class: "cc-scripts" });
  const list = el("div", { class: "cc-scripts__list" });

  function categoryOptions(): { value: string; label: string }[] {
    return (["analytics", "marketing", "preferences"] as OptionalCategoryId[])
      .filter((id) => state.categories[id]?.enabled)
      .map((id) => ({ value: id, label: id[0]!.toUpperCase() + id.slice(1) }));
  }

  function renderList(): void {
    list.replaceChildren();
    if (state.scripts.length === 0) {
      list.append(el("p", { class: "cc-hint" }, ["No gated scripts yet."]));
    }
    state.scripts.forEach((script, index) => {
      list.append(buildScriptRow(script, index, state, categoryOptions(), () => { renderList(); refresh(); }));
    });
  }

  const addBtn = el("button", { class: "cc-btn", type: "button" }, ["+ Add script"]) as HTMLButtonElement;
  addBtn.addEventListener("click", () => {
    const first = categoryOptions()[0];
    state.scripts.push({ name: "", category: first ? first.value : "analytics", type: "src", value: "" });
    renderList();
    refresh();
  });

  wrap.append(list, addBtn);
  renderList();
  return wrap;
}

function buildScriptRow(
  script: ScriptFormState,
  index: number,
  state: WebflowFormState,
  cats: { value: string; label: string }[],
  onChange: () => void,
): HTMLElement {
  const remove = el("button", { class: "cc-btn cc-btn--icon", type: "button", title: "Remove" }, ["✕"]) as HTMLButtonElement;
  remove.addEventListener("click", () => { state.scripts.splice(index, 1); onChange(); });

  const categorySelect = cats.length > 0
    ? select(script.category, cats, (v) => { script.category = v; onChange(); })
    : el("select", { class: "cc-input", disabled: "disabled" }, [el("option", {}, ["(enable a category)"])]);

  return el("div", { class: "cc-script-row" }, [
    el("div", { class: "cc-script-row__head" }, [
      textInput(script.name, (v) => { script.name = v; onChange(); }),
      remove,
    ]),
    el("div", { class: "cc-grid cc-grid--tight" }, [
      field("Category", categorySelect),
      field("Type", select(script.type, [
        { value: "src", label: "External URL (src)" },
        { value: "inline", label: "Inline code" },
      ], (v) => { script.type = v; onChange(); })),
    ]),
    field(
      script.type === "src" ? "Script URL" : "Inline code",
      script.type === "src"
        ? textInput(script.value, (v) => { script.value = v; onChange(); }, "url")
        : textarea(script.value, (v) => { script.value = v; onChange(); }, 3),
    ),
  ]);
}

/** Exposed for a possible "copy embed instead" affordance / tests. */
export function currentSnippet(state: WebflowFormState): string {
  return buildEmbedSnippet(configFromForm(state));
}

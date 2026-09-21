/**
 * The hosted embed config page UI (Phase 3.1 App shell).
 *
 * A static, framework-free authoring tool: the user fills in the form, sees a
 * live preview of the real runtime, and copies the `<script>` snippet to paste
 * into their own site `<head>`. Zero infra — this whole app is static files.
 *
 * All config logic lives in {@link configFromForm} (pure + tested); this file is
 * only DOM wiring: build controls, mutate {@link EmbedFormState}, and re-render
 * the snippet + preview whenever anything changes.
 */

import type { EmbedForm } from "@framer-cookie-consent/shared";
import { buildEmbedSnippet, runtimeScriptUrl } from "@framer-cookie-consent/shared";
import type {
  EmbedFormState,
  OptionalCategoryId,
  ScriptFormState,
} from "./config-from-form.js";
import {
  configFromForm,
  defaultFormState,
  OPTIONAL_CATEGORY_IDS,
} from "./config-from-form.js";
import { buildPreviewDocument } from "./preview.js";

/* -------------------------------------------------------------------------- */
/* Small DOM helpers                                                          */
/* -------------------------------------------------------------------------- */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Partial<Record<string, string>> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined) node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

/** A labelled field wrapper. */
function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const children: (Node | string)[] = [el("span", { class: "cc-label" }, [label]), control];
  if (hint) children.push(el("span", { class: "cc-hint" }, [hint]));
  return el("label", { class: "cc-field" }, children);
}

function textInput(value: string, onInput: (v: string) => void, type = "text"): HTMLInputElement {
  const input = el("input", { class: "cc-input", type, value });
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

function numberInput(
  value: number,
  onInput: (v: number) => void,
  min?: number,
  max?: number,
): HTMLInputElement {
  const attrs: Record<string, string> = { class: "cc-input", type: "number", value: String(value) };
  if (min !== undefined) attrs.min = String(min);
  if (max !== undefined) attrs.max = String(max);
  const input = el("input", attrs);
  input.value = String(value);
  input.addEventListener("input", () => {
    const n = Number(input.value);
    if (Number.isFinite(n)) onInput(n);
  });
  return input;
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
  return el("section", { class: "cc-section" }, [el("h2", { class: "cc-section__title" }, [title]), body]);
}

/* -------------------------------------------------------------------------- */
/* App                                                                        */
/* -------------------------------------------------------------------------- */

/** Mount the whole authoring app into `root`. */
export function mountApp(root: HTMLElement): void {
  const state = defaultFormState();
  let embedForm: EmbedForm = "window";

  // Output + preview nodes are created once and updated in place.
  const snippetOut = el("textarea", { class: "cc-snippet", readonly: "readonly", spellcheck: "false" }) as HTMLTextAreaElement;
  const previewFrame = el("iframe", { class: "cc-preview", title: "Banner preview" }) as HTMLIFrameElement;
  const copyBtn = el("button", { class: "cc-btn cc-btn--primary", type: "button" }, ["Copy snippet"]) as HTMLButtonElement;
  const downloadBtn = el("button", { class: "cc-btn", type: "button" }, ["Download .html"]) as HTMLButtonElement;

  function currentSnippet(): string {
    return buildEmbedSnippet(configFromForm(state), { form: embedForm });
  }

  function refresh(): void {
    snippetOut.value = currentSnippet();
    previewFrame.srcdoc = buildPreviewDocument(configFromForm(state));
  }

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(snippetOut.value);
      flash(copyBtn, "Copied ✓");
    } catch {
      snippetOut.select();
      flash(copyBtn, "Press ⌘/Ctrl+C");
    }
  });

  downloadBtn.addEventListener("click", () => {
    const blob = new Blob([snippetOut.value], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: "consentful-embed.html" });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  root.append(buildHeader(), buildLayout(buildForm(state, refresh, (f) => { embedForm = f; refresh(); }, () => embedForm), {
    snippetOut,
    previewFrame,
    copyBtn,
    downloadBtn,
    runtimeNote: runtimeScriptUrl(),
  }));

  refresh();
}

/** Briefly swap a button's label to signal an action, then restore it. */
function flash(btn: HTMLButtonElement, text: string): void {
  const original = btn.textContent ?? "";
  btn.textContent = text;
  btn.disabled = true;
  window.setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
  }, 1400);
}

function buildHeader(): HTMLElement {
  return el("header", { class: "cc-header" }, [
    el("div", { class: "cc-header__brand" }, [
      el("span", { class: "cc-header__mark" }, ["◗"]),
      el("span", { class: "cc-header__name" }, ["Consentful"]),
    ]),
    el("p", { class: "cc-header__tagline" }, [
      "Build your cookie-consent banner, then paste one snippet into your site ",
      el("code", {}, ["<head>"]),
      ". Works on Wix, Squarespace, Ghost, Carrd, or any hand-coded site.",
    ]),
  ]);
}

function buildLayout(
  formCol: HTMLElement,
  out: {
    snippetOut: HTMLTextAreaElement;
    previewFrame: HTMLIFrameElement;
    copyBtn: HTMLButtonElement;
    downloadBtn: HTMLButtonElement;
    runtimeNote: string;
  },
): HTMLElement {
  const outputCol = el("div", { class: "cc-output" }, [
    el("div", { class: "cc-output__preview-wrap" }, [
      el("div", { class: "cc-output__bar" }, [el("span", {}, ["Live preview"])]),
      out.previewFrame,
    ]),
    el("div", { class: "cc-output__snippet-wrap" }, [
      el("div", { class: "cc-output__bar" }, [
        el("span", {}, ["Embed snippet"]),
        el("div", { class: "cc-output__actions" }, [out.copyBtn, out.downloadBtn]),
      ]),
      out.snippetOut,
      el("p", { class: "cc-output__note" }, [
        "Loads the version-pinned runtime from ",
        el("code", {}, [out.runtimeNote]),
        ". Re-copy after any edit to update your live banner.",
      ]),
    ]),
  ]);
  return el("div", { class: "cc-layout" }, [formCol, outputCol]);
}

function buildForm(
  state: EmbedFormState,
  refresh: () => void,
  setEmbedForm: (f: EmbedForm) => void,
  getEmbedForm: () => EmbedForm,
): HTMLElement {
  const form = el("div", { class: "cc-form" });

  /* Content ----------------------------------------------------------------- */
  const content = el("div", { class: "cc-grid" }, [
    field("Title", textInput(state.title, (v) => { state.title = v; refresh(); })),
    field("Message", textarea(state.message, (v) => { state.message = v; refresh(); })),
    field("Accept button", textInput(state.acceptAll, (v) => { state.acceptAll = v; refresh(); })),
    field("Reject button", textInput(state.rejectAll, (v) => { state.rejectAll = v; refresh(); })),
    field("Manage button", textInput(state.customize, (v) => { state.customize = v; refresh(); })),
    field("Save button", textInput(state.savePreferences, (v) => { state.savePreferences = v; refresh(); })),
    field("Privacy link label", textInput(state.privacyPolicyLabel, (v) => { state.privacyPolicyLabel = v; refresh(); })),
    field("Privacy policy URL", textInput(state.privacyPolicyUrl, (v) => { state.privacyPolicyUrl = v; refresh(); }, "url")),
  ]);
  form.append(section("Content", content));

  /* Categories -------------------------------------------------------------- */
  const catBody = el("div", { class: "cc-cats" });
  catBody.append(el("p", { class: "cc-hint" }, ["Strictly necessary is always included and always on."]));
  const CAT_LABELS: Record<OptionalCategoryId, string> = {
    analytics: "Analytics",
    marketing: "Marketing",
    preferences: "Preferences",
  };
  for (const id of OPTIONAL_CATEGORY_IDS) {
    const row = el("div", { class: "cc-cat-row" });
    const cat = state.categories[id];
    row.append(
      checkbox(CAT_LABELS[id], cat.enabled, (v) => { cat.enabled = v; refresh(); }),
      checkbox("On by default", cat.defaultOn, (v) => { cat.defaultOn = v; refresh(); }),
    );
    catBody.append(row);
  }
  form.append(section("Categories", catBody));

  /* Appearance -------------------------------------------------------------- */
  const appearance = el("div", { class: "cc-grid" }, [
    field("Layout", select(state.layout, [
      { value: "card", label: "Card" },
      { value: "bar", label: "Bar" },
      { value: "modal", label: "Modal" },
    ], (v) => { state.layout = v; refresh(); })),
    field("Position", select(state.position, [
      { value: "bottom-left", label: "Bottom left" },
      { value: "bottom-right", label: "Bottom right" },
      { value: "bottom-center", label: "Bottom center" },
      { value: "center", label: "Center" },
    ], (v) => { state.position = v; refresh(); }), "Card layout only"),
    field("Theme", select(state.themeMode, [
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
      { value: "auto", label: "Auto (system)" },
    ], (v) => { state.themeMode = v; refresh(); })),
    field("Accent colour", textInput(state.accent, (v) => { state.accent = v; refresh(); }, "text")),
    field("Corner radius (px)", numberInput(state.borderRadius, (v) => { state.borderRadius = v; refresh(); }, 0, 40)),
    field("Font family", textInput(state.fontFamily, (v) => { state.fontFamily = v; refresh(); }), "'inherit' adopts your site font"),
  ]);
  const ctaRow = el("div", { class: "cc-toggles" }, [
    checkbox("Show reject button", state.showRejectButton, (v) => { state.showRejectButton = v; refresh(); }),
    checkbox("Show manage-preferences button", state.showPreferencesButton, (v) => { state.showPreferencesButton = v; refresh(); }),
    checkbox("Dim page behind banner (overlay)", state.overlay, (v) => { state.overlay = v; refresh(); }),
  ]);
  appearance.append(ctaRow);
  form.append(section("Appearance", appearance));

  /* Behavior ---------------------------------------------------------------- */
  const behavior = el("div", { class: "cc-grid" }, [
    field("Show banner to", select(state.showMode, [
      { value: "everywhere", label: "Everyone" },
      { value: "eu-only", label: "EU / EEA visitors only" },
    ], (v) => { state.showMode = v; refresh(); })),
    field("Consent model", select(state.consentModel, [
      { value: "opt-in", label: "Opt-in (GDPR)" },
      { value: "opt-out", label: "Opt-out (CCPA)" },
      { value: "auto", label: "Auto (by region)" },
    ], (v) => { state.consentModel = v; refresh(); })),
  ]);
  const behToggles = el("div", { class: "cc-toggles" }, [
    checkbox("Respect Do Not Track", state.respectDoNotTrack, (v) => { state.respectDoNotTrack = v; refresh(); }),
    checkbox("Respect Global Privacy Control (GPC)", state.respectGpc, (v) => { state.respectGpc = v; refresh(); }),
    checkbox("Hide banner after a choice", state.hideAfterChoice, (v) => { state.hideAfterChoice = v; refresh(); }),
    checkbox("Show floating 'cookie settings' button", state.floatingButton, (v) => { state.floatingButton = v; refresh(); }),
    checkbox("Enable Google Consent Mode v2", state.enableConsentMode, (v) => { state.enableConsentMode = v; refresh(); }),
  ]);
  behavior.append(behToggles);
  form.append(section("Behavior", behavior));

  /* Scripts ----------------------------------------------------------------- */
  form.append(section("Gated scripts", buildScriptsEditor(state, refresh)));

  /* Snippet form ------------------------------------------------------------ */
  const formToggle = el("div", { class: "cc-grid" }, [
    field("Snippet shape", select<EmbedForm>(getEmbedForm(), [
      { value: "window", label: "window.__CC_CONFIG__ (recommended)" },
      { value: "attribute", label: "data-cc-config attribute (single tag)" },
    ], (v) => setEmbedForm(v)), "Use the attribute form on hosts that allow only one tag or forbid inline scripts."),
  ]);
  form.append(section("Snippet options", formToggle));

  return form;
}

function buildScriptsEditor(state: EmbedFormState, refresh: () => void): HTMLElement {
  const wrap = el("div", { class: "cc-scripts" });
  const list = el("div", { class: "cc-scripts__list" });

  function categoryOptions(): { value: string; label: string }[] {
    const ids: string[] = ["analytics", "marketing", "preferences"];
    return ids
      .filter((id) => state.categories[id as OptionalCategoryId]?.enabled)
      .map((id) => ({ value: id, label: id[0]!.toUpperCase() + id.slice(1) }));
  }

  function renderList(): void {
    list.replaceChildren();
    if (state.scripts.length === 0) {
      list.append(el("p", { class: "cc-hint" }, ["No gated scripts yet. Add tags here to hold them back until the matching consent is given."]));
    }
    state.scripts.forEach((script, index) => {
      list.append(buildScriptRow(script, index, state, categoryOptions(), () => { renderList(); refresh(); }));
    });
  }

  const addBtn = el("button", { class: "cc-btn", type: "button" }, ["+ Add script"]) as HTMLButtonElement;
  addBtn.addEventListener("click", () => {
    const cats = categoryOptions();
    const first = cats[0];
    const newScript: ScriptFormState = {
      name: "",
      category: first ? first.value : "analytics",
      type: "src",
      value: "",
    };
    state.scripts.push(newScript);
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
  state: EmbedFormState,
  cats: { value: string; label: string }[],
  onChange: () => void,
): HTMLElement {
  const remove = el("button", { class: "cc-btn cc-btn--icon", type: "button", title: "Remove" }, ["✕"]) as HTMLButtonElement;
  remove.addEventListener("click", () => {
    state.scripts.splice(index, 1);
    onChange();
  });

  const categorySelect = cats.length > 0
    ? select(script.category, cats, (v) => { script.category = v; onChange(); })
    : (() => {
        const disabled = el("select", { class: "cc-input", disabled: "disabled" }, [el("option", {}, ["(enable a category)"])]);
        return disabled;
      })();

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

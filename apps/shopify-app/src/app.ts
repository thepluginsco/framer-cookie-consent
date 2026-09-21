/**
 * The Shopify authoring UI (Phase 3.4 App shell, browser half).
 *
 * A framework-free authoring page: author the banner, preview the real runtime,
 * then copy or download the generated `blocks/consentful.liquid` app-embed block
 * to drop into the theme app extension and deploy with the Shopify CLI. Unlike
 * Webflow (a Worker writes the site live), Shopify bakes the config into a
 * deployable Liquid artifact, so this page's output IS the deliverable — the
 * analogue of the universal embed page.
 *
 * All config logic is pure + tested ({@link configFromForm},
 * {@link buildConsentfulBlock}); this file is only DOM wiring.
 */

import { buildConsentfulBlock } from "./extension.js";
import {
  configFromForm,
  defaultFormState,
  OPTIONAL_CATEGORY_IDS,
  type OptionalCategoryId,
  type ScriptFormState,
  type ShopifyFormState,
} from "./config-form.js";
import { buildPreviewDocument } from "./preview.js";
import { SHOPIFY_BLOCK_FILENAME } from "@framer-cookie-consent/shared";

/* Optional runtime URL override, baked at build time. */
const RUNTIME_URL = import.meta.env?.VITE_RUNTIME_URL as string | undefined;

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

  const previewFrame = el("iframe", { class: "cc-preview", title: "Banner preview" }) as HTMLIFrameElement;
  const codeArea = el("textarea", { class: "cc-code", readonly: "readonly", spellcheck: "false" }) as HTMLTextAreaElement;
  const copyBtn = el("button", { class: "cc-btn cc-btn--primary", type: "button" }, ["Copy block"]) as HTMLButtonElement;
  const downloadBtn = el("button", { class: "cc-btn", type: "button" }, ["Download .liquid"]) as HTMLButtonElement;
  const resultLine = el("p", { class: "cc-result" }, []);

  function blockLiquid(): string {
    return buildConsentfulBlock(
      configFromForm(state),
      RUNTIME_URL ? { runtimeUrl: RUNTIME_URL } : {},
    ).liquid;
  }

  function refresh(): void {
    previewFrame.srcdoc = buildPreviewDocument(configFromForm(state));
    codeArea.value = blockLiquid();
  }

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(blockLiquid());
      resultLine.textContent = "Copied. Paste it into your extension's blocks/consentful.liquid.";
    } catch {
      codeArea.select();
      resultLine.textContent = "Select-all + copy the block below.";
    }
  });

  downloadBtn.addEventListener("click", () => {
    const blob = new Blob([blockLiquid()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: "consentful.liquid" });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    resultLine.textContent = `Downloaded consentful.liquid → put it at ${SHOPIFY_BLOCK_FILENAME}.`;
  });

  root.append(
    buildHeader(),
    el("div", { class: "cc-layout" }, [
      buildForm(state, refresh),
      el("div", { class: "cc-output" }, [
        el("div", { class: "cc-output__bar" }, [el("span", {}, ["Live preview"])]),
        previewFrame,
        el("div", { class: "cc-output__bar cc-output__bar--code" }, [
          el("span", {}, [SHOPIFY_BLOCK_FILENAME]),
          el("div", { class: "cc-actions" }, [copyBtn, downloadBtn]),
        ]),
        codeArea,
        resultLine,
        buildDeployNote(),
      ]),
    ]),
  );

  refresh();
}

function buildHeader(): HTMLElement {
  return el("header", { class: "cc-header" }, [
    el("div", { class: "cc-header__brand" }, [
      el("span", { class: "cc-header__mark" }, ["◗"]),
      el("span", { class: "cc-header__name" }, ["Consentful for Shopify"]),
    ]),
    el("p", { class: "cc-header__tagline" }, [
      "Author your consent banner, then deploy it as a theme app embed. The bridge " +
        "relays each decision into Shopify's Customer Privacy API so checkout and Web " +
        "Pixels honour it.",
    ]),
  ]);
}

function buildDeployNote(): HTMLElement {
  return el("div", { class: "cc-note" }, [
    el("strong", {}, ["To deploy:"]),
    el("ol", {}, [
      el("li", {}, [`Put this block at ${SHOPIFY_BLOCK_FILENAME} in the theme app extension.`]),
      el("li", {}, ["Run ", el("code", {}, ["shopify app deploy"]), " to publish the extension."]),
      el("li", {}, ["In the store's theme editor → App embeds, turn on Consentful."]),
    ]),
  ]);
}

function buildForm(state: ShopifyFormState, refresh: () => void): HTMLElement {
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

function buildScriptsEditor(state: ShopifyFormState, refresh: () => void): HTMLElement {
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
  state: ShopifyFormState,
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

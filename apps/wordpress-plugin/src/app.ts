/**
 * The WordPress admin settings-screen UI (Phase 3.3 App shell).
 *
 * A framework-free authoring panel that runs inside wp-admin: the user fills in
 * the form, sees a live preview of the real runtime, optionally pre-fills gated
 * scripts from the site's active plugins, and Publishes — which writes the
 * byte-identical loader into the site's `wp_head` via the shared engine.
 *
 * All config logic lives in {@link configFromForm} (pure + tested); the REST HTTP
 * shapes live in {@link WordPressRestStore} (pure + tested). This file is only DOM
 * wiring: build controls, mutate {@link WordPressFormState}, refresh preview, and
 * call the shared `installWordPressLoader` / `removeWordPressLoader`.
 */

import {
  installWordPressLoader,
  removeWordPressLoader,
  runtimeScriptUrl,
} from "@framer-cookie-consent/shared";
import type {
  OptionalCategoryId,
  ScriptFormState,
  WordPressFormState,
} from "./config-form.js";
import {
  configFromForm,
  defaultFormState,
  mergeDetectedScripts,
  OPTIONAL_CATEGORY_IDS,
} from "./config-form.js";
import { buildPreviewDocument } from "./preview.js";
import { WordPressRestStore } from "./rest-store.js";

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

function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const children: (Node | string)[] = [el("span", { class: "cc-label" }, [label]), control];
  if (hint) children.push(el("span", { class: "cc-hint" }, [hint]));
  return el("label", { class: "cc-field" }, children);
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
  return el("section", { class: "cc-section" }, [el("h2", { class: "cc-section__title" }, [title]), body]);
}

/* -------------------------------------------------------------------------- */
/* App                                                                        */
/* -------------------------------------------------------------------------- */

/** Mount the whole admin authoring app into `root`. */
export function mountApp(root: HTMLElement): void {
  const state = defaultFormState();
  const boot = window.CONSENTFUL_WP;
  const runtimeUrl = boot?.runtimeUrl;
  const store = boot
    ? new WordPressRestStore({ restBase: boot.restBase, nonce: boot.nonce })
    : null;

  const previewFrame = el("iframe", { class: "cc-preview", title: "Banner preview" }) as HTMLIFrameElement;
  const publishBtn = el("button", { class: "cc-btn cc-btn--primary", type: "button" }, ["Publish to site"]) as HTMLButtonElement;
  const removeBtn = el("button", { class: "cc-btn", type: "button" }, ["Remove from site"]) as HTMLButtonElement;
  const statusLine = el("p", { class: "cc-status" }, [
    store ? "Ready. Publish writes the banner into your site's <head>." : "Preview only — open this screen inside WordPress to publish.",
  ]);

  if (!store) {
    publishBtn.disabled = true;
    removeBtn.disabled = true;
  }

  function refresh(): void {
    previewFrame.srcdoc = buildPreviewDocument(configFromForm(state), runtimeUrl ? { runtimeUrl } : {});
  }

  publishBtn.addEventListener("click", async () => {
    if (!store) return;
    await withStatus(publishBtn, statusLine, "Publishing…", async () => {
      const config = configFromForm(state);
      const wrote = await installWordPressLoader(store, config, runtimeUrl ? { runtimeUrl } : {});
      return wrote ? "Published ✓ Your banner is live." : "Already up to date — nothing to publish.";
    });
  });

  removeBtn.addEventListener("click", async () => {
    if (!store) return;
    await withStatus(removeBtn, statusLine, "Removing…", async () => {
      const removed = await removeWordPressLoader(store);
      return removed ? "Removed ✓ The banner is no longer on your site." : "Nothing to remove — no banner was published.";
    });
  });

  root.append(
    buildHeader(),
    buildLayout(buildForm(state, refresh, store), {
      previewFrame,
      publishBtn,
      removeBtn,
      statusLine,
      runtimeNote: runtimeUrl ?? runtimeScriptUrl(),
    }),
  );

  refresh();
}

/** Run an async action while showing a working label, then a result message. */
async function withStatus(
  btn: HTMLButtonElement,
  status: HTMLElement,
  working: string,
  action: () => Promise<string>,
): Promise<void> {
  const original = btn.textContent ?? "";
  btn.disabled = true;
  status.textContent = working;
  status.classList.remove("cc-status--error");
  try {
    status.textContent = await action();
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : String(err);
    status.classList.add("cc-status--error");
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

function buildHeader(): HTMLElement {
  return el("header", { class: "cc-header" }, [
    el("div", { class: "cc-header__brand" }, [
      el("span", { class: "cc-header__mark" }, ["◗"]),
      el("span", { class: "cc-header__name" }, ["Consentful"]),
    ]),
    el("p", { class: "cc-header__tagline" }, [
      "Build your cookie-consent banner, then publish it straight into your WordPress site. ",
      "No external account — the config is stored on your site and the runtime loads from a pinned CDN.",
    ]),
  ]);
}

function buildLayout(
  formCol: HTMLElement,
  out: {
    previewFrame: HTMLIFrameElement;
    publishBtn: HTMLButtonElement;
    removeBtn: HTMLButtonElement;
    statusLine: HTMLElement;
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
        el("span", {}, ["Publish"]),
        el("div", { class: "cc-output__actions" }, [out.publishBtn, out.removeBtn]),
      ]),
      out.statusLine,
      el("p", { class: "cc-output__note" }, [
        "Loads the version-pinned runtime from ",
        el("code", {}, [out.runtimeNote]),
        ". Re-publish after any edit to update your live banner.",
      ]),
    ]),
  ]);
  return el("div", { class: "cc-layout" }, [formCol, outputCol]);
}

function buildForm(
  state: WordPressFormState,
  refresh: () => void,
  store: WordPressRestStore | null,
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
    field("Theme", select(state.themeMode, [
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
      { value: "auto", label: "Auto (system)" },
    ], (v) => { state.themeMode = v; refresh(); })),
    field("Accent colour", textInput(state.accent, (v) => { state.accent = v; refresh(); }, "text")),
  ]);
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
    checkbox("Respect Global Privacy Control (GPC)", state.respectGpc, (v) => { state.respectGpc = v; refresh(); }),
    checkbox("Enable Google Consent Mode v2", state.enableConsentMode, (v) => { state.enableConsentMode = v; refresh(); }),
  ]);
  behavior.append(behToggles);
  form.append(section("Behavior", behavior));

  /* Scripts ----------------------------------------------------------------- */
  form.append(section("Gated scripts", buildScriptsEditor(state, refresh, store)));

  return form;
}

function buildScriptsEditor(
  state: WordPressFormState,
  refresh: () => void,
  store: WordPressRestStore | null,
): HTMLElement {
  const wrap = el("div", { class: "cc-scripts" });
  const list = el("div", { class: "cc-scripts__list" });
  const detectStatus = el("p", { class: "cc-hint" }, []);

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
    state.scripts.push({ name: "", category: first ? first.value : "analytics", type: "src", value: "" });
    renderList();
    refresh();
  });

  const actions = el("div", { class: "cc-scripts__actions" }, [addBtn]);

  // The WordPress-specific affordance: pre-fill trackers from active plugins.
  if (store) {
    const detectBtn = el("button", { class: "cc-btn", type: "button" }, ["Detect from active plugins"]) as HTMLButtonElement;
    detectBtn.addEventListener("click", async () => {
      detectBtn.disabled = true;
      detectStatus.textContent = "Scanning your active plugins…";
      try {
        const detected = await store.detectTrackers();
        const before = state.scripts.length;
        state.scripts = mergeDetectedScripts(state.scripts, detected);
        const added = state.scripts.length - before;
        detectStatus.textContent = detected.length === 0
          ? "No known tracker plugins found. Add tags manually below."
          : added === 0
            ? "All detected trackers are already in your list."
            : `Added ${added} tracker${added === 1 ? "" : "s"} from your plugins. Set each tag's real id before publishing.`;
        renderList();
        refresh();
      } catch (err) {
        detectStatus.textContent = err instanceof Error ? err.message : String(err);
      } finally {
        detectBtn.disabled = false;
      }
    });
    actions.append(detectBtn);
  }

  wrap.append(list, actions, detectStatus);
  renderList();
  return wrap;
}

function buildScriptRow(
  script: ScriptFormState,
  index: number,
  state: WordPressFormState,
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

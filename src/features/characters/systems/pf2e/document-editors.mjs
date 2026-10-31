import { ACTOR_COMMANDS as C } from "../../../../kernel/command-names.mjs";
import { icon, node } from "../../../../ui/dom.mjs";
import { localizedText } from "../../../../ui/localized-text.mjs";

const allowed = (actor, kind) => actor?.capabilities?.[kind === "spellManagement" ? "manageSpells" : kind === "preparation" ? "prepareSpells" : kind === "currency" ? "currency" : kind === "biography" ? "editBiography" : kind === "defenses" ? "editDefenses" : "editArmorClass"] === true;
const local = (commands, key, fallback, values) => localizedText(commands.localize, key, fallback, values);

export function syncDocumentEditor(shell, deferred) {
  const modal = shell.documentModal;
  if (!modal) return;
  if (deferred || shell.actor?.sourceUuid !== modal.sourceUuid || shell.screen.dataset.pf2eView !== modal.tab || !allowed(shell.actor, modal.kind)) modal.close(false);
  else { modal.refresh?.(); }
}

export function editor(shell, kind, label, glyph, ownerScope, overlayHost) {
  if (ownerScope.disposed || !allowed(shell.actor, kind)) return null;
  shell.documentModal?.close(false);
  const scope = ownerScope.child(`pf2e-${kind}-editor`);
  const commands = shell.commands;
  const actor = shell.actor;
  const t = (key, fallback, values) => local(commands, key, fallback, values);
  const focus = shell.screen.ownerDocument?.activeElement;
  const modal = shell.documentModal = { kind, tab: shell.screen.dataset.pf2eView, sourceUuid: actor.sourceUuid, pending: false };
  const title = ["preparation","spellManagement"].includes(kind) ? label : t("VEMOBILE.Character.Presenter.Edit", "Edit {label}", { label });
  const close = () => { if (!modal.pending) modal.close(); };
  const closeButton = node("button", { className: "ve-pf2e-editor-close", attrs: { type: "button", "aria-label": t("VEMOBILE.Controls.Close", "Close") }, children: [icon("fa-xmark")], on: { click: close } }, scope);
  const body = node("div", { className: "ve-pf2e-editor-body" });
  const error = node("p", { className: "ve-pf2e-editor-error", attrs: { role: "alert" } });
  const footer = node("footer", { children: [node("button", { attrs: { type: "button" }, text: t("VEMOBILE.Scene.Template.Cancel", "Cancel"), on: { click: close } }, scope)] });
  const form = node("form", { className: "ve-pf2e-document-dialog", attrs: { role: "dialog", "aria-modal": "true", "aria-label": title }, children: [
    node("header", { children: [icon(glyph), node("div", { children: [node("small", { text: actor.name }), node("h2", { text: title })] }), closeButton] }), body, error, footer
  ] });
  const layer = node("div", { className: "ve-pf2e-document-layer", children: [form] });
  modal.close = (restoreFocus = true) => {
    scope.dispose();
    if (restoreFocus && !ownerScope.disposed && focus?.isConnected) focus.focus?.({ preventScroll: true });
  };
  scope.own(() => { layer.remove(); if (shell.documentModal === modal) shell.documentModal = null; });
  const viewport = shell.screen.ownerDocument?.defaultView?.visualViewport;
  const view = shell.screen.ownerDocument?.defaultView;
  const fit = () => {
    layer.style.top = `${viewport?.offsetTop ?? 0}px`; layer.style.left = `${viewport?.offsetLeft ?? 0}px`;
    layer.style.width = `${viewport?.width ?? view?.innerWidth ?? 0}px`; layer.style.height = `${viewport?.height ?? view?.innerHeight ?? 0}px`;
  };
  fit();
  for (const target of [viewport, view].filter(Boolean)) scope.listen(target, "resize", fit);
  if (viewport) scope.listen(viewport, "scroll", fit);
  const host = shell.screen.closest?.(".ve-mobile-app") ?? overlayHost ?? shell.screen;
  host.append(layer);
  scope.listen(layer, "click", event => { if (event.target === layer) close(); });
  scope.listen(layer, "keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key !== "Tab") return;
    const controls = [...layer.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[contenteditable='true']:not(:disabled)")];
    const first = controls[0], last = controls.at(-1), active = layer.ownerDocument.activeElement;
    if (event.shiftKey && active === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && active === last) { event.preventDefault(); first?.focus(); }
  });
  scope.listen(form, "submit", event => { event.preventDefault(); });
  closeButton.focus?.({ preventScroll: true });
  const run = async (command, payload, closeAfter = true) => {
    if (modal.pending || scope.disposed || shell.actor?.sourceUuid !== actor.sourceUuid || !allowed(shell.actor, kind)) return;
    modal.pending = true;
    error.textContent = "";
    const controls = [...form.querySelectorAll("button,input,textarea,select,[contenteditable='true']")];
    const disabled = controls.map(control => ({ disabled: control.disabled, contenteditable: control.getAttribute?.("contenteditable") }));
    controls.forEach(control => { control.disabled = true; if (control.getAttribute?.("contenteditable") === "true") control.setAttribute("contenteditable", "false"); });
    form.setAttribute("aria-busy", "true");
    try {
      await shell.commands.execute(command, { ...payload, actorSourceUuid: actor.sourceUuid });
      if (!scope.disposed && closeAfter) modal.close();
    } catch (failure) {
      if (!scope.disposed) error.textContent = failure?.message ?? t("VEMOBILE.PF2E.Character.ActionFailed", "That action could not be completed.");
    } finally {
      modal.pending = false;
      if (!scope.disposed) { controls.forEach((control, index) => {
        control.disabled = disabled[index].disabled;
        if (disabled[index].contenteditable !== null) control.setAttribute("contenteditable", disabled[index].contenteditable);
      }); form.removeAttribute("aria-busy"); modal.refresh?.(); }
    }
  };
  return { modal, scope, commands, actor, t, body, footer, form, run };
}

function submitButton(context, onSubmit) {
  const { scope, t, form, footer } = context;
  footer.append(node("button", { className: "is-primary", attrs: { type: "submit" }, text: t("VEMOBILE.Character.Presenter.SaveChanges", "Save Changes") }));
  scope.listen(form, "submit", event => { event.preventDefault(); if (form.reportValidity()) void onSubmit(); });
}

export function openCurrencyEditor(shell, ownerScope, overlayHost) {
  const context = editor(shell, "currency", local(shell.commands, "VEMOBILE.PF2E.Character.Supplement.Currency", "Currency"), "fa-coins", ownerScope, overlayHost);
  if (!context) return;
  const originalValues = { ...context.actor.pf2e.details.currency };
  const inputs = new Map();
  context.body.classList.add("ve-pf2e-currency-fields");
  for (const key of ["pp", "gp", "sp", "cp"]) {
    const input = node("input", { attrs: { type: "number", min: "0", max: "999999", step: "1", inputmode: "numeric", value: originalValues[key], "aria-label": key.toUpperCase() } });
    inputs.set(key, input);
    const step = delta => { input.value = String(Math.min(999999, Math.max(0, Math.trunc(Number(input.value) || 0) + delta))); };
    const stepButton = delta => node("button", { attrs: { type: "button", "aria-label": context.t(delta < 0 ? "VEMOBILE.Character.Presenter.Decrease" : "VEMOBILE.Character.Presenter.Increase", delta < 0 ? "Decrease {denomination}" : "Increase {denomination}", { denomination: key.toUpperCase() }) }, children: [icon(delta < 0 ? "fa-minus" : "fa-plus")], on: { click: () => step(delta) } }, context.scope);
    context.body.append(node("label", { className: `ve-currency-editor-row is-${key}`, children: [node("span", { children: [icon("fa-coins"), node("strong", { text: key.toUpperCase() })] }), stepButton(-1), input, stepButton(1)] }));
  }
  submitButton(context, () => context.run(C.UPDATE_CURRENCY, { values: Object.fromEntries([...inputs].map(([key, input]) => [key, Number(input.value)])), originalValues }));
}

export function openBiographyEditor(shell, section, label, fieldLabels, ownerScope, overlayHost) {
  const fields = section.editorFields;
  if (!Array.isArray(fields)) return;
  const context = editor(shell, "biography", label, "fa-pen-to-square", ownerScope, overlayHost);
  if (!context) return;
  const inputs = new Map();
  const richFields = new Map();
  const originalValues = Object.fromEntries(fields.map(field => [field.key, field.value]));
  context.body.classList.add("ve-pf2e-biography-editor-fields");
  for (const field of fields) {
    const caption = fieldLabels[field.key];
    const fieldLabel = caption ? local(context.commands, caption[1], caption[0]) : label;
    if (field.kind === "rich") {
      const input = node("div", { className: "ve-pf2e-biography-rich-editor", attrs: {
        contenteditable: "true", role: "textbox", "aria-multiline": "true", "aria-label": fieldLabel, spellcheck: "true"
      } });
      input.innerHTML = sanitizeBiographyHtml(input.ownerDocument, field.value);
      const initialHtml = input.innerHTML;
      let edited = false;
      context.scope.listen(input, "input", () => { edited = input.innerHTML !== initialHtml; });
      context.scope.listen(input, "paste", event => {
        const html = event.clipboardData?.getData("text/html");
        if (!html) return;
        event.preventDefault();
        const document = input.ownerDocument;
        const safeHtml = sanitizeBiographyHtml(document, html);
        if (!document.execCommand?.("insertHTML", false, safeHtml)) insertSafeHtmlAtSelection(input, safeHtml, event.clipboardData?.getData("text/plain") ?? "");
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
      });
      context.scope.listen(input, "click", event => {
        if (!event.target?.closest?.("a")) return;
        event.preventDefault();
        event.stopPropagation();
      });
      richFields.set(field.key, { input, original: String(field.value ?? ""), wasEdited: () => edited });
      context.body.append(node("div", { className: "ve-pf2e-biography-rich-field", children: [node("span", { text: fieldLabel }), richToolbar(input, context), input] }));
      continue;
    }
    const input = node(field.kind === "text" ? "input" : "textarea", { attrs: {
      ...(field.kind === "text" ? { type: "text" } : { rows: field.kind === "rich" ? "8" : "3" }),
      maxlength: field.kind === "rich" ? "200000" : field.kind === "list" ? "32000" : "5000", "aria-label": fieldLabel
    } });
    input.value = Array.isArray(field.value) ? field.value.join("\n") : field.value;
    inputs.set(field.key, input);
    context.body.append(node("label", { children: [node("span", { text: fieldLabel }), input] }));
  }
  submitButton(context, () => context.run(C.UPDATE_BIOGRAPHY_SECTION, { section: section.id, originalValues,
    values: Object.fromEntries(fields.map(field => {
      if (field.kind === "rich") {
        const rich = richFields.get(field.key);
        return [field.key, rich.wasEdited() ? sanitizeBiographyHtml(rich.input.ownerDocument, rich.input.innerHTML) : rich.original];
      }
      return [field.key, field.kind === "list" ? inputs.get(field.key).value.split(/\r?\n/u) : inputs.get(field.key).value];
    })) }));
}

function richToolbar(input, context) {
  const { t, scope } = context;
  const toolbar = node("div", { className: "ve-pf2e-biography-rich-toolbar", attrs: { role: "toolbar", "aria-label": t("VEMOBILE.Character.Presenter.RichTextToolbar", "Text formatting") } });
  for (const [command, labelKey, label, glyph] of [
    ["bold", "VEMOBILE.Character.Presenter.RichTextBold", "Bold", "fa-bold"], ["italic", "VEMOBILE.Character.Presenter.RichTextItalic", "Italic", "fa-italic"], ["insertUnorderedList", "VEMOBILE.Character.Presenter.RichTextBulletedList", "Bulleted list", "fa-list-ul"]
  ]) {
    const localizedLabel = t(labelKey, label);
    const button = node("button", { className: "ve-pf2e-biography-rich-tool", attrs: { type: "button", "aria-label": localizedLabel, title: localizedLabel }, children: [icon(glyph)], on: {
      mousedown: event => event.preventDefault(),
      click: () => { input.focus(); input.ownerDocument.execCommand?.(command); }
    } }, scope);
    toolbar.append(button);
  }
  return toolbar;
}

const SAFE_RICH_TAGS = new Set("a abbr b blockquote br cite code dd del div dl dt em h1 h2 h3 h4 h5 h6 hr i li ol p pre q s small span strong sub sup table tbody td tfoot th thead tr u ul".split(" "));
const ACTIVE_RICH_TAGS = new Set("applet audio base button canvas embed fencedframe form frame frameset iframe input link meta object portal script select source style svg template textarea track video webview".split(" "));

function sanitizeBiographyHtml(document, value) {
  const template = document.createElement("template");
  template.innerHTML = String(value ?? "");
  const cleanChildren = parent => {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === 8) { child.remove(); continue; }
      if (child.nodeType !== 1) continue;
      const tag = child.localName.toLowerCase();
      if (ACTIVE_RICH_TAGS.has(tag) || tag.includes("-")) { child.remove(); continue; }
      if (!SAFE_RICH_TAGS.has(tag)) {
        cleanChildren(child);
        child.replaceWith(...child.childNodes);
        continue;
      }
      for (const attribute of [...child.attributes]) {
        const name = attribute.name.toLowerCase();
        if (tag === "a" && name === "href" && safeBiographyLink(document, attribute.value)) continue;
        if (["title", "aria-label"].includes(name) && attribute.value.length <= 512) continue;
        child.removeAttribute(attribute.name);
      }
      cleanChildren(child);
    }
  };
  cleanChildren(template.content);
  return template.innerHTML;
}

function insertSafeHtmlAtSelection(input, html, plainText) {
  const document = input.ownerDocument;
  const selection = document.getSelection?.();
  if (!selection?.rangeCount || !input.contains(selection.anchorNode)) {
    input.append(document.createTextNode(plainText));
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const fragment = range.createContextualFragment(html);
  const last = fragment.lastChild;
  range.insertNode(fragment);
  if (last) { range.setStartAfter(last); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); }
}

function safeBiographyLink(document, value) {
  const link = String(value).trim().replace(/[\u0000-\u0020\u007f]/gu, "");
  if (!link) return false;
  if (link.startsWith("#")) return true;
  try {
    const parsed = new URL(link, document.baseURI);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch { return false; }
}

export function openAcEditor(shell, ownerScope, overlayHost) {
  const context = editor(shell, "armorClass", local(shell.commands, "VEMOBILE.PF2E.Character.ArmorClass", "Armor Class"), "fa-shield", ownerScope, overlayHost);
  if (!context) return;
  const { body, commands, scope, actor, t, modal, run } = context;
  context.form.classList.add("ve-pf2e-ac-dialog");
  const acPanel = node("section", { className: "ve-pf2e-ac-panel", attrs: { role: "tabpanel" } });
  const shieldPanel = node("section", { className: "ve-pf2e-shield-panel", attrs: { role: "tabpanel", hidden: true } });
  const shield = actor.pf2e?.shield;
  const hasShield = Boolean(shield?.itemId);
  const tabs = node("div", { className: "ve-pf2e-ac-tabs", attrs: { role: "tablist" } });
  let shieldSave;
  const tabButtons = [
    ["AC", acPanel, false], [t("VEMOBILE.PF2E.Character.Shield.Tab", "Shield"), shieldPanel, !hasShield]
  ].map(([label, panel, disabled], index) => node("button", { text: label, attrs: { type: "button", role: "tab", disabled, "aria-selected": index === 0 ? "true" : "false" }, on: { click: () => {
    for (const [i, target] of [acPanel, shieldPanel].entries()) { target.hidden = target !== panel; tabButtons[i].setAttribute("aria-selected", target === panel ? "true" : "false"); }
    if (shieldSave) shieldSave.hidden = panel !== shieldPanel;
  } } }, scope));
  tabs.append(...tabButtons);
  body.append(tabs, acPanel, shieldPanel);
  if (hasShield) {
    const input = node("input", { attrs: { type: "number", min: "0", max: shield.hp.max, step: "1", inputmode: "numeric", value: shield.hp.value, disabled: !actor.capabilities?.editShield, "aria-label": t("VEMOBILE.PF2E.Character.Shield.HP", "Shield HP") } });
    const perform = operation => run(C.EDIT_PF2E_SHIELD, { operation, itemId: shield.itemId, ...(operation === "set-hp" ? { value: Number(input.value), originalValue: shield.hp.value } : {}) }, true);
    const fill = node("span");
    const updateFill = () => { fill.style.width = `${Math.max(0, Math.min(100, shield.hp.max > 0 ? Number(input.value) / shield.hp.max * 100 : 0)) || 0}%`; };
    scope.listen(input, "input", updateFill); updateFill();
    const step = delta => node("button", { className: "ve-pf2e-shield-step", attrs: { type: "button", disabled: !actor.capabilities?.editShield,
      "aria-label": t(delta < 0 ? "VEMOBILE.Character.Presenter.Decrease" : "VEMOBILE.Character.Presenter.Increase", delta < 0 ? "Decrease {denomination}" : "Increase {denomination}", { denomination: t("VEMOBILE.PF2E.Character.Shield.HP", "Shield HP") }) },
      children: [icon(delta < 0 ? "fa-minus" : "fa-plus")], on: { click: () => { input.value = String(Math.max(0, Math.min(shield.hp.max, Math.trunc(Number(input.value) || 0) + delta))); updateFill(); } }
    }, scope);
    const state = shield.destroyed ? "Destroyed" : shield.broken ? "Broken" : "Intact";
    const stat = (label, value) => node("div", { children: [node("small", { text: label }), node("strong", { text: value == null ? "—" : String(value) })] });
    shieldPanel.append(node("div", { className: "ve-pf2e-shield-card", children: [
      node("header", { className: "ve-pf2e-shield-identity", children: [icon("fa-shield"), node("div", { children: [
        node("h3", { text: shield.name }), node("span", { className: `ve-pf2e-shield-state${shield.broken || shield.destroyed ? " is-damaged" : ""}`, text: t(`VEMOBILE.PF2E.Character.Shield.${state}`, state) })
      ] })] }),
      node("div", { className: "ve-pf2e-shield-health", children: [
        node("span", { className: "ve-pf2e-shield-hp-label", text: t("VEMOBILE.PF2E.Character.Shield.HP", "Shield HP") }),
        node("div", { className: "ve-pf2e-shield-hp-controls", children: [step(-1), node("div", { className: "ve-pf2e-shield-hp-editor", children: [input, node("span", { text: `/ ${shield.hp.max}` })] }), step(1)] }),
        node("div", { className: "ve-pf2e-shield-hp-track", attrs: { "aria-hidden": "true" }, children: [fill] })
      ] }),
      node("div", { className: "ve-pf2e-shield-editor-stats", children: [
        stat(t("VEMOBILE.PF2E.Character.Hardness", "Hardness"), shield.hardness), stat(t("VEMOBILE.PF2E.Character.Shield.BreakThreshold", "Break threshold"), shield.hp.brokenThreshold)
      ] })
    ] }), node("button", { className: "ve-pf2e-shield-repair", attrs: { type: "button", disabled: !actor.capabilities?.repairShield },
      children: [icon("fa-hammer"), node("span", { text: t("VEMOBILE.PF2E.Character.Shield.Repair", "Attempt to Repair") })], on: { click: () => void perform("repair") }
    }, scope));
    shieldSave = node("button", { className: "is-primary ve-pf2e-shield-save", attrs: { type: "button", hidden: true, disabled: !actor.capabilities?.editShield },
      children: [icon("fa-check"), node("span", { text: t("VEMOBILE.Character.Presenter.SaveChanges", "Save Changes") })], on: { click: () => { if (input.reportValidity()) void perform("set-hp"); } }
    }, scope);
    context.footer.append(shieldSave);
  }
  const list = node("div", { className: "ve-pf2e-ac-modifiers" });
  const label = node("input", { attrs: { type: "text", maxlength: "100", required: true, "aria-label": t("VEMOBILE.PF2E.Character.ModifierName", "Modifier name"), placeholder: t("VEMOBILE.PF2E.Character.ModifierName", "Modifier name") } });
  const value = node("input", { attrs: { type: "number", min: "-999", max: "999", step: "1", value: "1", required: true, inputmode: "numeric", "aria-label": t("VEMOBILE.PF2E.Character.ModifierValue", "Modifier value") } });
  const type = node("select", { attrs: { "aria-label": t("VEMOBILE.PF2E.Character.ModifierType", "Modifier type") }, children:
    ["circumstance", "item", "status", "untyped"].map(key => node("option", { attrs: { value: key }, text: t(`VEMOBILE.PF2E.Character.ModifierTypes.${key}`, key[0].toUpperCase() + key.slice(1)) })) });
  const add = node("button", { className: "is-primary", attrs: { type: "submit" }, text: t("VEMOBILE.PF2E.Character.Action.Add", "Add") });
  acPanel.append(list, node("div", { className: "ve-pf2e-ac-add", children: [label, value, type, add] }));
  const draw = () => {
    if (modal.pending || scope.disposed || shell.actor?.sourceUuid !== actor.sourceUuid) return;
    modal.listScope?.dispose();
    const listScope = modal.listScope = scope.child("ac-modifier-rows");
    const ac = shell.actor.pf2e?.armorClass;
    const custom = ac?.customModifiers ?? [];
    list.replaceChildren(...(ac?.modifiers ?? []).map(modifier => node("div", { className: `ve-pf2e-ac-modifier${modifier.enabled ? "" : " is-suppressed"}`, children: [
      node("strong", { text: `${modifier.value >= 0 ? "+" : ""}${modifier.value}` }),
      node("div", { children: [node("span", { text: modifier.label }), node("small", { text: t(`VEMOBILE.PF2E.Character.ModifierTypes.${modifier.type}`, modifier.type) })] }),
      custom.some(entry => entry.slug === modifier.slug) ? node("button", { attrs: { type: "button", "aria-label": t("VEMOBILE.PF2E.Character.RemoveModifier", "Remove {label}", { label: modifier.label }) }, children: [icon("fa-trash")], on: { click: () => run(C.EDIT_PF2E_AC_MODIFIER, { operation: "remove", slug: modifier.slug, originalModifiers: custom }, false) } }, listScope) : null
    ] })));
    // Suppressed custom modifiers can be absent from the prepared AC list.
    for (const modifier of custom.filter(entry => !(ac?.modifiers ?? []).some(row => row.slug === entry.slug))) {
      list.append(node("div", { className: "ve-pf2e-ac-modifier is-suppressed", children: [node("strong", { text: String(modifier.value) }), node("span", { text: modifier.label }),
        node("button", { attrs: { type: "button", "aria-label": t("VEMOBILE.PF2E.Character.RemoveModifier", "Remove {label}", { label: modifier.label }) }, children: [icon("fa-trash")], on: { click: () => run(C.EDIT_PF2E_AC_MODIFIER, { operation: "remove", slug: modifier.slug, originalModifiers: custom }, false) } }, listScope)] }));
    }
  };
  modal.refresh = draw;
  scope.listen(context.form, "submit", event => {
    event.preventDefault();
    if (acPanel.hidden) return;
    if (!context.form.reportValidity()) return;
    void run(C.EDIT_PF2E_AC_MODIFIER, { operation: "add", label: label.value, value: Number(value.value), modifierType: type.value,
      originalModifiers: shell.actor.pf2e?.armorClass?.customModifiers ?? [] }, false);
  });
  draw();
}

const DEFENSE_CATEGORIES = new Set(["immunities", "weaknesses", "resistances"]);

/** Edit one category of PF2e IWR while keeping derived defenses informational. */
export function openDefenseEditor(shell, category, ownerScope, overlayHost) {
  if (!DEFENSE_CATEGORIES.has(category)) return;
  const actor = shell.actor;
  const categoryKey = category[0].toUpperCase() + category.slice(1);
  const categoryLabels = { immunities: "VEMOBILE.PF2E.Character.Defenses.Immunities", weaknesses: "VEMOBILE.PF2E.Character.Defenses.Weaknesses", resistances: "VEMOBILE.PF2E.Character.Defenses.Resistances" };
  const label = local(shell.commands, categoryLabels[category], categoryKey);
  const context = editor(shell, "defenses", label, "fa-shield", ownerScope, overlayHost);
  if (!context) return;

  let source;
  try { source = shell.commands.readCharacterDefenseEditor(actor.sourceUuid); }
  catch (error) { context.body.textContent = error?.message ?? label; return; }
  const typeOptions = Array.isArray(source?.types?.[category]) ? source.types[category] : [];
  const tagOptions = typeOptions;
  const originalEntries = Array.isArray(source?.entries?.[category]) ? source.entries[category] : [];
  const derivedEntries = Array.isArray(source?.derived?.[category]) ? source.derived[category] : [];
  const drafts = originalEntries.filter(entry => entry.editable === true).map(entry => ({
    sourceIndex: entry.sourceIndex,
    type: entry.type,
    value: category === "immunities" ? null : entry.value,
    exceptions: [...(entry.exceptions ?? [])],
    doubleVs: [...(entry.doubleVs ?? [])]
  }));
  const t = context.t;
  const list = node("div", { className: "ve-pf2e-defense-list" });
  const derived = node("section", { className: "ve-pf2e-defense-derived" });
  const addButton = node("button", { className: "ve-pf2e-defense-add is-primary", attrs: { type: "button" }, children: [icon("fa-plus"), node("span", { text: t("VEMOBILE.PF2E.Character.Defenses.Add", "Add {category}", { category: label.toLocaleLowerCase() }) })] });
  context.body.classList.add("ve-pf2e-defense-editor");
  context.body.append(list, addButton);
  if (derivedEntries.length) {
    derived.append(node("h3", { text: t("VEMOBILE.PF2E.Character.Defenses.Derived", "Derived from feats and effects") }));
    for (const entry of derivedEntries) derived.append(node("div", { className: "ve-pf2e-defense-derived-row", children: [
      node("strong", { text: entry.label }), node("small", { text: entry.source })
    ] }));
    context.body.append(derived);
  }

  const allTags = new Map();
  for (const option of typeOptions) allTags.set(String(option.value), String(option.label));
  for (const group of ["immunities", "weaknesses", "resistances"]) {
    for (const entry of source?.entries?.[group] ?? []) {
      for (const value of [...(entry.exceptions ?? []), ...(entry.doubleVs ?? [])]) if (!allTags.has(String(value))) allTags.set(String(value), String(value));
    }
  }
  const render = () => {
    if (context.modal.pending || context.scope.disposed) return;
    context.modal.rowsScope?.dispose();
    const rowsScope = context.modal.rowsScope = context.scope.child("defense-editor-rows");
    const typeLabel = value => typeOptions.find(option => option.value === value)?.label ?? value;
    const rows = [];
    for (const entry of originalEntries.filter(item => item.editable !== true)) rows.push(node("div", {
      className: "ve-pf2e-defense-row is-readonly", children: [node("strong", { text: entry.label ?? entry.type ?? "—" }),
        ...(entry.value == null ? [] : [node("span", { text: String(entry.value) })]),
        ...(entry.exceptions ?? []).map(value => node("small", { text: t("VEMOBILE.PF2E.Character.Defenses.Exception", "Except {value}", { value }) }))]
    }));
    for (const [index, draft] of drafts.entries()) {
      const type = node("select", { attrs: { required: true, "aria-label": t("VEMOBILE.PF2E.Character.Defenses.Type", "Defense type") }, children: [
        node("option", { attrs: { value: "" }, text: t("VEMOBILE.PF2E.Character.Defenses.ChooseType", "Choose type") }),
        ...typeOptions.map(option => node("option", { attrs: { value: option.value }, text: option.label }))
      ] });
      if (draft.type && !typeOptions.some(option => option.value === draft.type)) type.append(node("option", { attrs: { value: draft.type }, text: typeLabel(draft.type) }));
      type.value = draft.type ?? "";
      const fields = [node("label", { className: "ve-pf2e-defense-type", children: [node("span", { text: t("VEMOBILE.PF2E.Character.Defenses.Type", "Defense type") }), type] })];
      if (category !== "immunities") {
        const value = node("input", { attrs: { type: "number", min: "1", max: "999", step: "1", required: true, inputmode: "numeric", value: draft.value ?? "", "aria-label": t("VEMOBILE.PF2E.Character.Defenses.Value", "Value") } });
        fields.push(node("label", { className: "ve-pf2e-defense-value", children: [node("span", { text: t("VEMOBILE.PF2E.Character.Defenses.Value", "Value") }), value] }));
        rowsScope.listen(value, "input", () => { draft.value = value.value === "" ? null : Number(value.value); });
      }
      rowsScope.listen(type, "change", () => { draft.type = type.value; });
      const remove = node("button", { className: "ve-pf2e-defense-remove", attrs: { type: "button", "aria-label": t("VEMOBILE.PF2E.Character.Defenses.Remove", "Remove {type}", { type: typeLabel(draft.type) }) }, children: [icon("fa-trash")], on: { click: () => { drafts.splice(index, 1); render(); } } }, rowsScope);
      fields.push(remove);
      const row = node("div", { className: "ve-pf2e-defense-row", children: fields });

      const details = node("details", { className: "ve-pf2e-defense-more", children: [node("summary", { text: t("VEMOBILE.PF2E.Character.Defenses.More", "More") })] });
      for (const [field, titleKey, fallback] of [["exceptions", "VEMOBILE.PF2E.Character.Defenses.Exceptions", "Exceptions"], ...(category === "resistances" ? [["doubleVs", "VEMOBILE.PF2E.Character.Defenses.DoubleVs", "Double resistance against"]] : [])]) {
        const selected = draft[field];
        const picker = node("select", { attrs: { "aria-label": t(titleKey, fallback), disabled: selected.length >= 6 }, children: [
          node("option", { attrs: { value: "" }, text: t("VEMOBILE.PF2E.Character.Defenses.ChooseTag", "Choose a tag") }),
          ...tagOptions.filter(option => !selected.includes(option.value)).map(option => node("option", { attrs: { value: option.value }, text: option.label }))
        ] });
        const chips = node("div", { className: "ve-pf2e-defense-tags", children: selected.map(value => node("span", { className: "ve-pf2e-defense-tag", children: [
          node("span", { text: allTags.get(value) ?? value }),
          node("button", { attrs: { type: "button", "aria-label": t("VEMOBILE.PF2E.Character.Defenses.RemoveTag", "Remove {tag}", { tag: allTags.get(value) ?? value }) }, children: [icon("fa-xmark")], on: { click: () => { draft[field] = selected.filter(tag => tag !== value); render(); } } }, rowsScope)
        ] })) });
        rowsScope.listen(picker, "change", () => { if (picker.value && selected.length < 6) { draft[field].push(picker.value); render(); } });
        details.append(node("label", { className: "ve-pf2e-defense-tag-picker", children: [node("span", { text: t(titleKey, fallback) }), picker] }), chips);
      }
      row.append(details);
      rows.push(row);
    }
    list.replaceChildren(...rows);
    addButton.disabled = !typeOptions.length;
  };
  context.scope.listen(addButton, "click", () => {
    if (context.modal.pending || context.scope.disposed) return;
    drafts.push({ sourceIndex: null, type: "", value: null, exceptions: [], doubleVs: [] });
    render();
    list.querySelector("select")?.focus?.({ preventScroll: true });
  });
  context.modal.refresh = render;
  const submit = () => {
    const retained = originalEntries.flatMap(entry => entry.editable ? drafts.filter(draft => draft.sourceIndex === entry.sourceIndex) : [entry]);
    const values = [...retained, ...drafts.filter(entry => entry.sourceIndex === null)].map(({ sourceIndex, type, value, exceptions, doubleVs }) => ({ sourceIndex, type, value,
      exceptions: [...exceptions], doubleVs: [...doubleVs] }));
    return context.run(C.EDIT_PF2E_DEFENSES, { category, originalEntries, values });
  };
  submitButton(context, submit);
  render();
}

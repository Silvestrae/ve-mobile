import { ACTOR_COMMANDS as C } from "../../../../kernel/command-names.mjs";
import { icon, node } from "../../../../ui/dom.mjs";
import { localizedText } from "../../../../ui/localized-text.mjs";

const canEdit = actor => actor?.capabilities?.editPersistentDamage === true;
const actorRecord = shell => shell.actor?.pf2e?.persistentDamage;

/** Close a persistent-damage dialog when its snapshot or view is no longer current. */
export function syncPersistentDamageDialog(shell, deferred = false) {
  const modal = shell.persistentDamageModal;
  if (!modal) return;
  if (deferred || shell.actor?.sourceUuid !== modal.sourceUuid
    || shell.screen.dataset.pf2eView !== modal.tab || !actorRecord(shell)) modal.close(false);
  else modal.refresh();
}

/** Open a compact editor for the current actor's PF2e persistent damage. */
export function openPersistentDamageDialog(shell, ownerScope, overlayHost) {
  const actor = shell.actor;
  const record = actorRecord(shell);
  if (ownerScope.disposed || !actor?.sourceUuid || !record) return;
  shell.persistentDamageModal?.close(false);

  const scope = ownerScope.child("pf2e-persistent-damage-dialog");
  const commands = shell.commands;
  const t = (key, fallback, values) => localizedText(commands?.localize, key, fallback, values);
  const writable = () => canEdit(shell.actor) && shell.actor?.sourceUuid === actor.sourceUuid;
  const focus = shell.screen.ownerDocument?.activeElement;
  const modal = shell.persistentDamageModal = {
    sourceUuid: actor.sourceUuid,
    tab: shell.screen.dataset.pf2eView,
    pending: false
  };
  const title = t("VEMOBILE.PF2E.PersistentDamage.Title", "Persistent damage");
  const closeButton = node("button", { className: "ve-pf2e-editor-close", attrs: {
    type: "button", "aria-label": t("VEMOBILE.Controls.Close", "Close")
  }, children: [icon("fa-xmark")], on: { click: () => modal.close() } }, scope);
  const body = node("div", { className: "ve-pf2e-editor-body ve-pf2e-persistent-damage-body" });
  const error = node("p", { className: "ve-pf2e-editor-error", attrs: { role: "alert" } });
  const footer = node("footer", { children: [node("button", { attrs: { type: "button" },
    text: t("VEMOBILE.Controls.Close", "Close"), on: { click: () => modal.close() } }, scope)] });
  const form = node("form", { className: "ve-pf2e-document-dialog ve-pf2e-persistent-damage-dialog", attrs: {
    role: "dialog", "aria-modal": "true", "aria-label": title
  }, children: [
    node("header", { children: [icon("fa-droplet"), node("div", { children: [
      node("small", { text: actor.name }), node("h2", { text: title })
    ] }), closeButton] }), body, error, footer
  ] });
  const layer = node("div", { className: "ve-pf2e-document-layer", children: [form] });
  const drafts = new Map();
  let rowScope;
  let rowsSignature = "";
  let renderedWritable;
  let busyDisabled = null;
  const removedIds = new Set();
  const draftKey = id => id || "__new__";

  modal.close = (restoreFocus = true) => {
    scope.dispose();
    if (restoreFocus && !ownerScope.disposed && focus?.isConnected) focus.focus?.({ preventScroll: true });
  };
  scope.own(() => { rowScope?.dispose(); layer.remove(); if (shell.persistentDamageModal === modal) shell.persistentDamageModal = null; });

  const viewport = shell.screen.ownerDocument?.defaultView?.visualViewport;
  const view = shell.screen.ownerDocument?.defaultView;
  const fit = () => {
    layer.style.top = `${viewport?.offsetTop ?? 0}px`;
    layer.style.left = `${viewport?.offsetLeft ?? 0}px`;
    layer.style.width = `${viewport?.width ?? view?.innerWidth ?? 0}px`;
    layer.style.height = `${viewport?.height ?? view?.innerHeight ?? 0}px`;
  };
  fit();
  for (const target of [viewport, view].filter(Boolean)) scope.listen(target, "resize", fit);
  if (viewport) scope.listen(viewport, "scroll", fit);
  const host = shell.screen.closest?.(".ve-mobile-app") ?? overlayHost ?? shell.screen;
  host.append(layer);
  scope.listen(layer, "click", event => { if (event.target === layer && !modal.pending) modal.close(); });
  scope.listen(layer, "keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!modal.pending) modal.close(); }
    if (event.key !== "Tab") return;
    const controls = [...layer.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled)")];
    const first = controls[0], last = controls.at(-1), active = layer.ownerDocument.activeElement;
    if (event.shiftKey && active === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && active === last) { event.preventDefault(); first?.focus(); }
  });
  scope.listen(form, "submit", event => { event.preventDefault(); });

  const setBusy = busy => {
    modal.pending = busy;
    form.setAttribute("aria-busy", String(busy));
    const controls = [...form.querySelectorAll("button,input,select")];
    if (busy) {
      busyDisabled = new Map(controls.map(control => [control, control.disabled]));
      controls.forEach(control => { control.disabled = true; });
      return;
    }
    for (const control of controls) control.disabled = busyDisabled?.get(control) ?? (!writable() && control.dataset.readOnlyDisable === "true");
    busyDisabled = null;
  };
  const run = async (operation, payload, draftAfterSuccess) => {
    if (modal.pending || scope.disposed || !writable()) return;
    setBusy(true);
    error.textContent = "";
    try {
      await commands.execute(C.EDIT_PF2E_PERSISTENT_DAMAGE, {
        actorSourceUuid: actor.sourceUuid, operation, ...payload
      });
      if (scope.disposed) return;
      if (draftAfterSuccess) {
        const draft = drafts.get(draftAfterSuccess.key);
        if (draft) draft.submitted = draftAfterSuccess.value;
      }
      if (operation === "remove") {
        drafts.delete(draftKey(payload.itemId));
        removedIds.add(payload.itemId);
        rowsSignature = "";
      }
      if (operation === "add") { createFormula.value = ""; createDc.value = "15"; }
    } catch (failure) {
      if (!scope.disposed) error.textContent = failure?.message ?? t("VEMOBILE.PF2E.Character.ActionFailed", "That action could not be completed.");
    } finally {
      if (!scope.disposed) { setBusy(false); modal.refresh(); }
    }
  };

  const field = (kind, label, scopeForRows, id) => node(kind, { attrs: {
    ...(kind === "input" ? { type: "text", maxlength: "500", autocomplete: "off", required: true } : {}),
    "aria-label": label,
    ...(id ? { "data-field-id": `${id}:formula` } : {})
  } }, scopeForRows);

  const createFormula = node("input", { attrs: { type: "text", maxlength: "500", required: true,
    autocomplete: "off", "aria-label": t("VEMOBILE.PF2E.PersistentDamage.Formula", "Damage formula") } });
  const createType = node("select", { attrs: { required: true,
    "aria-label": t("VEMOBILE.PF2E.PersistentDamage.DamageType", "Damage type") } });
  const createDc = node("input", { attrs: { type: "number", min: "1", max: "999", step: "1", inputmode: "numeric",
    required: true, value: "15", "aria-label": t("VEMOBILE.PF2E.PersistentDamage.DC", "Recovery DC") } });
  const addButton = node("button", { className: "is-primary", attrs: { type: "button", "data-read-only-disable": "true" },
    text: t("VEMOBILE.PF2E.PersistentDamage.Add", "Add"), on: { click: () => {
      if (!createFormula.reportValidity() || !createType.reportValidity() || !createDc.reportValidity() || !writable()) return;
      void run("add", { formula: createFormula.value, damageType: createType.value, dc: Number(createDc.value) });
    } } }, scope);
  const addFields = node("div", { className: "ve-pf2e-persistent-damage-add", children: [
    node("label", { children: [node("span", { text: t("VEMOBILE.PF2E.PersistentDamage.Formula", "Damage formula") }), createFormula] }),
    node("label", { children: [node("span", { text: t("VEMOBILE.PF2E.PersistentDamage.DamageType", "Damage type") }), createType] }),
    node("label", { children: [node("span", { text: t("VEMOBILE.PF2E.PersistentDamage.DC", "Recovery DC") }), createDc] }), addButton
  ] });
  const addSection = node("section", { className: "ve-pf2e-persistent-damage-add-section", children: [
    node("h3", { text: t("VEMOBILE.PF2E.PersistentDamage.AddTitle", "Add persistent damage") }), addFields
  ] });
  const list = node("div", { className: "ve-pf2e-persistent-damage-list", attrs: { "aria-live": "polite" } });
  body.append(addSection, list);

  const typeOptions = types => {
    const selected = createType.value;
    createType.replaceChildren(...types.map(type => node("option", { text: type.label, attrs: { value: type.value } })));
    if (types.some(type => type.value === selected)) createType.value = selected;
    else if (types.length) createType.value = types[0].value;
    createType.disabled = !types.length || !writable() || modal.pending;
  };
  const makeTypeSelect = (types, current, rowScopeForRows, id) => {
    const options = [...types];
    if (current && !options.some(type => type.value === current)) options.unshift({ value: current, label: current, unavailable: true });
    const select = node("select", { attrs: { "aria-label": t("VEMOBILE.PF2E.PersistentDamage.DamageType", "Damage type"),
      ...(id ? { "data-field-id": `${id}:type` } : {}) }, children: options.map(type => node("option", {
      text: type.label, attrs: { value: type.value, disabled: type.unavailable === true }
    })) }, rowScopeForRows);
    select.value = current || "";
    return select;
  };
  const renderRows = currentRecord => {
    const active = layer.ownerDocument.activeElement;
    const focusId = active?.getAttribute?.("data-field-id");
    const scroll = body.scrollTop;
    rowScope?.dispose();
    rowScope = scope.child("persistent-damage-rows");
    list.replaceChildren();
    typeOptions(currentRecord.types ?? []);
    const conditions = (currentRecord.conditions ?? []).filter(entry => !removedIds.has(entry.id));
    if (!conditions.length) {
      list.append(node("p", { className: "ve-pf2e-persistent-damage-empty", text: t("VEMOBILE.PF2E.PersistentDamage.Empty", "No persistent damage is recorded.") }));
      body.scrollTop = scroll;
      return;
    }
    for (const condition of conditions) {
      const key = draftKey(condition.id);
      const original = { formula: condition.formula, damageType: condition.damageType, dc: condition.dc, active: condition.active };
      const matchesValues = values => values && values.formula === condition.formula
        && values.damageType === condition.damageType && Number(values.dc) === condition.dc;
      let draft = drafts.get(key);
      if (draft && (matchesValues(draft.submitted) || (!draft.submitted && matchesValues(draft.values)))) {
        drafts.delete(key);
        draft = null;
      }
      draft ??= { original, values: { formula: condition.formula, damageType: condition.damageType, dc: String(condition.dc ?? "") } };
      const item = node("article", { className: "ve-pf2e-persistent-damage-row" });
      const formula = field("input", t("VEMOBILE.PF2E.PersistentDamage.Formula", "Damage formula"), rowScope, condition.id);
      formula.value = draft.values.formula;
      const type = makeTypeSelect(currentRecord.types ?? [], draft.values.damageType, rowScope, condition.id);
      const dc = node("input", { attrs: { type: "number", min: "1", max: "999", step: "1", inputmode: "numeric",
        required: true, "aria-label": t("VEMOBILE.PF2E.PersistentDamage.DC", "Recovery DC"), "data-field-id": `${condition.id}:dc` } }, rowScope);
      dc.value = draft.values.dc;
      const save = node("button", { attrs: { type: "button", "data-read-only-disable": "true" }, text: t("VEMOBILE.Character.Presenter.SaveChanges", "Save changes"), on: {
        click: () => {
          if (!formula.reportValidity() || !dc.reportValidity()) return;
          void run("update", { itemId: condition.id,
            original: drafts.get(key)?.original ?? original,
            formula: formula.value, damageType: type.value, dc: Number(dc.value)
          }, { key, value: { formula: formula.value, damageType: type.value, dc: dc.value } });
        }
      } }, rowScope);
      const remove = node("button", { attrs: { type: "button", "data-read-only-disable": "true" }, text: t("VEMOBILE.PF2E.PersistentDamage.Remove", "Remove"), on: {
        click: () => void run("remove", { itemId: condition.id,
          original: { formula: condition.formula, damageType: condition.damageType, dc: condition.dc, active: condition.active } })
      } }, rowScope);
      const recover = node("button", { attrs: { type: "button", "data-read-only-disable": "true" }, text: t("VEMOBILE.PF2E.PersistentDamage.Recovery", "Recovery"), on: {
        click: () => void run("recover", { itemId: condition.id,
          original: { formula: condition.formula, damageType: condition.damageType, dc: condition.dc, active: condition.active } })
      } }, rowScope);
      const roll = node("button", { attrs: { type: "button", "data-read-only-disable": "true" }, text: t("VEMOBILE.PF2E.PersistentDamage.RollDamage", "Roll damage"), on: {
        click: () => void run("roll-damage", { itemId: condition.id,
          original: { formula: condition.formula, damageType: condition.damageType, dc: condition.dc, active: condition.active } })
      } }, rowScope);
      if (!condition.active) { recover.disabled = true; roll.disabled = true; }
      const markDraft = () => {
        const existing = drafts.get(key);
        drafts.set(key, { original: existing?.original ?? original,
          values: { formula: formula.value, damageType: type.value, dc: dc.value }, submitted: existing?.submitted });
      };
      rowScope.listen(formula, "input", markDraft);
      rowScope.listen(type, "change", markDraft);
      rowScope.listen(dc, "input", markDraft);
      rowScope.listen(formula, "input", () => { save.disabled = !writable() || modal.pending || (formula.value === condition.formula && type.value === condition.damageType && Number(dc.value) === condition.dc); });
      rowScope.listen(type, "change", () => { save.disabled = !writable() || modal.pending || (formula.value === condition.formula && type.value === condition.damageType && Number(dc.value) === condition.dc); });
      rowScope.listen(dc, "input", () => { save.disabled = !writable() || modal.pending || (formula.value === condition.formula && type.value === condition.damageType && Number(dc.value) === condition.dc); });
      save.disabled = !writable() || (formula.value === condition.formula && type.value === condition.damageType && Number(dc.value) === condition.dc);
      for (const control of [formula, type, dc, save, remove, recover, roll]) if (!writable()) control.disabled = true;
      item.append(node("h3", { text: `${condition.formula} · ${condition.damageType}` }),
        node("div", { className: "ve-pf2e-persistent-damage-fields", children: [
          node("label", { children: [node("span", { text: t("VEMOBILE.PF2E.PersistentDamage.Formula", "Damage formula") }), formula] }),
          node("label", { children: [node("span", { text: t("VEMOBILE.PF2E.PersistentDamage.DamageType", "Damage type") }), type] }),
          node("label", { children: [node("span", { text: t("VEMOBILE.PF2E.PersistentDamage.DC", "Recovery DC") }), dc] })
        ] }), node("div", { className: "ve-pf2e-persistent-damage-actions", children: [save, remove, recover, roll] }));
      list.append(item);
    }
    body.scrollTop = scroll;
    if (focusId) [...layer.querySelectorAll("[data-field-id]")].find(control => control.getAttribute("data-field-id") === focusId)?.focus?.({ preventScroll: true });
  };

  modal.refresh = () => {
    if (modal.pending || scope.disposed) return;
    if (shell.actor?.sourceUuid !== modal.sourceUuid || !actorRecord(shell)) { modal.close(false); return; }
    const next = actorRecord(shell);
    const canWrite = writable();
    const ids = new Set((next.conditions ?? []).map(condition => condition.id));
    for (const id of removedIds) if (!ids.has(id)) removedIds.delete(id);
    const signature = JSON.stringify(next);
    if (signature === rowsSignature && canWrite === renderedWritable) return;
    rowsSignature = signature;
    renderedWritable = canWrite;
    renderRows(next);
    createFormula.disabled = !canWrite;
    createDc.disabled = !canWrite;
    addButton.disabled = !canWrite;
    createType.disabled = !canWrite || !(next.types ?? []).length;
  };
  modal.refresh();
  closeButton.focus?.({ preventScroll: true });
}

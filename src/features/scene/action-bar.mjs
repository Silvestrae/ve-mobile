import { localizedText } from "../../ui/localized-text.mjs";
import { icon, node } from "../../ui/dom.mjs";
import { bindQuickbarController } from "./quickbar-controller.mjs";
import { ACTOR_COMMANDS } from "../../kernel/command-names.mjs";
import { ACTION_BAR_PAGE_SIZE, ACTION_BAR_SLOT_COUNT, actionBarPage, actionBarColumns, cycleActionBarPage } from "../../kernel/action-bar-model.mjs";

/** Both sources share a presentation, while all native reads/writes stay injected. */
export function renderActionBar({ actor, hotbar, source = "character", commands, scope, collapsed = false, onCollapsedVisualChange = () => {} }) {
  const native = source === "foundry";
  const label = native ? localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.FoundryHotbar", "Foundry Hotbar") : localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.CharacterQuickbar", "Character Quickbar");
  const memory = commands.readActionBarPreferences?.(source, actor?.sourceUuid) ?? {};
  let page = actionBarPage(memory.page);
  let staged = Array.from({ length: ACTION_BAR_SLOT_COUNT }, (_, index) => (native ? hotbar?.slots : actor?.quickbar)?.[index] ?? null);
  const baseline = staged.map(storedDescriptor);
  let editing = false;
  let selected = -1;
  let dirty = false;
  let pending = false;
  let pickerScope = null;
  let gesture = null;
  const status = node("div", { className: "ve-quickbar-status", attrs: { role: "status", "aria-live": "polite" } });
  const board = node("div", { className: "ve-quickbar-board" });
  const message = node("span", { className: "ve-quickbar-idle-message", text: localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.SelectAToken", "Select a token") });
  const controls = node("div", { className: "ve-action-bar-pages" });
  const editControls = node("div", { className: "ve-action-bar-edit-controls", attrs: { hidden: true } });
  const picker = node("div", { className: "ve-action-bar-picker", attrs: { hidden: true, role: "dialog", "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.ChooseAMacro", "Choose a macro") } });
  const bar = node("div", { className: "ve-quickbar", attrs: { role: "toolbar", "aria-label": label }, children: [board, message, controls] });
  const wrapper = node("div", { className: `ve-quickbar-wrap${collapsed ? " is-collapsed" : ""}`, attrs: { "data-ve-scene-control": true, "data-source": source, "data-columns": 5 } });
  const button = (name, glyph, action, className = "") => node("button", {
    className, attrs: { type: "button", "aria-label": name, title: name, "data-ve-scene-control": true },
    on: { click: action }, children: [icon(glyph)]
  }, scope);
  const handle = button(collapsed ? localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.ExpandActionBar", "Expand action bar") : localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.CollapseActionBar", "Collapse action bar"), collapsed ? "fa-chevron-up" : "fa-chevron-down", () => {
    if (editing || pending) return;
    collapsed = !collapsed;
    wrapper.classList.toggle("is-collapsed", collapsed);
    handle.setAttribute("aria-expanded", String(!collapsed));
    handle.setAttribute("aria-label", collapsed ? localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.ExpandActionBar", "Expand action bar") : localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.CollapseActionBar", "Collapse action bar"));
    handle.replaceChildren(icon(collapsed ? "fa-chevron-up" : "fa-chevron-down"));
    onCollapsedVisualChange(collapsed);
    commands.setQuickbarCollapsed(collapsed);
  }, "ve-quickbar-mark");
  handle.setAttribute("aria-expanded", String(!collapsed));
  wrapper.append(status, handle, picker, editControls, bar);
  const slots = Array.from({ length: ACTION_BAR_PAGE_SIZE }, () => node("button", { className: "ve-quickbar-slot", attrs: { type: "button", "data-ve-scene-control": true } }));
  board.append(...slots);
  const closePicker = () => { pickerScope?.dispose(); pickerScope = null; picker.hidden = true; picker.replaceChildren(); };
  scope.own(closePicker);
  const pickerHeader = (title, closeLabel, owner) => {
    const dismiss = node("button", { attrs: { type: "button", "aria-label": closeLabel },
      children: [icon("fa-xmark"), node("span", { text: localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.Close", "Close") })], on: { click: closePicker } }, owner);
    return { dismiss, element: node("div", { className: "ve-action-bar-picker-header", children: [node("strong", { text: title }), dismiss] }) };
  };
  const report = (error) => { if (scope.disposed) return; status.classList.add("is-error"); status.textContent = error?.message ?? localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.ActionFailed", "Action failed"); };
  const run = async (action) => {
    if (pending || scope.disposed) return;
    pending = true;
    update();
    try { await action(); } catch (error) { report(error); }
    finally { pending = false; if (!scope.disposed) update(); }
  };
  const changePage = (next) => {
    if (pending) return;
    gesture?.reset();
    closePicker();
    selected = -1;
    page = actionBarPage(next);
    commands.setActionBarPage?.(source, actor?.sourceUuid, page);
    update();
  };
  const previous = button(localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.PreviousActionBarPage", "Previous action bar page"), "fa-chevron-left", () => changePage(cycleActionBarPage(page, -1)));
  const next = button(localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.NextActionBarPage", "Next action bar page"), "fa-chevron-right", () => changePage(cycleActionBarPage(page, 1)));
  const pagePicker = node("select", { attrs: { "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.ActionBarPage", "Action bar page"), "data-ve-scene-control": true },
    children: Array.from({ length: 5 }, (_, i) => node("option", { attrs: { value: i + 1 }, text: `${i + 1}/5` })),
    on: { change: () => changePage(Number(pagePicker.value)) }
  }, scope);
  controls.append(pagePicker, previous, next);
  const done = button(localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.SaveQuickbarArrangement", "Save Quickbar arrangement"), "fa-check", () => run(async () => {
    if (dirty) await commands.saveQuickbar(actor.sourceUuid, staged.map(storedDescriptor), baseline);
    if (scope.disposed) return;
    editing = false; dirty = false; selected = -1; status.textContent = localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.ArrangementSaved", "Arrangement saved");
  }), "ve-quickbar-confirm");
  const cancel = button(localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.CancelQuickbarEdits", "Cancel Quickbar edits"), "fa-xmark", () => { staged = Array.from({ length: ACTION_BAR_SLOT_COUNT }, (_, i) => actor?.quickbar?.[i] ?? null); editing = false; dirty = false; selected = -1; status.textContent = ""; update(); });
  const remove = button(localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.RemoveSelectedShortcut", "Remove selected shortcut"), "fa-trash", () => run(async () => {
    if (selected < 0) return;
    if (native) await commands.assignHotbarMacro({ slot: selected + 1, macroId: null, expectedMacroId: staged[selected]?.macroId ?? null });
    else { staged[selected] = null; dirty = true; selected = -1; status.textContent = localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.ShortcutRemovedSaveToKeepChanges", "Shortcut removed; save to keep changes"); }
  }));
  const edit = button(localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.EditSelectedMacro", "Edit selected macro"), "fa-pen-to-square", () => run(() => commands.editHotbarMacro({ slot: selected + 1, macroId: staged[selected]?.macroId })));
  const finishNative = button(localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.FinishHotbarEditing", "Finish Hotbar editing"), "fa-check", () => { editing = false; selected = -1; closePicker(); update(); });
  const move = button(localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.MoveSelectedShortcut", "Move selected shortcut"), "fa-arrows-up-down-left-right", () => {
    if (pending || selected < 0 || (native && hotbar?.locked)) return;
    const from = selected;
    closePicker();
    pickerScope = scope.child("slot-picker");
    const owner = pickerScope;
    picker.dataset.kind = "move";
    const header = pickerHeader(localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.MoveSlotTo", "Move slot {from1} to…", { from1: (from + 1) }), localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.CloseSlotPicker", "Close slot picker"), owner);
    const destinations = node("div", { className: "ve-action-bar-destinations" });
    for (let index = 0; index < staged.length; index++) destinations.append(node("button", {
      attrs: { type: "button", disabled: index === from, "aria-label": staged[index] ? localizedText(commands.localize, "VEMOBILE.ActionBar.MoveSwap", "Move to slot {slot}; swap with {name}", { slot: index + 1, name: staged[index].label }) : localizedText(commands.localize, "VEMOBILE.ActionBar.MoveEmpty", "Move to slot {slot}; empty", { slot: index + 1 }) },
      text: String(index + 1), on: { click: () => run(async () => {
        if (native) await commands.moveHotbarMacro({ fromSlot: from + 1, slot: index + 1, macroId: staged[from]?.macroId, expectedMacroId: staged[index]?.macroId ?? null });
        else {
          [staged[from], staged[index]] = [staged[index], staged[from]]; dirty = true; selected = index;
          page = Math.floor(index / ACTION_BAR_PAGE_SIZE) + 1;
          commands.setActionBarPage?.(source, actor?.sourceUuid, page);
        }
        if (!scope.disposed) closePicker();
      }) }
    }, owner));
    picker.append(header.element, destinations);
    picker.hidden = false;
    header.dismiss.focus?.({ preventScroll: true });
  });
  editControls.append(done, cancel, finishNative, move, remove, edit);
  const chooseMacro = (index) => {
    if (hotbar?.locked || pending) return;
    closePicker();
    pickerScope = scope.child("macro-picker");
    const owner = pickerScope;
    picker.dataset.kind = "macro";
    const header = pickerHeader(localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.AssignMacroToSlot", "Assign macro to slot {index1}", { index1: (index + 1) }), localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.CloseMacroPicker", "Close macro picker"), owner);
    const choices = node("div", { className: "ve-action-bar-macro-list" });
    const directory = macroDirectory(hotbar?.macros ?? [], hotbar?.rootSorting);
    let currentFolder = directory;
    const pageSize = 30;
    let resultPage = 0;
    let results = [];
    let resultsScope = null;
    owner.own(() => resultsScope?.dispose());
    const count = node("span", { attrs: { role: "status", "aria-live": "polite" } });
    const previousResults = node("button", { attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.PreviousMacroResults", "Previous macro results") }, children: [icon("fa-chevron-left")],
      on: { click: () => { if (resultPage > 0) { resultPage--; drawResults(); } } } }, owner);
    const nextResults = node("button", { attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.NextMacroResults", "Next macro results") }, children: [icon("fa-chevron-right")],
      on: { click: () => { if ((resultPage + 1) * pageSize < results.length) { resultPage++; drawResults(); } } } }, owner);
    const pagination = node("div", { className: "ve-action-bar-picker-pages", children: [previousResults, count, nextResults] });
    const folderName = node("span");
    const back = node("button", { attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.BackToParentMacroFolder", "Back to parent macro folder") }, children: [icon("fa-chevron-left"), node("span", { text: localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.Back", "Back") })],
      on: { click: () => { if (currentFolder.parent) openFolder(currentFolder.parent); } } }, owner);
    const navigation = node("div", { className: "ve-action-bar-folder-path", children: [back, folderName] });
    const openFolder = (folder) => { currentFolder = folder; resultPage = 0; drawResults(); };
    function drawResults() {
      resultsScope?.dispose();
      resultsScope = owner.child("macro-results");
      results = [...currentFolder.folders, ...currentFolder.macros];
      navigation.hidden = !currentFolder.parent;
      const path = [];
      for (let folder = currentFolder; folder?.folder; folder = folder.parent) path.unshift(folder.folder.name);
      folderName.textContent = path.join(" / ");
      const start = resultPage * pageSize;
      // Keep large native macro libraries from creating hundreds of image/DOM nodes.
      choices.replaceChildren(...results.slice(start, start + pageSize).map((entry) => entry.folder ? node("button", {
        className: "ve-action-bar-macro-folder", attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.OpenMacroFolder", "Open macro folder {name}", { name: (entry.folder.name) }), "data-folder-id": entry.folder.id },
        children: [icon("fa-folder"), node("span", { text: entry.folder.name }), node("small", { text: entry.count }), icon("fa-chevron-right")],
        on: { click: () => openFolder(entry) }
      }, resultsScope) : macroChoice(entry)));
      function macroChoice(macro) { return node("button", { attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.Assign", "Assign {label}", { label: (macro.label) }) },
        children: [macro.img ? node("img", { attrs: { src: macro.img, alt: "", loading: "lazy", decoding: "async" } }) : icon("fa-code"), node("span", { text: macro.label })],
        on: { click: () => run(async () => {
          await commands.assignHotbarMacro({ slot: index + 1, macroId: macro.macroId, expectedMacroId: staged[index]?.macroId ?? null });
          if (!scope.disposed) closePicker();
        }) }
      }, resultsScope); }
      if (!results.length) choices.append(node("p", { text: localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.NoExecutableMacrosAreAvailableCreateMacrosInFoundry", "No executable macros are available. Create macros in Foundry to assign them here.") }));
      choices.scrollTop = 0;
      count.textContent = results.length ? localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.Of", "{start1}–{length} of {length3}", { start1: (start + 1), length: (Math.min(start + pageSize, results.length)), length3: (results.length) }) : localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.Macros", "0 macros");
      previousResults.disabled = resultPage === 0;
      nextResults.disabled = start + pageSize >= results.length;
      pagination.hidden = results.length <= pageSize;
    }
    drawResults();
    picker.append(header.element, navigation, choices, pagination);
    picker.hidden = false;
    // A non-editable control gives the picker focus without a software keyboard.
    header.dismiss.focus?.({ preventScroll: true });
  };
  const activate = (index) => run(async () => {
    const shortcut = staged[index];
    if (native && !shortcut) { chooseMacro(index); return; }
    if (!shortcut?.available) throw new Error(localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.IsNoLongerAvailable", "{labelShortcut} is no longer available", { labelShortcut: (shortcut?.label ?? localizedText(commands.localize, "VEMOBILE.ActionBar.Shortcut", "Shortcut")) }));
    if (native) { await commands.executeHotbarMacro({ slot: index + 1, macroId: shortcut.macroId }); return; }
    const command = shortcut.kind === "skill" ? ACTOR_COMMANDS.ROLL_SKILL : ACTOR_COMMANDS.USE_ITEM;
    const payload = shortcut.kind === "skill" ? { skill: shortcut.skill } : { itemId: shortcut.itemId, ...(shortcut.activityId ? { activityId: shortcut.activityId } : {}) };
    let openedId = "";
    const openActionSession = (session) => {
      const id = String(session?.rootMessageId ?? "");
      if (scope.disposed || !id || id === openedId) return;
      openedId = id;
      commands.openActionSession(session, "scene");
    };
    const outcome = await commands.execute(command, { actorSourceUuid: actor.sourceUuid, ...payload }, { onActionSession: openActionSession });
    if (outcome?.actionSession) openActionSession(outcome.actionSession);
  });
  function update() {
    const idle = !native && !actor;
    wrapper.classList.toggle("is-idle", idle);
    wrapper.classList.toggle("is-editing", editing);
    board.hidden = idle; controls.hidden = idle; message.hidden = !idle;
    editControls.hidden = !editing;
    done.hidden = native; cancel.hidden = native; finishNative.hidden = !native;
    done.disabled = cancel.disabled = finishNative.disabled = pending;
    remove.disabled = pending || selected < 0 || !staged[selected] || (native && hotbar?.locked);
    move.disabled = pending || selected < 0 || !staged[selected]?.available || (native && hotbar?.locked);
    edit.hidden = !native; edit.disabled = pending || selected < 0 || !staged[selected]?.editable;
    handle.disabled = pending || editing;
    previous.disabled = next.disabled = pagePicker.disabled = pending;
    pagePicker.value = String(page);
    for (let cell = 0; cell < slots.length; cell++) {
      const index = (page - 1) * ACTION_BAR_PAGE_SIZE + cell;
      const shortcut = staged[index];
      const element = slots[cell];
      element.dataset.veQuickbarSlot = String(index);
      element.className = `ve-quickbar-slot${shortcut ? " is-filled" : " is-empty"}${shortcut && !shortcut.available ? " is-unavailable" : ""}${selected === index && editing ? " is-selected" : ""}`;
      element.disabled = pending || (idle || (!shortcut && !editing && (!native || hotbar?.locked)));
      const slotLabel = !shortcut ? ["EmptySlot", "{bar} slot {slot}: empty"] : !shortcut.available ? ["UnavailableSlot", "{bar} slot {slot}: {name}; unavailable"] : ["Slot", "{bar} slot {slot}: {name}"];
      element.setAttribute("aria-label", localizedText(commands.localize, `VEMOBILE.ActionBar.${slotLabel[0]}`, slotLabel[1], { bar: label, slot: index + 1, name: shortcut?.label }));
      element.title = shortcut?.label ?? localizedText(commands.localize, "VEMOBILE.Interface.ActionBar.AssignMacro", "Assign macro");
      element.replaceChildren(shortcut?.img ? node("img", { attrs: { src: shortcut.img, alt: "" } }) : icon(shortcut?.kind === "skill" ? "fa-dice-d20" : shortcut ? "fa-code" : "fa-plus"), node("span", { className: "ve-action-bar-slot-number", text: cell + 1 }));
    }
  }
  const enterEdit = (index) => { if (pending || !staged[index]) return; editing = true; selected = index; update(); };
  gesture = bindQuickbarController({ bar, scope, getSlots: () => staged, isEditing: () => editing, deferSwap: native,
    canPress: (index) => !pending && (Boolean(staged[index]) || (native && !hotbar?.locked)),
    onActivate: (index) => { if (native && !staged[index]) chooseMacro(index); else void activate(index); },
    onEnterEdit: enterEdit,
    onSelect: (index) => { selected = index; if (native && !staged[index]) chooseMacro(index); update(); },
    onSwap: (from, to) => {
      if (native) { if (!hotbar?.locked) void run(() => commands.moveHotbarMacro({ fromSlot: from + 1, slot: to + 1, macroId: staged[from]?.macroId, expectedMacroId: staged[to]?.macroId ?? null })); return; }
      [staged[from], staged[to]] = [staged[to], staged[from]]; selected = to; dirty = true; update();
    },
    onDragChange: (index, dragging) => slots.find((slot) => Number(slot.dataset.veQuickbarSlot) === index)?.classList.toggle("is-dragging", dragging)
  });
  // Capture all touch/context gestures, including disabled and empty cells.
  for (const type of ["pointerdown", "pointerup", "pointermove", "touchstart", "touchend", "touchmove", "dblclick", "contextmenu", "click"]) {
    scope.listen(wrapper, type, (event) => {
      event.stopPropagation();
      if (["contextmenu", "dblclick"].includes(type)) event.preventDefault();
      if (type === "contextmenu") {
        const slot = event.target?.closest?.("[data-ve-quickbar-slot]");
        if (slot && bar.contains(slot)) enterEdit(Number(slot.dataset.veQuickbarSlot));
      }
    });
  }
  scope.listen(wrapper, "keydown", (event) => {
    if (event.key === "F2") {
      event.preventDefault(); event.stopPropagation();
      const slot = event.target?.closest?.("[data-ve-quickbar-slot]");
      if (slot && bar.contains(slot)) enterEdit(Number(slot.dataset.veQuickbarSlot));
    }
    if (event.key === "Escape") { event.stopPropagation(); closePicker(); if (native) { editing = false; selected = -1; update(); } }
  });
  update();
  return wrapper;
}

export function bindActionBarLayout(surface, wrapper, scope, { Observer = globalThis.ResizeObserver } = {}) {
  if (!wrapper) return;
  const resize = () => {
    if (scope.disposed) return;
    const columns = actionBarColumns(surface.getBoundingClientRect().width);
    wrapper.dataset.columns = String(columns);
    surface.dataset.quickbarRows = String(Math.ceil(ACTION_BAR_PAGE_SIZE / columns));
    const height = wrapper.getBoundingClientRect().height;
    if (height > 0) surface.style.setProperty("--ve-action-bar-clearance", `${Math.ceil(height + 20)}px`);
  };
  if (typeof Observer === "function") {
    const observer = new Observer(resize);
    scope.own(() => observer.disconnect());
    observer.observe(surface);
    observer.observe(wrapper);
  }
  resize();
}

function macroDirectory(macros, rootSorting = "m") {
  const branch = (folder, parent) => ({ folder, parent, count: 0, folders: new Map(), macros: [], sorting: folder?.sorting ?? rootSorting });
  const root = branch(null, null);
  for (const macro of macros) {
    let current = root;
    current.count++;
    for (const folder of macro.folderPath ?? []) {
      if (!current.folders.has(folder.id)) current.folders.set(folder.id, branch(folder, current));
      current = current.folders.get(folder.id);
      current.count++;
    }
    current.macros.push(macro);
  }
  const sort = current => {
    const compare = (a, b) => (current.sorting === "a" ? 0 : (Number(a.sort) || 0) - (Number(b.sort) || 0))
      || String(a.name ?? a.label).localeCompare(String(b.name ?? b.label));
    current.folders = [...current.folders.values()].sort((a, b) => compare(a.folder, b.folder));
    current.macros.sort(compare);
    current.folders.forEach(sort);
  };
  sort(root);
  return root;
}

function storedDescriptor(shortcut) {
  if (!shortcut) return null;
  if (shortcut.kind === "macro") return { kind: "macro", macroId: shortcut.macroId };
  if (shortcut.kind === "skill") return { kind: "skill", skill: shortcut.skill, label: shortcut.label, img: shortcut.img ?? "" };
  return { kind: "item", itemId: shortcut.itemId, ...(shortcut.activityId ? { activityId: shortcut.activityId } : {}), label: shortcut.label, img: shortcut.img ?? "" };
}

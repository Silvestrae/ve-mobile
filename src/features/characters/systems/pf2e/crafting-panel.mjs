import { ACTOR_COMMANDS } from "../../../../kernel/command-names.mjs";
import { node, icon } from "../../../../ui/dom.mjs";
import { localizedText } from "../../../../ui/localized-text.mjs";
import { bindLongPress } from "../../../../ui/long-press.mjs";
import { notifyCharacter, characterErrorMessage } from "../../notifications.mjs";

/** Render the lazily loaded Crafting tab. The pane scope owns every listener and
 * pending DOM update; the retained shell owns only plain UI state and one read promise.
 * Native documents never cross into this presenter. */
export function renderCraftingPanel({ actor, commands, scope, shell }) {
  const root = node("section", { className: "ve-pf2e-crafting" });
  scope.own(() => root.remove());
  const translate = (key, fallback, values) => localizedText(commands.localize, `VEMOBILE.PF2E.Crafting.${key}`, fallback, values);
  const nativeText = (key, fallback) => localizedText(commands.localize, key, fallback);
  root.setAttribute("aria-label", translate("Title", "Crafting"));
  if (shell.craftingState?.source !== actor.sourceUuid) shell.craftingState = { source: actor.sourceUuid, search: "", level: "", page: 0, expanded: new Set(), quantities: new Map() };
  const state = shell.craftingState;
  let rowsScope = null, data = null, pending = Boolean(state.pending), surfaceScope = null, readGeneration = 0;
  const content = node("div", { className: "ve-pf2e-crafting-content" });
  root.append(content);
  // Retain only user drafts and focus/scroll identity across native publications.
  // The parent replaces this asynchronous pane before its new read has completed.
  const captureView = () => {
    state.scrollTop = shell.scroller?.scrollTop ?? 0;
    const active = root.ownerDocument.activeElement;
    if (root.contains(active)) {
      state.focusKey = active.dataset.pf2eFocusKey ?? "";
      state.selection = [active.selectionStart, active.selectionEnd];
    } else if (!state.pending) state.focusKey = "";
  };
  scope.own(captureView);
  // Every asynchronous continuation checks both pane lifetime and exact retained source.
  const current = () => !scope.disposed && shell.actor?.sourceUuid === actor.sourceUuid && shell.screen?.dataset.pf2eView === "crafting";
  const read = payload => commands.readCharacterCrafting({ actorSourceUuid: actor.sourceUuid, ...payload });
  // Follow the other PF2e tabs' familiar action glyphs and accessible labels.
  const button = (label, action, disabled = false, owner = rowsScope ?? scope, focusKey = "", glyph = "", iconOnly = false) => node("button", {
    className: `ve-pf2e-action-button${/^(daily|reset|learn|picker:|crafting-craft:|ability-craft:)/.test(focusKey) ? " ve-pf2e-crafting-primary" : ""}`, dataset: focusKey ? { pf2eFocusKey: focusKey } : {},
    attrs: { type: "button", disabled: disabled || pending, "aria-label": label, title: label },
    children: [glyph ? icon(glyph) : null, iconOnly ? null : node("span", { text: label })], on: { click: action }
  }, owner);
  // PF2e's consuming ability.craft spends one unit of its configured resource.
  const abilityMessage = (ability, formula) => ability.resource
    ? translate("AbilityResourceConfirm", "Craft {name} (batch {batch}) for 1 {resource}?", { name: formula.name, batch: formula.batchSize, resource: ability.resource.label })
    : translate("AbilityCraftConfirm", "Craft {name} using this ability?", formula);

  // Invalidate only the retained open-tab read, then fetch authoritative native state.
  const load = async (force = false) => {
    if (!current()) return;
    if (data && !pending) captureView();
    const generation = ++readGeneration;
    content.inert = true;
    root.setAttribute("aria-busy", "true");
    let actionError = null;
    try {
      // A native publication may remount this pane during a consuming action.
      // Let that exact action finish before asking the gateway for a snapshot;
      // a mid-update snapshot may legitimately be rejected as stale. The current
      // replacement also owns feedback if the action itself fails.
      const activeOperation = state.pending;
      if (activeOperation) {
        try { await activeOperation; } catch (error) { actionError = error; }
        if (!current() || generation !== readGeneration) return;
        force = true;
      }
      if (force || shell.craftingRead?.actor !== actor) shell.craftingRead = { actor, promise: read({}) };
      const result = await shell.craftingRead.promise;
      if (!current() || generation !== readGeneration) return;
      content.inert = false;
      data = result; pending = Boolean(state.pending);
      if (!pending) root.removeAttribute("aria-busy");
      render();
      if (actionError) notifyCharacter(commands, actor.sourceUuid, characterErrorMessage(commands, actionError, translate("ActionFailed", "Crafting could not be completed.")), "error");
    } catch (error) {
      if (!current() || generation !== readGeneration) return;
      content.inert = false;
      pending = false; root.removeAttribute("aria-busy");
      if (actionError) notifyCharacter(commands, actor.sourceUuid, characterErrorMessage(commands, actionError, translate("ActionFailed", "Crafting could not be completed.")), "error");
      notifyCharacter(commands, actor.sourceUuid, characterErrorMessage(commands, error, localizedText(commands.localize, "VEMOBILE.Character.Errors.LoadFailed", "Could not load {label}.", { label: translate("Title", "Crafting") }), { readOnly: true }), "error");
      content.replaceChildren(button(translate("Retry", "Retry"), () => load(true), false, scope));
    }
  };

  // Send only explicit named crafting operations; the native boundary rechecks authority.
  const run = async (payload, command = ACTOR_COMMANDS.EDIT_PF2E_CRAFTING) => {
    if (!current() || pending || !data?.owner) return;
    captureView();
    pending = true; root.setAttribute("aria-busy", "true");
    for (const control of root.querySelectorAll("button,input,select")) control.disabled = true;
    try {
      const operation = Promise.resolve().then(() => commands.execute(command, { actorSourceUuid: actor.sourceUuid, ...payload }));
      state.pending = operation;
      try { await operation; } finally { if (state.pending === operation) state.pending = null; }
      if (shell.craftingRead?.actor === actor) shell.craftingRead = null;
      if (current()) await load(true);
    } catch (error) {
      if (shell.craftingRead?.actor === actor) shell.craftingRead = null;
      if (!current()) return;
      pending = false; root.removeAttribute("aria-busy"); render();
      notifyCharacter(commands, actor.sourceUuid, characterErrorMessage(commands, error, translate("ActionFailed", "Crafting could not be completed.")), "error");
    }
  };

  // Reuse the character editors' viewport-sized modal layer. The current rows
  // own it, so publication, actor/tab replacement and teardown close stale choices.
  const openSurface = (title, kind, glyph) => {
    if (!current() || pending || !data?.owner) return null;
    title = title.replace(/(?:…|\.{3})$/u, "");
    surfaceScope?.dispose();
    const priorFocus = root.ownerDocument.activeElement;
    const modalScope = rowsScope.child(`crafting-${kind}`);
    surfaceScope = modalScope;
    const close = () => {
      modalScope.dispose();
      if (current() && priorFocus?.isConnected) priorFocus.focus({ preventScroll: true });
    };
    const body = node("div", { className: `ve-pf2e-editor-body ve-pf2e-crafting-${kind}` });
    const footer = node("footer");
    const closeButton = button(translate("Close", "Close"), close, false, modalScope);
    closeButton.classList.add("ve-pf2e-editor-close");
    closeButton.setAttribute("aria-label", translate("Close", "Close"));
    closeButton.replaceChildren(icon("fa-xmark"));
    const form = node("form", { className: "ve-pf2e-document-dialog ve-pf2e-crafting-modal", attrs: {
      role: "dialog", "aria-modal": "true", "aria-label": title
    }, children: [node("header", { children: [icon(glyph), node("div", { children: [
      node("small", { text: actor.name }), node("h2", { text: title })
    ] }), closeButton] }), body, footer] });
    const layer = node("div", { className: "ve-pf2e-document-layer", dataset: {
      veBackDismissable: "true", veBackKind: "crafting-modal"
    }, children: [form] });
    const host = shell.screen.closest(".ve-mobile-app") ?? shell.screen;
    // Prevent background navigation and keyboard access without changing its
    // layout or scroll position. Restore each sibling's original inert state.
    const background = [...host.children].map(element => [element, element.inert]);
    modalScope.own(() => {
      layer.remove();
      for (const [element, inert] of background) element.inert = inert;
      if (surfaceScope === modalScope) surfaceScope = null;
    });
    for (const [element] of background) element.inert = true;
    host.append(layer);
    const view = root.ownerDocument.defaultView, viewport = view?.visualViewport;
    // Keep the popup in the visible viewport, including Tablet Split and keyboards.
    const fit = () => {
      layer.style.top = `${viewport?.offsetTop ?? 0}px`; layer.style.left = `${viewport?.offsetLeft ?? 0}px`;
      layer.style.width = `${viewport?.width ?? view?.innerWidth ?? 0}px`; layer.style.height = `${viewport?.height ?? view?.innerHeight ?? 0}px`;
    };
    fit();
    for (const target of [view, viewport].filter(Boolean)) modalScope.listen(target, "resize", fit);
    if (viewport) modalScope.listen(viewport, "scroll", fit);
    modalScope.listen(form, "submit", event => event.preventDefault());
    modalScope.listen(layer, "ve-close", close);
    modalScope.listen(layer, "click", event => { if (event.target === layer) close(); });
    modalScope.listen(layer, "keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key !== "Tab") return;
      const controls = [...form.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled)")];
      const first = controls[0], last = controls.at(-1), active = root.ownerDocument.activeElement;
      if (event.shiftKey && active === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first?.focus(); }
    });
    return { scope: modalScope, body, footer, form, layer, close };
  };

  // Confirm destructive/consuming intent in a popup, matching native confirmation
  // placement and the other VE editors while retaining the guarded named command.
  const confirm = (message, payload) => {
    const title = payload.operation === "forget" ? translate("Forget", "Forget formula…")
      : payload.operation === "reset" ? translate("Reset", "Reset preparation…")
      : payload.operation === "daily" ? translate("PrepareDaily", "Complete daily preparation…")
      : payload.originalFreeCrafting && !payload.originalQuickAlchemy ? nativeText("PF2E.Actor.Character.Crafting.Create", "Create") : translate("Craft", "Craft…");
    const modal = openSurface(title, "confirm", payload.operation === "forget" ? "fa-trash" : "fa-hammer");
    if (!modal) return;
    const { scope: confirmationScope, body, footer, close } = modal;
    body.append(node("p", { text: message }));
    const cancel = button(translate("Cancel", "Cancel"), close, false, confirmationScope);
    const actionLabel = title.replace(/(?:…|\.{3})$/u, "");
    const proceed = button(actionLabel, () => { close(); void run({ ...payload, confirmed: true }); }, false, confirmationScope);
    proceed.classList.add("is-primary");
    footer.append(cancel, proceed);
    cancel.focus({ preventScroll: true });
  };

  // Compact native-style item rows share disclosure structure. Prepared rows have
  // distinct keys, so opening one ability never opens the same formula elsewhere.
  // The row scope owns description reads; closed rows never enrich their content.
  const formulaRow = (formula, controls, rowScope, { key = `formula:${formula.uuid}`, prepared = false, onOpen = null } = {}) => {
    const description = node("div", { className: "ve-pf2e-row-description" });
    const quantityText = prepared ? `×${formula.quantity}` : "";
    const details = node("details", { className: `${prepared ? "ve-pf2e-crafting-item ve-pf2e-crafting-prepared" : "ve-pf2e-crafting-item ve-pf2e-crafting-formula"}${formula.expended ? " is-expended" : ""}`,
      dataset: { pf2eDisclosureKey: key }, attrs: { open: state.expanded.has(key) }, children: [
      node("summary", { dataset: { pf2eFocusKey: `disclosure:${key}` }, children: [formula.img ? node("img", { attrs: { src: formula.img, alt: "", loading: "lazy", draggable: false } }) : icon("fa-scroll"),
        node("strong", { text: formula.name }),
        prepared ? node("span", { className: "ve-pf2e-crafting-row-quantity", text: quantityText,
          attrs: { "aria-label": translate("PreparedQuantity", "Prepared quantity: {quantity} · batches: {batches}", formula) },
          children: [formula.isSignatureItem ? icon("fa-star") : null, formula.expended ? node("small", { text: nativeText("VEMOBILE.PF2E.Character.Expended", "Expended") }) : null] }) : null,
        icon("fa-chevron-down")] }),
      node("div", { className: "ve-pf2e-crafting-detail", children: [
        node("p", { className: "ve-pf2e-crafting-meta", text: prepared
          ? translate("PreparedQuantity", "Prepared quantity: {quantity} · batches: {batches}", formula)
          : translate("FormulaMetadata", "Level {level} · batch {batch}", { level: formula.level, batch: formula.batchSize }) }),
        prepared ? controls : null,
        node("div", { className: "ve-pf2e-crafting-facts", children: [
          node("span", { text: `${nativeText("PF2E.CraftDCTitle", "DC")} ${formula.dc}` }),
          formula.price ? node("span", { text: translate("UnitPrice", "Price: {price} per {quantity}", { price: formula.price, quantity: formula.pricePer }) }) : null,
        ] }),
        (formula.traitLabels ?? formula.traits)?.length ? node("div", { className: "ve-pf2e-crafting-traits", children: (formula.traitLabels ?? formula.traits).map(trait => node("span", { className: "ve-pf2e-crafting-trait", text: trait })) }) : null,
        prepared ? null : controls, description
      ] })
    ] });
    // Right-click and a stationary hold provide another route to these same
    // visible controls. The shared gesture owner cancels scrolling/disposal and
    // swallows the release click; no gesture invokes a crafting mutation.
    const summary = details.querySelector(":scope > summary");
    const openControls = () => {
      if (!current() || rowScope.disposed || pending || !details.isConnected) return;
      state.expanded.add(key);
      details.open = true;
      summary.focus({ preventScroll: true });
    };
    bindLongPress(summary, rowScope, openControls, { claimPointer: true });
    rowScope.listen(summary, "keydown", event => {
      if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
      event.preventDefault();
      openControls();
    });
    let loaded = false;
    const showDetails = async () => {
      if (!details.open || loaded || !current() || rowScope.disposed) return;
      onOpen?.();
      loaded = true; description.textContent = translate("Loading", "Loading crafting…");
      try {
        const result = await read({ operation: "details", formulaUuid: formula.uuid });
        if (!current() || rowScope.disposed || !description.isConnected) return;
        description.innerHTML = result.html;
        if (!result.html?.trim()) description.textContent = nativeText("VEMOBILE.PF2E.Character.Empty", "Nothing to show here.");
      } catch (error) { if (current() && !rowScope.disposed && description.isConnected) { description.textContent = characterErrorMessage(commands, error, localizedText(commands.localize, "VEMOBILE.Character.Errors.LoadFailed", "Could not load {label}.", { label: formula.name }), { readOnly: true }); loaded = false; } }
    };
    rowScope.listen(details, "toggle", () => {
      if (details.open) { state.expanded.add(key); void showDetails(); } else state.expanded.delete(key);
    });
    if (details.open) queueMicrotask(() => { if (!rowScope.disposed) void showDetails(); });
    return details;
  };

  // Section headers and pressed mode buttons use the existing VE palette and
  // compact PF2e toolbar sizing, retaining readable labels and accessible names.
  const sectionHeader = (label, action = null) => node("header", { className: "ve-pf2e-crafting-header", children: [node("h3", { text: label }), action] });
  const modeButton = (label, active, action, focusKey) => {
    const control = button(label, action, !data.owner, rowsScope, focusKey);
    control.classList.add("ve-pf2e-crafting-mode");
    control.setAttribute("aria-pressed", String(active));
    control.prepend(icon(active ? "fa-square-check" : "fa-square", active ? "solid" : "regular"));
    return control;
  };

  // Pick formulas for one entry or learn from accessible equipment packs, without drag/drop.
  const picker = async (ability = null) => {
    const title = ability ? `${ability.label} · ${ability.isPrepared ? translate("AddFormula", "Add formula") : translate("Craft", "Craft…")}` : translate("LearnFormula", "Learn formula");
    const modal = openSurface(title, "picker", "fa-book-open");
    if (!modal) return;
    const { scope: pickerScope, body: box, footer, close } = modal;
    const search = node("input", { attrs: { type: "search", placeholder: translate("SearchSources", "Search available formulas"), "aria-label": translate("SearchSources", "Search available formulas") } });
    const results = node("div", { className: "ve-pf2e-crafting-picker-results", attrs: { "aria-live": "polite" } });
    if (ability?.resource) box.append(node("p", { text: ability.isDailyPrep
      ? translate("ResourceCost", "{resource}: {value}/{max} · preparation cost: {cost}", { resource: ability.resource.label, value: ability.resource.value, max: ability.resource.max, cost: ability.cost })
      : translate("AbilityResourceCost", "{resource}: {value}/{max} · 1 per craft", { resource: ability.resource.label, value: ability.resource.value, max: ability.resource.max }) }));
    if (!ability) results.textContent = translate("SearchPrompt", "Enter at least two letters to search available formulas.");
    let generation = 0;
    // A superseded query never overwrites a newer result or a closed picker.
    const searchNow = async (cursor = 0) => {
      const request = ++generation;
      results.textContent = translate("Loading", "Loading crafting…");
      try {
        const response = await read(ability ? { operation: "options", abilitySlug: ability.slug }
          : { operation: "search", search: search.value, cursor });
        if (!current() || pickerScope.disposed || request !== generation) return;
        const query = search.value.trim().toLocaleLowerCase();
        const matches = response.formulas.filter(row => !ability || row.name.toLocaleLowerCase().includes(query));
        if (!ability) matches.sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));
        const options = ability ? matches.slice(cursor, cursor + 40) : matches;
        const nextCursor = ability ? (matches.length > cursor + 40 ? cursor + 40 : null) : response.nextCursor;
        // Keep the native item artwork beside its name in every formula choice.
        results.replaceChildren(...options.map(row => {
          const label = row.sourceLabel ? `${row.name} · ${row.sourceLabel}` : row.name;
          const metadata = [translate("FormulaLevel", "Level {level}", row), row.price ? translate("UnitPrice", "Price: {price} per {quantity}", { price: row.price, quantity: row.pricePer }) : null,
            !ability && data.knownUuids.includes(row.uuid) ? translate("Known", "Known") : null,
            ability ? (row.traitLabels ?? row.traits ?? []).join(" · ") : null].filter(Boolean).join(" · ");
          const choice = button(label, () => {
            close();
            if (ability && !ability.isPrepared) {
              confirm(abilityMessage(ability, row), { operation: "ability-craft", abilitySlug: ability.slug, abilityStamp: response.abilityStamp, formulaUuid: row.uuid });
            } else void run(ability ? { operation: "prepare", abilitySlug: ability.slug, abilityStamp: response.abilityStamp, formulaUuid: row.uuid }
                : { operation: "learn", formulaUuid: row.uuid, originalUuids: data.knownUuids });
          }, !data.owner || (!ability && data.knownUuids.includes(row.uuid)), pickerScope);
          choice.classList.add("ve-pf2e-crafting-choice");
          choice.setAttribute("aria-description", metadata);
          choice.replaceChildren(node("span", { className: "ve-pf2e-crafting-choice-art", attrs: { "aria-hidden": "true" }, children: [
            row.img ? node("img", { attrs: { src: row.img, alt: "", loading: "lazy", draggable: false } }) : icon("fa-book-open"),
          ] }), node("span", { className: "ve-pf2e-crafting-choice-label", children: [
            node("span", { text: label }), node("small", { text: metadata }),
          ] }));
          return choice;
        }));
        if (!options.length) results.textContent = ability ? translate("NoEligible", "No eligible known formulas match this view.")
          : query.length < 2 ? translate("SearchPrompt", "Enter at least two letters to search available formulas.") : translate("NoSourceMatches", "No available formulas match this search.");
        const paging = node("div", { className: "ve-pf2e-crafting-actions" });
        if (cursor > 0) paging.append(button(translate("Previous", "Previous"), () => searchNow(Math.max(0, cursor - 40)), false, pickerScope));
        if (nextCursor !== null && nextCursor !== undefined) paging.append(button(translate("Next", "Next"), () => searchNow(nextCursor), false, pickerScope));
        if (paging.childElementCount) results.append(paging);
      } catch (error) { if (current() && !pickerScope.disposed) results.textContent = characterErrorMessage(commands, error, translate("SearchFailed", "Formula search could not be completed."), { readOnly: true }); }
    };
    box.append(node("div", { className: "ve-pf2e-crafting-search", children: [search,
      node("div", { className: "ve-pf2e-crafting-actions", children: [
        button(translate("Search", "Search"), () => searchNow(), false, pickerScope)
      ] })
    ] }), results);
    footer.append(button(translate("Close", "Close"), close, false, pickerScope));
    search.focus({ preventScroll: true });
    pickerScope.listen(search, "keydown", event => { if (event.key === "Enter") { event.preventDefault(); void searchNow(); } });
    if (ability) await searchNow();
  };

  // Blank spell consumables need an explicit eligible spell before free creation.
  // Paid crafting keeps PF2e's native downstream spell selector/result continuation.
  const startCraft = async (formula, quantity) => {
    if (!current() || pending || !data.owner) return;
    const payload = { operation: "craft", formulaUuid: formula.uuid, quantity: data.quickAlchemy ? 1 : quantity,
      originalFreeCrafting: data.freeCrafting, originalQuickAlchemy: Boolean(data.quickAlchemy) };
    const message = data.quickAlchemy
      ? translate("LegacyQuickConfirm", "Create 1 × {name} with legacy Quick Alchemy for 1 Infused Reagent?", formula)
      : data.freeCrafting ? translate("CreateConfirm", "Create {quantity} × {name}?", { name: formula.name, quantity }) : translate("CraftConfirm", "Craft {quantity} × {name}?", { name: formula.name, quantity });
    if (data.quickAlchemy || !formula.spellConsumable || !data.freeCrafting) { confirm(message, payload); return; }
    const modal = openSurface(translate("ChooseSpell", "Choose a spell"), "picker", "fa-scroll");
    if (!modal) return;
    const { scope: pickerScope, body: box, footer, close } = modal;
    const loading = node("p", { text: translate("Loading", "Loading crafting…") });
    box.append(loading);
    footer.append(button(translate("Cancel", "Cancel"), close, false, pickerScope));
    try {
      const options = await read({ operation: "spell-options", formulaUuid: formula.uuid });
      if (!current() || pickerScope.disposed) return;
      const select = node("select", { attrs: { "aria-label": translate("ChooseSpell", "Choose a spell"), disabled: !options.spells.length }, children:
        options.spells.map(spell => node("option", { text: `${spell.rank} · ${spell.name}`, attrs: { value: spell.id } })) });
      const spellArt = node("span", { className: "ve-pf2e-crafting-choice-art", attrs: { "aria-hidden": "true" } });
      // Match spell preparation's selected-art treatment while retaining a native select.
      const updateSpellArt = () => {
        const spell = options.spells.find(row => row.id === select.value);
        spellArt.replaceChildren(spell?.img ? node("img", { attrs: { src: spell.img, alt: "", draggable: false } }) : icon("fa-book-open"));
      };
      updateSpellArt();
      pickerScope.listen(select, "change", updateSpellArt);
      box.replaceChildren(node("div", { className: "ve-pf2e-crafting-spell-choice", children: [spellArt, select] }));
      footer.append(button(translate("Continue", "Continue"), () => {
            const spell = options.spells.find(row => row.id === select.value);
            if (!spell) return;
            close();
            confirm(translate("CreateConfirm", "Create {quantity} × {name}?", {
              name: `${formula.name} (${spell.name})`, quantity,
            }), { ...payload, spellId: spell.id });
          }, options.spells.length === 0, pickerScope));
      if (!options.spells.length) box.append(node("p", { text: translate("NoSpells", "No eligible spells are available for this item.") }));
      if (options.spells.length) select.focus();
      else footer.querySelector("button")?.focus();
    } catch (error) { if (current() && !pickerScope.disposed) loading.textContent = characterErrorMessage(commands, error, localizedText(commands.localize, "VEMOBILE.Character.Errors.LoadFailed", "Could not load {label}.", { label: nativeText("VEMOBILE.PF2E.Character.Tab.Spells", "Spells") }), { readOnly: true }); }
  };

  // Build entry controls from current native capabilities; never infer an alchemist's rules.
  const abilitySection = ability => {
    const choose = ability.isPrepared
      ? button(translate("AddFormula", "Add formula"), () => picker(ability), !data.owner, rowsScope, `picker:${ability.slug}`, "fa-plus", true)
      : button(translate("Craft", "Craft…"), () => picker(ability), !data.owner || (ability.resource && ability.resource.value <= 0), rowsScope, `picker:${ability.slug}`, "fa-hammer");
    const section = node("section", { className: "ve-sheet-card ve-pf2e-crafting-ability", children: [sectionHeader(ability.label, choose)] });
    if (Number.isFinite(ability.maxItemLevel) && ability.maxItemLevel >= 0) section.append(node("p", { text: translate("AbilityLevel", "Maximum item level: {level}", { level: ability.maxItemLevel }) }));
    if (ability.isPrepared && ability.maxSlots > 0) section.append(node("p", { text: translate("Capacity", "Remaining slots: {remaining} · limit: {max}", { remaining: ability.remainingSlots, max: ability.maxSlots }) }));
    if (ability.resource) section.append(node("p", { text: ability.isDailyPrep ? translate("ResourceCost", "{resource}: {value}/{max} · preparation cost: {cost}", {
      resource: ability.resource.label, value: ability.resource.value, max: ability.resource.max, cost: ability.cost
    }) : translate("AbilityResourceCost", "{resource}: {value}/{max} · 1 per craft", { resource: ability.resource.label, value: ability.resource.value, max: ability.resource.max }) }));
    if (ability.isPrepared && !ability.prepared.length) section.append(node("p", { className: "ve-pf2e-crafting-empty", text: translate("EmptyPreparation", "No formulas prepared.") }));
    for (const formula of ability.prepared) {
      const payload = { abilitySlug: ability.slug, abilityStamp: ability.stamp, formulaUuid: formula.uuid, index: formula.index };
      section.append(formulaRow(formula, node("div", { className: "ve-pf2e-crafting-actions", children: [
        // Keep the native quantity beside the controls that change it, as in the
        // resource steppers. The group stays together when secondary tools wrap.
        node("div", { className: "ve-pf2e-crafting-prepared-stepper", attrs: { role: "group", "aria-label": translate("PreparedQuantity", "Prepared quantity: {quantity} · batches: {batches}", formula) }, children: [
          button(translate("Decrease", "Decrease"), () => run({ ...payload, operation: "quantity", direction: "decrease" }), !data.owner, rowsScope, `decrease:${ability.slug}:${formula.index}`, "fa-minus", true),
          node("strong", { text: String(formula.quantity) }),
          button(translate("Increase", "Increase"), () => run({ ...payload, operation: "quantity", direction: "increase" }), !data.owner, rowsScope, `increase:${ability.slug}:${formula.index}`, "fa-plus", true),
        ] }),
          button(translate("Unprepare", "Unprepare"), () => run({ ...payload, operation: "unprepare" }), !data.owner, rowsScope, `unprepare:${ability.slug}:${formula.index}`, "fa-trash", true),
          ability.isAlchemical ? button(formula.isSignatureItem ? translate("RemoveSignature", "Remove signature") : translate("MakeSignature", "Make signature item"),
            () => run({ ...payload, operation: "signature", originalSignature: formula.isSignatureItem }), !data.owner, rowsScope, `signature:${ability.slug}:${formula.index}`, "fa-star") : null,
          !ability.isDailyPrep && !ability.resource ? button(formula.expended ? translate("Restore", "Restore") : translate("MarkExpended", "Mark expended"), () => run({ ...payload, operation: "expended", value: !formula.expended }), !data.owner, rowsScope, `expended:${ability.slug}:${formula.index}`, formula.expended ? "fa-rotate-left" : "fa-square-minus") : null,
          !ability.isDailyPrep ? button(translate("Craft", "Craft…"), () => confirm(abilityMessage(ability, formula), { ...payload, operation: "ability-craft" }), !data.owner || formula.expended || (ability.resource && ability.resource.value <= 0), rowsScope, `ability-craft:${ability.slug}:${formula.index}`, "fa-hammer") : null
        ] }), rowsScope, { key: `prepared:${ability.slug}:${formula.index}:${formula.uuid}`, prepared: true }));
    }
    return section;
  };

  // Rebuild only this pane's owned rows, preserving explicit search/page/disclosure state.
  const render = () => {
    rowsScope?.dispose(); rowsScope = scope.child("crafting-rows");
    const preparation = node("div", { className: "ve-pf2e-crafting-preparation", children: data.abilities.map(abilitySection) });
    const book = node("section", { className: "ve-sheet-card ve-pf2e-crafting-book" });
    const search = node("input", { dataset: { pf2eFocusKey: "crafting-search" }, attrs: { type: "search", placeholder: translate("SearchKnown", "Search known formulas"), "aria-label": translate("SearchKnown", "Search known formulas") } });
    search.value = state.search;
    const level = node("select", { dataset: { pf2eFocusKey: "crafting-level" }, attrs: { "aria-label": translate("Level", "Level") }, children: [node("option", { text: translate("AllLevels", "All levels"), attrs: { value: "" } }),
      ...[...new Set(data.formulas.map(formula => formula.level))].sort((a, b) => a - b).map(value => node("option", { text: String(value), attrs: { value } }))] });
    level.value = state.level;
    const list = node("div", { className: "ve-pf2e-crafting-formulas" });
    const paging = node("div", { className: "ve-pf2e-crafting-actions" });
    let formulaScope;
    // Search all known metadata but render a bounded page. Descriptions remain lazy.
    const renderBook = () => {
      formulaScope?.dispose(); formulaScope = rowsScope.child("formula-page");
      const filtered = data.formulas.filter(row => row.name.toLocaleLowerCase().includes(state.search.toLocaleLowerCase()) && (!state.level || String(row.level) === state.level)).sort((a, b) => b.level - a.level);
      const peersByLevel = new Map();
      for (const row of data.formulas) {
        if (!peersByLevel.has(row.level)) peersByLevel.set(row.level, []);
        peersByLevel.get(row.level).push(row);
      }
      const pageCount = Math.max(1, Math.ceil(filtered.length / 25)); state.page = Math.min(state.page, pageCount - 1);
      list.replaceChildren();
      let previousLevel = null;
      for (const formula of filtered.slice(state.page * 25, (state.page + 1) * 25)) {
        if (previousLevel !== formula.level) list.append(node("h4", { text: translate("FormulaLevel", "Level {level}", { level: formula.level }) }));
        previousLevel = formula.level;
        const quantity = node("input", { dataset: { pf2eFocusKey: `crafting-quantity:${formula.uuid}` }, attrs: { type: "number", min: data.quickAlchemy ? 1 : formula.pricePer, max: 9999, step: formula.pricePer, value: data.quickAlchemy ? 1 : state.quantities.get(formula.uuid) ?? (data.freeCrafting ? formula.pricePer : formula.batchSize),
          "aria-label": translate("CraftQuantity", "Craft quantity"), disabled: !data.owner || pending || data.quickAlchemy } });
        const cost = node("p", { className: "ve-pf2e-crafting-cost", attrs: { "aria-live": "polite" } });
        let costScope = null;
        // Coalesce draft typing, use native Coins pricing, and discard stale responses.
        // The row owns both the timer and read continuation; collapsed rows do no work.
        const updateCost = (immediate = false) => {
          const value = Number(quantity.value);
          costScope?.dispose();
          costScope = formulaScope.child("formula-cost");
          const requestScope = costScope;
          cost.textContent = "";
          if (!Number.isSafeInteger(value) || value < 1 || value > 9999) return;
          const showCost = async () => {
            try {
              const result = await read({ operation: "cost", formulaUuid: formula.uuid, quantity: value });
              if (!current() || requestScope.disposed || !cost.isConnected || Number(quantity.value) !== value) return;
              cost.textContent = result.cost ? translate("QuantityCost", "Cost for {quantity}: {cost}", { quantity: value, cost: result.cost }) : "";
            } catch {
              if (current() && !requestScope.disposed && cost.isConnected) cost.textContent = translate("CostUnavailable", "Cost unavailable.");
            }
          };
          if (immediate) void showCost(); else requestScope.timeout(() => void showCost(), 180);
        };
        formulaScope.listen(quantity, "input", () => {
          state.quantities.delete(formula.uuid); state.quantities.set(formula.uuid, quantity.value);
          while (state.quantities.size > 100) state.quantities.delete(state.quantities.keys().next().value);
          updateCost();
        });
        // A bounded local draft stepper mirrors native quantity controls without writing.
        const changeQuantity = direction => {
          const step = Number(formula.pricePer) || 1;
          quantity.value = String(Math.max(step, Math.min(9999, (Number(quantity.value) || step) + direction * step)));
          quantity.dispatchEvent(new Event("input", { bubbles: true }));
        };
        const quantityField = node("label", { className: "ve-pf2e-crafting-quantity", children: [node("span", { text: translate("CraftQuantity", "Craft quantity") }), node("div", { className: "ve-pf2e-crafting-quantity-stepper", children: [
          button(translate("Decrease", "Decrease"), () => changeQuantity(-1), !data.owner || data.quickAlchemy, formulaScope, `draft-decrease:${formula.uuid}`, "fa-minus", true), quantity,
          button(translate("Increase", "Increase"), () => changeQuantity(1), !data.owner || data.quickAlchemy, formulaScope, `draft-increase:${formula.uuid}`, "fa-plus", true),
        ] })] });
        const controls = node("div", { className: "ve-pf2e-crafting-row-controls", children: [
          quantityField,
          button(data.freeCrafting ? nativeText("PF2E.Actor.Character.Crafting.Create", "Create") : translate("Craft", "Craft…"), () => startCraft(formula, Number(quantity.value)), !data.owner || (data.quickAlchemy && (!data.legacyQuickAlchemy || !(data.infusedReagents?.value >= 1))), formulaScope, `crafting-craft:${formula.uuid}`, data.freeCrafting ? "fa-plus" : "fa-hammer")
        ] });
        const peers = peersByLevel.get(formula.level);
        const index = peers.findIndex(row => row.uuid === formula.uuid);
        const order = node("span", { className: "ve-pf2e-crafting-order", children: [
          button(translate("MoveEarlier", "Move earlier"), () => run({ operation: "reorder", formulaUuid: formula.uuid, beforeUuid: peers[index - 1]?.uuid, originalUuids: data.knownUuids }), !data.owner || index === 0, formulaScope, `earlier:${formula.uuid}`, "fa-arrow-up", true),
          button(translate("MoveLater", "Move later"), () => run({ operation: "reorder", formulaUuid: peers[index + 1]?.uuid, beforeUuid: formula.uuid, originalUuids: data.knownUuids }), !data.owner || index + 1 >= peers.length, formulaScope, `later:${formula.uuid}`, "fa-arrow-down", true),
        ] });
        // Secondary tools stay together below quantity/Craft; ordering is an inseparable pair.
        controls.append(cost, node("div", { className: "ve-pf2e-crafting-tools", children: [
          button(translate("Post", "Post to chat"), () => run({ operation: "post", formulaUuid: formula.uuid }), !data.owner, formulaScope, `post:${formula.uuid}`, "fa-message", true), order,
          button(translate("Forget", "Forget formula…"), () => confirm(translate("ForgetConfirm", "Remove {name} from this formula book?", formula), { operation: "forget", formulaUuid: formula.uuid, originalUuids: data.knownUuids }), !data.owner, formulaScope, `forget:${formula.uuid}`, "fa-trash", true),
        ] }));
        if (data.quickAlchemy && !(data.infusedReagents?.value >= 1)) controls.append(node("p", { className: "ve-pf2e-crafting-local-notice", text: translate("NoReagents", "No Infused Reagents remaining.") }));
        list.append(formulaRow(formula, controls, formulaScope, { onOpen: () => updateCost(true) }));
      }
      if (!filtered.length) list.append(node("p", { text: data.formulas.length ? translate("EmptyBook", "No known formulas match this view.") : translate("NoKnownFormulas", "No formulas known yet.") }));
      paging.replaceChildren(button(translate("Previous", "Previous"), () => { state.page--; renderBook(); }, state.page === 0, formulaScope),
        node("span", { text: translate("Page", "Page {page} of {total}", { page: state.page + 1, total: pageCount }) }),
        button(translate("Next", "Next"), () => { state.page++; renderBook(); }, state.page + 1 >= pageCount, formulaScope));
      paging.hidden = pageCount <= 1;
    };
    rowsScope.listen(search, "input", () => { state.search = search.value; state.page = 0; renderBook(); });
    rowsScope.listen(level, "change", () => { state.level = level.value; state.page = 0; renderBook(); });
    const freeMode = modeButton(translate("FreeCraftingMode", "Free crafting"), data.freeCrafting,
      () => run({ operation: "mode", mode: "freeCrafting", value: !data.freeCrafting, originalValue: data.freeCrafting, originalOtherValue: Boolean(data.quickAlchemy) }), "free-mode");
    // Follow Inventory's compact header tools. Free mode remains visible text;
    // the labelled Learn icon removes the separate, mostly empty mode row.
    book.append(sectionHeader(translate("FormulaBook", "Formula book"), node("div", { className: "ve-pf2e-crafting-header-tools", children: [
      freeMode, button(translate("LearnFormula", "Learn formula"), () => picker(), !data.owner, rowsScope, "learn", "fa-magnifying-glass", true)
    ] })), node("div", { className: "ve-pf2e-crafting-filters", children: [search, level] }), list, paging);
    // Missing native sources stay removable without inventing item metadata.
    for (const [index, uuid] of (data.unavailableFormulas ?? []).entries()) book.append(node("div", { className: "ve-pf2e-crafting-unavailable", children: [
      node("p", { text: translate("UnavailableNumber", "Unavailable formula {number}", { number: index + 1 }) }),
      button(translate("Forget", "Forget formula…"), () => confirm(translate("ForgetUnavailable", "Remove this unavailable formula from the book?"),
        { operation: "forget", formulaUuid: uuid, originalUuids: data.knownUuids }), !data.owner, rowsScope, `forget:${uuid}`)
    ] }));
    const summary = node("section", { className: "ve-sheet-card ve-pf2e-crafting-summary" });
    if (data.abilities.some(ability => ability.isDailyPrep)) {
      const payload = { originalComplete: data.complete, abilityStamps: data.abilities.map(ability => ({ slug: ability.slug, stamp: ability.stamp })) };
      const reagentCost = data.abilities.filter(ability => ability.isAlchemical).reduce((total, ability) => total + ability.cost, 0);
      const insufficient = data.abilities.some(ability => ability.insufficient) || (data.infusedReagents && reagentCost > data.infusedReagents.value);
      // Only the action appropriate to the current native preparation state is
      // useful. Keep resource explanations and confirmations without a dead tool.
      summary.append(node("p", { text: data.complete ? translate("Complete", "Daily preparation complete") : insufficient ? translate("InsufficientResources", "Not enough resources for this preparation.") : translate("Ready", "Daily preparation ready") }),
        node("div", { className: "ve-pf2e-crafting-actions", children: [
          data.complete
            ? button(translate("Reset", "Reset preparation…"), () => confirm(translate("ResetConfirm", "Reset preparation? PF2e removes temporary inventory items and restores the related preparation state."), { ...payload, operation: "reset" }), !data.owner, rowsScope, "reset", "fa-rotate-right")
            : button(translate("PrepareDaily", "Complete daily preparation…"), () => confirm(translate("DailyConfirm", "Create the prepared items and apply their native resource costs?"), { ...payload, operation: "daily" }), !data.owner || insufficient, rowsScope, "daily", "fa-hammer")
        ] }));
    }
    // Native crafting presents its resource overview before abilities and the daily
    // action after prepared rows. Keep that reading order on Phone and Tablet Split.
    const overview = node("section", { className: "ve-sheet-card ve-pf2e-crafting-overview" });
    const overviewControls = node("div", { className: "ve-pf2e-crafting-overview-controls" });
    if (data.legacyQuickAlchemy || data.quickAlchemy) overviewControls.append(modeButton(data.abilities.some(ability => ability.slug === "quick-alchemy") ? translate("LegacyQuickModeMixed", "Legacy Quick Alchemy") : translate("LegacyQuickMode", "Quick Alchemy"), Boolean(data.quickAlchemy),
      () => run({ operation: "mode", mode: "quickAlchemy", value: !data.quickAlchemy, originalValue: Boolean(data.quickAlchemy), originalOtherValue: data.freeCrafting }), "legacy-quick-mode"));
    if (data.legacyQuickAlchemy || data.quickAlchemy || data.abilities.some(ability => ability.isAlchemical)) {
      const reagent = data.infusedReagents;
      const cost = data.abilities.filter(ability => ability.isAlchemical).reduce((total, ability) => total + ability.cost, 0);
      const controls = node("div", { className: "ve-pf2e-crafting-reagent-controls" });
      if (reagent) {
        // The stepper delegates the same bounded resource command used by other tabs.
        for (const delta of [-1, 1]) {
          const label = delta < 0 ? translate("Decrease", "Decrease") : translate("Increase", "Increase");
          const control = button(delta < 0 ? "−" : "+",
            () => run({ resource: "infused-reagents", value: reagent.value + delta, originalValue: reagent.value, originalMax: reagent.max }, ACTOR_COMMANDS.SET_PF2E_RESOURCE),
            !data.owner || reagent.value + delta < 0 || reagent.value + delta > reagent.max, rowsScope, delta < 0 ? "reagent-decrease" : "reagent-increase");
          control.setAttribute("aria-label", label); control.title = label;
          if (delta > 0) controls.append(node("strong", { text: `${reagent.value} / ${reagent.max}` }));
          controls.append(control);
        }
      }
      overviewControls.append(node("div", { className: "ve-pf2e-crafting-resource", children: [
        node("span", { text: translate("Reagents", "Infused Reagents") }), controls
      ] }));
      overview.append(node("p", { className: "ve-pf2e-crafting-meta", text: translate("TotalCost", "Total preparation cost: {cost}", { cost }) }));
    }
    if (overviewControls.childElementCount) overview.prepend(overviewControls);
    if (overview.childElementCount) preparation.prepend(overview);
    if (summary.childElementCount) preparation.append(summary);
    const hasPreparation = preparation.childElementCount > 0;
    content.replaceChildren(node("div", { className: `ve-pf2e-crafting-columns${hasPreparation ? "" : " is-book-only"}`, children: [hasPreparation ? preparation : null, book] }));
    if (!data.owner) content.prepend(node("p", { className: "ve-pf2e-crafting-local-notice", text: translate("ReadOnly", "Read only: you do not own this character.") }));
    renderBook();
    if (shell.scroller) shell.scroller.scrollTop = state.scrollTop ?? 0;
    if (state.focusKey) {
      const focus = [...root.querySelectorAll("[data-pf2e-focus-key]")].find(element => element.dataset.pf2eFocusKey === state.focusKey);
      focus?.focus({ preventScroll: true });
      if (focus && typeof focus.setSelectionRange === "function" && Number.isInteger(state.selection?.[0])) {
        try { focus.setSelectionRange(...state.selection); } catch { /* Numeric/select controls have no text selection API. */ }
      }
    }
  };
  commands.watchCharacterCrafting?.({ actorSourceUuid: actor.sourceUuid }, scope, () => { if (current() && !pending) void load(true); });
  void load();
  return root;
}

import { icon, node } from "../../../../ui/dom.mjs";
import { localizedText } from "../../../../ui/localized-text.mjs";
import { characterErrorMessage, notifyCharacter } from "../../notifications.mjs";

// Open a short-lived picker on Features. All source reads and advancement writes go through named commands.
export function classAdvancementActions(actor, commands, scope) {
  if (!(actor.capabilities?.classLevelUpCapacity > 0)) return null;
  const classes = (actor.classes ?? []).filter(item => Number.isSafeInteger(item.levels) && item.levels > 0);
  const localize = (key, fallback, data) => localizedText(commands.localize, key, fallback, data);
  const levelUp = localize("DND5E.LevelActionIncrease", "Level Up");
  const addClass = localize("DND5E.ClassAdd", "Add Class");
  let activeDialog = null;

  // Open one modal, preserving background state and focus until the player dismisses or hands off.
  function openDialog(trigger, title, glyph, build) {
    const host = trigger.closest(".ve-mobile-app");
    if (!host || activeDialog) return;
    const dialogScope = scope.child("class-advancement-picker");
    activeDialog = dialogScope;
    let pending = false;
    const close = (restoreFocus = true) => {
      dialogScope.dispose();
      if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
    const requestClose = () => { if (!pending) close(); };
    const closeButton = node("button", { className: "ve-hp-editor-close",
      attrs: { type: "button", "aria-label": localize("Close", "Close") }, children: [icon("fa-xmark")] });
    dialogScope.listen(closeButton, "click", requestClose);
    const contents = node("div", { className: "ve-dnd5e-advancement-content" });
    const panel = node("section", { className: "ve-hp-editor ve-dnd5e-advancement-dialog",
      attrs: { role: "dialog", "aria-modal": "true", "aria-label": title },
      children: [node("header", { children: [
        node("span", { className: "ve-hp-editor-heading-icon", children: [icon(glyph)] }),
        node("div", { children: [node("small", { text: actor.name }), node("h2", { text: title })] }),
        closeButton
      ] }), contents]
    });
    const layer = node("div", { className: "ve-hp-editor-layer ve-dnd5e-advancement-layer",
      dataset: { veBackDismissable: "true", veBackKind: "class-advancement-picker" }, children: [panel] });
    const siblings = [...host.children].map(element => [element, element.inert]);
    dialogScope.own(() => {
      layer.remove();
      for (const [element, inert] of siblings) element.inert = inert;
      activeDialog = null;
    });
    for (const [element] of siblings) element.inert = true;
    host.append(layer);
    closeButton.focus({ preventScroll: true });
    dialogScope.listen(layer, "ve-close", requestClose);
    dialogScope.listen(layer, "click", event => { if (event.target === layer) requestClose(); });
    dialogScope.listen(layer, "keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); requestClose(); }
      if (event.key !== "Tab") return;
      const controls = [...panel.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled)")];
      const first = controls[0], last = controls.at(-1), focused = host.ownerDocument.activeElement;
      if (event.shiftKey && focused === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && focused === last) { event.preventDefault(); first?.focus(); }
    });
    // Keep search and results within the visible viewport when the system keyboard opens.
    const viewport = host.ownerDocument.defaultView?.visualViewport;
    if (viewport) {
      const fit = () => {
        layer.style.inset = "auto";
        layer.style.top = viewport.offsetTop + "px";
        layer.style.left = viewport.offsetLeft + "px";
        layer.style.width = viewport.width + "px";
        layer.style.height = viewport.height + "px";
      };
      fit();
      dialogScope.listen(viewport, "resize", fit);
      dialogScope.listen(viewport, "scroll", fit);
    }

    // A deliberate choice hands off to the native window. A rejected request leaves the picker available.
    const handoff = async (command, request) => {
      if (pending || dialogScope.disposed) return;
      pending = closeButton.disabled = true;
      contents.inert = true;
      panel.setAttribute("aria-busy", "true");
      host.ownerDocument.activeElement?.blur();
      try {
        await command({ actorSourceUuid: actor.sourceUuid, ...request });
        if (!dialogScope.disposed) close(false);
      } catch (error) {
        if (dialogScope.disposed) return;
        const fallback = localize("VEMOBILE.Character.ActorEditorGateway.AdvancementUnavailable", "Native class advancement is unavailable.");
        notifyCharacter(commands, actor.sourceUuid, characterErrorMessage(commands, error, fallback), "error");
        pending = closeButton.disabled = false;
        contents.inert = false;
        panel.removeAttribute("aria-busy");
        closeButton.focus({ preventScroll: true });
      }
    };
    build(contents, dialogScope, handoff);
  }

  // Existing classes retain their current level and share the remaining character levels.
  function showLevels(trigger) {
    openDialog(trigger, levelUp, "fa-arrow-up", (contents, dialogScope, handoff) => {
      for (const item of classes) {
        const label = localize("DND5E.ClassLevels", "Class Levels");
        const target = node("select", { attrs: { "aria-label": [item.name, label].join(" · ") },
          children: Array.from({ length: actor.capabilities.classLevelUpCapacity + 1 }, (_, offset) => {
            const level = item.levels + offset;
            return node("option", { attrs: { value: level }, text: localize("DND5E.LevelNumber", "Level {level}", { level }) });
          }) });
        const advance = node("button", { attrs: { type: "button", disabled: true, "aria-label": [levelUp, item.name].join(" · ") }, text: levelUp });
        dialogScope.listen(target, "change", () => { advance.disabled = Number(target.value) === item.levels; });
        dialogScope.listen(advance, "click", () => handoff(commands.advanceCharacterClass,
          { classId: item.id, fromLevel: item.levels, toLevel: Number(target.value) }));
        contents.append(node("div", { className: "ve-dnd5e-class-level-row", children: [node("strong", { text: item.name }), target, advance] }));
      }
    });
  }

  // Read compendium indexes only when the player opens Add Class. The chosen row requires a separate confirmation.
  function showCompendium(trigger) {
    openDialog(trigger, addClass, "fa-book-open", (contents, dialogScope, handoff) => {
      const label = localize("VEMOBILE.Character.ClassAdvancement.SearchClasses", "Search classes");
      const search = node("input", { attrs: { type: "search", autocomplete: "off", "aria-label": label, placeholder: label, disabled: true } });
      const results = node("div", { className: "ve-dnd5e-class-results" });
      const status = node("p", { attrs: { role: "status" }, text: localize("VEMOBILE.Character.ClassAdvancement.LoadingClasses", "Loading compendium classes…") });
      const confirm = node("button", { className: "ve-hp-editor-submit", attrs: { type: "button", disabled: true }, text: addClass });
      contents.classList.add("ve-dnd5e-class-picker");
      contents.append(search, results, status, confirm);
      let entries = [];
      let choice = "";
      // Rebuild the options after a search and retain the selection only while it is visible.
      function refresh() {
        const query = search.value.trim().toLocaleLowerCase();
        const matches = entries.filter(entry => [entry.name, entry.packLabel].some(text => text.toLocaleLowerCase().includes(query)));
        if (!matches.some(entry => entry.uuid === choice)) choice = "";
        confirm.disabled = !choice;
        results.replaceChildren(...matches.map(entry => node("label", { className: "ve-dnd5e-compendium-class", children: [
          node("input", { attrs: { type: "radio", name: "compendium-class", value: entry.uuid, checked: entry.uuid === choice } }),
          node("span", { children: [node("strong", { text: entry.name }), node("small", { text: entry.packLabel })] })
        ] })));
        status.textContent = matches.length ? "" : localize("VEMOBILE.Character.ClassAdvancement.NoClasses", "No matching compendium classes.");
      }
      dialogScope.listen(search, "input", refresh);
      dialogScope.listen(results, "change", event => {
        choice = event.target.value;
        confirm.disabled = !choice;
      });
      dialogScope.listen(confirm, "click", () => {
        if (choice) void handoff(commands.addCharacterClass, { classUuid: choice });
      });
      Promise.resolve(commands.listCharacterClasses({ actorSourceUuid: actor.sourceUuid })).then(classes => {
        if (dialogScope.disposed) return;
        entries = classes;
        search.disabled = false;
        refresh();
      }).catch(error => {
        if (dialogScope.disposed) return;
        status.textContent = characterErrorMessage(commands, error,
          localize("VEMOBILE.Character.ClassAdvancement.LoadFailed", "Could not load compendium classes."), { readOnly: true });
      });
    });
  }

  const buttons = [
    classes.length ? node("button", { attrs: { type: "button", "aria-haspopup": "dialog" }, children: [icon("fa-arrow-up"), levelUp],
      on: { click: event => showLevels(event.currentTarget) } }, scope) : null,
    node("button", { attrs: { type: "button", "aria-haspopup": "dialog" }, children: [icon("fa-book-open"), addClass],
      on: { click: event => showCompendium(event.currentTarget) } }, scope)
  ];
  return node("div", { className: "ve-dnd5e-advancement-actions", children: buttons });
}

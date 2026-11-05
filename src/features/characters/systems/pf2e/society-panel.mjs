import { ACTOR_COMMANDS } from "../../../../kernel/command-names.mjs";
import { node, icon } from "../../../../ui/dom.mjs";
import { localizedText, localizedNumber } from "../../../../ui/localized-text.mjs";
import { notifyCharacter, characterErrorMessage } from "../../notifications.mjs";
import { editor } from "./document-editors.mjs";
import { itemArt, itemRow } from "./item-rows.mjs";

// Keep native field labels shared between the summary and its single save form.
const FIELD_LABELS = Object.freeze({
  playerNumber: ["PF2E.PFS.OrganizedPlayNumber", "Organized Play number"],
  characterNumber: ["PF2E.PFS.CharacterNumber", "Character number"],
  currentFaction: ["PF2E.PFS.CurrentFaction", "Current faction"]
});
// Localize only presentation copy; named commands remain the mutation boundary.
const text = (commands, key, fallback, values) => localizedText(commands.localize, key, fallback, values);

/** Render Society's existing native fields and boon Items. The parent owns pane
 * replacement; shared editors retain drafts across publications for the same Actor. */
export function renderSocietyPanel({ actor, commands, scope, shell, ownerScope = scope }) {
  const society = actor.pf2e?.society;
  const title = text(commands, "PF2E.TabPathfinderSociety", "Pathfinder Society");
  const root = node("section", { className: "ve-pf2e-society", attrs: { "aria-label": title } });
  if (!society) {
    root.append(node("p", { className: "ve-empty", text: text(commands, "VEMOBILE.PF2E.Society.Unavailable", "Society details are unavailable for this character.") }));
    return root;
  }
  const canEdit = actor.capabilities?.editSociety === true;
  const heading = (label, glyph, action = null) => node("header", { className: "ve-sheet-card-heading", children: [icon(glyph), node("h3", { text: label }), action] });
  const editLabel = text(commands, "VEMOBILE.PF2E.Society.EditDetails", "Edit Society details");
  const details = node("dl", { className: "ve-pf2e-society-details" });
  for (const [key, [labelKey, fallback]] of Object.entries(FIELD_LABELS)) {
    const value = key === "currentFaction" ? society.factions.find(faction => faction.id === society.currentFaction)?.label
      : society[key] > 0 ? String(society[key]) : "—";
    details.append(node("div", { children: [node("dt", { text: text(commands, labelKey, fallback) }), node("dd", { text: value || "—" })] }));
  }
  const levelLabel = text(commands, "PF2E.PFS.LevelBump", "Level bump");
  const level = node("button", { className: "ve-pf2e-society-level-bump", dataset: { pf2eFocusKey: "society-level-bump" }, attrs: {
    type: "button", role: "switch", "aria-checked": String(society.levelBump), "aria-label": levelLabel, disabled: !canEdit || shell.societyPending?.source === actor.sourceUuid
  }, children: [node("span", { text: levelLabel }), icon(society.levelBump ? "fa-toggle-on" : "fa-toggle-off")], on: {
    click: () => runPaneAction(shell, actor, scope, { operation: "level-bump", value: !society.levelBump, originalValue: society.levelBump })
  } }, scope);
  const edit = canEdit ? button(commands, editLabel, "fa-pen-to-square", () => openSocietyEditor(shell, ownerScope), scope, true) : null;
  root.append(node("section", { className: "ve-sheet-card", children: [heading(title, "fa-globe", edit), details, level] }));
  const reputationLabel = text(commands, "PF2E.PFS.Reputation", "Reputation");
  root.append(node("section", { className: "ve-sheet-card", children: [heading(reputationLabel, "fa-flag"), node("dl", {
    className: "ve-pf2e-society-reputation", children: society.factions.map(faction => node("div", { children: [
      node("dt", { text: faction.label }), node("dd", { text: localizedNumber(society.reputation[faction.id] ?? 0, commands.locale ?? "en") })
    ] }))
  })] }));
  const boonTitle = text(commands, "PF2E.FeatPFSBoonHeader", "Society boons");
  const addLabel = text(commands, "VEMOBILE.PF2E.Society.AddBoon", "Add boon");
  const boons = node("section", { className: "ve-sheet-card ve-pf2e-society-boons", children: [heading(boonTitle, "fa-scroll",
    canEdit ? button(commands, addLabel, "fa-plus", () => openBoonPicker(shell, ownerScope), scope) : null)] });
  for (const boon of society.boons) {
    const actions = canEdit ? [
      button(commands, text(commands, "VEMOBILE.PF2E.Character.Action.PostToChat", "Post to chat"), "fa-comment-dots", () => runPaneAction(shell, actor, scope, { itemId: boon.id, kind: "item" }, ACTOR_COMMANDS.USE_ITEM), scope),
      button(commands, text(commands, "PF2E.EditItemTitle", "Edit item"), "fa-pen-to-square", () => runPaneAction(shell, actor, scope, { itemId: boon.id }, ACTOR_COMMANDS.OPEN_ITEM_SHEET), scope),
      button(commands, text(commands, "PF2E.DeleteItemTitle", "Delete item"), "fa-trash", () => openRemoveBoon(shell, boon, ownerScope), scope)
    ] : [];
    boons.append(itemRow({ item: boon, actor, commands, scope, className: "ve-pf2e-society-boon", disclosureKey: `society:${boon.id}`,
      header: [itemArt(boon), node("strong", { text: boon.name })], actions }));
  }
  if (!society.boons.length) boons.append(node("p", { className: "ve-empty", text: text(commands, "VEMOBILE.PF2E.Society.EmptyBoons", "No Society boons recorded.") }));
  root.append(boons);
  return root;
}

// Use the existing PF2e button language, with visible labels for row actions.
function button(commands, label, glyph, action, scope, iconOnly = false) {
  return node("button", { className: "ve-pf2e-action-button", attrs: { type: "button", "aria-label": label, title: label },
    children: [icon(glyph), iconOnly ? null : node("span", { text: label })], on: { click: action } }, scope);
}

/** Keep duplicate taps blocked across a native publication. Only the captured
 * Actor may receive feedback; command authority is rechecked by the gateway. */
async function runPaneAction(shell, actor, scope, payload, command = ACTOR_COMMANDS.EDIT_PF2E_SOCIETY) {
  if (scope.disposed || shell.societyPending?.source === actor.sourceUuid || shell.actor?.sourceUuid !== actor.sourceUuid || !shell.actor.capabilities?.editSociety) return;
  const current = () => !scope.disposed && shell.actor?.sourceUuid === actor.sourceUuid;
  const controls = [...shell.panelHost.querySelectorAll("button")];
  const disabled = controls.map(control => control.disabled);
  controls.forEach(control => { control.disabled = true; });
  const operation = Promise.resolve().then(() => shell.commands.execute(command, { actorSourceUuid: actor.sourceUuid, ...payload }));
  const pending = { source: actor.sourceUuid, operation };
  shell.societyPending = pending;
  try { await operation; }
  catch (error) {
    if (shell.actor?.sourceUuid === actor.sourceUuid && shell.screen.isConnected) notifyCharacter(shell.commands, actor.sourceUuid,
      characterErrorMessage(shell.commands, error, text(shell.commands, "VEMOBILE.PF2E.Society.ActionFailed", "Could not update Pathfinder Society.")), "error");
  } finally {
    if (shell.societyPending === pending) shell.societyPending = null;
    if (current()) controls.forEach((control, index) => { control.disabled = disabled[index]; });
    // A new pane may have mounted while the native operation published updates.
    if (shell.actor?.sourceUuid === actor.sourceUuid) for (const control of shell.panelHost.querySelectorAll(".ve-pf2e-society-level-bump")) control.disabled = !shell.actor.capabilities?.editSociety || shell.societyPending?.source === actor.sourceUuid;
  }
}

// Capture only editable Society source fields so a save cannot overwrite Level Bump.
function editableValues(society) {
  return { playerNumber: society.playerNumber, characterNumber: society.characterNumber,
    currentFaction: society.currentFaction, reputation: { ...society.reputation } };
}

// Register these editors with VE Back without changing other tabs' modal owners.
function societyEditor(shell, label, glyph, ownerScope, { editTitle = true } = {}) {
  const context = editor(shell, "society", label, glyph, ownerScope);
  if (!context) return null;
  // Picker and confirmation titles describe their action without an Edit prefix.
  if (!editTitle) {
    context.form.querySelector("h2").textContent = label;
    context.form.setAttribute("aria-label", label);
  }
  const layer = context.form.parentElement;
  layer.dataset.veBackDismissable = "true";
  layer.dataset.veBackKind = "society-editor";
  context.scope.listen(layer, "ve-close", () => { if (!context.modal.pending) context.modal.close(); });
  return context;
}

// Edit all bookkeeping together, preserving drafts and original values until save.
function openSocietyEditor(shell, ownerScope) {
  const commands = shell.commands;
  const context = societyEditor(shell, text(commands, "PF2E.TabPathfinderSociety", "Pathfinder Society"), "fa-globe", ownerScope);
  if (!context) return;
  const society = context.actor.pf2e.society;
  const originalValues = editableValues(society);
  const inputs = new Map();
  context.body.classList.add("ve-pf2e-society-fields");
  for (const [key, [labelKey, fallback]] of Object.entries(FIELD_LABELS)) {
    const label = text(commands, labelKey, fallback);
    const bounds = society.bounds?.[key];
    const input = key === "currentFaction" ? node("select", { attrs: { "aria-label": label, name: key }, children:
      society.factions.map(faction => node("option", { attrs: { value: faction.id, selected: faction.id === society.currentFaction }, text: faction.label })) })
      : node("input", { attrs: { type: "number", inputmode: "numeric", name: key, min: String(bounds?.min ?? (key === "playerNumber" ? 1 : 2001)), max: String(bounds?.max ?? (key === "playerNumber" ? 9999999 : 9999)), step: "1",
        value: society[key] == null ? "" : String(society[key]), "aria-label": label } });
    inputs.set(key, input);
    context.body.append(node("label", { children: [node("span", { text: label }), input] }));
  }
  context.body.append(node("h3", { text: text(commands, "PF2E.PFS.Reputation", "Reputation") }));
  for (const faction of society.factions) {
    const input = node("input", { attrs: { type: "number", inputmode: "decimal", min: "0", max: String(society.bounds?.reputation?.max ?? Number.MAX_SAFE_INTEGER), step: "any", placeholder: "0",
      value: society.reputation[faction.id] == null ? "" : String(society.reputation[faction.id]), name: `reputation.${faction.id}`, "aria-label": faction.label } });
    inputs.set(`reputation.${faction.id}`, input);
    context.body.append(node("label", { children: [node("span", { text: faction.label }), input] }));
  }
  context.footer.append(node("button", { className: "is-primary", attrs: { type: "submit" }, text: text(commands, "VEMOBILE.Character.Presenter.SaveChanges", "Save Changes") }));
  context.scope.listen(context.form, "submit", event => {
    event.preventDefault();
    if (!context.form.reportValidity()) return;
    const numberValue = input => input.value.trim() === "" ? null : Number(input.value);
    const values = { playerNumber: numberValue(inputs.get("playerNumber")), characterNumber: numberValue(inputs.get("characterNumber")), currentFaction: inputs.get("currentFaction").value,
      reputation: Object.fromEntries(society.factions.map(faction => [faction.id, numberValue(inputs.get(`reputation.${faction.id}`))])) };
    void context.run(ACTOR_COMMANDS.EDIT_PF2E_SOCIETY, { operation: "update", values, originalValues });
  });
}

// A destructive embedded-item removal always has a named confirmation surface.
function openRemoveBoon(shell, boon, ownerScope) {
  const commands = shell.commands;
  const context = societyEditor(shell, text(commands, "VEMOBILE.PF2E.Society.RemoveBoon", "Remove boon"), "fa-trash", ownerScope, { editTitle: false });
  if (!context) return;
  context.body.append(node("p", { text: text(commands, "VEMOBILE.PF2E.Society.RemoveConfirm", "Remove {name} from this character?", { name: boon.name }) }));
  context.footer.append(button(commands, text(commands, "VEMOBILE.PF2E.Society.RemoveBoon", "Remove boon"), "fa-trash", () => {
    void context.run(ACTOR_COMMANDS.EDIT_PF2E_SOCIETY, { operation: "remove-boon", itemId: boon.id, originalName: boon.name });
  }, context.scope));
}

/** Search only when requested. The editor scope and request generation prevent
 * late catalogue results from repopulating a closed or newer search surface. */
function openBoonPicker(shell, ownerScope) {
  const commands = shell.commands;
  const context = societyEditor(shell, text(commands, "VEMOBILE.PF2E.Society.AddBoon", "Add boon"), "fa-scroll", ownerScope, { editTitle: false });
  if (!context) return;
  context.form.classList.add("ve-pf2e-society-picker");
  const label = text(commands, "VEMOBILE.PF2E.Society.SearchBoons", "Search Society boons");
  const input = node("input", { attrs: { type: "search", maxlength: "80", "aria-label": label, placeholder: label } });
  const search = node("button", { attrs: { type: "submit", "aria-label": label }, children: [icon("fa-search")] });
  const results = node("div", { className: "ve-pf2e-society-catalog", attrs: { "aria-live": "polite" } });
  const hint = text(commands, "VEMOBILE.PF2E.Society.SearchHint", "Search available boons. Add only boons this character has earned or purchased.");
  context.body.append(node("div", { className: "ve-pf2e-society-search", children: [input, search] }), node("p", { className: "ve-pf2e-society-hint", text: hint }), results);
  let request = 0;
  const current = generation => !context.scope.disposed && request === generation && shell.actor?.sourceUuid === context.actor.sourceUuid && shell.actor.capabilities?.editSociety;
  context.scope.listen(context.form, "submit", async event => {
    event.preventDefault();
    if (context.modal.pending || search.disabled) return;
    const generation = ++request;
    search.disabled = true; input.disabled = true; results.setAttribute("aria-busy", "true");
    try {
      const response = await shell.commands.execute(ACTOR_COMMANDS.EDIT_PF2E_SOCIETY, { actorSourceUuid: context.actor.sourceUuid, operation: "search", search: input.value });
      if (!current(generation)) return;
      const catalog = response.catalog;
      results.replaceChildren();
      for (const boon of catalog?.boons ?? []) {
        const add = button(commands, text(commands, "VEMOBILE.PF2E.Society.AddBoon", "Add boon"), "fa-plus", () => {
          void context.run(ACTOR_COMMANDS.EDIT_PF2E_SOCIETY, { operation: "add-boon", uuid: boon.uuid });
        }, context.scope, true);
        add.setAttribute("aria-label", text(commands, "VEMOBILE.PF2E.Society.AddNamedBoon", "Add {name}", { name: boon.name }));
        results.append(node("div", { className: "ve-pf2e-society-catalog-row", children: [boon.img ? node("img", { attrs: { src: boon.img, alt: "", loading: "lazy" } }) : icon("fa-scroll"), node("strong", { text: boon.name }), add] }));
      }
      if (!catalog?.boons?.length) results.append(node("p", { className: "ve-empty", text: text(commands, "VEMOBILE.PF2E.Society.NoMatches", "No matching Society boons in available compendiums.") }));
      if (catalog?.truncated) results.append(node("p", { text: text(commands, "VEMOBILE.PF2E.Society.RefineSearch", "More boons match. Refine your search to narrow the results.") }));
    } catch (error) {
      if (current(generation)) notifyCharacter(commands, context.actor.sourceUuid, characterErrorMessage(commands, error, text(commands, "VEMOBILE.PF2E.Society.SearchFailed", "Could not search Society boons."), { readOnly: true }), "error");
    } finally {
      if (current(generation)) { search.disabled = false; input.disabled = false; results.removeAttribute("aria-busy"); }
    }
  });
}

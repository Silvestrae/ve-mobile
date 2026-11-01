import { ACTOR_COMMANDS } from "../../../../kernel/command-names.mjs";
import { icon, node } from "../../../../ui/dom.mjs";
import { localizedText } from "../../../../ui/localized-text.mjs";
import { editor } from "./document-editors.mjs";

/** A scoped, touch-first editor for one exact spellcasting entry. */
export function openSpellPreparation(shell, entryId, ownerScope, overlayHost) {
  // Resolve by entry ID on every refresh so a replaced Actor cannot leave stale data.
  const current = () => shell.actor?.pf2e?.spellcasting?.find(entry => entry.entryId === entryId);
  if (!current()?.preparation && !current()?.management) return;
  const managementOnly = !current()?.preparation;
  const context = editor(shell, managementOnly ? "spellManagement" : "preparation", localizedText(shell.commands?.localize,
    managementOnly ? "VEMOBILE.PF2E.Spells.Title" : "VEMOBILE.PF2E.Character.Preparation.Title",
    managementOnly ? "Manage spells" : "Prepare spells"), "fa-book-open", ownerScope, overlayHost);
  if (!context) return;
  const { modal, form, body, footer, t: translate } = context;
  form.classList.add("ve-pf2e-preparation-dialog");
  footer.firstChild.textContent = translate("VEMOBILE.Controls.Close", "Close");
  const intro = node("div", { className: "ve-pf2e-preparation-intro", children: [
    node("h3", { text: current().label }),
    node("p", { text: current().preparation
      ? translate("VEMOBILE.PF2E.Spells.ManageIntro", "Choose spells for each slot, manage signatures, or add a spell from the installed compendiums. Each change saves immediately; expended slots stay expended.")
      : translate("VEMOBILE.PF2E.Spells.ManageIntro", "Search installed spells to add them to this entry. Flexible entries can mark signatures within their available slots.") })
  ] });
  const groups = node("div", { className: "ve-pf2e-preparation-groups" });
  body.append(intro, groups);
  let signature = "";
  let rowsScope;
  const opened = new Set(["0", "1", "flexible"]);
  // Format rank zero as cantrips and higher values as localized ranks.
  const label = rank => rank === 0 ? translate("VEMOBILE.PF2E.Character.Cantrips", "Cantrips") : `${translate("VEMOBILE.PF2E.Character.Rank.Label", "Rank")} ${rank}`;
  // Route preparation edits and broader spell management through their named commands.
  const run = payload => context.run(["assign", "clear", "toggle-flexible"].includes(payload.operation)
    ? ACTOR_COMMANDS.EDIT_PF2E_SPELL_PREPARATION : ACTOR_COMMANDS.EDIT_PF2E_SPELLS, { entryId, ...payload }, false);
  // Keep each rank group open state across record refreshes.
  const section = (key, title, children) => {
    const group = node("details", { className: "ve-pf2e-preparation-rank", attrs: { open: opened.has(key) }, children: [
      node("summary", { children: [node("strong", { text: title }), icon("fa-chevron-down")] }), ...children
    ] });
    rowsScope.listen(group, "toggle", () => { if (group.open) opened.add(key); else opened.delete(key); });
    return group;
  };
  // Rebuild rows only when the entry snapshot changes, preserving dialog scroll.
  modal.refresh = () => {
    if (modal.pending) return;
    const accent = shell.screen.ownerDocument?.defaultView?.getComputedStyle?.(shell.screen).getPropertyValue("--ve-character-accent").trim();
    if (accent) form.style.setProperty("--ve-preparation-accent", accent);
    const entry = current();
    if (!entry || (!entry.preparation && !entry.management)) { modal.close(false); return; }
    const preparation = entry.preparation;
    const management = entry.management;
    const nextSignature = JSON.stringify([preparation, management]);
    if (signature === nextSignature) return;
    signature = nextSignature;
    const scroll = body.scrollTop;
    rowsScope?.dispose();
    rowsScope = context.scope.child("preparation-rows");
    groups.replaceChildren();
    for (const group of (preparation?.ranks ?? []).filter(group => group.slots.length)) {
      groups.append(section(String(group.rank), label(group.rank), group.slots.map(slot => {
        const select = node("select", { attrs: { "aria-label": translate("VEMOBILE.PF2E.Character.Preparation.SlotLabel", "{rank}, slot {slot}", { rank: label(group.rank), slot: slot.slotId + 1 }) }, children: [
          node("option", { text: translate("VEMOBILE.PF2E.Character.Preparation.EmptySlot", "Empty slot"), attrs: { value: "" } }),
          ...group.options.map(spell => node("option", { text: spell.name, attrs: { value: spell.spellId,
            disabled: group.rank === 0 && slot.spellId !== spell.spellId
              && group.slots.some(other => other.slotId !== slot.slotId && other.spellId === spell.spellId) } }))
        ] });
        if (slot.spellId && !group.options.some(spell => spell.spellId === slot.spellId)) select.append(node("option", { text: translate("VEMOBILE.PF2E.Character.Preparation.UnavailableSpell", "Unavailable spell"), attrs: { value: slot.spellId, disabled: true } }));
        select.value = slot.spellId ?? "";
        const selectedSpellImage = node("img", { className: "ve-pf2e-preparation-selected-icon", attrs: { alt: "", "aria-hidden": "true" } });
        const selectedSpellFallback = icon("fa-book-open");
        // Keep the selected spell art and fallback icon aligned with the slot choice.
        const updateSelectedSpellIcon = () => {
          const image = group.options.find(spell => spell.spellId === select.value)?.img;
          selectedSpellImage.hidden = !image;
          selectedSpellFallback.hidden = Boolean(image);
          if (image) selectedSpellImage.src = image;
          else selectedSpellImage.removeAttribute("src");
        };
        updateSelectedSpellIcon();
        const apply = node("button", { text: translate("VEMOBILE.PF2E.Character.Preparation.Apply", "Apply"), attrs: { type: "button", disabled: true }, on: { click: () => run({
          operation: select.value ? "assign" : "clear", rank: group.rank, slotId: slot.slotId,
          spellId: select.value || null, originalSpellId: slot.spellId, originalExpended: slot.expended
        }) } }, rowsScope);
        rowsScope.listen(select, "change", () => {
          apply.disabled = select.value === (slot.spellId ?? "");
          updateSelectedSpellIcon();
        });
        return node("div", { className: "ve-pf2e-preparation-slot", children: [
          node("small", { text: `${slot.slotId + 1}${slot.expended ? ` · ${translate("VEMOBILE.PF2E.Character.Expended", "Expended")}` : ""}` }),
          node("div", { className: "ve-pf2e-preparation-selection", children: [selectedSpellImage, selectedSpellFallback, select] }), apply
        ] });
      })));
    }
    if (preparation?.flexible) {
      const limit = preparation.flexibleLimit;
      const choices = preparation.flexibleOptions ?? [];
      groups.append(section("flexible", limit
        ? translate("VEMOBILE.PF2E.Character.Preparation.SpellCollectionCount", "Spell collection · {value}/{max}", { value: limit.value, max: limit.max })
        : translate("VEMOBILE.PF2E.Character.Preparation.SpellCollection", "Spell collection"), choices.map(spell => node("div", { className: "ve-pf2e-preparation-choice", children: [
        spell.img ? node("img", { attrs: { src: spell.img, alt: "" } }) : icon("fa-book-open"),
        node("div", { children: [node("strong", { text: spell.name }), node("small", { text: label(spell.rank) })] }),
        node("button", { text: spell.selected ? translate("VEMOBILE.PF2E.Character.Preparation.Remove", "Remove") : translate("VEMOBILE.PF2E.Character.PrepareSpells", "Prepare"), attrs: { type: "button", "aria-pressed": String(spell.selected), disabled: !spell.selected && limit?.value >= limit?.max }, on: { click: () => run({ operation: "toggle-flexible", spellId: spell.spellId, selected: !spell.selected, originalSelected: spell.selected }) } }, rowsScope)
      ] }))));
    }
    if (management) {
      const signatureOptions = management.signatures ?? [];
      if (!preparation?.flexible && signatureOptions.length && management.signatureOptions?.length) groups.append(section("signatures",
        translate("VEMOBILE.PF2E.Spells.Signatures", "Signature spells"), signatureOptions.map(spell => node("div", { className: "ve-pf2e-preparation-choice", children: [
          spell.img ? node("img", { attrs: { src: spell.img, alt: "" } }) : icon("fa-book-open"),
          node("div", { children: [node("strong", { text: spell.name }), node("small", { text: label(spell.rank) })] }),
          node("button", { text: spell.selected ? translate("VEMOBILE.PF2E.Spells.Unsign", "Remove signature") : translate("VEMOBILE.PF2E.Spells.Sign", "Set signature"), attrs: { type: "button", "aria-pressed": String(spell.selected), disabled: !spell.selected && management.signatureLimit?.value >= management.signatureLimit?.max }, on: { click: () => run({ operation: "toggle-signature", spellId: spell.spellId, selected: !spell.selected, originalSelected: spell.selected }) } }, rowsScope)
        ] }))));
      const search = node("input", { attrs: { type: "search", maxlength: "80", autocomplete: "off", placeholder: translate("VEMOBILE.PF2E.Spells.Search", "Search installed spells"), "aria-label": translate("VEMOBILE.PF2E.Spells.Search", "Search installed spells") } });
      const searchButton = node("button", { text: translate("VEMOBILE.PF2E.Spells.SearchButton", "Search"), attrs: { type: "button" } });
      const resultArea = node("div", { className: "ve-pf2e-spell-catalog" });
      groups.append(node("section", { className: "ve-pf2e-spell-management-catalog", children: [node("h3", { text: translate("VEMOBILE.PF2E.Spells.Add", "Add a spell") }), search, searchButton, resultArea] }));
      let searchGeneration = 0;
      // Search installed spell sources and ignore results from stale requests or owners.
      const doSearch = async cursor => {
        const generation = ++searchGeneration;
        const searchScope = rowsScope;
        const query = search.value.trim();
        searchButton.disabled = true;
        resultArea.setAttribute("aria-busy","true");
        try {
          const response = await context.commands.execute(ACTOR_COMMANDS.EDIT_PF2E_SPELLS, { actorSourceUuid: context.actor.sourceUuid, entryId, operation: "search", search: query, cursor });
          const catalog = response?.catalog ?? response?.result?.catalog ?? response;
          if (generation !== searchGeneration || searchScope.disposed || ownerScope.disposed || shell.documentModal !== modal
            || shell.actor?.sourceUuid !== context.actor.sourceUuid || current()?.entryId !== entryId) return;
          const results = catalog?.spells ?? [];
          resultArea.replaceChildren(...results.map(spell => {
            const maxRank = management.maxRank ?? current()?.preparation?.ranks?.at(-1)?.rank ?? 10;
            const rankSelect = management.spontaneous && !spell.cantrip ? node("select", { attrs: { "aria-label": translate("VEMOBILE.PF2E.Spells.ImportRank", "Import at rank") }, children: Array.from({ length: Math.max(0, maxRank - spell.rank + 1) }, (_, index) => {
              const rank = spell.rank + index;
              return node("option", { text: label(rank), attrs: { value: rank, selected: rank === spell.rank } });
            }) }) : null;
            return node("div", { className: "ve-pf2e-preparation-choice", children: [spell.img ? node("img", { attrs: { src: spell.img, alt: "" } }) : icon("fa-book-open"), node("div", { children: [node("strong", { text: spell.name }), node("small", { text: spell.cantrip ? translate("VEMOBILE.PF2E.Character.Cantrips", "Cantrips") : label(spell.rank) })] }),
              node("div", { children: [rankSelect, node("button", { text: translate("VEMOBILE.PF2E.Spells.Import", "Add"), attrs: { type: "button" }, on: { click: () => run({ operation: "import", spellUuid: spell.uuid, ...(rankSelect ? { rank: Number(rankSelect.value) } : {}) }) }, }, rowsScope)] })] });
          }), ...(catalog?.nextCursor !== null && catalog?.nextCursor !== undefined ? [node("button", { text: translate("VEMOBILE.PF2E.Spells.More", "More results"), attrs: { type: "button" }, on: { click: () => doSearch(catalog.nextCursor) } }, rowsScope)] : []));
          if (!results.length) resultArea.append(node("p", { text: translate("VEMOBILE.PF2E.Spells.NoResults", "No eligible spells found.") }));
        } catch (failure) {
          if (generation === searchGeneration && !searchScope.disposed && !ownerScope.disposed) resultArea.replaceChildren(node("p", { text: failure?.message ?? translate("VEMOBILE.PF2E.Spells.SearchFailed", "Spell search could not be completed.") }));
        } finally { if (generation === searchGeneration && !searchScope.disposed && !ownerScope.disposed) {searchButton.disabled = false;resultArea.removeAttribute("aria-busy");} }
      };
      rowsScope.listen(searchButton, "click", () => doSearch(0));
      rowsScope.listen(search, "keydown", event => { if (event.key === "Enter") { event.preventDefault(); doSearch(0); } });
    }
    if (!groups.children.length) groups.append(node("p", { text: translate("VEMOBILE.PF2E.Character.Preparation.NoSlots", "No preparation slots are available in this entry.") }));
    body.scrollTop = scroll;
  };
  modal.refresh();
}

// Preserve the public management entry point while sharing the same editor flow.
export const openSpellManagement = openSpellPreparation;

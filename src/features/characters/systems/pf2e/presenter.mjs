import { openItemDetails, syncItemDetails } from "./item-details.mjs";
import { openPersistentDamageDialog, syncPersistentDamageDialog } from "./persistent-damage-dialog.mjs";
import { openSpellPreparation } from "./spell-preparation.mjs";
import { openHeaderEditor, syncHeaderEditor, headerPointResource } from "./header-editors.mjs";
import { collectionGroup, inventoryControls, listControls } from "./collection-controls.mjs";
import { itemArt, itemRow } from "./item-rows.mjs";
import { ruleOptions, itemRuleOptions, explorationControl, ammunitionControls, elementalBlasts } from "./play-controls.mjs";
import { inventoryControls as itemInventoryControls, effectControls } from "./inventory-effect-controls.mjs";
import { bindPf2eShortcutIcons } from "./shortcut-hold.mjs";
import { openAcEditor, openBiographyEditor, openCurrencyEditor, openDefenseEditor, syncDocumentEditor } from "./document-editors.mjs";
import { createCharacterMenuController } from "../../character-menu.mjs";
import { ACTOR_COMMANDS } from "../../../../kernel/command-names.mjs";
import { localizedNumber, localizedText } from "../../../../ui/localized-text.mjs";
import { icon, node, vectorIcon } from "../../../../ui/dom.mjs";
import { actionResultsDeferred, renderActionSessionModal } from "../../../../ui/action-session-modal.mjs";
import { renderRollResultOverlay } from "../../../../ui/roll-result-overlay.mjs";
import { renderImageViewer } from "../../../../ui/image-viewer.mjs";
import { resolveCharacterTheme } from "../../../../kernel/character-theme.mjs";
import { resolvePf2eHeaderBanner } from "../../../../kernel/pf2e-class-appearance.mjs";

const TABS = Object.freeze([
  ["overview", "fa-address-card", "Character", "PF2E.TabCharacterLabel"],
  ["features", "action-glyph", "Actions", "PF2E.TabActionsLabel"],
  ["inventory", "fa-backpack", "Inventory", "PF2E.TabInventoryLabel"],
  ["spells", "fa-wand-magic-sparkles", "Spellcasting", "PF2E.TabSpellbookLabel"],
  ["abilities", "fa-hand", "Proficiencies", "PF2E.TabSkillsLabel"],
  ["feats", "fa-medal", "Feats", "PF2E.Item.Feat.Plural"],
  ["effects", "fa-person-rays", "Effects", "PF2E.Item.Effect.Plural"],
  ["biography", "fa-book-reader", "Biography", "PF2E.Biography"]
]);
const CARRY_CHOICES = Object.freeze([
  ["held-1", "Held (1 hand)", "VEMOBILE.PF2E.Character.Carry.Held1", { carryType: "held", handsHeld: 1, inSlot: false }],
  ["held-2", "Held (2 hands)", "VEMOBILE.PF2E.Character.Carry.Held2", { carryType: "held", handsHeld: 2, inSlot: false }],
  ["worn-slot", "Worn in equipment slot", "VEMOBILE.PF2E.Character.Carry.WornSlot", { carryType: "worn", handsHeld: 0, inSlot: true }],
  ["worn-no-slot", "Worn outside equipment slot", "VEMOBILE.PF2E.Character.Carry.WornNoSlot", { carryType: "worn", handsHeld: 0, inSlot: false }],
  ["stowed", "Stowed", "VEMOBILE.PF2E.Character.Carry.Stowed", { carryType: "stowed", handsHeld: 0, inSlot: false }],
  ["dropped", "Dropped", "VEMOBILE.PF2E.Character.Carry.Dropped", { carryType: "dropped", handsHeld: 0, inSlot: false }]
]);
const CARRY_LABEL_BY_TYPE = Object.freeze({ held: "VEMOBILE.PF2E.Character.Carry.Held", worn: "VEMOBILE.PF2E.Character.Carry.Worn", stowed: "VEMOBILE.PF2E.Character.Carry.Stowed", dropped: "VEMOBILE.PF2E.Character.Carry.Dropped" });
const ACTOR_TYPE_LABELS = Object.freeze({
  character: "VEMOBILE.PF2E.Character.Type.Character", npc: "VEMOBILE.PF2E.Character.Type.NPC",
  familiar: "VEMOBILE.PF2E.Character.Type.Familiar", hazard: "VEMOBILE.PF2E.Character.Type.Hazard",
  loot: "VEMOBILE.PF2E.Character.Type.Loot", party: "VEMOBILE.PF2E.Character.Type.Party",
  army: "VEMOBILE.PF2E.Character.Type.Army", vehicle: "VEMOBILE.PF2E.Character.Type.Vehicle"
});
const BIOGRAPHY_SECTIONS = Object.freeze({
  appearance: ["Appearance", "PF2E.BiographyAppearance"],
  backstory: ["Backstory", "PF2E.BiographyBackStory"],
  personality: ["Personality", "PF2E.BiographyPersonalityHeader"],
  campaign: ["Campaign", "PF2E.BiographyCampaignNotesHeader"]
});
const BIOGRAPHY_LABELS = Object.freeze({
  height: ["Height", "PF2E.Height"], weight: ["Weight", "PF2E.Weight"],
  birthPlace: ["Birth place", "PF2E.BiographyBirthPlace"], attitude: ["Attitude", "PF2E.BiographyAttitude"],
  beliefs: ["Beliefs", "PF2E.BiographyBeliefs"], edicts: ["Edicts", "PF2E.BiographyEdicts"],
  anathema: ["Anathema", "PF2E.BiographyAnathema"], likes: ["Likes", "PF2E.BiographyLikes"],
  dislikes: ["Dislikes", "PF2E.BiographyDislikes"], catchphrases: ["Catchphrases", "PF2E.BiographyCatchphrases"],
  campaignNotes: ["Notes", "PF2E.BiographyCampaignNotes"], allies: ["Allies", "PF2E.BiographyAllies"],
  enemies: ["Enemies", "PF2E.BiographyEnemies"], organizations: ["Organizations", "PF2E.BiographyOrganizations"]
});
const SECTION_LABELS = Object.freeze({
  "Vital statistics": "VEMOBILE.PF2E.Character.Section.VitalStatistics",
  "Hit points": "VEMOBILE.PF2E.Character.Section.HitPoints",
  Resources: "VEMOBILE.PF2E.Character.Section.Resources", Strikes: "VEMOBILE.PF2E.Character.Section.Strikes",
  Conditions: "VEMOBILE.PF2E.Character.Section.Conditions", "Saving throws": "VEMOBILE.PF2E.Character.Section.SavingThrows",
  Skills: "VEMOBILE.PF2E.Character.Section.Skills", Perception: "VEMOBILE.PF2E.Character.Section.Perception",
  Actions: "VEMOBILE.PF2E.Character.Section.Actions", Attributes: "VEMOBILE.PF2E.Character.Section.Attributes", "Passive features": "VEMOBILE.PF2E.Character.Section.PassiveFeatures", "Pinned actions": "VEMOBILE.PF2E.Character.Section.PinnedActions",
  Inventory: "VEMOBILE.PF2E.Character.Section.Inventory", Biography: "VEMOBILE.PF2E.Character.Section.Biography",
  Spells: "VEMOBILE.PF2E.Character.Section.Spells"
});
const ACTION_LABELS = Object.freeze({
  Add: "VEMOBILE.PF2E.Character.Action.Add", "Apply carry": "VEMOBILE.PF2E.Character.Action.ApplyCarry",
  Attack: "VEMOBILE.PF2E.Character.Action.Attack", Cast: "VEMOBILE.PF2E.Character.Action.Cast",
  "Critical damage": "VEMOBILE.PF2E.Character.Action.CriticalDamage", "Post to chat": "VEMOBILE.PF2E.Character.Action.PostToChat", "View all": "VEMOBILE.PF2E.Character.Action.ViewAll", "View all statistics": "VEMOBILE.PF2E.Character.Action.ViewAllStatistics", Damage: "VEMOBILE.PF2E.Character.Action.Damage",
  Details: "VEMOBILE.PF2E.Character.Action.Details", Heal: "VEMOBILE.PF2E.Character.Action.Heal",
  Invest: "VEMOBILE.PF2E.Character.Action.Invest", "Item card": "VEMOBILE.PF2E.Character.Action.ItemCard",
  "Rest overnight": "VEMOBILE.PF2E.Character.Action.RestOvernight", "Roll initiative": "VEMOBILE.PF2E.Character.Action.RollInitiative",
  "Set temporary HP": "VEMOBILE.PF2E.Character.Action.SetTemporaryHP", Uninvest: "VEMOBILE.PF2E.Character.Action.Uninvest",
  Use: "VEMOBILE.PF2E.Character.Action.Use"
});

/** Render a PF2e character sheet using only the published Actor record and named commands. */
export function renderPf2eCharacters({ state, commands, scope, overlayHost = null, retained = null }) {
  const shell = retained ?? { screen: null, paneScope: null, panelState: new Map() };
  const ownerScope = scope;
  const actors = state?.snapshot?.actors ?? [];
  const actor = Object.hasOwn(state?.snapshot ?? {}, "selectedActor")
    ? state.snapshot.selectedActor
    : actors.find(entry => entry.id === state?.selectedActorId) ?? null;
  shell.actorSourceUuid = actor?.sourceUuid ?? "";
  shell.actor = actor;
  shell.commands = commands;
  commands = Object.create(commands, {
    pf2eActionCurrent: { value: source => !ownerScope.disposed && shell.actorSourceUuid === source },
    openPf2eItemDetails: { value: payload => openItemDetails(shell, payload, ownerScope, overlayHost) }
  });
  const screen = shell.screen ??= node("section", { className: "ve-character-screen ve-character-shared-shell ve-pf2e-character-screen" });
  shell.status ??= node("p", { className: "ve-action-status", attrs: { role: "status", "aria-live": "polite" } });
  shell.heading ??= node("div", { className: "ve-character-heading ve-pf2e-character-heading", dataset: { headerLayout: "intrinsic" } });
  shell.scroller ??= node("div", { className: "ve-character-content-scroller", attrs: { tabindex: "0" } });
  shell.panelHost ??= node("div", { className: "ve-sheet-panel ve-pf2e-sheet-panel" });
  if (!shell.mounted) {
    shell.scroller.append(shell.panelHost);
    shell.screen.append(shell.heading, shell.status, shell.scroller);
    shell.mounted = true;
  }
  shell.openHeaderEditor = kind => openHeaderEditor(shell, kind, ownerScope, overlayHost);
  shell.openCurrencyEditor = () => openCurrencyEditor(shell, ownerScope, overlayHost);
  shell.openAcEditor = () => openAcEditor(shell, ownerScope, overlayHost);
  shell.openSpellPreparation = entryId => openSpellPreparation(shell, entryId, ownerScope, overlayHost);
  shell.openBiographyEditor = (section, label) => openBiographyEditor(shell, section, label, BIOGRAPHY_LABELS, ownerScope, overlayHost);
  shell.openPersistentDamage = () => openPersistentDamageDialog(shell, ownerScope, overlayHost);
  shell.openConditions = () => openConditionsOverlay(shell, ownerScope, overlayHost);
  shell.conditionCommands = commands;
  const status = shell.status;
  const resultsDeferred = actionResultsDeferred(state);
  syncOverlays(shell, { state, commands, ownerScope, overlayHost, resultsDeferred });
  syncHeaderEditor(shell, resultsDeferred);
  syncItemDetails(shell, resultsDeferred);
  const ownActionSession = Boolean(state?.actionSession && state.actionSessionOrigin !== "scene" && !resultsDeferred);
  screen.className = `ve-character-screen ve-character-shared-shell ve-pf2e-character-screen${state?.rollResult && !resultsDeferred ? " has-roll-result" : ""}${ownActionSession ? " has-action-session" : ""}`;
  screen.dataset.characterTheme = resolveCharacterTheme(actor?.themeClassKey ?? "neutral", commands.readCharacterPreferences?.()?.colorScheme);
  screen.dataset.actorType = actor?.type ?? "";
  if (actor) {
    const tab = presentationTab(state.characterTab);
    screen.dataset.pf2eView = tab;
    const visibleTabs = TABS;
    const panelKey = ["abilities", "effects"].includes(state.characterTab) ? state.characterTab : tab;
    const context = `${actor.sourceUuid ?? actor.id}:${panelKey}`;
    // Native updates rebuild command closures, but an open description must not
    // disappear while its refreshed enriched HTML is being fetched.
    const descriptions = new Map();
    if (shell.activePanelContext === context && actor.capabilities?.owner) {
      for (const row of shell.panelHost.querySelectorAll('details[data-pf2e-disclosure-key]')) {
        const description = row.querySelector('.ve-pf2e-row-description');
        if (row.open && description) descriptions.set(row.dataset.pf2eDisclosureKey, description.innerHTML);
      }
    }
    if (shell.activePanelContext) capturePanelState(shell, shell.activePanelContext);
    syncHeader(shell, { actor, actors, commands, ownerScope, overlayHost });
    syncTabs(shell, visibleTabs, tab, commands, ownerScope);
    shell.paneScope?.dispose();
    const paneScopeNow = ownerScope.child("pf2e-character-pane");
    shell.paneScope = paneScopeNow;
    shell.activePanelContext = context;
    const panel = renderTab(tab, actor, state, commands, status, paneScopeNow, shell);
    if (["features", "spells"].includes(tab)) {
      prepareListSorting(panel);
      listControls(panel, commands, paneScopeNow, { label: text(commands, TABS.find(([key]) => key === tab)[2], TABS.find(([key]) => key === tab)[3]), stateKey: `${tab}-sort` });
    }
    for (const row of panel.querySelectorAll('details[data-pf2e-disclosure-key]')) {
      const html = descriptions.get(row.dataset.pf2eDisclosureKey);
      const description = row.querySelector('.ve-pf2e-row-description');
      if (html !== undefined && description) description.innerHTML = html;
    }
    shell.panelHost.replaceChildren(panel);
    restorePanelState(shell, context);
    bindPf2eShortcutIcons(screen, actor, commands, paneScopeNow);
  } else {
    if (shell.menuController) setActorMenuOpen(shell, false, ownerScope);
    shell.paneScope?.dispose();
    const paneScopeNow = ownerScope.child("pf2e-character-pane");
    shell.paneScope = paneScopeNow;
    shell.heading.replaceChildren(node("header", { className: "ve-character-selection-notice ve-pf2e-selection-heading", children: [
      icon("fa-user"), node("h2", { text: text(commands, "Select character", "VEMOBILE.Character.Presenter.SelectCharacter") })
    ] }));
    shell.panelHost.replaceChildren(actors.length ? actorChoices(actors, commands, paneScopeNow) : node("p", {
      className: "ve-empty", text: text(commands, "No supported characters are available to this user.", "VEMOBILE.Character.Presenter.NoSupportedCharactersAreAvailableToThisUser")
    }));
  }
  syncDocumentEditor(shell, resultsDeferred);
  syncPersistentDamageDialog(shell, resultsDeferred);
  if (shell.conditionModal) {
    if (!actor || shell.conditionModal.sourceUuid !== actor.sourceUuid || resultsDeferred) shell.conditionModal.close(false);
    else shell.conditionModal.render();
  }
  shell.screen = screen;
  screen.__veUpdateCharacter = next => renderPf2eCharacters({ ...next, scope: ownerScope, overlayHost, retained: shell });
  return screen;
}

function presentationTab(tab) { return TABS.some(([key]) => key === tab) ? tab : "overview"; }

function syncPortraitConditions(shell, commands, scope) {
  const { actor, headerRefs: refs } = shell;
  refs.portraitConditions ??= new Map();
  const recovery = actor.pf2e?.recovery;
  refs.portrait.classList.toggle("is-dying", Number(recovery?.dying?.value) > 0);
  for (const slug of ["dying", "wounded"]) {
    let entry = refs.portraitConditions.get(slug);
    if (!entry) {
      const image = node("img", { attrs: { alt: "", hidden: true } });
      const pips = node("span", { className: "ve-pf2e-portrait-pips", attrs: { "aria-hidden": "true" } });
      const button = node("button", { className: "ve-pf2e-portrait-condition", dataset: { condition: slug }, attrs: { type: "button", hidden: true },
        children: [image, pips], on: { click: () => shell.openConditions() } }, scope);
      refs.portrait.append(button);
      entry = { button, image, pips };
      refs.portraitConditions.set(slug, entry);
    }
    const counter = recovery?.[slug];
    const condition = actor.pf2e?.conditions?.find(row => row.slug === slug && row.active)
      ?? actor.pf2e?.availableConditions?.find(row => row.slug === slug);
    entry.button.hidden = !(counter?.value > 0);
    entry.button.disabled = !can(actor, "conditions");
    const label = condition?.label || (slug === "dying" ? text(commands, "Dying", "PF2E.ConditionTypeDying") : text(commands, "Wounded", "PF2E.ConditionTypeWounded"));
    entry.button.setAttribute("aria-label", `${label} ${number(commands, counter?.value ?? 0)}`);
    entry.button.setAttribute("title", `${label} ${number(commands, counter?.value ?? 0)}`);
    entry.image.hidden = !condition?.img;
    if (condition?.img) entry.image.setAttribute("src", condition.img);
    const max = Math.max(0, Math.min(20, Math.floor(Number(counter?.max) || 0)));
    entry.pips.replaceChildren(...Array.from({ length: max }, (_, index) => node("i", { className: `ve-pf2e-portrait-pip${index < counter.value ? " is-active" : ""}` })));
  }
  if (!refs.recoveryButton) {
    refs.recoveryLabel = node("span");
    refs.recoveryButton = node("button", { className: "ve-pf2e-portrait-recovery", attrs: { type: "button", hidden: true }, children: [icon("fa-dice-d20"), refs.recoveryLabel],
      on: { click: event => issueCommand({ button: event.currentTarget, actor: shell.actor, command: ACTOR_COMMANDS.ROLL_PF2E_RECOVERY, payload: {},
        commands: shell.actionCommands, status: shell.status, scope, resultLabel: text(shell.commands, "Recovery", "VEMOBILE.PF2E.Character.Recovery"),
        isEnabled: () => can(shell.actor, "rollRecovery") }) } }, scope);
    refs.portrait.append(refs.recoveryButton);
  }
  refs.recoveryLabel.textContent = text(commands, "Recovery", "VEMOBILE.PF2E.Character.Recovery");
  refs.recoveryButton.hidden = !can(actor, "rollRecovery");
  refs.recoveryButton.disabled = !can(actor, "rollRecovery") || refs.recoveryButton.classList.contains("is-pending");
}

function syncHeader(shell, { actor, actors, commands, ownerScope, overlayHost }) {
  shell.actors = actors;
  shell.menuHost = overlayHost;
  const settings = commands.readCharacterPreferences?.() ?? {};
  if (!shell.headerRefs) {
    const image = node("img", { attrs: { alt: "", draggable: false } });
    const portraitButton = node("button", { className: "ve-character-portrait-button", attrs: { type: "button" }, on: {
      click: () => {
        const current = shell.actor;
        if (!current?.img) return;
        const name = localizedText(shell.commands.localize, "VEMOBILE.Character.PortraitOf", "{name}'s portrait", { name: current.name ?? "" });
        shell.commands.openCharacterPortrait?.({ src: current.img, name });
      }
    }, children: [image] }, ownerScope);
    const portrait = node("div", { className: "ve-sheet-portrait-frame ve-pf2e-portrait", children: [portraitButton] });
    const name = node("h2", { attrs: { title: actor.name } });
    const subtitle = node("p", { className: "ve-pf2e-identity-subtitle" });
    const identityCopy = node("div", { className: "ve-sheet-identity-copy", children: [name, subtitle] });
    const tags = node("div", { className: "ve-pf2e-header-tags" });
    const levelValue = node("strong");
    const level = node("div", { className: "ve-pf2e-level-badge", children: [
      node("span", { text: text(commands, "Level", "VEMOBILE.Character.Header.level") }), levelValue
    ] });
    const expandedClass = node("span", { className: "ve-pf2e-expanded-class" });
    const xpValue = node("span", { className: "ve-pf2e-xp-value" });
    const xpSummary = node("div", { className: "ve-pf2e-xp-summary", children: [expandedClass, xpValue] });
    const xpFill = node("span");
    const xpTrack = node("div", { className: "ve-pf2e-xp-track", attrs: { role: "progressbar", "aria-label": text(commands, "Experience progress", "VEMOBILE.Character.Header.experience"), "aria-valuemin": "0" }, children: [xpFill] });
    const xpGauge = node("button", { className: "ve-pf2e-xp-gauge", attrs: { type: "button", "aria-label": text(commands, "Add experience", "VEMOBILE.Character.AddExperience") }, children: [xpTrack], on: { click: () => shell.openHeaderEditor("xp") } }, ownerScope);
    const experienceDetails = node("div", { className: "ve-pf2e-experience-details", children: [xpSummary, xpGauge] });
    const experience = node("div", { className: "ve-pf2e-header-experience", children: [level, experienceDetails] });
    const band = node("div", { className: "ve-pf2e-identity-band", children: [identityCopy, tags, experience] });
    const arrow = icon("fa-chevron-down");
    const controls = node("button", { className: "ve-character-select-trigger ve-pf2e-identity-controls", attrs: {
      type: "button", "aria-haspopup": "menu", "aria-expanded": "false", "aria-label": text(commands, "Choose character", "VEMOBILE.PF2E.Character.SelectCharacter")
    }, children: [arrow], on: { click: () => setActorMenuOpen(shell, !shell.menuController, ownerScope) } }, ownerScope);
    const hero = node("article", { className: "ve-sheet-identity ve-pf2e-hero", dataset: { classArt: "fallback" }, children: [portrait, band, controls] });
    const selector = node("div", { className: "ve-character-selector ve-pf2e-character-selector", children: [hero] });
    const hpRow = node("div", { className: "ve-pf2e-header-health" });
    const vitals = node("div", { className: "ve-pf2e-header-vitals" });
    const shieldRow = node("div", { className: "ve-pf2e-header-shield", attrs: { id: "ve-pf2e-shield-details", hidden: true } });
    const speedRow = node("div", { className: "ve-pf2e-header-speeds", attrs: { id: "ve-pf2e-speed-details", hidden: true } });
    const perceptionRow = node("div", { className: "ve-pf2e-header-perception", attrs: { id: "ve-pf2e-perception-details", hidden: true } });
    const classDcRow = node("div", { className: "ve-pf2e-header-class-dcs", attrs: { id: "ve-pf2e-class-dc-details", hidden: true } });
    hero.append(hpRow, vitals, shieldRow, speedRow, perceptionRow, classDcRow);
    // Clear the full-width health band while expanded, including wrapped labels
    // and HP controls; the compact portrait spans the identity and health rows.
    if (typeof ResizeObserver === "function") {
      const portraitObserver = new ResizeObserver(() => {
        if (ownerScope.disposed) return;
        hero.style.setProperty("--ve-pf2e-health-height", `${hpRow.getBoundingClientRect().height}px`);
      });
      ownerScope.own(() => portraitObserver.disconnect());
      portraitObserver.observe(hpRow);
    }
    shell.headerRefs = { image, portrait, portraitButton, name, subtitle, expandedClass, tags, level, levelValue, experience, xpGauge, xpValue, xpTrack, xpFill, hero, selector, controls, arrow, hpRow, vitals, shieldRow, speedRow, perceptionRow, classDcRow };
    shell.selector = selector;
    shell.heading.append(selector);
    shell.headerScope = ownerScope.child("pf2e-header-actions");
    shell.actionCommands = commands;
  }
  shell.commands = commands;
  shell.actionCommands = commands;
  shell.headerScope ??= ownerScope.child("pf2e-header-actions");
  const refs = shell.headerRefs;
  if (refs.image.getAttribute?.("src") !== (actor.img ?? "")) {
    actor.img ? refs.image.setAttribute("src", actor.img) : refs.image.removeAttribute("src");
  }
  refs.image.hidden = !actor.img;
  refs.portraitButton.hidden = !actor.img;
  refs.portraitButton.setAttribute("aria-label", localizedText(commands.localize, "VEMOBILE.Character.ViewPortrait", "View {name} portrait", { name: actor.name ?? "" }));
  refs.image.setAttribute("alt", localizedText(commands.localize, "VEMOBILE.Character.PortraitOf", "{name}'s portrait", { name: actor.name ?? "" }));
  syncPortraitConditions(shell, commands, ownerScope);
  refs.name.textContent = actor.name ?? "";
  refs.name.setAttribute("title", actor.name ?? "");
  const identity = actor.pf2e?.identity ?? {};
  const className = identity.className || actor.classes?.map(entry => entry.name).filter(Boolean).join(" / ") || "";
  const identityText = className || actor.npc?.creatureType || (ACTOR_TYPE_LABELS[actor.type] ? text(commands, actor.type, ACTOR_TYPE_LABELS[actor.type]) : actor.type ?? "");
  refs.subtitle.replaceChildren(...[
    actor.level != null ? node("span", { className: "ve-pf2e-compact-level", text: `${text(commands, "Level", "VEMOBILE.Character.Header.level")} ${number(commands, actor.level)} ` }) : null,
    node("span", { text: identityText })
  ].filter(Boolean));
  refs.subtitle.setAttribute("title", [identity.ancestry, identity.heritage, className].filter(Boolean).join(" · "));
  refs.expandedClass.textContent = identityText;
  refs.expandedClass.setAttribute("title", identityText);
  const details = actor.pf2e?.details ?? {};
  const seenTags = new Set();
  const tags = [details.size, identity.heritage, identity.ancestry, ...(identity.traits ?? [])].filter(label => {
    if (!label || seenTags.has(label.toLocaleLowerCase())) return false;
    seenTags.add(label.toLocaleLowerCase()); return true;
  });
  refs.tags.replaceChildren(...tags.map(label => node("span", { text: label, className: label === details.size ? "is-size" : "" })));
  refs.tags.hidden = tags.length === 0;
  refs.levelValue.textContent = actor.level !== null && actor.level !== undefined ? number(commands, actor.level) : "";
  refs.level.hidden = actor.level === null || actor.level === undefined;
  const xp = details.experience;
  const hasXp = Number.isFinite(xp?.value) && Number.isFinite(xp?.max) && xp.max > 0;
  refs.xpGauge.hidden = !hasXp;
  refs.xpGauge.disabled = !can(actor, "editExperience");
  refs.xpValue.hidden = !hasXp;
  refs.experience.hidden = refs.level.hidden && !hasXp && !identityText;
  if (hasXp) {
    refs.xpValue.textContent = `${number(commands, xp.value)} / ${number(commands, xp.max)}`;
    refs.xpTrack.setAttribute("aria-valuemax", String(xp.max));
    refs.xpTrack.setAttribute("aria-valuenow", String(Math.max(0, Math.min(xp.max, xp.value))));
    refs.xpFill.style.setProperty("width", `${Math.max(0, Math.min(100, xp.value / xp.max * 100))}%`);
  }
  shell.heading.dataset.headerRevision = [actor.sourceUuid, actor.name, refs.subtitle.textContent, actor.level, tags.join(","), hasXp, xp?.value, xp?.max].join("|");
  if (shell.menuController && (shell.menuActors !== actors || shell.menuActor !== actor)) {
    const expanded = [...shell.menuController.expandedFolderIds];
    setActorMenuOpen(shell, false, ownerScope);
    setActorMenuOpen(shell, true, ownerScope, expanded);
  }
  updateHeaderHealth(shell, actor, commands);
  updateHeaderVitals(shell, actor, commands);
  const artwork = settings.headerArtwork ?? "automatic";
  const bannerSignature = [actor.sourceUuid, artwork, actor.type, identity.classSlug, identity.ancestrySlug, identity.ancestry].join("|");
  if (shell.bannerSignature !== bannerSignature) {
    shell.bannerScope?.dispose();
    shell.bannerScope = ownerScope.child("pf2e-character-banner");
    shell.bannerSignature = bannerSignature;
    const resolution = resolvePf2eHeaderBanner(actor, artwork);
    loadPf2eBanner(refs.hero, resolution.candidates, shell.bannerScope);
  }
  if (refs.selector.parentElement !== shell.heading) shell.heading.append(refs.selector);
}

function setActorMenuOpen(shell, open, ownerScope, expanded = []) {
  shell.menuScope?.dispose(); shell.menuScope = null; shell.menuController = null;
  const refs = shell.headerRefs;
  refs.controls.setAttribute("aria-expanded", String(open));
  refs.arrow.classList.toggle("fa-chevron-down", !open);
  refs.arrow.classList.toggle("fa-chevron-up", open);
  refs.selector.classList.toggle("is-open", open);
  if (!open || ownerScope.disposed) return;
  const scope = shell.menuScope = ownerScope.child("pf2e-actor-menu");
  const close = () => { setActorMenuOpen(shell, false, ownerScope); refs.controls.focus?.({preventScroll:true}); };
  const controller = shell.menuController = createCharacterMenuController({
    actors: shell.actors, selectedActor: shell.actor, commands: { localize: shell.commands.localize, selectActor: source => shell.commands.selectActor(source) },
    onClose: close, scope, describeActor: entry => [entry.pf2e?.identity?.className, entry.pf2e?.identity?.ancestry].filter(Boolean).join(" · ") || entry.type
  });
  shell.menuActors = shell.actors; shell.menuActor = shell.actor;
  for (const id of expanded) controller.expandedFolderIds.add(id);
  const menu = controller.element;
  menu.classList.add("ve-pf2e-actor-menu");
  (shell.menuHost ?? shell.screen.closest?.(".ve-mobile-app") ?? refs.selector).append(menu);
  scope.own(() => menu.remove());
  controller.mount(); menu.removeAttribute("hidden");
  scope.listen(menu, "keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } });
  scope.listen(document, "pointerdown", event => { if (!menu.contains(event.target) && !refs.controls.contains(event.target)) close(); }, {passive:true});
}

function syncTabs(shell, visibleTabs, selectedTab, commands, ownerScope) {
  const keys = visibleTabs.map(([key]) => key).join(":");
  if (!shell.tabBar) {
    shell.tabBar = node("div", { className: "ve-sheet-tabs ve-pf2e-tabs", attrs: { role: "tablist", "aria-label": text(commands, "Character sections", "VEMOBILE.PF2E.Character.Sections") }, dataset: { count: String(visibleTabs.length) } });
    shell.heading.append(shell.tabBar);
  }
  if (shell.tabsKey !== keys) {
    shell.tabScope?.dispose();
    shell.tabScope = ownerScope.child("pf2e-character-tabs");
    shell.tabsKey = keys;
    shell.tabBar.dataset.count = String(visibleTabs.length);
    const buttons = visibleTabs.map(([key, iconName, fallback, labelKey]) => {
      const label = text(commands, fallback, labelKey);
      return node("button", { className: key === selectedTab ? "is-active" : "", attrs: { type: "button", role: "tab", "data-character-tab": key, "aria-label": label, title: label, "aria-selected": String(key === selectedTab) }, on: {
        click: () => shell.commands.selectCharacterTab(key)
      }, children: [iconName === "action-glyph" ? node("span", { className: "action-glyph ve-pf2e-tab-action", text: "1", attrs: { "aria-hidden": "true" } }) : icon(iconName), node("span", { text: label })] }, shell.tabScope);
    });
    shell.tabBar.replaceChildren(...buttons);
    shell.tabButtons = new Map(visibleTabs.map(([key], index) => [key, buttons[index]]));
  }
  for (const [key, button] of shell.tabButtons ?? []) {
    const active = key === selectedTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    if (active && shell.lastSelectedTab !== selectedTab && typeof button.offsetLeft === "number") {
      const left = button.offsetLeft;
      if (left < shell.tabBar.scrollLeft) shell.tabBar.scrollLeft = left;
      else if (left + button.offsetWidth > shell.tabBar.scrollLeft + shell.tabBar.clientWidth) shell.tabBar.scrollLeft = left + button.offsetWidth - shell.tabBar.clientWidth;
    }
  }
  shell.lastSelectedTab = selectedTab;
  if (shell.tabBar.parentElement !== shell.heading) shell.heading.append(shell.tabBar);
}

function updateHeaderHealth(shell, actor, commands) {
  const refs = shell.headerRefs;
  const hp = actor.hp;
  const heroPoints = headerPointResource(actor);
  if (!refs.health || refs.healthSourceUuid !== actor.sourceUuid) {
    const hpValue = node("strong", { className: "ve-pf2e-hp-value" });
    const hpLabel = node("span", { className: "ve-pf2e-hp-label", text: text(commands, "Hit points", "VEMOBILE.PF2E.Character.Section.HitPoints") });
    const hpTrack = node("div", { className: "ve-pf2e-health-track", attrs: { role: "progressbar", "aria-label": text(commands, "Hit points", "VEMOBILE.PF2E.Character.Section.HitPoints"), "aria-valuemin": "0" } });
    const hpFill = node("span", { className: "ve-pf2e-health-fill" }); hpTrack.append(hpFill);
    const hpCell = node("button", { className: "ve-pf2e-health-cell", attrs: { type: "button" }, children: [hpLabel, node("div", { className: "ve-pf2e-health-number", children: [icon("fa-heart"), hpValue] })], on: { click: () => shell.openHeaderEditor("hp") } }, shell.headerScope);
    const tempValue = node("strong", { className: "ve-pf2e-temp-value" });
    const tempCell = node("button", { className: "ve-pf2e-temp-cell", attrs: { type: "button" }, children: [node("span", { text: text(commands, "Temp HP", "VEMOBILE.PF2E.Character.TempHPShort") }), node("div", { className: "ve-pf2e-health-number", children: [icon("fa-shield"), tempValue] })], on: { click: () => shell.openHeaderEditor("temp") } }, shell.headerScope);
    const pointsValue = node("strong", { className: "ve-pf2e-hero-points-value" });
    const pointsCell = node("button", { className: "ve-pf2e-hero-points", attrs: { type: "button" }, children: [node("span", { text: text(commands, "Hero points", "VEMOBILE.PF2E.Character.HeroPoints") }), pointsValue], on: { click: () => shell.openHeaderEditor("hero") } }, shell.headerScope);
    refs.health = node("div", { className: "ve-pf2e-header-health-row", children: [hpCell, tempCell, pointsCell, hpTrack] });
    refs.hpActionButtons = [hpCell, tempCell];
    refs.healthHpValue = hpValue; refs.healthTemp = tempValue;
    refs.healthPoints = pointsValue; refs.healthFill = hpFill; refs.healthTrack = hpTrack; refs.hpActions = hpCell;
    refs.healthSourceUuid = actor.sourceUuid;
  }
  refs.health.hidden = !hp && !heroPoints;
  refs.hpActions.hidden = !hp;
  if (hp) {
    refs.healthHpValue.replaceChildren(node("span", { text: number(commands, hp.value) }), node("small", { text: ` / ${number(commands, hp.max)}` }));
    if (refs.healthTemp) refs.healthTemp.textContent = number(commands, hp.temp);
    const percentage = Number(hp.max) > 0 ? Math.max(0, Math.min(100, Number(hp.value) / Number(hp.max) * 100)) : 0;
    refs.healthFill?.style?.setProperty("--ve-pf2e-health-percent", `${percentage}%`);
    refs.healthTrack?.setAttribute("aria-valuemax", String(hp.max));
    refs.healthTrack?.setAttribute("aria-valuenow", String(hp.value));
  }
  if (refs.healthPoints) {
    const pointsLabel = refs.healthPoints.parentElement?.querySelector("span");
    if (pointsLabel) pointsLabel.textContent = heroPoints?.label ?? text(commands, "Hero points", "VEMOBILE.PF2E.Character.HeroPoints");
    refs.healthPoints.textContent = heroPoints ? Array.from({ length: Math.max(0, Math.min(3, heroPoints.max)) }, (_, index) => index < heroPoints.value ? "★" : "☆").join("") : "—";
    refs.healthPoints.setAttribute("aria-label", heroPoints ? `${number(commands, heroPoints.value)} / ${number(commands, heroPoints.max)}` : "—");
  }
  if (refs.healthPoints?.parentElement) { refs.healthPoints.parentElement.hidden = !heroPoints; refs.healthPoints.parentElement.disabled = !can(actor, "resources"); }
  for (const button of refs.hpActionButtons ?? []) button.disabled = !hp || !can(actor, "editHitPoints") || button.getAttribute?.("aria-busy") === "true";
  if (refs.health.parentElement !== refs.hpRow) refs.hpRow.replaceChildren(refs.health);
}

function updateHeaderVitals(shell, actor, commands) {
  const pf2e = actor.pf2e ?? {};
  const primaryClassDc = pf2e.classDC ?? pf2e.details?.proficiencies?.find(row => row.group === "classDCs");
  const keys = ["armorClass", "speed", "perception", ...(primaryClassDc ? ["classDC"] : [])];
  const signature = keys.join(":");
  if (shell.headerRefs.vitalsSignature !== signature) {
    const ac = statCell(commands, "AC", "VEMOBILE.PF2E.Character.AC", actor.armorClass, "fa-shield", text(commands, "Armor Class", "VEMOBILE.PF2E.Character.ArmorClass"), "button");
    const toggle = ac;
    ac.setAttribute("type", "button");
    ac.setAttribute("aria-expanded", "false");
    ac.setAttribute("aria-controls", "ve-pf2e-shield-details");
    ac.setAttribute("aria-label", text(commands, "Shield details", "VEMOBILE.PF2E.Character.Shield.Details"));
    const chevron = node("span", { className: "ve-pf2e-ac-toggle", attrs: { "aria-hidden": "true" }, children: [icon("fa-chevron-down")] });
    shell.headerScope.listen(ac, "click", () => toggleHeaderDetail(shell, "shieldRow"));
    ac.querySelector("span").append(chevron);
    shell.headerRefs.shieldToggle = toggle;
    const speed = statCell(commands, "Speed", "VEMOBILE.PF2E.Character.Speed", actor.speed?.value ?? "—", "fa-boot", null, "button");
    speed.setAttribute("type", "button"); speed.setAttribute("aria-expanded", "false"); speed.setAttribute("aria-controls", "ve-pf2e-speed-details");
    const speedArrow = node("span", { className: "ve-pf2e-ac-toggle", attrs: { "aria-hidden": "true" }, children: [icon("fa-chevron-down")] });
    speed.querySelector("span").append(speedArrow);
    shell.headerScope.listen(speed, "click", () => toggleHeaderDetail(shell, "speedRow"));
    shell.headerRefs.speedToggle = speed;
    const cells = [
      ac,
      speed,
      perceptionCell(shell, commands),
      ...(primaryClassDc ? [headerDisclosureCell(shell, commands, "Class DC", "VEMOBILE.PF2E.Character.ClassDC", primaryClassDc.value, "fa-gear", "classDcRow")] : [])
    ];
    shell.headerRefs.vitals.replaceChildren(...cells);
    shell.headerRefs.vitals.style.setProperty("--ve-pf2e-stat-count", String(cells.length));
    shell.headerRefs.vitalsSignature = signature;
    shell.headerRefs.vitalCells = Object.fromEntries(keys.map((key, index) => [key, cells[index]]));
  }
  updateShieldDetails(shell, actor, commands);
  updateSpeedDetails(shell, actor, commands);
  updateHeaderDetailPanels(shell, actor, commands);
  const cells = shell.headerRefs.vitalCells;
  const values = { armorClass: actor.armorClass ?? "—", speed: actor.speed ? `${number(commands, actor.speed.value)} ${actor.speed.unit || "ft"}` : "—", classDC: primaryClassDc?.value ?? "—" };
  for (const [key, value] of Object.entries(values)) {
    const strong = cells?.[key]?.querySelector?.("strong"); if (strong) strong.textContent = String(value);
  }
  const perception = cells?.perception;
  if (perception) {
    const statistic = pf2e.perception;
    const label = statistic?.label || text(commands, "Perception", "VEMOBILE.PF2E.Character.Perception");
    const strong = perception.querySelector?.("strong"); if (strong) strong.textContent = modifier(statistic?.modifier);
    perception.setAttribute("aria-label", label);
  }
}

function statCell(commands, label, key, value, iconName, fullLabel = null, tag = "div") {
  return node(tag, { className: "ve-pf2e-vital-cell", attrs: fullLabel ? { title: fullLabel } : {}, children: [icon(iconName), node("span", { text: text(commands, label, key) }), node("strong", { text: value === null || value === undefined ? "—" : String(value) })] });
}

function updateSpeedDetails(shell, actor, commands) {
  const refs = shell.headerRefs;
  if (refs.speedSource !== actor.sourceUuid) {
    refs.speedRow.hidden = true; refs.speedToggle?.setAttribute("aria-expanded", "false");
    refs.speedToggle?.querySelector(".ve-pf2e-ac-toggle i")?.classList.remove("fa-chevron-up");
    refs.speedToggle?.querySelector(".ve-pf2e-ac-toggle i")?.classList.add("fa-chevron-down");
    refs.speedSource = actor.sourceUuid;
  }
  const speeds = actor.pf2e?.details?.speeds ?? [];
  const signature = JSON.stringify([actor.sourceUuid, speeds, actor.speed, actor.capabilities?.movementActions]);
  if (refs.speedSignature === signature) return;
  refs.speedSignature = signature; refs.speedScope?.dispose();
  const scope = refs.speedScope = shell.headerScope.child("speed-details");
  refs.speedRow.replaceChildren(...[["land", "Land", "PF2E.Actor.Speed.Type.Land"], ["swim", "Swim", "PF2E.Actor.Speed.Type.Swim"], ["climb", "Climb", "PF2E.Actor.Speed.Type.Climb"], ["fly", "Fly", "PF2E.Actor.Speed.Type.Fly"], ["burrow", "Burrow", "PF2E.Actor.Speed.Type.Burrow"]].map(([slug, fallback, key]) => {
    const entry = speeds.find(speed => speed.slug === slug) ?? (slug === "land" ? actor.speed : null);
    const label = entry?.label || text(commands, fallback, key);
    const roll = entry?.action && actor.capabilities?.movementActions?.includes(entry.action);
    return node("div", { className: "ve-pf2e-speed-stat", children: [node("small", { text: label }),
      entry?.value ? node("strong", { text: `${number(commands, entry.value)} ${entry.unit || "ft"}` })
        : roll ? actionButton(commands, label, "fa-dice-d20", () => issueCommand({ actor: shell.actor, command: ACTOR_COMMANDS.USE_PF2E_MOVEMENT_ACTION,
          payload: { slug: entry.action }, commands: shell.commands, status: shell.status, scope, actionSession: true }), scope, false, label)
        : node("strong", { text: "—" })
    ] });
  }));
}

function updateShieldDetails(shell, actor, commands) {
  const refs = shell.headerRefs;
  const shield = actor.pf2e?.shield;
  if (refs.shieldSource !== actor.sourceUuid) {
    refs.shieldRow.hidden = true;
    refs.shieldToggle?.setAttribute("aria-expanded", "false");
    refs.shieldToggle?.querySelector(".ve-pf2e-ac-toggle i")?.classList.remove("fa-chevron-up");
    refs.shieldToggle?.querySelector(".ve-pf2e-ac-toggle i")?.classList.add("fa-chevron-down");
    refs.shieldSource = actor.sourceUuid;
  }
  const signature = JSON.stringify([actor.sourceUuid, shield, actor.capabilities?.editArmorClass]);
  if (refs.shieldSignature === signature) return;
  refs.shieldSignature = signature;
  refs.shieldScope?.dispose();
  const scope = refs.shieldScope = shell.headerScope.child("shield-details");
  const cell = (label, key, value) => node("div", { className: "ve-pf2e-shield-stat", children: [node("small", { text: text(commands, label, key) }), node("strong", { text: value })] });
  const state = shield?.destroyed ? ["Destroyed", "VEMOBILE.PF2E.Character.Shield.Destroyed"] : shield?.broken ? ["Broken", "VEMOBILE.PF2E.Character.Shield.Broken"] : ["Intact", "VEMOBILE.PF2E.Character.Shield.Intact"];
  refs.shieldRow.replaceChildren(...(shield ? [
    cell("Shield HP", "VEMOBILE.PF2E.Character.Shield.HP", `${number(commands, shield.hp?.value)} / ${number(commands, shield.hp?.max)}`),
    cell("Raised AC", "VEMOBILE.PF2E.Character.Shield.RaisedAC", shield.raisedArmorClass == null ? "—" : number(commands, shield.raisedArmorClass)),
    cell("Hardness", "VEMOBILE.PF2E.Character.Hardness", number(commands, shield.hardness)),
    cell("Break at", "VEMOBILE.PF2E.Character.Shield.BreakThreshold", number(commands, shield.hp?.brokenThreshold)),
    node("div", { className: `ve-pf2e-shield-state${shield.broken || shield.destroyed ? " is-broken" : ""}`, attrs: { title: text(commands, ...state) }, children: [icon(shield.broken || shield.destroyed ? "fa-shield-halved" : "fa-shield"), node("small", { text: text(commands, ...state) })] })
  ] : [node("span", { className: "ve-pf2e-no-shield", text: text(commands, "No shield equipped", "VEMOBILE.PF2E.Character.Shield.None") })]),
  node("button", { className: "ve-pf2e-ac-settings", attrs: { type: "button", disabled: !actor.capabilities?.editArmorClass, "aria-label": text(commands, "Armor Class modifiers", "VEMOBILE.PF2E.Character.ArmorClassModifiers") }, children: [icon("fa-gear")], on: { click: () => shell.openAcEditor() } }, scope));
}

function prepareListSorting(panel) {
  for (const list of panel.querySelectorAll(".ve-pf2e-feature-list,.ve-pf2e-strike-list,.ve-pf2e-spell-list,.ve-pf2e-feat-rows,.ve-pf2e-proficiency-skills,.ve-pf2e-proficiency-readouts,.ve-pf2e-effect-rows,.ve-pf2e-spell-reference-list")) {
    list.dataset.pf2eSortList = "";
    [...list.children].forEach((row, index) => {
      row.dataset.pf2eSortOrder = String(index);
      row.dataset.pf2eSortName ||= row.querySelector("h3,h4,.ve-pf2e-feat-name,.ve-pf2e-spell-copy > strong,.ve-pf2e-skill-roll > span,.ve-pf2e-proficiency-readout > span,strong")?.textContent ?? row.textContent;
    });
  }
}

function toggleHeaderDetail(shell, selected) {
  const refs = shell.headerRefs;
  const opening = refs[selected].hidden;
  for (const [key, toggleKey] of [["shieldRow", "shieldToggle"], ["speedRow", "speedToggle"], ["perceptionRow", "perceptionRowToggle"], ["classDcRow", "classDcRowToggle"]]) {
    const open = key === selected && opening;
    refs[key].hidden = !open;
    const toggle = refs[toggleKey];
    toggle?.setAttribute("aria-expanded", String(open));
    toggle?.querySelector(".ve-pf2e-ac-toggle i")?.classList.toggle("fa-chevron-up", open);
    toggle?.querySelector(".ve-pf2e-ac-toggle i")?.classList.toggle("fa-chevron-down", !open);
  }
}

function headerDisclosureCell(shell, commands, label, key, value, glyph, rowKey) {
  const cell = statCell(commands, label, key, value, glyph, null, "button");
  const arrow = node("span", { className: "ve-pf2e-ac-toggle", attrs: { "aria-hidden": "true" }, children: [icon("fa-chevron-down")] });
  cell.querySelector("span").append(arrow);
  cell.setAttribute("type", "button"); cell.setAttribute("aria-expanded", "false");
  cell.setAttribute("aria-controls", shell.headerRefs[rowKey].id ?? shell.headerRefs[rowKey].getAttribute("id"));
  cell.setAttribute("aria-label", text(commands, label, key));
  shell.headerRefs[`${rowKey}Toggle`] = cell;
  shell.headerScope.listen(cell, "click", () => toggleHeaderDetail(shell, rowKey));
  return cell;
}

function perceptionCell(shell, commands) {
  return headerDisclosureCell(shell, commands, "Perception", "VEMOBILE.PF2E.Character.Perception",
    modifier(shell.actor?.pf2e?.perception?.modifier), "fa-eye", "perceptionRow");
}

function updateHeaderDetailPanels(shell, actor, commands) {
  const refs = shell.headerRefs;
  if (refs.detailSource !== actor.sourceUuid) {
    for (const key of ["perceptionRow", "classDcRow"]) {
      refs[key].hidden = true;
      const toggle = refs[`${key}Toggle`]; toggle?.setAttribute("aria-expanded", "false");
      toggle?.querySelector(".ve-pf2e-ac-toggle i")?.classList.remove("fa-chevron-up");
      toggle?.querySelector(".ve-pf2e-ac-toggle i")?.classList.add("fa-chevron-down");
    }
    refs.detailSource = actor.sourceUuid;
  }
  const perception = actor.pf2e?.perception;
  const senses = actor.pf2e?.details?.senses ?? [];
  const classDcs = (actor.pf2e?.details?.proficiencies ?? []).filter(row => row.group === "classDCs");
  const signature = JSON.stringify([actor.sourceUuid, perception, senses, classDcs, actor.capabilities?.rollStatistic, actor.capabilities?.rollInitiative]);
  if (signature === refs.detailSignature) return;
  refs.detailSignature = signature; refs.detailScope?.dispose();
  const scope = refs.detailScope = shell.headerScope.child("header-detail-actions");
  const roll = (label, key, command, payload, enabled) => node("button", {
    className: "ve-pf2e-action-button", attrs: { type: "button", disabled: !enabled, "aria-label": text(commands, label, key) },
    on: { click: event => issueCommand({ button: event.currentTarget, actor: shell.actor, command, payload, commands: shell.actionCommands,
      status: shell.status, scope, resultLabel: command === ACTOR_COMMANDS.ROLL_STATISTIC ? `${perception?.label || text(commands, "Perception", "VEMOBILE.PF2E.Character.Perception")} ${text(commands, "Check", "VEMOBILE.PF2E.Character.Check")}` : text(commands, "Initiative", "VEMOBILE.PF2E.Character.Initiative"),
      isEnabled: () => command === ACTOR_COMMANDS.ROLL_STATISTIC ? can(shell.actor, "rollStatistic", payload.statistic) : can(shell.actor, "rollInitiative") }) },
    children: [icon("fa-dice-d20")]
  }, scope);
  const detail = (label, content) => node("div", { className: "ve-pf2e-perception-stat", children: [node("small", { text: label }), content] });
  refs.perceptionRow.replaceChildren(
    detail(text(commands, "Initiative", "VEMOBILE.PF2E.Character.Initiative"),
      roll("Roll initiative", "VEMOBILE.Character.Presenter.RollInitiative", ACTOR_COMMANDS.ROLL_INITIATIVE, {}, can(actor, "rollInitiative"))),
    detail(text(commands, "Perception", "VEMOBILE.PF2E.Character.Perception"),
      roll("Roll Perception", "VEMOBILE.PF2E.Character.RollPerception", ACTOR_COMMANDS.ROLL_STATISTIC, { statistic: perception?.slug }, Boolean(perception) && can(actor, "rollStatistic", perception.slug))),
    detail(text(commands, "Proficiency", "VEMOBILE.PF2E.Character.ModifierTypes.proficiency"),
      node("strong", { className: "ve-pf2e-perception-rank", text: perception?.rankLabel || perception?.rankAbbreviation || "—" })),
    detail(supplement(commands, "Senses", "Senses"), node("ul", {
      className: "ve-pf2e-perception-senses", attrs: { tabindex: "0", "aria-label": supplement(commands, "Senses", "Senses") },
      children: (senses.length ? senses : ["—"]).map(sense => node("li", { text: sense }))
    }))
  );
  refs.classDcRow.replaceChildren(...(classDcs.length ? classDcs.map(row => node("div", { className: "ve-pf2e-proficiency-readout", children: [
    node("span", { text: row.label }), node("strong", { text: row.value == null ? "—" : number(commands, row.value) })
  ] })) : [empty(commands)]));
}

function loadPf2eBanner(header, candidates, scope) {
  header.style?.removeProperty("--ve-class-art");
  delete header.dataset.bannerCatalogue;
  if (!candidates.length || typeof Image !== "function") return;
  let cancelled = false;
  scope.own(() => { cancelled = true; });
  const tryCandidate = index => {
    const candidate = candidates[index];
    if (!candidate || cancelled) return;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      header.style?.setProperty("--ve-class-art", `url("${candidate.url}")`);
      header.dataset.bannerCatalogue = "true";
    };
    image.onerror = () => tryCandidate(index + 1);
    image.src = candidate.url;
  };
  tryCandidate(0);
}

function syncOverlays(shell, { state, commands, ownerScope, overlayHost, resultsDeferred }) {
  const sceneSession = state?.actionSessionOrigin === "scene";
  const portraitImage = state?.portraitImage;
  if (shell.overlayState?.session === state?.actionSession && shell.overlayState?.roll === state?.rollResult
    && shell.overlayState?.deferred === resultsDeferred && shell.overlayState?.sceneSession === sceneSession
    && shell.overlayState?.portrait === portraitImage) return;
  shell.overlayScope?.dispose();
  shell.overlayScope = ownerScope.child("pf2e-character-overlays");
  const overlays = resultsDeferred ? [] : [
    sceneSession ? null : renderActionSessionModal(state?.actionSession, commands, shell.overlayScope),
    renderRollResultOverlay(state?.rollResult, commands, shell.overlayScope),
    renderImageViewer(portraitImage, commands.closeCharacterPortrait, shell.overlayScope, { localize: commands.localize })
  ].filter(Boolean);
  shell.overlayScope.own(() => overlays.forEach(element => element.remove()));
  if (overlayHost) overlayHost.append(...overlays);
  else shell.screen.append(...overlays);
  shell.overlayState = { session: state?.actionSession, roll: state?.rollResult, deferred: resultsDeferred, sceneSession, portrait: portraitImage };
}

function capturePanelState(shell, context) {
  const prior = shell.panelState.get(context) ?? {};
  const scroller = shell.scroller;
  prior.scrollTop = scroller?.scrollTop ?? prior.scrollTop ?? 0;
  prior.inputs = new Map(); prior.disclosures = new Map();
  for (const input of shell.panelHost?.querySelectorAll?.("[data-pf2e-state-key]") ?? []) {
    prior.inputs.set(input.dataset.pf2eStateKey, { value: input.value, selectionStart: input.selectionStart, selectionEnd: input.selectionEnd });
  }
  for (const details of shell.panelHost?.querySelectorAll?.("details[data-pf2e-disclosure-key]") ?? []) prior.disclosures.set(details.dataset.pf2eDisclosureKey, details.open);
  const documentActive = globalThis.document?.activeElement;
  const active = documentActive && shell.panelHost?.contains?.(documentActive) ? documentActive : shell.panelHost?.querySelector?.('[data-pf2e-focus-key]:focus');
  prior.focusKey = active?.getAttribute?.("data-pf2e-focus-key") ?? active?.dataset?.pf2eFocusKey ?? prior.focusKey ?? "";
  shell.panelState.delete(context);
  shell.panelState.set(context, prior);
  while (shell.panelState.size > 32) shell.panelState.delete(shell.panelState.keys().next().value);
}

function restorePanelState(shell, context) {
  const saved = shell.panelState.get(context);
  if (!saved) { shell.scroller.scrollTop = 0; return; }
  // Replaying input events updates remembered focus; preserve the actual prior control.
  const focusKey = saved.focusKey;
  for (const input of shell.panelHost?.querySelectorAll?.("[data-pf2e-state-key]") ?? []) {
    const value = saved.inputs?.get(input.dataset.pf2eStateKey);
    if (value) {
      input.value = value.value;
      input.dispatchEvent?.(new Event(String(input.tagName ?? input.tag).toLowerCase() === "select" ? "change" : "input", { bubbles: true }));
      try { if (value.selectionStart !== null && value.selectionStart !== undefined) input.setSelectionRange(value.selectionStart, value.selectionEnd); } catch { /* Some native inputs do not support text selection. */ }
    }
  }
  for (const details of shell.panelHost?.querySelectorAll?.("details[data-pf2e-disclosure-key]") ?? []) {
    if (saved.disclosures?.has(details.dataset.pf2eDisclosureKey)) details.open = saved.disclosures.get(details.dataset.pf2eDisclosureKey);
  }
  shell.scroller.scrollTop = saved.scrollTop ?? 0;
  if (focusKey) {
    const focusTarget = [...(shell.panelHost?.querySelectorAll?.("[data-pf2e-focus-key]") ?? [])].find(element => element.dataset.pf2eFocusKey === focusKey);
    try { focusTarget?.focus?.({ preventScroll: true }); } catch { focusTarget?.focus?.(); }
  }
}

function actorChoices(actors, commands, scope) {
  const controller = createCharacterMenuController({ actors, selectedActor: null, commands,
    onClose() {}, scope, embedded: true,
    describeActor: entry => [entry.pf2e?.identity?.className, entry.pf2e?.identity?.ancestry].filter(Boolean).join(" · ") || entry.type });
  controller.element.classList.add("ve-pf2e-initial-actor-menu");
  controller.mount();
  return controller.element;
}

function renderTab(tab, actor, state, commands, status, scope, shell) {
  const pf2e = actor.pf2e ?? {};
  if (tab === "abilities") return statisticsPanel(actor, commands, status, scope, shell);
  if (tab === "effects") return effectsPanel(actor, commands, status, scope, shell);
  if (tab === "inventory") return inventoryPanel(actor, commands, status, scope, shell);
  if (tab === "spells") return spellsPanel(actor, commands, status, scope, shell);
  if (tab === "features") return actionsPanel(actor, commands, status, scope, shell);
  if (tab === "feats") return featsPanel(actor, commands, status, scope, shell);
  if (tab === "biography") return morePanel(actor, pf2e.biography, commands, status, scope, shell);
  return overviewPanel(actor, commands, status, scope, shell);
}

function overviewPanel(actor, commands, status, scope, shell) {
  const pf2e = actor.pf2e ?? {};
  const defenses = node("section", { className: "ve-sheet-card ve-pf2e-overview-defenses", children: [
    node("header", { className: "ve-pf2e-defense-heading", children: [overviewGlyph("fortitude"), node("h3", { text: text(commands, "Defenses", "VEMOBILE.PF2E.Character.OverviewDefenses") })] }),
    ...["immunities", "weaknesses", "resistances"].map(category => {
      const label = supplement(commands, category[0].toUpperCase() + category.slice(1), category[0].toUpperCase() + category.slice(1));
      return node("div", { className: "ve-pf2e-defense-row", dataset: { defenseCategory: category }, children: [
        node("strong", { text: label }), node("span", { text: pf2e.details?.defenses?.[category]?.join("; ") || "—" }),
        node("button", { className: "ve-pf2e-defense-edit", attrs: { type: "button", disabled: !can(actor, "editDefenses"), "aria-label": localizedText(commands.localize, "VEMOBILE.Character.Presenter.Edit", "Edit {label}", { label }) }, children: [icon("fa-gear")], on: { click: () => openDefenseEditor(shell, category, scope, shell.overlayHost) } }, scope)
      ] });
    }),
    pf2e.shield ? shieldSummary(pf2e.shield, commands) : null
  ] });
  return node("div", { className: "ve-pf2e-overview", children: [
    node("div", { className: "ve-pf2e-overview-stats", children: [
      savingThrows(pf2e.saves ?? [], actor, commands, status, scope),
      pf2e.attributes?.length ? attributesPanel(pf2e.attributes, commands) : null
    ] }),
    defenses,
    characterDetails(actor, commands, scope),
    node("div", { className: "ve-pf2e-character-tools", children: [
      restControl(actor, commands, status, scope)
    ] })
  ] });
}

function statisticsPanel(actor, commands, status, scope, shell = null) {
  const skills = actor.pf2e?.skills ?? [];
  const group = (label, key, entries) => entries.length ? collectionGroup({ key: `proficiency:${key}`, label: text(commands, label, key), glyph: "fa-dice-d20", className: "ve-pf2e-proficiency-group", children: [
    node("div", { className: "ve-pf2e-proficiency-skills", children: entries.map(skill => node("div", { className: "ve-pf2e-proficiency-skill", children: [
      skillRoll(skill, actor, commands, status, scope, true),

    ] })) })
  ] }) : null;
  return node("div", { className: "ve-pf2e-statistics", children: [
    group("Core Skills", "PF2E.CoreSkillsHeader", skills.filter(skill => !skill.lore)),
    group("Lore Skills", "PF2E.LoreSkillsHeader", skills.filter(skill => skill.lore)),
    supplementaryProficiencies(actor, commands)
  ] });
}

function overviewGlyph(kind) {
  const paths = {
    fortitude: ["M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"],
    reflex: ["m14 2-9 12h7l-2 8 9-12h-7Z"],
    will: ["M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0"],
    rest: ["M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"]
  };
  return vectorIcon("0 0 24 24", (paths[kind] ?? paths.fortitude).map(d => ({ tag: "path", attrs: {
    d, fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round"
  } })), "ve-pf2e-overview-glyph");
}

function savingThrows(saves, actor, commands, status, scope) {
  return node("section", { className: "ve-sheet-card ve-pf2e-saves", children: [sectionHeading(commands, "Saving throws", "fa-shield"), node("div", {
    className: "ve-pf2e-save-grid", children: saves.map(save => node("button", { className: "ve-pf2e-save", dataset: { save: save.slug }, attrs: {
      type: "button", disabled: !can(actor, "rollSave", save.slug),
      "aria-label": localizedText(commands.localize, "VEMOBILE.PF2E.Character.RollSave", "Roll {label} save {modifier}", { label: save.label, modifier: modifier(save.modifier) })
    }, on: { click: event => issueCommand({ button: event.currentTarget, actor, command: ACTOR_COMMANDS.ROLL_SAVE,
      payload: { ability: save.slug }, commands, status, scope,
      resultLabel: `${save.label} ${text(commands, "Check", "VEMOBILE.PF2E.Character.Check")}` }) }, children: [
      node("span", { className: "ve-pf2e-save-content", children: [
        overviewGlyph(save.slug), node("strong", { text: modifier(save.modifier) }),
        node("span", { className: "ve-pf2e-save-labels", children: [node("span", { text: save.label }), rankBadge(commands, save, true)] })
      ] })
    ] }, scope))
  })] });
}

function attributesPanel(attributes, commands) {
  return node("section", { className: "ve-sheet-card ve-pf2e-attributes", children: [sectionHeading(commands, "Attributes", "fa-dna"), node("div", {
    className: "ve-pf2e-attribute-grid", children: attributes.map(attribute => node("div", { className: `ve-pf2e-attribute${attribute.key ? " is-key" : ""}`, children: [
      icon(({ str: "fa-hand-fist", dex: "fa-feather", con: "fa-heart", int: "fa-book-open", wis: "fa-tree", cha: "fa-sun" })[attribute.slug] ?? "fa-dice-d20"),
      node("span", { attrs: { title: attribute.label }, children: [attribute.key ? node("i", { className: "fa-solid fa-key", attrs: { title: text(commands, "Key attribute", "PF2E.Actor.Character.Attribute.Key"), "aria-label": text(commands, "Key attribute", "PF2E.Actor.Character.Attribute.Key") } }) : null, node("span", { text: attribute.slug.toUpperCase() }), attribute.apex ? node("i", { className: "fa-solid fa-circle-a", attrs: { title: text(commands, "Apex attribute", "PF2E.Actor.Character.Attribute.Apex") } }) : null] }), node("strong", { text: modifier(attribute.modifier) })
    ] }))
  })] });
}

function skillPreview(skills, actor, commands, status, scope) {
  const quickbar = Array.isArray(actor.quickbar) ? actor.quickbar : [];
  const pinnedSlugs = quickbar.map(slot => slot?.kind === "skill" ? slot.skill : "").filter(Boolean);
  const pinned = pinnedSlugs.length ? pinnedSlugs.map(slug => skills.find(skill => skill.slug === slug)).filter(Boolean) : skills.slice(0, 4);
  const entries = pinned.slice(0, 4);
  return node("section", { className: "ve-sheet-card ve-pf2e-skill-preview", children: [node("header", { className: "ve-sheet-card-heading", children: [
    icon("fa-dice-d20"), node("h3", { text: text(commands, "Skills", "VEMOBILE.PF2E.Character.Section.Skills") }),
    actionButton(commands, "View all", "fa-arrow-right", () => commands.selectCharacterTab("abilities"), scope)
  ] }), entries.length ? node("div", { className: "ve-pf2e-skill-grid", children: entries.map(skill => skillRoll(skill, actor, commands, status, scope)) }) : empty(commands)] });
}

function skillRoll(skill, actor, commands, status, scope, fullRank = false) {
  const label = skill.label || skill.slug;
  const ariaLabel = skill.rankLabel
    ? localizedText(commands.localize, "VEMOBILE.PF2E.Character.RollSkill", "Roll {label} {modifier}; {rank}", { label, modifier: modifier(skill.modifier), rank: skill.rankLabel })
    : localizedText(commands.localize, "VEMOBILE.PF2E.Character.RollStatistic", "Roll {label} {modifier}", { label, modifier: modifier(skill.modifier) });
  return node("button", { className: "ve-pf2e-skill-roll", attrs: {
    type: "button", disabled: !can(actor, "rollSkill", skill.slug), "aria-label": ariaLabel
  }, on: { click: event => issueCommand({ button: event.currentTarget, actor, command: ACTOR_COMMANDS.ROLL_SKILL,
    payload: { skill: skill.slug }, commands, status, scope,
    resultLabel: label + " " + text(commands, "Check", "VEMOBILE.PF2E.Character.Check") }) }, children: [
      itemArt({ name: label }, { kind: "skill", skill: skill.slug, label, img: "" }),
      node("span", { text: label }), rankBadge(commands, skill, fullRank), node("strong", { text: modifier(skill.modifier) })
    ] }, scope);
}
function rankBadge(commands, statistic, full = false) {
  const rank = full ? statistic?.rankLabel || statistic?.rankAbbreviation : statistic?.rankAbbreviation || statistic?.rankLabel;
  return rank ? node("small", { className: "ve-pf2e-rank-badge", attrs: { "aria-label": localizedText(commands.localize, "VEMOBILE.PF2E.Character.ProficiencyRank", "{rank} proficiency", { rank: statistic.rankLabel || rank }) }, text: rank }) : null;
}

function rankBadgeText(commands, statistic) {
  const rank = statistic?.rankLabel;
  return rank ? ` · ${rank}` : "";
}

function supplement(commands, key, fallback) { return text(commands, fallback, `VEMOBILE.PF2E.Character.Supplement.${key}`); }
function fold(key, label, children) {
  return node("details", { className: "ve-sheet-card ve-pf2e-fold", attrs: { "data-pf2e-disclosure-key": key }, children: [
    node("summary", { children: [node("span", { text: label }), icon("fa-chevron-down")] }), node("div", { className: "ve-pf2e-fold-body", children: children.filter(Boolean) })
  ] });
}
function detailRows(rows) {
  return node("dl", { className: "ve-pf2e-detail-rows", children: rows.filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) => node("div", { children: [node("dt", { text: label }), node("dd", { text: value })] })) });
}
function characterDetails(actor, commands, scope) {
  const d = actor.pf2e?.details ?? {}, biography = actor.pf2e?.biography ?? {};
  const detailsControl = itemId => ({ attrs: { type: "button", disabled: !itemId || !canItem(actor, itemId) },
    on: { click: () => commands.openPf2eItemDetails({ actorSourceUuid: actor.sourceUuid, itemId, fullPage: true }) } });
  const tags = (values, className = "") => node("div", { className: `ve-pf2e-character-tags ${className}`, children:
    (values?.length ? values : ["—"]).map(value => node("span", { text: value })) });
  const personal = [
    [text(commands, "Gender / pronouns", "PF2E.GenderPronoun"), biography.gender],
    [text(commands, "Age", "PF2E.Age"), biography.age],
    [text(commands, "Ethnicity", "PF2E.Ethnicity"), biography.ethnicity],
    [text(commands, "Nationality", "PF2E.Nationality"), biography.nationality]
  ];
  // Land speed, class, ancestry/heritage tags and XP already live in the header.
  return node("div", { className: "ve-pf2e-character-details", children: [
    node("section", { className: "ve-sheet-card ve-pf2e-origins", children: [
      node("div", { className: `ve-pf2e-origin-highlights${d.deity ? " has-deity" : ""}`, children: [
        node("button", { ...detailsControl(d.backgroundItemId), className: "ve-pf2e-background-highlight", children: [
          icon("fa-scroll"), node("span", { className: "ve-pf2e-origin-label", text: supplement(commands, "Background", "Background") }),
          node("strong", { text: d.background || "—" })
        ] }, scope),
        d.deity ? node("button", { ...detailsControl(d.deityItemId), className: `ve-pf2e-deity-highlight${d.deityImg ? " is-illustrated" : ""}`, children: [
          d.deityImg ? node("img", { attrs: { src: d.deityImg, alt: "", loading: "lazy" } }) : null,
          node("div", { children: [node("span", { className: "ve-pf2e-origin-label", text: supplement(commands, "Deity", "Deity") }), node("strong", { text: d.deity })] })
        ] }, scope) : null
      ] }),
      personal.some(([, value]) => value) ? fold("personal-details", text(commands, "More details", "VEMOBILE.PF2E.Character.MoreDetails"), [
        node("dl", { className: "ve-pf2e-personal-grid", children: personal.map(([label, value]) => node("div", { children: [node("dt", { text: label }), node("dd", { text: value || "—" })] })) })
      ]) : null
    ] }),
    node("section", { className: "ve-sheet-card ve-pf2e-languages", children: [
      node("header", { className: "ve-sheet-card-heading", children: [node("h3", { text: supplement(commands, "Languages", "Languages") }), node("small", { text: number(commands, d.languages?.length ?? 0) })] }), tags(d.languages)
    ] }),
    d.senses?.length ? node("section", { className: "ve-sheet-card ve-pf2e-languages ve-pf2e-senses", children: [
      node("header", { className: "ve-sheet-card-heading", children: [node("h3", { text: supplement(commands, "Senses", "Senses") }), node("small", { text: number(commands, d.senses.length) })] }), tags(d.senses)
    ] }) : null
  ] });
}

function supplementaryProficiencies(actor, commands) {
  const rows = actor.pf2e?.details?.proficiencies ?? [];
  return node("div", { className: "ve-pf2e-combat-proficiencies", children: [
    ...[["attacks", "Attacks", "PF2E.Actor.Character.Proficiency.Attack.Title", "fa-swords"], ["defenses", "Defenses", "PF2E.Actor.Character.Proficiency.Defense.Title", "fa-shield"], ["classDCs", "Class DC", "PF2E.Actor.Character.ClassDC.Label", "fa-gear"]].flatMap(([group, label, key, glyph]) => {
      const entries = rows.filter(row => row.group === group && (group === "classDCs" || row.rank !== 0));
      if (!entries.length) return [];
      return [collectionGroup({ key: `proficiency:${group}`, label: text(commands, label, key), glyph, className: "ve-pf2e-proficiency-group", children: [
        node("div", { className: "ve-pf2e-proficiency-readouts", children: entries.map(row => node("div", { className: "ve-pf2e-proficiency-readout", children: [
          node("span", { text: row.label }), rankBadge(commands, row, true), row.value != null ? node("strong", { text: group === "classDCs" ? number(commands, row.value) : modifier(row.value) }) : null
        ] })) })
      ] })];
    })
  ] });
}
function equipmentSummary(actor, commands, scope, shell) {
  const d = actor.pf2e?.details;
  if (!d?.currency && !d?.invested) return null;
  const readout = (label, value) => node("span", { children: [node("small", { text: label }), node("strong", { text: value })] });
  return node("div", { className: "ve-pf2e-equipment-summary", children: [
    d.currency ? node("div", { className: "ve-currency-strip ve-pf2e-currency-strip", attrs: { "aria-label": text(commands, "Currency", "VEMOBILE.Character.Presenter.Currency") }, on: { click: () => { if (actor.capabilities?.currency) shell.openCurrencyEditor(); } }, children: [
      ...["pp", "gp", "sp", "cp"].map(key => node("span", { className: `is-${key}`, attrs: { title: `${key.toUpperCase()} ${number(commands, d.currency[key])}` }, children: [node("small", { text: key.toUpperCase() }), node("strong", { text: number(commands, d.currency[key]) })] })),
      node("button", { className: "ve-currency-edit ve-pf2e-coins", attrs: { type: "button", disabled: !actor.capabilities?.currency, "aria-label": text(commands, "Edit Currency", "VEMOBILE.Character.Presenter.EditCurrency2") }, children: [icon("fa-pen"), node("span", { text: text(commands, "Edit", "VEMOBILE.Character.Presenter.Edit2") })] })
    ] }, scope) : null,
    node("div", { className: "ve-pf2e-wealth", children: [
      d.currencyGoldValue != null ? readout(text(commands, "Total Currency", "PF2E.TotalCurrency"), `${number(commands, d.currencyGoldValue)} ${text(commands, "gp", "PF2E.CurrencyAbbreviations.gp")}`) : null,
      d.totalWealthGoldValue != null ? readout(text(commands, "Total Wealth", "PF2E.TotalWealth"), `${number(commands, d.totalWealthGoldValue)} ${text(commands, "gp", "PF2E.CurrencyAbbreviations.gp")}`) : null,
      d.invested ? readout(supplement(commands, "Invested", "Invested"), `${number(commands,d.invested.value)}/${number(commands,d.invested.max)}`) : null
    ] })
  ] });
}
function effectsPanel(actor, commands, status, scope, shell) {
  const d = actor.pf2e?.details ?? {};
  const list = (label, key, glyph, entries = []) => collectionGroup({ key: `effects:${key}`, label: text(commands, label, key), glyph, className: "ve-pf2e-effects-list", children: [
    node("div", { className: "ve-pf2e-effect-rows", children: entries.length ? entries.map(effect => itemRow({ item: effect, actor, commands, scope, extraDetails: itemRuleControls(effect, actor, commands, status, scope), className: `ve-pf2e-effect-row${effect.expired ? " is-expired" : ""}`, primaryAction: canItem(actor, effect.id) ? itemPrimaryAction(effect, actor, commands, status, scope) : null, actions: [...itemPostActions(effect, actor, commands, status, scope), actor.capabilities?.owner ? effectControls(effect,actor,commands,scope,(command,payload)=>issueCommand({actor,command,payload,commands,status,scope})):null], header: [
      itemArt(effect),
      node("div", { children: [node("strong", { text: effect.name }), node("small", { text: [effect.badge,effect.stage,effect.duration,effect.expired ? supplement(commands, "Expired", "Expired") : ""].filter(Boolean).join(" · ") })] }),
    ] })) : [empty(commands)] })
  ] });
  return node("div", { className: "ve-pf2e-effects", children: [
    conditionsPanel(actor, commands, scope, shell),
    d.afflictions?.length ? list("Afflictions", "TYPES.Item.affliction", "fa-heart-crack", d.afflictions) : null,
    list("Effects", "PF2E.EffectsLabel", "fa-sparkles", d.effects),
    list("Divine Intercessions", "PF2E.Actor.Character.FeatSlot.DivineIntercessions", "fa-sun", d.divineIntercessions)
  ] });
}

function shieldSummary(shield, commands) {
  const states = [shield.raised ? text(commands, "Raised", "VEMOBILE.PF2E.Character.Shield.Raised") : "",
    shield.broken ? text(commands, "Broken", "VEMOBILE.PF2E.Character.Shield.Broken") : "",
    shield.destroyed ? text(commands, "Destroyed", "VEMOBILE.PF2E.Character.Shield.Destroyed") : ""].filter(Boolean);
  return node("section", { className: "ve-sheet-card ve-pf2e-shield-summary", children: [
    node("strong", { text: shield.name }), node("span", { text: [shield.hp ? `${number(commands, shield.hp.value)} / ${number(commands, shield.hp.max)} ${text(commands, "HP", "VEMOBILE.PF2E.Character.HP")}` : "",
      shield.hardness != null ? `${text(commands, "Hardness", "VEMOBILE.PF2E.Character.Hardness")} ${number(commands, shield.hardness)}` : "",
      shield.ac != null ? `${text(commands, "AC", "VEMOBILE.PF2E.Character.AC")} ${number(commands, shield.ac)}` : "", ...states].filter(Boolean).join(" · ") })
  ] });
}

function restControl(actor, commands, status, scope) {
  const button = actionButton(commands, "Rest overnight", "fa-bed", () => issueCommand({ actor, command: ACTOR_COMMANDS.TAKE_REST,
    payload: { rest: "night" }, commands, status, scope }), scope, !can(actor, "rest"));
  button.classList.add("ve-pf2e-rest-banner");
  button.replaceChildren(overviewGlyph("rest"), node("span", { className: "ve-pf2e-rest-copy", children: [
    node("strong", { text: text(commands, "Rest overnight", "VEMOBILE.PF2E.Character.Action.RestOvernight") }),
    node("small", { text: text(commands, "End the day. Prepare for the next.", "VEMOBILE.PF2E.Character.RestHint") })
  ] }), icon("fa-arrow-right"));
  return button;
}

function actionsPanel(actor, commands, status, scope, shell) {
  const pf2e = actor.pf2e ?? {};
  const actions = (pf2e.features ?? []).filter(feature => isActiveFeature(feature) || (feature.traitSlugs ?? []).some(trait => ["exploration", "downtime"].includes(trait)));
  const selected = shell.panelState.get(shell.activePanelContext)?.inputs?.get("actions-mode")?.value ?? "encounter";
  const modes = [["encounter", "Encounter", "PF2E.TabActionsEncounterLabel"], ["exploration", "Exploration", "PF2E.TabActionsExplorationLabel"], ["downtime", "Downtime", "PF2E.TabActionsDowntimeLabel"]];
  const modeOf = feature => (feature.traitSlugs ?? []).includes("exploration") ? "exploration" : (feature.traitSlugs ?? []).includes("downtime") ? "downtime" : "encounter";
  const groups = [];
  if (pf2e.strikes?.length) {
    const strikes = strikesPanel(pf2e.strikes, actor, commands, status, scope);
    strikes.dataset.pf2eActionMode = "encounter"; groups.push(strikes);
  }
  for (const [mode, fallback, modeKey] of modes) {
    const sections = mode === "encounter" ? [["action", "Actions", "PF2E.ActionsActionsHeader"], ["reaction", "Reactions", "PF2E.ActionsReactionsHeader"], ["free", "Free actions", "PF2E.ActionsFreeActionsHeader"]] : [["all", fallback, modeKey]];
    for (const [type, label, key] of sections) {
      const entries = actions.filter(feature => modeOf(feature) === mode && (type === "all" || (feature.actionType || "action") === type));
      if (!entries.length) continue;
      groups.push(collectionGroup({ key: `actions:${mode}:${type}`, label: text(commands, label, key), glyph: "fa-bolt", className: "ve-pf2e-action-browser", dataset: { pf2eActionMode: mode }, children: [
        node("div", { className: "ve-pf2e-feature-list", children: entries.map(feature => compactActionRow(feature, actor, commands, status, scope)) })
      ] }));
    }
  }
  const view = node("div", { className: "ve-pf2e-actions-view", dataset: { actionMode: selected }, children: [
    node("div", { className: "ve-pf2e-action-tools", children: [filterChips({ className: "ve-pf2e-action-modes", key: "actions-mode", label: text(commands, "Actions", "VEMOBILE.PF2E.Character.Actions"), options: modes, selected, commands, scope, shell,
      apply: select => { const root = select.closest(".ve-pf2e-actions-view"); if (root) { root.dataset.actionMode = select.value; updateActionGroups(root); } } })] }),
    elementalBlasts(actor,commands,scope,(command,payload,actionSession)=>issueCommand({actor,command,payload,commands,status,scope,actionSession})),
    ...groups,
    resourcesPanel(specialResources(actor).filter(resource => !resource.sourceItemId || !resourceItemVisible(actor, resource.sourceItemId)), actor, commands, status, scope),
    ruleOptions(actor,commands,scope,(command,payload)=>issueCommand({actor,command,payload,commands,status,scope})),
    node("div", { className: "ve-pf2e-action-empty", children: [empty(commands)] })
  ] });
  updateActionGroups(view);
  return view;
}

function updateActionGroups(root) {
  if (!root?.classList?.contains("ve-pf2e-actions-view")) return;
  const mode = root.dataset.actionMode ?? "encounter";
  const groups = [...(root.querySelectorAll?.("[data-pf2e-action-mode]") ?? [])];
  for (const group of groups) group.hidden = group.dataset.pf2eActionMode !== mode || [...group.querySelectorAll("[data-pf2e-search-text]")].every(row => row.hidden);
  const blank = root.querySelector?.(".ve-pf2e-action-empty");
  if (blank) blank.hidden = groups.some(group => !group.hidden);
}

function compactActionRow(feature, actor, commands, status, scope) {
  const cost = feature.actionCost ?? (feature.actions ? { type: "action", value: feature.actions } : null);
  return itemRow({ item: feature, actor, commands, scope, extraDetails: itemRuleControls(feature, actor, commands, status, scope), className: "ve-pf2e-feature ve-pf2e-compact-action", primaryAction: itemPrimaryAction(feature, actor, commands, status, scope), dataset: { actionType: feature.actionType ?? "" }, header: [
    itemArt(feature), node("div", { className: "ve-pf2e-feature-copy", children: [node("h3", { text: feature.name }),
      feature.frequency ? node("small", { text: [feature.frequency.value == null ? null : `${feature.frequency.value}/${feature.frequency.max}`, feature.frequency.label || feature.frequency.per].filter(Boolean).join(" · ") }) : null] }),
    actor.pf2e.play?.exploration?.includes(feature.id) ? node("small",{className:"ve-pf2e-exploration-active",text:text(commands,"Active exploration","VEMOBILE.PF2E.Play.ActiveExploration")}):null,
    cost ? costGlyph(commands, cost) : null
  ], actions: [actionButton(commands, "Post to chat", "fa-comment-dots", () => issueCommand({ actor, command: ACTOR_COMMANDS.USE_ITEM,
    payload: { itemId: feature.id, kind: "item" }, commands, status, scope, actionSession: true }), scope, !canItem(actor, feature.id)), explorationControl(feature,actor,commands,scope,(command,payload)=>issueCommand({actor,command,payload,commands,status,scope}))] });
}

function itemRuleControls(item, actor, commands, status, scope) {
  const options = itemRuleOptions(item.id,actor,commands,scope,(command,payload)=>issueCommand({actor,command,payload,commands,status,scope}));
  const limits = actor.pf2e?.limitedUses?.find(entry => entry.itemId === item.id);
  const rows = ["frequency", "uses"].filter(kind => limits?.[kind]).map(kind => {
    const limit = limits[kind];
    const change = (delta, button) => issueCommand({actor,command:ACTOR_COMMANDS.EDIT_PF2E_INVENTORY,
      payload:{operation:"limit",itemId:item.id,kind,value:limit.value+delta,originalValue:limit.value,originalMax:limit.max},commands,status,scope});
    return node("div", {className:"ve-pf2e-resource-row",children:[
      node("span",{text:kind === "frequency"
        ? [localizedText(commands.localize,"VEMOBILE.PF2E.Character.LimitedUses","Uses"), limit.label || limit.per].filter(Boolean).join(" · ")
        : localizedText(commands.localize,"VEMOBILE.PF2E.Character.Charges","Charges")}),
      node("strong",{text:`${number(commands,limit.value)} / ${number(commands,limit.max)}`}),
      actionButton(commands,"−","fa-minus",button=>change(-1,button),scope,!actor.capabilities?.owner||limit.value<=(limit.min ?? 0)),
      actionButton(commands,"+","fa-plus",button=>change(1,button),scope,!actor.capabilities?.owner||limit.value>=limit.max)
    ]});
  });
  const resources = resourcesPanel(specialResources(actor).filter(resource => resource.sourceItemId === item.id), actor, commands, status, scope, false);
  return options || rows.length || resources ? node("div", {className:"ve-pf2e-item-rule-controls",children:[options,...rows,resources]}) : null;
}

function morePanel(actor, biography, commands, status, scope, shell) {
  return node("div", { className: "ve-pf2e-more ve-pf2e-biography-view", children: [
    biographyPanel(biography, actor, commands, status, scope, shell)
  ] });
}

function isActiveFeature(feature) {
  return feature.actionType ? feature.actionType !== "passive" : feature.type === "action" || feature.actions !== null && feature.actions !== undefined;
}

function pinnedIds(actor) {
  return Array.isArray(actor.quickbar) ? actor.quickbar.map(slot => slot?.kind === "item" ? slot.itemId : "").filter(Boolean) : [];
}

function pinnedRows(pf2e, pinned, actor, commands, status, scope) {
  const rows = [];
  for (const slug of pinned) {
    const skill = pf2e.skills?.find(entry => entry.slug === slug);
    const item = pf2e.inventory?.find(entry => entry.id === slug) || pf2e.features?.find(entry => entry.id === slug);
    if (skill) rows.push(skillRoll(skill, actor, commands, status, scope));
    else if (item) rows.push(itemSummaryAction(item, actor, commands, status, scope));
  }
  return rows;
}

function itemSummaryAction(item, actor, commands, status, scope) {
  return actionButton(commands, item.name, "fa-comment-dots", () => issueCommand({ actor, command: ACTOR_COMMANDS.USE_ITEM,
    payload: { itemId: item.id, kind: "item" }, commands, status, scope, actionSession: true }), scope, !canItem(actor, item.id));
}

function statisticList(title, statistics, defaultSlug, actor, commands, status, scope, saves = false, showRank = false) {
  return node("section", { className: "ve-sheet-card ve-pf2e-statistics-card", children: [
    sectionHeading(commands, title, saves ? "fa-shield" : "fa-dice-d20"),
    statistics.length ? node("div", { className: "ve-pf2e-statistic-list", children: statistics.map(stat => {
      const slug = stat.slug || defaultSlug;
      const action = saves ? ACTOR_COMMANDS.ROLL_SAVE : slug === "perception" ? ACTOR_COMMANDS.ROLL_STATISTIC : ACTOR_COMMANDS.ROLL_SKILL;
      const payload = saves ? { ability: slug } : action === ACTOR_COMMANDS.ROLL_STATISTIC ? { statistic: slug } : { skill: slug };
      const roll = action === ACTOR_COMMANDS.ROLL_SKILL ? skillRoll(stat, actor, commands, status, scope) : rollButton(stat.label || slug, `${modifier(stat.modifier)}${showRank ? rankBadgeText(commands, stat) : ""}`, () => issueCommand({
        button: null, actor, command: action, payload, commands, status,
        resultLabel: `${stat.label || slug} ${text(commands, "Check", "VEMOBILE.PF2E.Character.Check")}`,
        scope
      }), scope, can(actor, saves ? "rollSave" : action === ACTOR_COMMANDS.ROLL_SKILL ? "rollSkill" : "rollStatistic", slug));
      return node("div", { className: "ve-pf2e-statistic-row", children: [roll] });
    }) }) : empty(commands)
  ] });
}

function hpPanel(actor, commands, status, scope) {
  const hp = actor.hp;
  const input = node("input", { attrs: { type: "number", min: "0", step: "1", value: "1", inputmode: "numeric", "aria-label": text(commands, "Hit point amount", "VEMOBILE.PF2E.Character.HitPointAmount") } });
  const amount = () => Math.max(0, Math.floor(Number(input.value) || 0));
  const commandsList = [
    ["Damage", "fa-heart-crack", { operation: "damage", amount }],
    ["Heal", "fa-heart", { operation: "heal", amount }],
    ["Set temporary HP", "fa-shield", { operation: "set-temp", amount, originalValue: hp.temp }]
  ];
  return node("section", { className: "ve-sheet-card ve-pf2e-hp", children: [
    sectionHeading(commands, "Hit points", "fa-heart"),
    node("div", { className: "ve-pf2e-hp-readout", children: [node("strong", { text: `${number(commands, hp.value)} / ${number(commands, hp.max)}` }), hp.temp ? node("span", { text: `${text(commands, "Temporary", "VEMOBILE.PF2E.Character.TemporaryHP")}: ${number(commands, hp.temp)}` }) : null] }),
    node("div", { className: "ve-pf2e-hp-controls", children: [input, ...commandsList.map(([label, iconName, operation]) => actionButton(commands, label, iconName, () => issueCommand({
      actor, command: ACTOR_COMMANDS.EDIT_HIT_POINTS, payload: { ...Object.fromEntries(Object.entries(operation).map(([key, value]) => [key, typeof value === "function" ? value() : value])) }, commands, status, scope,
      disabled: !can(actor, "editHitPoints")
    }), scope, !can(actor, "editHitPoints"))) ] })
  ] });
}

const specialResources = actor => (actor.pf2e?.resources ?? []).filter(resource => !["heroPoints", "focus", "mythic-points"].includes(resource.id));
function resourceItemVisible(actor, id) {
  return [...(actor.pf2e?.inventory ?? []), ...(actor.pf2e?.features ?? [])].some(item => item.id === id);
}

function resourcesPanel(resources = [], actor, commands, status, scope, heading = true) {
  if (!resources.length) return null;
  return node("section", { className: "ve-sheet-card ve-pf2e-resources", children: [heading ? sectionHeading(commands, "Resources", "fa-gauge") : null, node("div", {
    className: "ve-pf2e-resource-list", children: resources.map(resource => node("div", { className: "ve-pf2e-resource-row", children: [
      node("span", { text: resource.label }),
      resource.id === "focus" ? node("span", { className: "ve-pf2e-focus-pips", attrs: { "aria-hidden": "true" }, children: Array.from({ length: Math.max(0, Math.min(3, resource.max)) }, (_, index) => node("i", { className: index < resource.value ? "is-filled" : "" })) }) : null,
      node("strong", { text: `${number(commands, resource.value)} / ${number(commands, resource.max)}` }),
      actionButton(commands, "−", "fa-minus", button => changeResource(resource, -1, button), scope, resource.value <= 0 || !can(actor, "resources"), localizedText(commands.localize, "VEMOBILE.PF2E.Character.Action.DecreaseResource", "Decrease {resource}", { resource: resource.label })),
      actionButton(commands, "+", "fa-plus", button => changeResource(resource, 1, button), scope, resource.value >= resource.max || !can(actor, "resources"), localizedText(commands.localize, "VEMOBILE.PF2E.Character.Action.IncreaseResource", "Increase {resource}", { resource: resource.label }))
    ] }, scope))
  })] });

  function changeResource(resource, delta, button) {
    return issueCommand({ actor, command: ACTOR_COMMANDS.SET_PF2E_RESOURCE,
      payload: { resource: resource.id, value: resource.value + delta, originalValue: resource.value, originalMax: resource.max }, commands, status, scope });
  }
}

function strikesPanel(strikes, actor, commands, status, scope) {
  return collectionGroup({ key: "actions:strikes", label: text(commands, "Attacks", "VEMOBILE.PF2E.Character.Section.Strikes"), glyph: "fa-swords", open: true, className: "ve-pf2e-strikes", children: [node("div", {
    className: "ve-pf2e-strike-list", children: strikes.map(strike => node("article", { className: "ve-pf2e-strike", dataset: { pf2eSearchText: [strike.label, ...(strike.traits ?? [])].join(" ").toLocaleLowerCase(), itemId: strike.itemId, actionType: "strike" }, children: [
      itemArt({ id: strike.itemId, name: strike.label, img: strike.img }, undefined, "ve-pf2e-strike-image"),
      node("details", { className: "ve-pf2e-strike-copy", attrs: { "data-pf2e-disclosure-key": `strike:${strike.id}` }, children: [
        node("summary", { children: [node("h4", { text: strike.label }), strike.actionCost ? costGlyph(commands, strike.actionCost) : null, icon("fa-chevron-down")] }),
        strike.traits?.length ? node("p", { className: "ve-pf2e-traits", text: strike.traits.join(" · ") }) : null
      ] }),
      Array.isArray(strike.auxiliaryActions) || Array.isArray(strike.versatileOptions)
        ? strikeNativeControls(strike, actor, commands, status, scope)
        : strike.ready === false ? strikeCarryControls(strike, actor, commands, status, scope) : null,
      ammunitionControls(strike,actor,commands,scope,(command,payload)=>issueCommand({actor,command,payload,commands,status,scope})),
      node("div", { className: "ve-pf2e-map-variants", attrs: { hidden: strike.ready === false, "aria-label": text(commands, "Attack variants", "VEMOBILE.PF2E.Character.AttackVariants") }, children:
        (strike.variants ?? []).map((variant, ordinal) => {
          const button = actionButton(commands, variant.label || text(commands, "Attack", "VEMOBILE.PF2E.Character.Attack"), "fa-dice-d20", () => useItem({ itemId: strike.itemId, kind: "strike", slug: strike.slug, variant: variant.index, mode: "attack" }), scope, !canItem(actor, strike.itemId), `${text(commands, "Attack", "VEMOBILE.PF2E.Character.Action.Attack")} ${ordinal + 1}${variant.label ? `: ${variant.label}` : ""}`);
          // Keep the system's text and exact variant index; only separate its numeric
          // modifier from the native MAP explanation for the compact button layout.
          const parts = String(variant.label ?? "").match(/^([+\-−]?\d+)\s*(.*)$/u);
          const note = parts?.[2]?.replace(/^\((.*)\)$/u, "$1");
          button.replaceChildren(node("small", { text: `${number(commands, ordinal + 1)}.` }),
            node("span", { text: parts?.[1] || variant.label || text(commands, "Attack", "VEMOBILE.PF2E.Character.Attack") }),
            ...(note ? [node("small", { className: "ve-pf2e-map-note", text: note })] : []));
          return node("div", { className: "ve-pf2e-map-variant", children: [button] });
        })
      }),
      node("div", { className: "ve-pf2e-strike-damage", attrs: { hidden: strike.ready === false }, children: [
        strike.damage ? actionButton(commands, "Damage", "fa-burst", () => useItem({ itemId: strike.itemId, kind: "strike", slug: strike.slug, mode: "damage" }), scope, !canItem(actor, strike.itemId)) : null,
        strike.damage ? actionButton(commands, "Critical damage", "fa-burst", () => useItem({ itemId: strike.itemId, kind: "strike", slug: strike.slug, mode: "critical" }), scope, !canItem(actor, strike.itemId)) : null
      ] })
    ] }, scope))
  })] });

  function useItem(payload) {
    return issueCommand({ actor, command: ACTOR_COMMANDS.USE_ITEM, payload, commands, status, scope, actionSession: true });
  }
}

function strikeNativeControls(strike, actor, commands, status, scope) {
  const execute = payload => issueCommand({ actor, command: ACTOR_COMMANDS.USE_ITEM,
    payload: { itemId: strike.itemId, kind: "strike", slug: strike.slug, ...payload }, commands, status, scope });
  const auxiliary = (strike.auxiliaryActions ?? []).map(action => {
    const select = action.options?.length ? node("select", { attrs: { "aria-label": action.label }, children: action.options.map(option =>
      node("option", { attrs: { value: option.value, selected: option.selected }, text: option.label })) }) : null;
    const button = actionButton(commands, action.label, null, () => execute({ mode: "auxiliary", index: action.index, key: action.key, selection: select?.value ?? null }), scope, !canItem(actor, strike.itemId), action.label);
    if (action.glyph) button.append(node("span", { className: "ve-pf2e-native-cost", attrs: { "aria-hidden": "true" }, text: action.glyph }));
    return node("div", { className: "ve-pf2e-auxiliary-action", children: [select, button] });
  });
  const choices = strike.versatileOptions ?? [];
  const versatile = choices.length ? node("div", { className: "ve-pf2e-versatile-options", attrs: { role: "group", "aria-label": text(commands, "Damage type", "VEMOBILE.PF2E.Character.DamageType") }, children: choices.map(option => {
    const label = text(commands, option.label, option.label);
    const button = actionButton(commands, label, null, () => execute({ mode: "versatile", value: option.value, originalValue: choices.find(entry => entry.selected)?.value }), scope, option.selected || !canItem(actor, strike.itemId), label);
    button.setAttribute("aria-pressed", option.selected ? "true" : "false");
    return button;
  }) }) : null;
  return node("div", { className: "ve-pf2e-actions ve-pf2e-native-strike-controls", children: [...auxiliary, versatile] });
}

function strikeCarryControls(strike, actor, commands, status, scope) {
  const item = actor.pf2e?.inventory?.find(item => item.id === strike.itemId);
  if (!item) return actionButton(commands, "Details", "fa-book-open", () => execute(commands, ACTOR_COMMANDS.OPEN_ITEM_SHEET, actor, { itemId: strike.itemId }, status, scope), scope, !canItem(actor, strike.itemId));
  const carry = carrySelectForItem(item, commands, scope);
  return node("div", { className: "ve-pf2e-actions", children: [carry.element,
    actionButton(commands, "Apply carry", "fa-box", () => {
      const [, , , payload] = CARRY_CHOICES.find(([value]) => value === carry.select.value) ?? CARRY_CHOICES[0];
      return issueCommand({ actor, command: ACTOR_COMMANDS.SET_ITEM_EQUIPPED, payload: { itemId: item.id, ...payload }, commands, status, scope });
    }, scope, !can(actor, "equipItem"))
  ] });
}

function inventoryPanel(actor, commands, status, scope, shell) {
  const inventory = actor.pf2e?.inventory ?? [];
  const byId = new Map(inventory.map(item => [item.id, item]));
  const topLevel = inventory.filter(item => !item.containerId || !byId.has(item.containerId));
  const category = item => item.type === "weapon" || item.type === "shield" ? "weapon" : item.type === "ammo" || item.category === "ammo" ? "ammo" : ["armor", "consumable", "treasure", "backpack"].includes(item.type) ? item.type : "equipment";
  const sections = [["weapon", "Weapons & Shields", "PF2E.Actor.Inventory.Section.WeaponsAndShields", "fa-swords"], ["armor", "Armor", "TYPES.Item.armor", "fa-shirt"], ["equipment", "Equipment", "TYPES.Item.equipment", "fa-toolbox"], ["consumable", "Consumables", "TYPES.Item.consumable", "fa-flask"], ["ammo", "Ammunition", "TYPES.Item.ammo", "fa-bow-arrow"], ["treasure", "Treasure", "TYPES.Item.treasure", "fa-coins"], ["backpack", "Containers", "TYPES.Item.backpack", "fa-backpack"]];
  const order = new Map(inventory.map((item, index) => [item.id, index]));
  const renderItem = (item, ancestors = new Set()) => {
    const next = new Set([...ancestors, item.id]);
    const contents = inventory.filter(child => child.containerId === item.id && !next.has(child.id));
    const card = itemCard(item, actor, commands, status, scope);
    const capacity = item.containerCapacity;
    const row = !contents.length && !capacity ? card : node("div", { className: "ve-pf2e-container", children: [card,
      node("details", { className: "ve-pf2e-container-contents", attrs: { "data-pf2e-disclosure-key": `container:${item.id}` }, children: [
        node("summary", { children: [icon("fa-box-open"), node("span", { text: `${text(commands, "Contents", "PF2E.OpenItemTitle")} (${contents.length})` }), capacity ? node("small", { text: `${capacity.value} / ${capacity.max}` }) : null, icon("fa-chevron-down")] }),
        ...contents.map(child => renderItem(child, next))
      ] })
    ] });
    row.dataset.pf2eSortName = item.name;
    row.dataset.pf2eSortOrder = String(order.get(item.id));
    return row;
  };
  let firstGroup = true;
  const inventoryHeading = sectionHeading(commands, "Inventory", "fa-backpack");
  inventoryHeading.classList.add("ve-pf2e-collection-heading");
  const inventoryCard = node("section", { className: "ve-sheet-card ve-pf2e-inventory-heading", children: [inventoryHeading,
    equipmentSummary(actor, commands, scope, shell),
    actor.pf2e?.bulk ? bulkSummary(actor.pf2e.bulk, commands) : null
  ] });
  const view = node("div", { className: "ve-pf2e-gear-view", children: [
    inventoryCard,
    ...sections.flatMap(([type, label, key, glyph]) => {
      const items = topLevel.filter(item => category(item) === type);
      if (!items.length) return [];
      const open = firstGroup;
      firstGroup = false;
      return [collectionGroup({ key: `inventory:${type}`, label: text(commands, label, key), glyph, open, className: "ve-pf2e-inventory-group",
        extra: node("small", { text: `${text(commands, "Quantity", "PF2E.QuantityLabel")} · ${supplement(commands, "Bulk", "Bulk")}` }), children: [
        node("div", { className: "ve-pf2e-item-list", children: items.map(item => renderItem(item)) })
      ] })];
    }),
    !inventory.length ? empty(commands) : null
  ] });
  inventoryHeading.append(inventoryControls(view, commands, scope));
  return view;
}

function itemPostActions(item, actor, commands, status, scope) {
  return canItem(actor, item.id) ? [actionButton(commands, "Post to chat", "fa-comment-dots", () => issueCommand({ actor,
    command: ACTOR_COMMANDS.USE_ITEM, payload: { itemId: item.id, kind: "item" }, commands, status, scope, actionSession: true }), scope)] : [];
}

function canConsumeItem(actor, item) {
  return canItem(actor, item.id) && (item.type !== "consumable" || actor.pf2e?.limitedUses?.find(limit => limit.itemId === item.id)?.uses?.value !== 0);
}

function itemPrimaryAction(item, actor, commands, status, scope) {
  const consume = item.type === "consumable";
  return { label: `${text(commands, consume ? "Use" : "Post to chat", ACTION_LABELS[consume ? "Use" : "Post to chat"])}: ${item.name}`,
    enabled: canConsumeItem(actor, item), activate: button => issueCommand({ button, actor, command: ACTOR_COMMANDS.USE_ITEM,
      payload: { itemId: item.id, kind: consume ? "consume" : "item" }, commands, status, scope, actionSession: true }) };
}

function itemCard(item, actor, commands, status, scope) {
  const actions = [actionButton(commands, item.type === "consumable" ? "Use" : "Post to chat", item.type === "consumable" ? "fa-hand" : "fa-comment-dots", () => issueCommand({
    actor, command: ACTOR_COMMANDS.USE_ITEM, payload: { itemId: item.id, kind: item.type === "consumable" ? "consume" : "item" }, commands, status, scope, actionSession: true
  }), scope, !canConsumeItem(actor, item))];
  if(actor.capabilities?.owner)actions.push(itemInventoryControls(item,actor,commands,scope,(command,payload)=>issueCommand({actor,command,payload,commands,status,scope})));
  if (["weapon", "armor", "shield", "equipment"].includes(item.type)) {
    const carry = carrySelectForItem(item, commands, scope);
    actions.push(node("div", { className: "ve-pf2e-carry-actions", children: [carry.element, actionButton(commands, "Apply carry", "fa-box", () => {
      const [, , , payload] = CARRY_CHOICES.find(([value]) => value === carry.select.value) ?? CARRY_CHOICES[0];
      return issueCommand({ actor, command: ACTOR_COMMANDS.SET_ITEM_EQUIPPED, payload: { itemId: item.id, ...payload }, commands, status, scope });
    }, scope, !can(actor, "equipItem"))] }));
    if (item.invested !== null && item.invested !== undefined) actions.push(actionButton(commands, item.invested ? "Uninvest" : "Invest", "fa-gem", () => issueCommand({
      actor, command: ACTOR_COMMANDS.SET_ITEM_ATTUNED, payload: { itemId: item.id, invested: !item.invested }, commands, status, scope
    }), scope, !can(actor, "investItem")));
  }
  return itemRow({ item, actor, commands, scope, extraDetails: itemRuleControls(item, actor, commands, status, scope), className: "ve-pf2e-item", primaryAction: itemPrimaryAction(item, actor, commands, status, scope), header: [itemArt(item),
    node("div", { className: "ve-pf2e-item-copy", children: [node("h3", { text: item.name }), node("p", { className: "ve-pf2e-item-meta", text: [
      item.carryType ? text(commands, item.carryType, CARRY_LABEL_BY_TYPE[item.carryType]) : "", item.invested ? supplement(commands, "Invested", "Invested") : "",
      item.identified === false ? text(commands, "Unidentified", "VEMOBILE.PF2E.Character.Unidentified") : ""
    ].filter(Boolean).join(" · ") })] }),
    node("div", { className: "ve-pf2e-item-amounts", children: [node("span", { attrs: { title: text(commands, "Quantity", "PF2E.QuantityLabel") }, text: number(commands, item.quantity) }),
      node("span", { attrs: { title: supplement(commands, "Bulk", "Bulk") }, text: item.bulk || "—" })] })
  ], actions });
}

function carrySelectForItem(item, commands, scope) {
  const current = item.carryType === "held"
    ? (Number(item.handsHeld) === 2 ? "held-2" : "held-1")
    : item.carryType === "worn" ? (item.inSlot === true ? "worn-slot" : "worn-no-slot")
      : item.carryType === "dropped" ? "dropped" : "stowed";
  const select = node("select", { className: "ve-pf2e-carry-select", attrs: { "aria-label": text(commands, "Carry state", "VEMOBILE.PF2E.Character.CarryState") }, children: CARRY_CHOICES.map(([value, label, labelKey]) => node("option", {
    attrs: { value, selected: value === current }, text: text(commands, label, labelKey)
  })) }, scope);
  return { select, element: node("label", { className: "ve-pf2e-carry-control", children: [
    node("span", { text: text(commands, "Carry state", "VEMOBILE.PF2E.Character.CarryState") }),
    select
  ] }, scope) };
}

function spellsPanel(actor, commands, status, scope, shell) {
  const entries = actor.pf2e?.spellcasting ?? [];
  const focus = actor.pf2e?.resources?.find(resource => resource.id === "focus");
  const selected = shell.panelState.get(shell.activePanelContext)?.inputs?.get("spell-mode")?.value ?? "known";
  const modes = [["known", "Known Spells", "PF2E.Actor.Character.Spellcasting.Tab.KnownSpells"], ["rituals", "Rituals", "PF2E.Actor.Character.Spellcasting.Tab.Rituals"], ["activations", "Activations", "PF2E.Actor.Character.Spellcasting.Tab.Activations"]];
  const panes = new Map();
  let view;
  const createPane = mode => {
    if (mode === "known") {
      const cards = entries.map(entry => spellEntry(entry, actor, commands, status, scope, shell)).filter(Boolean);
      return node("div", { className: "ve-pf2e-known-spells", dataset: { spellMode: mode }, children: [
        focus ? resourcesPanel([focus], actor, commands, status, scope) : null,
        node("section", { className: "ve-sheet-card ve-pf2e-spellbook", children: [
          cards.length ? node("div", { className: "ve-pf2e-spell-entries", children: cards }) : empty(commands)
        ] })
      ] });
    }
    const [, label, key] = modes.find(([value]) => value === mode);
    const items = actor.pf2e?.spellBrowsing?.[mode] ?? [];
    return collectionGroup({ key: `spells:${mode}`, label: text(commands, label, key), glyph: "fa-book-open", open: true, className: "ve-pf2e-spell-browsing", dataset: { spellMode: mode }, attrs: { hidden: true }, children: [
      node("div", { className: "ve-pf2e-spell-reference-list", children: items.length ? items.map(item => itemRow({ item, actor, commands, scope, extraDetails: itemRuleControls(item, actor, commands, status, scope), className: "ve-pf2e-spell-reference", primaryAction: spellReferencePrimary(item, actor, commands, status, scope), actions: [...itemPostActions(item, actor, commands, status, scope), item.castAction ? actionButton(commands, "Cast", "fa-wand-sparkles", () => issueCommand({ actor, command: ACTOR_COMMANDS.USE_ITEM, payload: item.castAction, commands, status, scope, actionSession: true }), scope, !canSpellReference(actor, item)) : null], header: [
        itemArt(item),
        node("div", { children: [node("strong", { text: item.name }), node("small", { text: [item.spellName, item.rank != null ? `${text(commands, "Rank", "VEMOBILE.PF2E.Character.Rank.Label")} ${number(commands, item.rank)}` : "", item.timeLabel].filter(Boolean).join(" · ") })] }),
      ] })) : [empty(commands)] })
    ] });
  };
  const ensurePane = mode => {
    let pane = panes.get(mode);
    if (pane) return pane;
    pane = createPane(mode);
    pane.hidden = mode !== selected;
    panes.set(mode, pane);
    view?.append(pane);
    if (view) {
      // The existing collection toolbar delegates sorting and disclosure state
      // across the pane root, so newly visited rows join the same controls.
      prepareListSorting(pane);
      const sort = view.querySelector('[data-pf2e-state-key="spells-sort"]');
      sort?.dispatchEvent(new Event("change", { bubbles: true }));
      const saved = shell.panelState.get(shell.activePanelContext);
      const disclosures = [
        ...(pane.dataset.pf2eDisclosureKey ? [pane] : []),
        ...pane.querySelectorAll('details[data-pf2e-disclosure-key]')
      ];
      for (const disclosure of disclosures) {
        if (saved?.disclosures?.has(disclosure.dataset.pf2eDisclosureKey)) disclosure.open = saved.disclosures.get(disclosure.dataset.pf2eDisclosureKey);
      }
      pane.dispatchEvent(new Event("toggle"));
    }
    return pane;
  };
  const initialPane = ensurePane(selected);
  view = node("div", { className: "ve-pf2e-spells", children: [
    filterChips({ className: "ve-pf2e-spell-modes", key: "spell-mode", label: text(commands, "Spells", "VEMOBILE.PF2E.Character.Spells"), options: modes, selected, commands, scope, shell,
      apply: select => {
        const active = ensurePane(select.value);
        for (const pane of panes.values()) pane.hidden = pane !== active;
      } }),
    initialPane
  ] });
  return view;
}

const canSpellReference = (actor, item) => canItem(actor, item.id) && (item.castAction?.kind !== "activation" || item.castAction.originalUses !== 0);

function spellReferencePrimary(item, actor, commands, status, scope) {
  if (!item.castAction) return canItem(actor,item.id) ? itemPrimaryAction(item,actor,commands,status,scope) : null;
  return {label: text(commands,"Cast",ACTION_LABELS.Cast)+": "+item.name, enabled:canSpellReference(actor,item),
    activate:button=>issueCommand({button,actor,command:ACTOR_COMMANDS.USE_ITEM,payload:item.castAction,commands,status,scope,actionSession:true})};
}

function castingSummary(entry, commands, actor, scope, shell) {
  return node("section", { className: "ve-sheet-card ve-pf2e-casting-summary", children: [
    node("div", { className: "ve-pf2e-casting-identity", children: [icon("fa-book-open"), node("div", { children: [
      node("h3", { text: entry.label }),
      node("small", { text: [entry.traditionLabel, entry.categoryLabel].filter(Boolean).join(" · ") })
    ] })] }),
    (entry.preparation && actor.capabilities?.prepareSpells || entry.management && actor.capabilities?.manageSpells) ? node("button", { className: "ve-pf2e-prepare-button", attrs: { type: "button", "aria-label": entry.preparation ? localizedText(commands.localize, "VEMOBILE.PF2E.Character.PrepareEntry", "Prepare {entry}", { entry: entry.label }):text(commands,"Manage spells","VEMOBILE.PF2E.Spells.Title") }, children: [icon("fa-book-open"), node("span", { text: entry.preparation ? text(commands, "Prepare", "VEMOBILE.PF2E.Character.PrepareSpells"):text(commands,"Manage spells","VEMOBILE.PF2E.Spells.Title") })], on: { click: () => shell.openSpellPreparation(entry.entryId) } }, scope) : null,
    entry.attackModifier !== null && entry.attackModifier !== undefined ? node("button",{className:"ve-pf2e-spell-attack-roll",attrs:{type:"button",disabled:!actor.capabilities?.manageSpells},children:[statReadout(commands,"Spell attack","VEMOBILE.PF2E.Character.SpellAttack",modifier(entry.attackModifier))],on:{click:event=>issueCommand({button:event.currentTarget,actor,command:ACTOR_COMMANDS.EDIT_PF2E_SPELLS,payload:{entryId:entry.entryId,operation:"attack"},commands,status:shell.status,scope,actionSession:true})}},scope):null,
    entry.dc !== null && entry.dc !== undefined ? statReadout(commands, "Spell DC", "VEMOBILE.PF2E.Character.SpellDC", number(commands, entry.dc)) : null
  ] });
}

function spellEntry(entry, actor, commands, status, scope, shell) {
  const options = entry.options ?? [];
  if (!options.length && !entry.preparation && !entry.management) return null;
  const groups = new Map();
  for (const [index, spell] of options.entries()) {
    const group = spell.isCantrip ? "cantrip" : `rank-${spell.rank}`;
    if (!groups.has(group)) groups.set(group, { key: group, rank: spell.rank, cantrip: spell.isCantrip, spells: [] });
    // Keep the prepared slot row identity. Two prepared copies of the same
    // spell are separate cast commands and must never collapse by display name.
    groups.get(group).spells.push({ ...spell, presentationId: `${entry.entryId}:${spell.spellId}:${spell.rank}:${spell.slotId ?? "free"}:${index}` });
  }
  return node("section", { className: "ve-sheet-card ve-pf2e-spell-entry", attrs: { "data-pf2e-spell-entry": entry.entryId }, children: [
    castingSummary(entry, commands, actor, scope, shell),
    ...[...groups.values()].map((group, index) => collectionGroup({ key: `spells:${entry.entryId}:${group.key}`, className: "ve-pf2e-spell-rank-group", attrs: { "data-spell-rank": group.key }, open: index === 0,
      label: group.cantrip ? text(commands, "Cantrips", "VEMOBILE.PF2E.Character.Cantrips") : `${text(commands, "Rank", "VEMOBILE.PF2E.Character.Rank.Label")} ${number(commands, group.rank)}`,
      glyph: "fa-wand-magic-sparkles", extra: slotSummary(entry, group, commands), children: [
      node("div", { className: "ve-pf2e-spell-list", children: group.spells.map(spell => spellRow(spell, entry, actor, commands, status, scope)) })
    ] }))
  ] });
}

function slotSummary(entry, group, commands) {
  if (group.cantrip) return null;
  const slot = entry.slots?.find(slot => slot.rank === group.rank);
  if (!slot || !(slot.max > 0)) return null;
  return node("small", { className: "ve-pf2e-slot-count", text: `${supplement(commands, "Slots", "Slots")} ${number(commands, slot.value ?? 0)}/${number(commands, slot.max)}` });
}

function spellRow(spell, entry, actor, commands, status, scope) {
  const traits = spell.traits ?? [];
  const cost = spell.actionCost;
  const tags = [spell.isCantrip ? text(commands, "Cantrip", "VEMOBILE.PF2E.Character.Cantrip") : "",
    spell.isFocus ? text(commands, "Focus", "VEMOBILE.PF2E.Character.Focus") : "",
    spell.expended ? text(commands, "Expended", "VEMOBILE.PF2E.Character.Expended") : "",
    spell.isAtWill ? text(commands, "At will", "VEMOBILE.PF2E.Character.AtWill") : ""].filter(Boolean);
  const metadata = [...new Set([
    !cost ? spell.timeLabel : "", `${text(commands, "Rank", "VEMOBILE.PF2E.Character.Rank.Label")} ${number(commands, spell.rank)}`,
    ...tags, ...traits
  ].filter(Boolean))].join(" · ");
  const compactMetadata = [...new Set([
    !cost ? spell.timeLabel : "",
    spell.isCantrip ? `${text(commands, "Rank", "VEMOBILE.PF2E.Character.Rank.Label")} ${number(commands, spell.rank)}` : "",
    spell.expended ? text(commands, "Expended", "VEMOBILE.PF2E.Character.Expended") : "",
    spell.isAtWill && !spell.isCantrip ? text(commands, "At will", "VEMOBILE.PF2E.Character.AtWill") : "",
    ...traits.filter(trait => !tags.includes(trait)).slice(0, spell.range || spell.defense ? 0 : 2)
  ].filter(Boolean))].join(" · ");
  const item = { ...spell, id: spell.spellId };
  const payload = { itemId: spell.spellId, kind: "cast", entryId: entry.entryId, rank: spell.rank,
    ...(spell.slotId === null ? {} : { slotId: spell.slotId }) };
  const enabled = !spell.expended && canItem(actor, spell.spellId);
  const cast = button => issueCommand({ button, actor, command: ACTOR_COMMANDS.USE_ITEM, payload, commands, status, scope, actionSession: true });
  const castButton = () => actionButton(commands, "Cast", "fa-wand-sparkles", () => cast(), scope, !enabled);
  const row = itemRow({ item, actor, commands, scope, extraDetails: itemRuleControls(item, actor, commands, status, scope), className: `ve-pf2e-spell${spell.expended ? " is-expended" : ""}`,
    disclosureKey: `spell:${entry.entryId}:${spell.presentationId}`,
    primaryAction: { label: `${text(commands, "Cast", ACTION_LABELS.Cast)}: ${spell.name}`, enabled, activate: cast },
    dataset: { spellId: spell.presentationId, spellRank: spell.isCantrip ? "cantrip" : `rank-${spell.rank}` },
    header: [itemArt(item), node("div", { className: "ve-pf2e-spell-copy", children: [
      node("strong", { text: spell.name }),
      node("small", { className: "ve-pf2e-spell-meta", children: [
        spell.actionCost ? costGlyph(commands, spell.actionCost) : null,
        node("span", { text: [spell.range, spell.defense, compactMetadata].filter(Boolean).join(" · "), attrs: { title: [metadata, spell.range, spell.defense, spell.duration].filter(Boolean).join(" · "), "aria-label": [metadata, spell.range, spell.defense, spell.duration].filter(Boolean).join(" · ") } })
      ] })
    ] }), castButton()], actions: [castButton()] });
  // A deliberate Cast tap must not also expand the reading surface.
  scope.listen(row.querySelector("summary > .ve-pf2e-action-button"), "click", event => { event.preventDefault(); event.stopPropagation(); });
  return row;
}

/** A serializable select value owns the filter; the visible chips are its touch controls. */
function filterChips({ className, key, label, options, selected, visible = () => true, dropdown = false, commands, scope, shell, apply }) {
  const chips = [];
  const select = node("select", { attrs: { "data-pf2e-state-key": key, ...(dropdown ? { "aria-label": label, "data-pf2e-focus-key": key } : { "aria-hidden": "true", tabindex: "-1" }) }, children:
    options.map(([value, fallback, labelKey]) => node("option", { attrs: { value, selected: value === selected }, text: labelKey ? text(commands, fallback, labelKey) : fallback }))
  });
  select.value = selected;
  if (dropdown) scope.listen(select, "focus", () => rememberPanelFocus(shell, key));
  const sync = () => {
    for (const chip of chips) {
      const active = chip.dataset.filterValue === select.value;
      chip.classList.toggle("is-active", active); chip.setAttribute("aria-pressed", String(active));
    }
    apply(select);
  };
  scope.listen(select, "change", sync);
  for (const [value, fallback, labelKey] of options.filter(([value]) => visible(value))) {
    const focusKey = `${key}:${value}`;
    chips.push(node("button", { className: value === selected ? "is-active" : "", dataset: { filterValue: value, pf2eFocusKey: focusKey }, attrs: { type: "button", "aria-pressed": String(value === selected) }, text: labelKey ? text(commands, fallback, labelKey) : fallback,
      on: { focus: () => rememberPanelFocus(shell, focusKey), click: () => { select.value = value; sync(); } }
    }, scope));
  }
  return node("div", { className: `${className} ve-pf2e-filter-chips`, attrs: { role: "group", "aria-label": label }, children: [select, ...chips] });
}

function searchInput(commands, fallback, key, stateKey, scope, shell) {
  const saved = shell.panelState.get(shell.activePanelContext)?.inputs?.get(stateKey)?.value ?? "";
  return node("label", { className: "ve-pf2e-search", children: [icon("fa-magnifying-glass"), node("input", {
    attrs: { type: "search", value: saved, placeholder: text(commands, fallback, key), "aria-label": text(commands, fallback, key),
      "data-pf2e-state-key": stateKey, "data-pf2e-focus-key": stateKey },
    on: { focus: () => rememberPanelFocus(shell, stateKey), input: event => { rememberPanelFocus(shell, stateKey); filterPresentationRows(event.currentTarget, event.currentTarget.value); } }
  }, scope)] }, scope);
}

function rememberPanelFocus(shell, key) {
  const saved = shell.panelState.get(shell.activePanelContext) ?? { inputs: new Map(), disclosures: new Map() };
  saved.focusKey = key; shell.panelState.set(shell.activePanelContext, saved);
}
function filterPresentationRows(input, query) {
  const root = input.closest?.(".ve-pf2e-actions-view, .ve-pf2e-gear-view, .ve-pf2e-spells, .ve-pf2e-feats");
  if (!root) return;
  const needle = String(query ?? "").trim().toLocaleLowerCase();
  for (const row of root.querySelectorAll?.("[data-pf2e-search-text]") ?? []) setPresentationFilter(row, "pf2eSearchHidden", Boolean(needle && !row.dataset.pf2eSearchText.includes(needle)));
  hideEmptySpellGroups(root);
  updateActionGroups(root);
  for (const group of root.querySelectorAll(".ve-pf2e-inventory-group")) group.hidden = [...group.querySelectorAll(".ve-pf2e-item")].every(row => row.hidden);
  for (const group of root.querySelectorAll(".ve-pf2e-feat-group")) group.hidden = [...group.querySelectorAll(".ve-pf2e-feat-row")].every(row => row.hidden);
  if (needle) for (const container of root.querySelectorAll(".ve-pf2e-container-contents")) if ([...container.querySelectorAll(".ve-pf2e-item")].some(row => !row.hidden)) container.open = true;
}

function setPresentationFilter(row, kind, hidden) {
  row.dataset[kind] = String(hidden);
  row.hidden = row.dataset.pf2eSearchHidden === "true" || row.dataset.pf2eFilterHidden === "true";
}

function hideEmptySpellGroups(root) {
  for (const group of root?.querySelectorAll?.(".ve-pf2e-spell-rank-group") ?? []) {
    const rows = [...group.querySelectorAll(".ve-pf2e-spell")];
    group.hidden = group.dataset.pf2eFilterHidden === "true" || rows.every(row => row.hidden);
  }
  for (const entry of root?.querySelectorAll?.(".ve-pf2e-spell-entry") ?? []) entry.hidden = [...entry.querySelectorAll(".ve-pf2e-spell-rank-group")].every(group => group.hidden);
}

function bulkSummary(bulk, commands) {
  const amount = bulk.value ?? "—";
  const thresholds = [bulk.encumberedAfter !== null && bulk.encumberedAfter !== undefined ? `${text(commands, "Encumbered", "VEMOBILE.PF2E.Character.Bulk.Encumbered")} ${bulk.encumberedAfter}` : "",
    bulk.max !== null && bulk.max !== undefined ? `${text(commands, "Maximum", "VEMOBILE.PF2E.Character.Bulk.Maximum")} ${bulk.max}` : ""].filter(Boolean);
  return node("section", { className: "ve-sheet-card ve-pf2e-bulk-summary", children: [icon("fa-weight-hanging"),
    node("strong", { text: `${text(commands, "Bulk", "VEMOBILE.PF2E.Character.Bulk.Label")}: ${amount}` }),
    thresholds.length ? node("span", { text: thresholds.join(" · ") }) : null
  ] });
}

function costGlyph(commands, cost) {
  const type = cost?.type;
  const count = Number(cost?.value);
  const label = cost?.label || text(commands, type === "reaction" ? "Reaction" : type === "free" ? "Free action" : "Action cost", type === "reaction" ? "VEMOBILE.PF2E.Character.ActionCost.Reaction" : type === "free" ? "VEMOBILE.PF2E.Character.ActionCost.Free" : "VEMOBILE.PF2E.Character.ActionCost.Actions");
  if (type === "time") return node("span", { className: "ve-pf2e-action-cost is-time", attrs: { "aria-label": label, title: label }, text: label });
  const glyph = type === "reaction" ? "R" : type === "free" ? "F" : type === "action" && [1, 2, 3].includes(count) ? String(count) : "";
  return node("span", { className: `ve-pf2e-action-cost${glyph ? " ve-pf2e-native-cost" : ""} is-${type || "unknown"}`, attrs: { "aria-label": label, title: label }, text: glyph || label });
}

function featsPanel(actor, commands, status, scope, shell) {
  const features = (actor.pf2e?.features ?? []).filter(feature => feature.type === "feat" || feature.type === "campaignFeature" || !isActiveFeature(feature));
  const groups = actor.pf2e?.featGroups?.length ? actor.pf2e.featGroups : [{ id: "features", label: text(commands, "Feats", "PF2E.Item.Feat.Plural"), entries: features }];
  const byId = new Map(features.map(feature => [feature.id, feature]));
  return node("div", { className: "ve-pf2e-feats", children: [
    ...groups.filter(group => group.entries?.length).map((group, index) => collectionGroup({ key: `feats:${group.id}`, label: group.label, glyph: "fa-medal", open: index === 0, className: "ve-pf2e-feat-group", children: [
      node("div", { className: "ve-pf2e-feat-rows", children: group.entries.map(entry => {
        const feat = { ...byId.get(entry.id), ...entry };
        return itemRow({ item: feat, actor, commands, scope, extraDetails: itemRuleControls(feat, actor, commands, status, scope), className: "ve-pf2e-feat-row", primaryAction: itemPrimaryAction(feat, actor, commands, status, scope), depth: Math.min(3, Math.max(0, Number(feat.depth) || 0)), header: [
          node("small", { className: "ve-pf2e-feat-level", text: feat.levelLabel ?? "" }), itemArt(feat), node("strong", { className: "ve-pf2e-feat-name", text: feat.name })
        ], actions: [actionButton(commands, "Post to chat", "fa-comment-dots", () => issueCommand({ actor, command: ACTOR_COMMANDS.USE_ITEM,
          payload: { itemId: feat.id, kind: "item" }, commands, status, scope, actionSession: true }), scope, !canItem(actor, feat.id))] });
      }) })
    ] })), !groups.some(group => group.entries?.length) ? empty(commands) : null
  ] });
}

function featureList(features, actor, commands, status, scope, title) {
  return node("section", { className: "ve-sheet-card ve-pf2e-features", children: [sectionHeading(commands, title, "fa-book-sparkles"), features.length ? node("div", {
    className: "ve-pf2e-feature-list", children: features.map(feature => featureRow(feature, actor, commands, status, scope))
  }) : empty(commands)] });
}

function featureRow(feature, actor, commands, status, scope) {
  return compactActionRow(feature, actor, commands, status, scope);
}

function biographyPanel(biography, actor, commands, status, scope, shell) {
  const context = shell.activePanelContext;
  const enriched = node("div", { className: "ve-pf2e-biography-enriched is-loading", attrs: { "aria-busy": "true", "data-actor-source-uuid": actor.sourceUuid } });
  void commands.readCharacterBiography(actor.sourceUuid).then(result => {
    if (scope.disposed || result?.actorSourceUuid !== actor.sourceUuid || enriched.dataset.actorSourceUuid !== actor.sourceUuid) return;
    enriched.classList.remove("is-loading");
    enriched.removeAttribute("aria-busy");
    if (Array.isArray(result.sections)) {
      enriched.replaceChildren(...result.sections.map(section => {
        const label = BIOGRAPHY_SECTIONS[section.id];
        if (!label) return null;
        const fields = section.fields.map(field => {
          const fieldLabel = BIOGRAPHY_LABELS[field.key];
          const content = node("div", { className: "ve-pf2e-biography-prose" });
          if (typeof field.html === "string") content.innerHTML = field.html;
          else content.textContent = field.text ?? "";
          return node("div", { className: `ve-pf2e-biography-field${field.html !== undefined ? " is-rich" : ""}`, children: [fieldLabel ? node("h4", { text: text(commands, fieldLabel[0], fieldLabel[1]) }) : null, content] });
        });
        const panel = fold(`biography-${section.id}`, text(commands, label[0], label[1]), fields.length ? [node("div", { className: "ve-pf2e-biography-fields", children: fields })] : [empty(commands)]);
        panel.classList.add("ve-pf2e-biography-section");
        if (result.editable && Array.isArray(section.editorFields) && actor.capabilities?.editBiography) {
          const summary = panel.querySelector("summary");
          const edit = node("button", { className: "ve-pf2e-biography-edit", attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Character.Presenter.Edit", "Edit {label}", { label: text(commands, label[0], label[1]) }) }, children: [icon("fa-pen-to-square")], on: { click: event => {
            event.preventDefault(); event.stopPropagation(); shell.openBiographyEditor(section, text(commands, label[0], label[1]));
          } } }, scope);
          summary.insertBefore(edit, summary.lastElementChild);
        }
        // Expand Appearance initially; other sections retain their disclosure state.
        if (section.id === "appearance") panel.open = true;
        return panel;
      }).filter(Boolean));
    } else if (typeof result.html === "string" && result.html) {
      enriched.innerHTML = result.html;
    } else enriched.replaceChildren(node("p", { className: "ve-sheet-empty", text: text(commands, "No biography has been recorded.", "VEMOBILE.PF2E.Character.EmptyBiography") }));
    if (!result.inlineRollsInteractive) {
      for (const roll of enriched.querySelectorAll?.("a.inline-roll:not(.inline-result)") ?? []) {
        roll.classList.add("is-disabled");
        roll.setAttribute("aria-disabled", "true");
        roll.setAttribute("title", text(commands, "Inline roll unavailable without OWNER permission", "VEMOBILE.PF2E.Character.InlineRollUnavailable"));
      }
    }
    restorePanelState(shell, context);
  }).catch(error => {
    if (scope.disposed) return;
    enriched.classList.remove("is-loading");
    enriched.removeAttribute("aria-busy");
    enriched.replaceChildren(node("p", { className: "ve-sheet-empty", text: error?.message ?? text(commands, "Biography is unavailable.", "VEMOBILE.PF2E.Character.BiographyUnavailable") }));
    status.classList.add("is-error");
    status.textContent = error?.message ?? text(commands, "Biography is unavailable.", "VEMOBILE.PF2E.Character.BiographyUnavailable");
  });
  return node("section", { className: "ve-pf2e-biography", children: [enriched] });
}

function conditionChoices(actor) {
  const active = (actor?.pf2e?.conditions ?? []).filter(condition => condition.active);
  const choices = new Map((actor?.pf2e?.availableConditions ?? []).map(condition => [condition.slug, { ...condition, active: false, value: 0, locked: false }]));
  for (const condition of active) {
    const old = choices.get(condition.slug);
    // PF2e appends the level to embedded names; the catalogue keeps the plain localized name.
    const label = condition.value != null && old?.label ? old.label : condition.label;
    choices.set(condition.slug, { ...old, ...condition, img: condition.img || old?.img || "", valued: old?.valued || condition.value != null,
      label, value: Math.max(old?.value ?? 0, condition.value ?? 0), locked: old?.locked || condition.locked });
  }
  return [...choices.values()].sort((a,b) => Number(b.active) - Number(a.active) || a.label.localeCompare(b.label));
}

function conditionArt(condition, commands, badge = false) {
  return node("span", { className: "ve-pf2e-condition-art", children: [
    condition.img ? node("img", { attrs: { src: condition.img, alt: "", draggable: false } }) : icon("fa-circle-exclamation"),
    badge && condition.valued && condition.value > 0 ? node("strong", { className: "ve-pf2e-condition-badge", text: number(commands, condition.value) }) : null
  ] });
}

function conditionsPanel(actor, commands, scope, shell) {
  const active = conditionChoices(actor).filter(condition => condition.active);
  return node("section", { className: "ve-sheet-card ve-pf2e-conditions", children: [
    sectionHeading(commands, "Conditions", "fa-heart-pulse",
      node("button", { className: "ve-sheet-card-action ve-pf2e-conditions-view-all", attrs: { type: "button", "data-pf2e-focus-key": "conditions-open" },
        children: [node("span", { text: text(commands, "View All", "VEMOBILE.Character.Presenter.ViewAll") }), icon("fa-chevron-right")],
        on: { click: () => shell.openConditions() } }, scope)),
    active.length ? node("div", { className: "ve-pf2e-condition-preview", children: active.map(condition => node("button", {
      className: "ve-pf2e-condition-chip", attrs: { type: "button", "aria-label": `${condition.label}${condition.valued ? ` ${condition.value}` : ""}` },
      children: [conditionArt(condition, commands, true), node("span", { text: condition.label })], on: { click: () => shell.openConditions() }
    }, scope)) }) : node("p", { className: "ve-pf2e-no-conditions", text: text(commands, "No active conditions.", "VEMOBILE.PF2E.Character.NoActiveConditions") })
  ] });
}

/** A locally owned sub-sheet: live snapshots update rows without closing it or losing scroll. */
function openConditionsOverlay(shell, ownerScope, overlayHost) {
  if (ownerScope.disposed || !shell.actor || shell.conditionModal) return;
  const scope = ownerScope.child("pf2e-conditions-overlay");
  const commands = shell.conditionCommands;
  const title = text(commands, "Conditions", "VEMOBILE.PF2E.Character.Section.Conditions");
  const status = node("p", { className: "ve-action-status", attrs: { role: "status", "aria-live": "polite" } });
  const body = node("div", { className: "ve-pf2e-condition-options" });
  const modal = { sourceUuid: shell.actor.sourceUuid, pending: new Set(), rowScope: null };
  shell.conditionModal = modal;
  modal.close = (restoreFocus = true) => {
    scope.dispose();
    if (shell.conditionModal === modal) shell.conditionModal = null;
    if (restoreFocus && !ownerScope.disposed) shell.screen.querySelector?.('[data-pf2e-focus-key="conditions-open"]')?.focus?.({ preventScroll: true });
  };
  const close = node("button", { attrs: { type: "button", "aria-label": text(commands, "Close", "VEMOBILE.Controls.Close") }, children: [icon("fa-xmark")], on: { click: () => modal.close() } }, scope);
  const dialog = node("section", { className: "ve-pf2e-conditions-dialog", attrs: { role: "dialog", "aria-modal": "true", "aria-label": title }, children: [
    node("header", { children: [icon("fa-heart-pulse"), node("h2", { text: title }), close] }), status, body
  ] });
  const layer = node("div", { className: "ve-pf2e-conditions-layer", children: [dialog], on: { click: event => { if (event.target === layer) modal.close(); } } }, scope);
  scope.own(() => { layer.remove(); if (shell.conditionModal === modal) shell.conditionModal = null; });
  // Above the entire frame, including both Tablet Split panes and navigation.
  const host = shell.screen.closest?.(".ve-mobile-app") ?? overlayHost ?? shell.screen;
  host.append(layer);
  scope.listen(layer, "keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); modal.close(); }
    if (event.key === "Tab") {
      const buttons = [...layer.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0], last = buttons.at(-1), focused = layer.ownerDocument?.activeElement;
      if (event.shiftKey && focused === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && focused === last) { event.preventDefault(); first?.focus(); }
    }
  });
  modal.render = () => {
    if (scope.disposed) return;
    const scroll = body.scrollTop ?? 0;
    const focusedKey = body.contains?.(body.ownerDocument?.activeElement) ? body.ownerDocument.activeElement.dataset.conditionFocus : null;
    modal.rowScope?.dispose();
    modal.rowScope = scope.child("condition-rows");
    const choices = conditionChoices(shell.actor);
    const firstInactive = choices.findIndex(condition => !condition.active);
    body.replaceChildren(...choices.flatMap((condition, index) => [
      ...(index === firstInactive && index > 0 ? [node("div", { className: "ve-pf2e-condition-divider", attrs: { role: "separator" } })] : []),
      conditionOverlayRow(condition, shell, modal, status, modal.rowScope, scope)
    ]));
    body.scrollTop = scroll;
    modal.focusKey = focusedKey || modal.focusKey;
    const focusTarget = [...(body.querySelectorAll?.("[data-condition-focus]") ?? [])].find(button => button.dataset.conditionFocus === modal.focusKey);
    if (focusTarget && !focusTarget.disabled) focusTarget.focus?.({ preventScroll: true });
  };
  modal.render();
  close.focus?.({ preventScroll: true });
}

function conditionOverlayRow(condition, shell, modal, status, rowScope, scope) {
  const commands = shell.conditionCommands;
  const editable = can(shell.actor, "conditions") && !condition.locked && !modal.pending.has(condition.slug);
  const change = async direction => {
    if (scope.disposed || shell.actor?.sourceUuid !== modal.sourceUuid || !can(shell.actor, "conditions") || modal.pending.has(condition.slug)) return;
    const current = conditionChoices(shell.actor).find(row => row.slug === condition.slug);
    if (!current || current.locked || (direction < 0 && !current.active)) return;
    modal.pending.add(condition.slug);
    modal.render();
    try { await issueCommand({ actor: shell.actor, command: ACTOR_COMMANDS.SET_PF2E_CONDITION, payload: { conditionId: condition.slug, direction }, commands: shell.conditionCommands, status, scope }); }
    finally { modal.pending.delete(condition.slug); if (!scope.disposed) modal.render(); }
  };
  const step = direction => node("button", { attrs: { type: "button", disabled: !editable || (direction < 0 && !condition.active),
    "data-condition-focus": `${condition.slug}:${direction}`, "aria-label": localizedText(commands.localize, direction < 0 ? "VEMOBILE.PF2E.Character.Action.DecreaseCondition" : "VEMOBILE.PF2E.Character.Action.IncreaseCondition", direction < 0 ? "Decrease {condition}" : "Increase {condition}", { condition: condition.label }) },
    children: [icon(direction < 0 ? "fa-minus" : "fa-plus")], on: { click: () => change(direction) } }, rowScope);
  const controls = condition.slug === "persistent-damage" ? node("button", { attrs: { type: "button",
    "aria-label": `${text(commands, "Persistent damage", "VEMOBILE.PF2E.PersistentDamage.Title")}` }, children: [icon("fa-pen-to-square")], on: { click: () => {
      modal.close(false); shell.openPersistentDamage();
    } } }, rowScope)
    : condition.valued ? node("div", { className: "ve-pf2e-condition-steps", attrs: { role: "group", "aria-label": condition.label }, children: [step(-1), node("strong", { text: number(commands, condition.active ? condition.value : 0) }), step(1)] })
    : node("button", { className: "ve-pf2e-condition-switch", attrs: { type: "button", role: "switch", "aria-label": condition.label, "aria-checked": String(Boolean(condition.active)), disabled: !editable, "data-condition-focus": `${condition.slug}:toggle` },
      children: [node("span", { attrs: { "aria-hidden": "true" } })], on: { click: () => change(condition.active ? -1 : 1) } }, rowScope);
  return node("div", { className: `ve-pf2e-condition-option${condition.active ? " is-active" : ""}`, dataset: { conditionSlug: condition.slug }, children: [
    conditionArt(condition, commands), node("span", { className: "ve-pf2e-condition-name", text: condition.label }), controls
  ] });
}

function actionButton(commands, label, iconName, onClick, scope, disabled = false, accessibleLabel = null, isEnabled = null) {
  const localizedLabel = ACTION_LABELS[label] ? text(commands, label, ACTION_LABELS[label]) : label;
  return node("button", { className: "ve-pf2e-action-button", attrs: { type: "button", disabled, "aria-label": accessibleLabel ?? localizedLabel },
    on: { click: async event => {
      const button = event.currentTarget;
      if (button.disabled) return;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      try { await onClick(button); }
      finally { if (!scope.disposed && button.isConnected !== false) { button.disabled = isEnabled ? !isEnabled() : false; button.removeAttribute("aria-busy"); } }
    } }, children: [iconName ? icon(iconName) : null, node("span", { text: localizedLabel })]
  }, scope);
}

function rollButton(label, meta, onClick, scope, enabled) {
  return node("button", { className: "ve-quick-roll ve-pf2e-roll", attrs: { type: "button", disabled: !enabled }, on: { click: async event => {
    const button = event.currentTarget;
    if (button.disabled) return;
    button.disabled = true;
    try { await onClick(button); } finally { if (!scope.disposed && button.isConnected !== false) button.disabled = false; }
  } },
    children: [icon("fa-dice-d20"), node("span", { children: [node("strong", { text: label }), node("small", { text: meta })] })]
  }, scope);
}

async function issueCommand({ button, actor, command, payload, commands, status, scope, resultLabel = "", actionSession = false, isEnabled = null }) {
  if (scope.disposed || button?.disabled) return;
  if (button) { button.disabled = true; button.classList.add("is-pending"); button.setAttribute("aria-busy", "true"); }
  status.classList.remove("is-error", "is-success");
  status.textContent = "";
  let rollId = null;
  let openedRootId = "";
  // A roll popup or resource publication replaces the pane during its own
  // action. Result ownership belongs to the retained character shell.
  const current = () => commands.pf2eActionCurrent?.(actor.sourceUuid) ?? !scope.disposed;
  const onActionSession = session => {
    const id = String(session?.rootMessageId ?? "");
    if (!id || id === openedRootId || !current()) return;
    openedRootId = id;
    commands.openActionSession(session, "character");
  };
  try {
    if (resultLabel) rollId = commands.showRollResult({ label: resultLabel, total: 0, pending: true });
    const output = await commands.execute(command, { actorSourceUuid: actor.sourceUuid, ...payload }, actionSession ? { onActionSession } : {});
    if (!current()) return;
    status.textContent = "";
    if (output?.actionSession) onActionSession(output.actionSession);
    else if (output?.rollResult && resultLabel) {
      if (rollId) commands.updateRollResult(rollId, { label: resultLabel, ...output.rollResult, pending: false });
      else commands.showRollResult({ label: resultLabel, ...output.rollResult });
    } else if (rollId) commands.dismissRollResult(rollId);
  } catch (error) {
    if (rollId) commands.dismissRollResult(rollId);
    if (current()) { status.classList.add("is-error"); status.textContent = error?.message ?? text(commands, "That action could not be completed.", "VEMOBILE.PF2E.Character.ActionFailed"); }
  } finally {
    if (button && !scope.disposed) { button.disabled = isEnabled ? !isEnabled() : false; button.classList.remove("is-pending"); button.removeAttribute("aria-busy"); }
  }
}

function execute(commands, command, actor, payload, status, scope) {
  const details = command === ACTOR_COMMANDS.OPEN_ITEM_SHEET && commands.openPf2eItemDetails;
  const result = details ? details({ actorSourceUuid: actor.sourceUuid, ...payload })
    : commands.execute(command, { actorSourceUuid: actor.sourceUuid, ...payload });
  return Promise.resolve(result).catch(error => {
    if (!scope.disposed) {
      status.classList.add("is-error");
      status.textContent = error?.message ?? text(commands, "That action could not be completed.", "VEMOBILE.PF2E.Character.ActionFailed");
    }
  });
}

function can(actor, capability, slug = null) {
  const value = actor?.capabilities?.[capability];
  return Array.isArray(value) ? (!slug || value.includes(slug)) : value === true;
}

function canItem(actor, id) {
  const value = actor?.capabilities?.useItem;
  return value === true || (Array.isArray(value) && value.includes(id));
}

function sectionHeading(commands, label, iconName, action = null) {
  return node("header", { className: "ve-sheet-card-heading", children: [icon(iconName), node("h3", { text: SECTION_LABELS[label] ? text(commands, label, SECTION_LABELS[label]) : label }), action] });
}

function statReadout(commands, label, key, value) {
  return node("div", { className: "ve-pf2e-stat-readout", children: [node("span", { text: text(commands, label, key) }), node("strong", { text: typeof value === "number" ? number(commands, value) : String(value ?? "—") })] });
}

function empty(commands) { return node("p", { className: "ve-empty", text: text(commands, "Nothing to show here.", "VEMOBILE.PF2E.Character.Empty") }); }
function text(commands, fallback, key) { return localizedText(commands?.localize, key, fallback); }
function number(commands, value) { return localizedNumber(Number(value ?? 0), commands?.locale ?? "en"); }
function modifier(value) { const n = Number(value); return Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n}` : "—"; }

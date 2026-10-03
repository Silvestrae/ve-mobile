import { localizedText, localizedCount, localizedNumber } from "../../ui/localized-text.mjs";
import { icon, node } from "../../ui/dom.mjs";
import { LONG_PRESS_DURATION_MS, LONG_PRESS_MOVEMENT_THRESHOLD } from "../../ui/long-press.mjs";
import { pulseHoldHaptic } from "../../ui/haptics.mjs";
import { currentFirstCombatants } from "./model.mjs";

export function renderCombat({ state, commands, scope }) {
  const combat = state.snapshot?.combat;
  if (!combat) return emptyCombat(localizedText(commands.localize, "VEMOBILE.Interface.Presenter.NoActiveCombat", "No active combat"), localizedText(commands.localize, "VEMOBILE.Interface.Presenter.JoinAnEncounterToSeeItsTurnOrderHere", "Join an encounter to see its turn order here."));
  const status = node("p", { className: "ve-combat-status", attrs: { role: "status", "aria-live": "polite" } });
  const list = node("ol", {
    className: "ve-combat-list",
    attrs: { "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.Presenter.CombatTurnOrder", "Combat turn order") },
    children: combat.combatants.map((combatant) => combatantRow(combat, combatant, commands, status, scope))
  });
  const endTurn = combat.canEndTurn ? node("button", {
    className: "ve-combat-end-turn ve-scene-combat-end-turn",
    attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.Presenter.EndTurn", "End Turn"), title: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.EndTurn", "End Turn") },
    on: { click: async (event) => {
      const button = event.currentTarget;
      if (button.disabled) return;
      button.disabled = true;
      status.classList.remove("is-error");
      status.textContent = localizedText(commands.localize, "VEMOBILE.Interface.Presenter.EndingTurn", "Ending turn…");
      try {
        await commands.endCombatTurn(combat.id);
        if (!scope.disposed) status.textContent = localizedText(commands.localize, "VEMOBILE.Interface.Presenter.TurnEnded", "Turn ended.");
      } catch (error) {
        if (!scope.disposed) {
          status.classList.add("is-error");
          status.textContent = error?.message ?? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.FoundryCouldNotEndTheTurn", "Foundry could not end the turn.");
          button.disabled = false;
        }
      }
    } },
    children: endTurnContents(commands)
  }, scope) : null;

  return node("section", { className: "ve-combat-screen", children: [
    node("header", { className: "ve-combat-heading", children: [
      node("span", { className: "ve-combat-round", children: [node("small", { text: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Round", "Round") }), node("strong", { text: combat.round || "—" })] }),
      node("div", { className: "ve-combat-heading-copy", children: [node("h2", { text: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Combat", "Combat") }), node("p", { text: combat.started ? localizedCount(commands.localize, "VEMOBILE.Combat.Count", { one: "{count} combatant", other: "{count} combatants" }, combat.combatants.length, commands.readLocale?.() ?? "en") : localizedText(commands.localize, "VEMOBILE.Interface.Presenter.WaitingToBegin", "Waiting to begin") })] }),
      endTurn
    ].filter(Boolean) }),
    status,
    combat.combatants.length ? list : emptyCombat(localizedText(commands.localize, "VEMOBILE.Interface.Presenter.NoVisibleCombatants", "No visible combatants"), localizedText(commands.localize, "VEMOBILE.Interface.Presenter.TheEncounterHasNoCombatantsYouCanView", "The encounter has no combatants you can view."))
  ].filter(Boolean) });
}

export function renderSceneCombatCarousel({ combat, commands, scope, carouselState = createCombatCarouselUiState(), getSceneViewport = () => null }) {
  const collapsed = carouselState.synchronize(combat);
  const status = node("span", { className: "ve-scene-combat-status", attrs: { role: "status", "aria-live": "polite" } });
  const combatants = currentFirstCombatants(combat);
  const strip = node("div", {
    className: "ve-scene-combatants",
    attrs: { "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.Presenter.CombatantsDragHorizontallyToInspectTurnOrder", "Combatants; drag horizontally to inspect turn order") },
    children: combatants.map((entry) => node("div", {
      className: `ve-scene-combatant${entry.current ? " is-current" : ""}${entry.defeated ? " is-defeated" : ""}`,
      attrs: {
        title: entry.name,
        "aria-label": entry.current && entry.defeated ? localizedText(commands.localize, "VEMOBILE.Combat.CurrentDefeated", "{name}, current turn, defeated", { name: entry.name }) : entry.current ? localizedText(commands.localize, "VEMOBILE.Combat.Current", "{name}, current turn", { name: entry.name }) : entry.defeated ? localizedText(commands.localize, "VEMOBILE.Combat.DefeatedName", "{name}, defeated", { name: entry.name }) : entry.name,
        "aria-current": entry.current ? "step" : undefined,
        "data-ve-combatant-id": entry.id,
        "data-ve-scene-control": true
      },
      children: [
        entry.img ? node("img", { attrs: { src: entry.img, alt: "", draggable: "false" } }) : icon("fa-user"),
        entry.initiative === null ? null : node("strong", { text: formatInitiative(entry.initiative, combat.initiativeDecimals, commands.readLocale?.() ?? "en") }),
        entry.defeated ? node("i", { className: "fa-solid fa-skull ve-scene-combatant-defeated", attrs: { "aria-hidden": "true" } }) : null
      ].filter(Boolean)
    }))
  });
  const viewport = node("div", {
    className: "ve-scene-combatant-viewport",
    attrs: { "data-ve-scene-control": true },
    children: [strip]
  });
  const round = node("button", {
    className: "ve-scene-combat-round",
    attrs: {
      type: "button",
      title: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Round2", "Round {round}", { round: (combat.round) }),
      "aria-label": collapsed ? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.ExpandCombatCarousel", "Expand Combat Carousel") : localizedText(commands.localize, "VEMOBILE.Interface.Presenter.CollapseCombatCarousel", "Collapse Combat Carousel"),
      "aria-pressed": String(!collapsed),
      "data-ve-scene-control": true
    },
    children: [
      node("span", { className: "ve-scene-combat-round-label", text: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Round", "Round") }),
      node("strong", { className: "ve-scene-combat-round-value", text: combat.round }),
      node("i", { className: `fa-solid ${collapsed ? "fa-chevron-right" : "fa-chevron-left"} ve-scene-combat-round-chevron`, attrs: { "aria-hidden": "true" } })
    ]
  }, scope);
  const endTurn = node("button", {
    className: "ve-scene-combat-end-turn",
    attrs: {
      type: "button",
      "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.Presenter.EndTurn", "End Turn"),
      title: combat.canEndTurn ? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.EndTurn", "End Turn") : localizedText(commands.localize, "VEMOBILE.Interface.Presenter.YouCannotEndThisTurn", "You cannot end this turn"),
      "aria-disabled": String(!combat.canEndTurn),
      disabled: !combat.canEndTurn,
      "data-ve-scene-control": true
    },
    on: { click: async (event) => {
      const button = event.currentTarget;
      if (button.disabled) return;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      try { await commands.endCombatTurn(combat.id); }
      catch (error) {
        if (!scope.disposed) {
          status.textContent = error?.message ?? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.CouldNotEndTurn", "Could not end turn.");
          button.disabled = false;
        }
      } finally {
        if (!scope.disposed) button.removeAttribute("aria-busy");
      }
    } },
    children: endTurnContents(commands)
  }, scope);
  const carousel = node("aside", {
    className: "ve-scene-combat-carousel",
    attrs: { "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.Presenter.RoundCombatTurnOrder", "Round {round} combat turn order", { round: (combat.round) }), "data-ve-scene-control": true },
    children: [
      round,
      viewport,
      endTurn,
      status
    ]
  });
  const applyCollapsed = (value) => {
    carousel.classList.toggle("is-collapsed", value);
    round.setAttribute("aria-label", value ? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.ExpandCombatCarousel", "Expand Combat Carousel") : localizedText(commands.localize, "VEMOBILE.Interface.Presenter.CollapseCombatCarousel", "Collapse Combat Carousel"));
    round.setAttribute("aria-pressed", String(!value));
    round.classList.toggle("is-expanded", !value);
    const chevron = round.querySelector(".ve-scene-combat-round-chevron");
    chevron?.classList.toggle("fa-chevron-left", !value);
    chevron?.classList.toggle("fa-chevron-right", value);
    endTurn.hidden = value;
    for (const combatant of strip.children) combatant.hidden = value && !combatant.classList.contains("is-current");
    if (!value) drag.reset();
  };
  scope.listen(round, "click", () => applyCollapsed(carouselState.toggle()));
  const actionFor = (combatantId, capability, action, fallback) => {
    const combatant = combatants.find((entry) => entry.id === combatantId);
    if (!combatant?.[capability]) return;
    void Promise.resolve(action(combatantId)).catch((error) => {
      if (!scope.disposed) status.textContent = error?.message ?? fallback;
    });
  };
  const drag = bindCombatantCarouselDrag(viewport, scope, {
    rail: strip,
    onTap: (combatantId) => actionFor(combatantId, "canFocus", (id) => commands.centerCombatant(combat.id, id, getSceneViewport()), localizedText(commands.localize, "VEMOBILE.Interface.Presenter.CouldNotCenterThatCombatant", "Could not center that combatant.")),
    onLongPress: (combatantId) => actionFor(combatantId, "canTarget", (id) => commands.targetCombatant(combat.id, id), localizedText(commands.localize, "VEMOBILE.Interface.Presenter.CouldNotChangeThatTarget", "Could not change that target."))
  });
  applyCollapsed(collapsed);
  return carousel;
}

function endTurnContents(commands) {
  return [
    node("span", { className: "ve-scene-combat-end-turn-copy ve-scene-combat-end-turn-line", text: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.EndTurn", "End Turn") }),
    node("span", { className: "ve-scene-combat-end-turn-chevron", children: [icon("fa-chevron-right")] })
  ];
}

/** Scene-lifetime UI state; intentionally separate from authoritative Combat state. */
export function createCombatCarouselUiState() {
  let combatId = "";
  let collapsed = false;
  return Object.freeze({
    synchronize(combat) {
      const nextCombatId = String(combat?.id ?? "");
      if (!nextCombatId || nextCombatId !== combatId) collapsed = false;
      combatId = nextCombatId;
      return collapsed;
    },
    toggle() {
      collapsed = !collapsed;
      return collapsed;
    },
    reset() {
      combatId = "";
      collapsed = false;
    },
    get collapsed() { return collapsed; }
  });
}

/** Shared 500ms press, tap, and horizontal-drag arbitration for the portrait rail. */
export function bindCombatantCarouselDrag(viewport, scope, {
  rail = viewport,
  movementThreshold = LONG_PRESS_MOVEMENT_THRESHOLD,
  longPressMs = LONG_PRESS_DURATION_MS,
  onTap = () => {},
  onLongPress = () => {},
  getCombatantId = combatantIdFromPointer,
  getWindow = () => globalThis.window,
  getDocument = () => globalThis.document,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
  haptic = pulseHoldHaptic
} = {}) {
  const eventWindow = getWindow() ?? viewport;
  const eventDocument = getDocument();
  let drag = null;
  let suppressTap = false;
  let railOffset = 0;
  const cancel = () => {
    const active = drag;
    drag = null;
    if (active?.timer !== null && active?.timer !== undefined) clearTimeoutFn(active.timer);
    if (active?.captured) viewport.releasePointerCapture?.(active.pointerId);
  };
  const armLongPress = (interaction) => {
    if (!interaction.combatantId) return;
    interaction.timer = setTimeoutFn(() => {
      if (drag !== interaction || interaction.dragged || interaction.longPressed || scope.disposed) return;
      interaction.timer = null;
      interaction.longPressed = true;
      suppressTap = true;
      haptic?.();
      onLongPress(interaction.combatantId);
    }, Math.max(0, Number(longPressMs) || LONG_PRESS_DURATION_MS));
  };
  const pointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    cancel();
    let captured = false;
    try {
      if (typeof viewport.setPointerCapture === "function") {
        viewport.setPointerCapture(event.pointerId);
        captured = true;
      }
    } catch { /* Pointer capture is an optional enhancement. */ }
    drag = {
      pointerId: event.pointerId,
      x: Number(event.clientX),
      offset: railOffset,
      combatantId: String(getCombatantId(event) ?? ""),
      dragged: false,
      longPressed: false,
      timer: null,
      captured
    };
    armLongPress(drag);
    event.preventDefault?.();
    event.stopPropagation?.();
  };
  const pointerMove = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.longPressed) {
      event.preventDefault?.();
      event.stopPropagation?.();
      return;
    }
    const delta = Number(event.clientX) - drag.x;
    if (!drag.dragged && Math.abs(delta) < movementThreshold) return;
    drag.dragged = true;
    if (drag.timer !== null && drag.timer !== undefined) clearTimeoutFn(drag.timer);
    drag.timer = null;
    railOffset = clampCarouselRailOffset(drag.offset - delta, viewport, rail);
    rail.style.transform = `translate3d(${-railOffset}px, 0, 0)`;
    event.preventDefault?.();
    event.stopPropagation?.();
  };
  const pointerEnd = (event, cancelled = false) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const active = drag;
    suppressTap ||= active.dragged || active.longPressed;
    cancel();
    if (!cancelled && active.combatantId && !active.dragged && !active.longPressed) onTap(active.combatantId);
  };
  const click = (event) => {
    if (!suppressTap) return;
    suppressTap = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const reset = () => {
    railOffset = 0;
    rail.style.transform = "";
    cancel();
  };
  scope.listen(viewport, "pointerdown", pointerDown, { passive: false });
  scope.listen(eventWindow, "pointermove", pointerMove, { passive: false });
  scope.listen(eventWindow, "pointerup", pointerEnd, { passive: true });
  scope.listen(eventWindow, "pointercancel", (event) => pointerEnd(event, true), { passive: true });
  scope.listen(viewport, "lostpointercapture", (event) => pointerEnd(event, true), { passive: true });
  scope.listen(eventWindow, "pagehide", cancel, { passive: true });
  scope.listen(eventWindow, "blur", cancel, { passive: true });
  if (eventDocument) scope.listen(eventDocument, "visibilitychange", () => {
    if (eventDocument.hidden) cancel();
  }, { passive: true });
  scope.listen(viewport, "click", click, { capture: true });
  scope.own(reset);
  return Object.freeze({ reset });
}

function combatantIdFromPointer(event) {
  return event.target?.closest?.("[data-ve-combatant-id]")?.getAttribute?.("data-ve-combatant-id") ?? "";
}

function clampCarouselRailOffset(offset, viewport, rail) {
  const visibleWidth = Number(viewport.clientWidth ?? viewport.offsetWidth ?? 0);
  const railWidth = Number(rail.scrollWidth ?? rail.offsetWidth ?? 0);
  const maximum = visibleWidth > 0 && railWidth > visibleWidth ? railWidth - visibleWidth : Number.MAX_SAFE_INTEGER;
  return Math.min(Math.max(0, Number(offset) || 0), maximum);
}

function combatantRow(combat, combatant, commands, status, scope) {
  const run = async (button, action) => {
    button.disabled = true;
    status.classList.remove("is-error");
    status.textContent = "";
    try { await action(); }
    catch (error) {
      if (!scope.disposed) {
        status.classList.add("is-error");
        status.textContent = error?.message ?? localizedText(commands.localize, "VEMOBILE.Interface.Presenter.TheCombatActionFailed", "The combat action failed.");
      }
    } finally {
      if (!scope.disposed) button.disabled = false;
    }
  };
  const controls = [];
  if (combatant.canRollInitiative) controls.push(node("button", {
    className: "ve-combat-roll-initiative",
    attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.Presenter.RollInitiativeFor", "Roll initiative for {name}", { name: (combatant.name) }), title: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.RollInitiative", "Roll initiative") },
    on: { click: (event) => run(event.currentTarget, () => commands.rollCombatInitiative(combat.id, combatant.id)) },
    children: [icon("fa-dice-d20")]
  }, scope));
  if (combatant.canTarget) controls.push(node("button", {
    attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Target", "Target {name}", { name: (combatant.name) }), title: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Target2", "Target") },
    on: { click: (event) => run(event.currentTarget, () => commands.targetCombatant(combat.id, combatant.id)) },
    children: [icon("fa-bullseye")]
  }, scope));
  if (combatant.canFocus) controls.push(node("button", {
    attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Focus", "Focus {name}", { name: (combatant.name) }), title: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Focus2", "Focus") },
    on: { click: (event) => run(event.currentTarget, () => commands.focusCombatant(combat.id, combatant.id)) },
    children: [icon("fa-arrows-to-eye")]
  }, scope));
  return node("li", {
    className: `${combatant.current ? "is-current" : ""}${combatant.defeated ? " is-defeated" : ""}`,
    attrs: { "aria-current": combatant.current ? "step" : undefined },
    children: [
      node("span", { className: "ve-combat-portrait", children: [combatant.img ? node("img", { attrs: { src: combatant.img, alt: "" } }) : icon("fa-user")] }),
      node("div", { className: "ve-combat-name", children: [node("strong", { text: combatant.name }), combatant.defeated ? node("small", { text: localizedText(commands.localize, "VEMOBILE.Interface.Presenter.Defeated", "Defeated") }) : null].filter(Boolean) }),
      combatant.initiative === null ? node("span", { className: "ve-combat-initiative is-empty", text: "—" }) : node("span", { className: "ve-combat-initiative", text: formatInitiative(combatant.initiative, combat.initiativeDecimals, commands.readLocale?.() ?? "en") }),
      controls.length ? node("div", { className: "ve-combat-row-controls", children: controls }) : null
    ].filter(Boolean)
  });
}

function emptyCombat(title, detail) {
  return node("div", { className: "ve-combat-empty", children: [icon("fa-shield-halved"), node("h2", { text: title }), node("p", { text: detail })] });
}

export function formatInitiative(value, decimals = 0, locale = "en") {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return localizedNumber(Number(value), locale, Number(decimals) === 2 ? 2 : 0);
}

import { localizedText } from "../../ui/localized-text.mjs";
import { node } from "../../ui/dom.mjs";
import { LONG_PRESS_DURATION_MS, LONG_PRESS_MOVEMENT_THRESHOLD } from "../../ui/long-press.mjs";
import { pulseHoldHaptic } from "../../ui/haptics.mjs";

/** Shared portrait/chooser gesture; permission and token creation stay at the command boundary. */
export function bindActorPlacementHold({ portrait, actor, actors, chooser, menuHost, state, commands, scope, closeChooser }) {
  const document = portrait.ownerDocument;
  const window = document.defaultView ?? globalThis.window;
  const split = state.formFactor === "tablet" && state.splitScreen && state.route === "characters";
  const sourceOf = (entry) => String(entry?.sourceUuid ?? (entry?.id ? `Actor.${entry.id}` : ""));
  const directory = new Map(actors.map((entry) => [sourceOf(entry), entry]));
  const selectedSource = String(state.snapshot?.selectedActor?.sourceUuid ?? sourceOf(actor));
  let press = null;
  let ghost = null;
  let suppress = null;
  let menuSource = "";
  const actionMenu = split ? null : node("div", { className: "ve-portrait-action-menu",
    attrs: { hidden: true, "data-ve-back-dismissable": "true", "data-ve-back-kind": "portrait-actions" },
    children: [node("button", { attrs: { type: "button" }, children: [node("span", {
      text: commands.localize?.("VEMOBILE.Character.PlaceOnScene", "Place on Scene") ?? localizedText(commands.localize, "VEMOBILE.Character.PlaceOnScene", "Place on Scene")
    })] }, scope)] });
  if (actionMenu) {
    (portrait.closest(".ve-mobile-app") ?? menuHost).append(actionMenu);
    scope.listen(actionMenu.querySelector("button"), "click", () => {
      const source = menuSource;
      closeMenu();
      if (source) void commands.beginActorTokenPlacement(source, selectedSource);
    });
    scope.listen(actionMenu, "ve-close", closeMenu);
  }
  portrait.title = split
    ? commands.localize?.("VEMOBILE.Character.HoldDragScene", "Hold and drag to Scene to create a token") ?? localizedText(commands.localize, "VEMOBILE.Character.HoldDragScene", "Hold and drag to Scene to create a token")
    : commands.localize?.("VEMOBILE.Character.HoldActions", "Hold for portrait actions") ?? localizedText(commands.localize, "VEMOBILE.Character.HoldActions", "Hold for portrait actions");
  portrait.querySelector("img")?.setAttribute("draggable", "false");

  function closeMenu() { if (actionMenu) actionMenu.hidden = true; menuSource = ""; }
  function clearGhost() { ghost?.remove(); ghost = null; }
  function cancel() {
    if (!press) return;
    const current = press;
    press = null;
    current.scope.dispose();
    clearGhost();
  }
  function sceneTarget(x, y) {
    const element = document.elementFromPoint?.(x, y);
    const surface = element?.closest?.(".ve-split-scene-viewport .ve-scene-screen");
    if (!surface || element.closest("button, a, [role='toolbar'], .ve-scene-combat-carousel, .ve-quickbar")) return null;
    return surface;
  }
  function sceneGeometryCurrent(current) {
    if (!split) return true;
    const bounds = document.querySelector(".ve-split-scene-viewport .ve-scene-screen")?.getBoundingClientRect?.();
    return Boolean(bounds && current.sceneBounds && ["x", "y", "width", "height"]
      .every((key) => Math.abs(bounds[key] - current.sceneBounds[key]) <= 2));
  }
  function positionGhost(current, x, y) {
    if (!ghost) {
      ghost = node("div", { className: "ve-portrait-token-ghost",
        attrs: { "data-ve-back-dismissable": "true", "data-ve-back-kind": "actor-token-drag" },
        children: [node("img", { attrs: { src: current.actor.img, alt: "", draggable: "false" } })] });
      portrait.closest(".ve-mobile-app")?.append(ghost);
      current.scope.listen(ghost, "ve-close", cancel);
    }
    if (ghost) { ghost.style.left = `${x}px`; ghost.style.top = `${y}px`; }
  }
  function lockScroll(current) {
    for (const scroller of [portrait.closest(".ve-viewport"), current.row && chooser].filter(Boolean)) {
      const overflow = scroller.style.overflowY;
      const top = scroller.scrollTop;
      scroller.style.overflowY = "hidden";
      current.scope.own(() => { scroller.style.overflowY = overflow; scroller.scrollTop = top; });
    }
    current.target.classList.add("is-actor-placement-armed");
    current.scope.own(() => current.target.classList.remove("is-actor-placement-armed"));
    const priorBack = current.target.getAttribute("data-ve-back-dismissable");
    current.target.setAttribute("data-ve-back-dismissable", "true");
    current.scope.own(() => {
      if (priorBack === null) current.target.removeAttribute("data-ve-back-dismissable");
      else current.target.setAttribute("data-ve-back-dismissable", priorBack);
    });
    current.scope.listen(current.target, "ve-close", cancel);
    if (split && current.row) {
      // The chooser covers Scene. Keep it mounted for capture, but expose Scene to hit testing.
      chooser.classList.add("is-actor-placement-dragging");
      current.scope.own(() => chooser.classList.remove("is-actor-placement-dragging"));
    }
    try { current.target.setPointerCapture?.(current.id); } catch { /* document listeners retain ownership */ }
    current.scope.own(() => { try { current.target.releasePointerCapture?.(current.id); } catch { /* source may detach */ } });
  }
  function arm(current) {
    if (press !== current || !current.target.isConnected || !commands.canPlaceActorToken?.(current.source)) { cancel(); return; }
    current.armed = true;
    current.sceneBounds = document.querySelector(".ve-split-scene-viewport .ve-scene-screen")?.getBoundingClientRect?.() ?? null;
    lockScroll(current);
    if (split) positionGhost(current, current.x, current.y);
    pulseHoldHaptic();
  }
  function resolveTarget(target) {
    if (portrait.contains(target)) return { target: portrait, actor, source: selectedSource, row: false };
    const row = target?.closest?.(".ve-character-menu-actor");
    if (!row || !chooser.contains(row)) return null;
    const childControl = target.closest?.("button, a, summary, input, select, textarea, [role='button']");
    if (childControl && childControl !== row) return null;
    const source = row.getAttribute("data-actor-source");
    const rowActor = directory.get(source);
    return rowActor ? { target: row, actor: rowActor, source, row: true } : null;
  }
  function pointerDown(event) {
    if ((event.button !== undefined && event.button !== 0) || press) return;
    const origin = resolveTarget(event.target);
    if (!origin?.source || !commands.canPlaceActorToken?.(origin.source)) return;
    closeMenu();
    const owner = scope.child("actor-placement-press");
    const current = { ...origin, scope: owner, id: event.pointerId, touchId: null,
      x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY,
      armed: false, dragging: false, sceneBounds: null };
    press = current;
    owner.timeout(() => arm(current), LONG_PRESS_DURATION_MS);
  }
  function move(x, y) {
    const current = press;
    if (!current) return;
    if (!current.target.isConnected) { cancel(); return; }
    current.lastX = x; current.lastY = y;
    if (!commands.canPlaceActorToken?.(current.source)) { cancel(); return; }
    const distance = Math.hypot(x - current.x, y - current.y);
    if (!current.armed) {
      if (distance >= LONG_PRESS_MOVEMENT_THRESHOLD) {
        suppress = { target: current.target, id: current.id, until: Date.now() + 1000 };
        cancel();
      }
      return;
    }
    if (distance >= LONG_PRESS_MOVEMENT_THRESHOLD) current.dragging = true;
    if (!split) return;
    if (!sceneGeometryCurrent(current)) { cancel(); return; }
    positionGhost(current, x, y);
    ghost?.classList.toggle("is-valid", Boolean(sceneTarget(x, y)));
  }
  function release(x, y) {
    const current = press;
    if (!current) return;
    if (current.armed) suppress = { target: current.target, id: current.id, until: Date.now() + 1000 };
    const valid = current.armed && current.target.isConnected
      && commands.canPlaceActorToken?.(current.source) && sceneGeometryCurrent(current);
    const drop = valid && split && current.dragging && sceneTarget(x, y);
    const showMenu = valid && !split && !current.dragging;
    const source = current.source;
    const row = current.row;
    cancel();
    if (drop) {
      if (row) closeChooser();
      void commands.dropActorToken(source, { x, y }, selectedSource)
        .catch((error) => commands.reportCharacterMutationError?.(error));
    } else if (showMenu) {
      if (row) closeChooser();
      menuSource = source;
      actionMenu.style.left = `${Math.max(8, Math.min(x, (window?.innerWidth ?? 400) - 178))}px`;
      actionMenu.style.top = `${Math.max(8, Math.min(y + 8, (window?.innerHeight ?? 800) - 56))}px`;
      actionMenu.hidden = false;
    }
  }
  function activeTouch(event) {
    if (!press) return null;
    const changed = Array.from(event.changedTouches ?? []);
    if (press.touchId === null && event.type === "touchstart" && resolveTarget(event.target)?.target === press.target) {
      press.touchId = changed[0]?.identifier ?? null;
    }
    return changed.find((touch) => touch.identifier === press.touchId) ?? null;
  }
  // Install before contact. Changing touch-action after pointerdown cannot reclaim Android panning.
  scope.listen(document, "touchmove", (event) => {
    const touch = activeTouch(event);
    if (!touch) return;
    if (press?.armed && event.cancelable) event.preventDefault();
    move(touch.clientX, touch.clientY);
  }, { capture: true, passive: false });
  scope.listen(document, "touchstart", activeTouch, { capture: true, passive: true });
  scope.listen(document, "touchend", (event) => {
    const touch = activeTouch(event);
    if (touch) release(touch.clientX, touch.clientY);
  }, { capture: true, passive: true });
  scope.listen(document, "touchcancel", (event) => { if (activeTouch(event)) cancel(); }, { capture: true, passive: true });
  scope.listen(portrait, "pointerdown", pointerDown);
  scope.listen(chooser, "pointerdown", pointerDown);
  scope.listen(document, "pointermove", (event) => { if (press?.id === event.pointerId) move(event.clientX, event.clientY); }, { capture: true, passive: true });
  scope.listen(document, "pointerup", (event) => { if (press?.id === event.pointerId) release(event.clientX, event.clientY); }, { capture: true, passive: true });
  scope.listen(document, "pointercancel", (event) => { if (press?.id === event.pointerId) cancel(); }, { capture: true, passive: true });
  scope.listen(document, "dragstart", (event) => { if (press && press.target.contains(event.target)) event.preventDefault(); }, { capture: true });
  scope.listen(document, "selectstart", (event) => { if (press?.armed && press.target.contains(event.target)) event.preventDefault(); }, { capture: true });
  scope.listen(document, "contextmenu", (event) => { if (resolveTarget(event.target)) event.preventDefault(); }, { capture: true });
  scope.listen(document, "click", (event) => {
    if (!suppress) return;
    if (Date.now() > suppress.until) { suppress = null; return; }
    const hasPointerId = Number.isInteger(event.pointerId) && event.pointerId !== 0;
    if ((hasPointerId && event.pointerId === suppress.id)
      || (!hasPointerId && (suppress.target === event.target || suppress.target.contains(event.target)))) {
      suppress = null;
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, { capture: true });
  scope.listen(document, "pointerdown", (event) => {
    if (actionMenu && !actionMenu.hidden && !actionMenu.contains(event.target) && !portrait.contains(event.target)) closeMenu();
  }, { capture: true, passive: true });
  scope.listen(window, "blur", cancel);
  scope.listen(window, "pagehide", cancel);
  scope.listen(document, "visibilitychange", () => { if (document.hidden) cancel(); });
  scope.listen(document, "keydown", (event) => {
    if (press?.armed && ["Escape", "Backspace"].includes(event.key)) {
      event.preventDefault();
      cancel();
    }
  }, { capture: true });
  scope.own(() => { cancel(); actionMenu?.remove(); });
  return Object.freeze({ cancel, closeMenu });
}

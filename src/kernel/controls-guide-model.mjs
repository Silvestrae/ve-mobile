/** Static, audited copy keys. Context is a narrow presentation record, never diagnostics. */
export function controlsGuideSections({ presentation = "desktop", canvasAvailable = true, split = false, canPlaceActor = false, collective = false, actionBarSource = "character" } = {}) {
  const sections = [
    { id: "common", entries: ["Tap", "Hold", "Back", "Availability"] },
    ...(canvasAvailable ? [{ id: "scene", entries: ["Pan", "Select", "Target", "TokenHold", "TokenDrag", "Scenery", "Joystick"] }] : [{ id: "scene", entries: ["NoCanvas"] }]),
    { id: "character", entries: ["Portrait", "Chooser", "Rows", ...(collective ? ["Members"] : []), actionBarSource === "foundry" ? "Hotbar" : "Quickbar"] },
    { id: "placement", entries: ["Navigation", ...(canvasAvailable ? ["Preview", ...(canPlaceActor && !collective ? [split ? "SplitDrop" : "ActorPlace"] : [])] : [])] },
    { id: "layout", entries: [...(presentation === "desktop" ? ["DesktopReview", "Phone", "TabletSplit", "TabletFull"] : [ presentation === "phone" ? "Phone" : split ? "TabletSplit" : "TabletFull"])] }
  ];
  return Object.freeze(sections.map(section => Object.freeze({ ...section, entries: Object.freeze(section.entries) })));
}

export function controlsInvitationReady({ ready, state = {}, blocked = false, interacting = false } = {}) {
  return Boolean(ready && state.status === "ready" && ["phone", "tablet"].includes(state.formFactor)
    && !state.reconnect && !state.modeTransition && !state.templatePlacement && !state.nativeTokenPlacement
    && !state.actorTokenPlacement && !state.actionSession && !state.hitPointEditor && !state.restEditor
    && !state.spellSlotEditor && !state.xpEditor && !state.portraitImage && !state.journalImage
    && !state.characterItemId && !state.sceneChooserOpen && !blocked && !interacting);
}

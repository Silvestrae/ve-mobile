const ROUTES = new Set(["characters", "chat", "journals", "scene", "combat", "settings"]);

export const initialAppState = Object.freeze({
  route: "characters",
  routeHistory: Object.freeze([]),
  selectedActorId: "",
  selectedActorSourceUuid: "",
  characterTab: "overview",
  characterNavigation: Object.freeze([]),
  snapshot: null,
  status: "starting",
  error: "",
  rollResult: null,
  actionSession: null,
  actionSessionOrigin: "",
  characterItemId: "",
  expandedCharacterItemId: "",
  characterOpenSections: Object.freeze([]),
  characterDisclosureByContext: Object.freeze({}),
  hitPointEditor: "",
  restEditor: false,
  spellSlotEditor: null,
  xpEditor: false,
  portraitImage: null,
  journal: null,
  journalLoading: false,
  journalError: "",
  journalPageId: "",
  journalHeading: "",
  journalMenuOpen: false,
  journalImage: null,
  quickbarCollapsed: false,
  sceneChooserOpen: false,
  sceneChooserRevision: 0,
  splitScreen: false,
  splitScreenPreferred: true,
  canvasAvailable: true,
  splitSecondaryRoute: "characters",
  tabletNavSide: "right",
  formFactor: "phone",
  orientation: "portrait",
  templatePlacement: null,
  nativeTokenPlacement: null,
  actorTokenPlacement: null,
  reconnect: null,
  modeTransition: null,
  viewRevision: 0
});

export function reduceAppState(state, event) {
  switch (event.type) {
    case "session-loaded": {
      const legacyActors = event.snapshot?.actors ?? [];
      const legacySelectedId = legacyActors.some((actor) => actor.id === state.selectedActorId)
        ? state.selectedActorId
        : event.snapshot?.preferredActorId ?? legacyActors[0]?.id ?? "";
      const authoritativeSelection = Object.hasOwn(event.snapshot ?? {}, "selectedActor");
      const selectedActor = authoritativeSelection ? event.snapshot.selectedActor : legacyActors.find((actor) => actor.id === legacySelectedId) ?? null;
      const controlledActorId = authoritativeSelection ? "" : event.snapshot?.scene?.movement?.tokens
        ?.find((token) => token.controlled && legacyActors.some((actor) => actor.id === token.actorId))?.actorId ?? "";
      const effectiveSelectedActor = controlledActorId ? legacyActors.find((actor) => actor.id === controlledActorId) ?? selectedActor : selectedActor;
      const selectedActorSourceUuid = String(event.snapshot?.selectedActorSourceUuid ?? effectiveSelectedActor?.sourceUuid ?? (effectiveSelectedActor?.id ? `Actor.${effectiveSelectedActor.id}` : ""));
      const selectedActorId = String(effectiveSelectedActor?.id ?? "");
      const hadSelectedActor = Boolean(state.selectedActorSourceUuid || state.selectedActorId);
      const selectedActorChanged = hadSelectedActor && (state.selectedActorSourceUuid
        ? selectedActorSourceUuid !== state.selectedActorSourceUuid
        : selectedActorId !== state.selectedActorId);
      const itemStillExists = actorItems(effectiveSelectedActor).some((item) => item.id === state.characterItemId);
      const expandedItemStillExists = actorItems(effectiveSelectedActor).some((item) => item.id === state.expandedCharacterItemId);
      const journalSummary = event.snapshot?.journals?.find((journal) => journal.id === state.journal?.id);
      const journalStillExists = Boolean(journalSummary);
      const visiblePageIds = new Set(journalSummary?.pages?.map((page) => page.id) ?? []);
      const visiblePages = state.journal?.pages?.filter((page) => visiblePageIds.has(page.id)) ?? [];
      const activeJournal = journalStillExists ? Object.freeze({ ...state.journal, pages: Object.freeze(visiblePages) }) : null;
      const activePageId = visiblePageIds.has(state.journalPageId) ? state.journalPageId : visiblePages[0]?.id ?? "";
      return {
        ...state,
        snapshot: event.snapshot,
        selectedActorId,
        selectedActorSourceUuid,
        characterTab: event.characterTab ?? (selectedActorChanged ? "overview" : state.characterTab),
        characterNavigation: event.characterNavigation ?? (selectedActorChanged ? Object.freeze([]) : state.characterNavigation),
        rollResult: selectedActorChanged ? null : state.rollResult,
        characterItemId: !selectedActorChanged && itemStillExists ? state.characterItemId : "",
        expandedCharacterItemId: !selectedActorChanged && expandedItemStillExists ? state.expandedCharacterItemId : "",
        characterOpenSections: selectedActorChanged
          ? disclosureSections(state.characterDisclosureByContext, selectedActorSourceUuid, event.characterTab ?? "overview")
          : state.characterOpenSections,
        hitPointEditor: !selectedActorChanged && effectiveSelectedActor ? state.hitPointEditor : "",
        restEditor: !selectedActorChanged && effectiveSelectedActor ? state.restEditor : false,
        spellSlotEditor: !selectedActorChanged && effectiveSelectedActor ? state.spellSlotEditor : null,
        xpEditor: !selectedActorChanged && effectiveSelectedActor ? state.xpEditor : false,
        portraitImage: !selectedActorChanged && effectiveSelectedActor ? state.portraitImage : null,
        journal: activeJournal,
        journalLoading: journalStillExists ? state.journalLoading : false,
        journalError: journalStillExists ? state.journalError : "",
        journalPageId: journalStillExists ? activePageId : "",
        journalHeading: journalStillExists && activePageId === state.journalPageId ? state.journalHeading : "",
        journalMenuOpen: journalStillExists ? state.journalMenuOpen : false,
        journalImage: journalStillExists ? state.journalImage : null,
        status: "ready",
        error: ""
      };
    }
    case "session-error":
      return { ...state, status: "error", error: String(event.error?.message ?? event.error ?? "VEMOBILE.Errors.Unknown") };
    case "navigate": {
      const route = ROUTES.has(event.route) ? event.route : "characters";
      if ((state.templatePlacement || state.nativeTokenPlacement) && route !== "scene") return state;
      return state.route === route ? state : { ...state, route, routeHistory: pushRouteHistory(state.routeHistory, state.route), sceneChooserOpen: false, splitSecondaryRoute: route === "scene" ? state.splitSecondaryRoute : route, rollResult: route === "characters" ? state.rollResult : null, characterItemId: route === "characters" ? state.characterItemId : "", expandedCharacterItemId: route === "characters" ? state.expandedCharacterItemId : "", characterOpenSections: route === "characters" ? disclosureSections(state.characterDisclosureByContext, activeActorSource(state), state.characterTab) : [], hitPointEditor: route === "characters" ? state.hitPointEditor : "", restEditor: route === "characters" ? state.restEditor : false, spellSlotEditor: route === "characters" ? state.spellSlotEditor : null, xpEditor: route === "characters" ? state.xpEditor : false, portraitImage: route === "characters" ? state.portraitImage : null };
    }
    case "return-to-character": {
      if (state.route === "characters") return state;
      const next = reduceAppState(state, { type: "navigate", route: "characters" });
      return next === state ? state : { ...next, routeHistory: Object.freeze([]) };
    }
    case "navigate-back": {
      const prior = popRouteHistory(state.routeHistory);
      if (!prior.route || !ROUTES.has(prior.route)) return state;
      return { ...state, route: prior.route, routeHistory: prior.history, sceneChooserOpen: false, journal: prior.route === "journals" ? state.journal : null, journalPageId: prior.route === "journals" ? state.journalPageId : "", journalImage: null, characterItemId: "", expandedCharacterItemId: "", hitPointEditor: "", restEditor: false, spellSlotEditor: null, xpEditor: false, portraitImage: null };
    }
    case "select-actor":
      return { ...state, characterNavigation: Object.freeze([]), selectedActorId: event.actorId ?? state.selectedActorId, selectedActorSourceUuid: event.sourceUuid ?? state.selectedActorSourceUuid, characterTab: "overview", route: "characters", sceneChooserOpen: false, splitSecondaryRoute: "characters", rollResult: null, characterItemId: "", expandedCharacterItemId: "", characterOpenSections: disclosureSections(state.characterDisclosureByContext, event.sourceUuid ?? state.selectedActorSourceUuid, "overview"), hitPointEditor: "", restEditor: false, spellSlotEditor: null, xpEditor: false, portraitImage: null };
    case "select-character-tab":
      return state.characterTab === event.tab ? state : { ...state, characterTab: event.tab, rollResult: null, expandedCharacterItemId: "", characterOpenSections: disclosureSections(state.characterDisclosureByContext, activeActorSource(state), event.tab), hitPointEditor: "", restEditor: false, spellSlotEditor: null, xpEditor: false, portraitImage: null };
    case "discard-character-origin":
      return { ...state, characterNavigation: Object.freeze((state.characterNavigation ?? []).slice(0, -1)), viewRevision: state.viewRevision + 1 };
    case "show-roll-result":
      return { ...state, rollResult: event.result };
    case "update-roll-result":
      return state.rollResult?.id !== event.result?.id ? state : { ...state, rollResult: event.result };
    case "dismiss-roll-result":
      return state.rollResult?.id !== event.id ? state : { ...state, rollResult: null };
    case "show-action-session":
      return { ...state, actionSession: event.session, actionSessionOrigin: event.origin === "scene" ? "scene" : "character", rollResult: null };
    case "dismiss-action-session":
      return state.actionSession ? { ...state, actionSession: null, actionSessionOrigin: "" } : state;
    case "open-character-item":
      return state.characterItemId === event.itemId ? state : { ...state, characterItemId: event.itemId };
    case "close-character-item":
      return state.characterItemId ? { ...state, characterItemId: "" } : state;
    case "set-expanded-character-item":
      return state.expandedCharacterItemId === event.itemId ? state : { ...state, expandedCharacterItemId: event.itemId ?? "" };
    case "clear-character-presentation":
      return { ...state, characterOpenSections: [], characterDisclosureByContext: Object.freeze({}) };
    case "initialize-character-sections": {
      if (state.route !== "characters" || activeActorSource(state) !== event.sourceUuid || state.characterTab !== event.tab
        || hasCharacterDisclosure(state, event.sourceUuid, event.tab)) return state;
      const characterOpenSections = [...new Set((event.sectionIds ?? []).map(String).filter(Boolean))];
      return { ...state, characterOpenSections, characterDisclosureByContext: storeDisclosure(state, characterOpenSections) };
    }
    case "set-character-section-expanded": {
      const sectionId = String(event.sectionId ?? "");
      if (!sectionId) return state;
      const open = new Set(state.characterOpenSections ?? []);
      if (event.expanded) open.add(sectionId);
      else open.delete(sectionId);
      const characterOpenSections = [...open];
      if (arraysEqual(characterOpenSections, state.characterOpenSections) && hasCharacterDisclosure(state)) return state;
      return { ...state, characterOpenSections, characterDisclosureByContext: storeDisclosure(state, characterOpenSections) };
    }
    case "set-character-sections-expanded": {
      const characterOpenSections = [...new Set((event.sectionIds ?? []).map(String).filter(Boolean))];
      if (arraysEqual(characterOpenSections, state.characterOpenSections) && hasCharacterDisclosure(state)) return state;
      return { ...state, characterOpenSections, characterDisclosureByContext: storeDisclosure(state, characterOpenSections) };
    }
    case "open-hit-point-editor": {
      const editor = ["hp", "temp"].includes(event.editor) ? event.editor : "hp";
      return state.hitPointEditor === editor && !state.restEditor && !state.spellSlotEditor && !state.xpEditor ? state : { ...state, hitPointEditor: editor, restEditor: false, spellSlotEditor: null, xpEditor: false, portraitImage: null, rollResult: null };
    }
    case "close-hit-point-editor":
      return state.hitPointEditor ? { ...state, hitPointEditor: "" } : state;
    case "open-rest-editor":
      return state.restEditor && !state.hitPointEditor && !state.spellSlotEditor && !state.xpEditor ? state : { ...state, restEditor: true, hitPointEditor: "", spellSlotEditor: null, xpEditor: false, portraitImage: null, rollResult: null };
    case "close-rest-editor":
      return state.restEditor ? { ...state, restEditor: false } : state;
    case "open-spell-slot-editor": {
      const resourceId = String(event.resourceId ?? "");
      const actorSourceUuid = String(event.actorSourceUuid ?? "");
      if (!/^spell-slot:spell[1-9]$/u.test(resourceId) || !actorSourceUuid) return state;
      const spellSlotEditor = Object.freeze({ resourceId, actorSourceUuid, connectionGeneration: Number(event.connectionGeneration) || 0 });
      return { ...state, spellSlotEditor, hitPointEditor: "", restEditor: false, xpEditor: false, portraitImage: null, rollResult: null };
    }
    case "close-spell-slot-editor":
      return state.spellSlotEditor ? { ...state, spellSlotEditor: null } : state;
    case "open-experience-editor":
      return state.xpEditor ? state : { ...state, xpEditor: true, hitPointEditor: "", restEditor: false, spellSlotEditor: null, portraitImage: null, rollResult: null };
    case "close-experience-editor":
      return state.xpEditor ? { ...state, xpEditor: false } : state;
    case "open-character-portrait":
      return event.image?.src ? { ...state, portraitImage: Object.freeze({ src: String(event.image.src), name: String(event.image.name ?? "") }), xpEditor: false, hitPointEditor: "", restEditor: false, spellSlotEditor: null } : state;
    case "close-character-portrait":
      return state.portraitImage ? { ...state, portraitImage: null } : state;
    case "journal-loading":
      return { ...state, journalLoading: true, journalError: "", journalImage: null };
    case "journal-loaded": {
      const pages = event.journal?.pages ?? [];
      const requested = pages.find((page) => page.id === event.target?.pageId)
        ?? (Number.isInteger(event.target?.pageIndex) ? pages[event.target.pageIndex] : null);
      const pageId = requested?.id ?? pages[0]?.id ?? "";
      return { ...state, journal: event.journal, journalLoading: false, journalError: "", journalPageId: pageId,
        journalHeading: requested && event.target?.anchor ? String(event.target.anchor) : "",
        journalMenuOpen: false, journalImage: null };
    }
    case "journal-error":
      return { ...state, journalLoading: false, journalError: String(event.error?.message ?? event.error ?? "VEMOBILE.Errors.JournalUnavailable") };
    case "close-journal":
      return { ...state, journal: null, journalLoading: false, journalError: "", journalPageId: "", journalHeading: "", journalMenuOpen: false, journalImage: null };
    case "select-journal-page":
      return state.journal?.pages?.some((page) => page.id === event.pageId)
        ? { ...state, journalPageId: event.pageId, journalHeading: "", journalMenuOpen: false, journalImage: null } : state;
    case "select-journal-heading": {
      const page = state.journal?.pages?.find((item) => item.id === event.pageId);
      return page?.toc?.some((item) => item.slug === event.heading)
        ? { ...state, journalPageId: page.id, journalHeading: event.heading, journalMenuOpen: false, journalImage: null } : state;
    }
    case "toggle-journal-menu":
      return state.journal ? { ...state, journalMenuOpen: !state.journalMenuOpen } : state;
    case "close-journal-menu":
      return state.journalMenuOpen ? { ...state, journalMenuOpen: false } : state;
    case "open-journal-image":
      return event.image?.src ? { ...state, journalImage: Object.freeze({ src: String(event.image.src), name: String(event.image.name ?? "") }) } : state;
    case "close-journal-image":
      return state.journalImage ? { ...state, journalImage: null } : state;
    case "set-quickbar-collapsed":
      return state.quickbarCollapsed === Boolean(event.collapsed) ? state : { ...state, quickbarCollapsed: Boolean(event.collapsed) };
    case "open-scene-chooser":
      return state.route === "scene" && !state.sceneChooserOpen ? { ...state, sceneChooserOpen: true } : state;
    case "open-split-scene-chooser":
      return state.route === "scene" && state.sceneChooserOpen ? state : {
        ...state,
        route: "scene",
        sceneChooserOpen: true,
        splitSecondaryRoute: state.route === "scene" ? state.splitSecondaryRoute : state.route,
        rollResult: null,
        characterItemId: "",
        expandedCharacterItemId: "",
        characterOpenSections: [],
        hitPointEditor: "",
        restEditor: false,
        spellSlotEditor: null,
        xpEditor: false,
        portraitImage: null
      };
    case "close-scene-chooser":
      return state.sceneChooserOpen ? { ...state, sceneChooserOpen: false } : state;
    case "toggle-scene-chooser":
      return state.route === "scene" ? { ...state, sceneChooserOpen: !state.sceneChooserOpen } : state;
    case "scene-navigation-invalidated":
      return state.sceneChooserOpen ? { ...state, sceneChooserRevision: state.sceneChooserRevision + 1 } : state;
    case "toggle-split-screen":
      if (state.templatePlacement || state.nativeTokenPlacement) return state;
      return state.formFactor === "tablet" && state.orientation === "landscape" && state.canvasAvailable !== false
        ? { ...state, splitScreen: !state.splitScreen, splitScreenPreferred: !state.splitScreen }
        : state.splitScreen ? { ...state, splitScreen: false } : state;
    case "layout-policy-changed": {
      const formFactor = event.formFactor === "tablet" ? "tablet" : "phone";
      const orientation = event.orientation === "landscape" ? "landscape" : "portrait";
      const canvasAvailable = event.canvasAvailable !== false;
      return {
        ...state,
        formFactor,
        orientation,
        canvasAvailable,
        splitScreen: formFactor === "tablet" && orientation === "landscape" && canvasAvailable
          ? Boolean(state.splitScreenPreferred || state.splitScreen)
          : false
      };
    }
    case "open-full-scene":
      return {
        ...state,
        route: "scene",
        sceneChooserOpen: false,
        splitSecondaryRoute: state.route === "scene" ? state.splitSecondaryRoute : state.route,
        rollResult: null,
        characterItemId: "",
        expandedCharacterItemId: "",
        characterOpenSections: [],
        hitPointEditor: "",
        restEditor: false,
        spellSlotEditor: null,
        xpEditor: false,
        portraitImage: null
      };
    case "toggle-tablet-nav-side":
      if (state.templatePlacement || state.nativeTokenPlacement) return state;
      return { ...state, tabletNavSide: state.tabletNavSide === "left" ? "right" : "left" };
    case "template-placement-changed":
      return { ...state, templatePlacement: event.placement ?? null, sceneChooserOpen: event.placement ? false : state.sceneChooserOpen };
    case "native-token-placement-changed":
      return { ...state, nativeTokenPlacement: event.placement ?? null, sceneChooserOpen: event.placement ? false : state.sceneChooserOpen };
    case "actor-token-placement-changed":
      return { ...state, actorTokenPlacement: event.placement ?? null, sceneChooserOpen: event.placement ? false : state.sceneChooserOpen };
    case "template-placement-ended":
      return state.templatePlacement && (!event.id || state.templatePlacement.id === event.id)
        ? { ...state, templatePlacement: null }
        : state;
    case "mode-transition-started":
      return {
        ...state,
        routeHistory: Object.freeze([]),
        rollResult: null,
        actionSession: null,
        actionSessionOrigin: "",
        characterItemId: "",
        hitPointEditor: "",
        restEditor: false,
        spellSlotEditor: null,
        xpEditor: false,
        portraitImage: null,
        journalImage: null,
        templatePlacement: null,
        nativeTokenPlacement: null,
        actorTokenPlacement: null,
        modeTransition: Object.freeze({
          generation: Number(event.generation) || 0,
          phase: "applying",
          target: String(event.target ?? ""),
          detail: String(event.detail ?? "")
        })
      };
    case "mode-transition-progress":
      return state.modeTransition?.generation === Number(event.generation)
        ? { ...state, modeTransition: Object.freeze({ ...state.modeTransition, phase: String(event.phase ?? state.modeTransition.phase), detail: String(event.detail ?? state.modeTransition.detail) }) }
        : state;
    case "mode-transition-finished":
    case "mode-transition-failed":
      return state.modeTransition?.generation === Number(event.generation) ? { ...state, modeTransition: null } : state;
    case "mode-transition-cleared":
      return state.modeTransition ? { ...state, modeTransition: null } : state;
    case "reconnect-started":
      return { ...state, reconnect: Object.freeze({ generation: Number(event.generation) || 0, phase: "reconnecting", checkpoint: "connection", detail: "Restoring connection…", startedAt: null, lastSuccessfulMs: null, progress: null, timings: Object.freeze({}), error: "" }) };
    case "reconnect-resynchronising":
      return state.reconnect?.generation === Number(event.generation)
        ? { ...state, reconnect: Object.freeze({ ...state.reconnect, phase: "resynchronising", checkpoint: "collections", detail: "Refreshing world data…", startedAt: Number(event.startedAt), lastSuccessfulMs: event.lastSuccessfulMs ?? null, error: "" }) }
        : state;
    case "reconnect-progress": {
      const checkpoints = ["connection", "collections", "foundry-session", "canvas", "mobile-session", "presentation", "interactions"];
      const currentIndex = checkpoints.indexOf(state.reconnect?.checkpoint);
      const nextIndex = checkpoints.indexOf(event.checkpoint);
      return state.reconnect?.generation === Number(event.generation)
        && state.reconnect.phase !== "failed"
        && nextIndex >= Math.max(0, currentIndex)
        ? { ...state, reconnect: Object.freeze({ ...state.reconnect, phase: nextIndex === 0 ? "reconnecting" : "resynchronising", checkpoint: checkpoints[nextIndex], detail: String(event.detail ?? state.reconnect.detail ?? ""), progress: event.progress ?? null, timings: Object.freeze({ ...(state.reconnect.timings ?? {}), ...(event.timings ?? {}) }), error: "" }) }
        : state;
    }
    case "reconnect-reloading":
      return state.reconnect?.generation === Number(event.generation)
        ? { ...state, reconnect: Object.freeze({ ...state.reconnect, phase: "reloading", detail: "Reloading Foundry to finish recovery…", progress: null }) }
        : state;
    case "reconnect-failed":
      return state.reconnect?.generation === Number(event.generation)
        ? { ...state, reconnect: Object.freeze({ ...state.reconnect, phase: "failed", checkpoint: event.error?.reconnectCheckpoint ?? state.reconnect.checkpoint, detail: event.error?.reconnectDetail ?? state.reconnect.detail, error: String(event.error?.message ?? event.error ?? "VEMOBILE.Errors.ResyncFailed") }) }
        : state;
    case "reconnect-finished":
      return state.reconnect?.generation === Number(event.generation) ? { ...state, reconnect: null } : state;
    case "reconnect-cleared":
      return state.reconnect ? { ...state, reconnect: null } : state;
    case "view-invalidated":
      return { ...state, viewRevision: state.viewRevision + 1 };
    default:
      return state;
  }
}

function pushRouteHistory(history, route) {
  return Object.freeze([...(history ?? []), route].slice(-16));
}

function popRouteHistory(history) {
  const entries = history ?? [];
  return { route: entries.at(-1) ?? "", history: Object.freeze(entries.slice(0, -1)) };
}

function actorItems(actor) {
  if (!actor) return [];
  return [...(actor.inventory ?? []), ...(actor.spells ?? []), ...(actor.features ?? []), ...(actor.items ?? [])];
}

function activeActorSource(state) {
  return String(state?.selectedActorSourceUuid ?? (state?.selectedActorId ? `Actor.${state.selectedActorId}` : ""));
}

function disclosureContextKey(actorSourceUuid, tab) {
  const actor = String(actorSourceUuid ?? "");
  const view = String(tab ?? "overview");
  return actor && view ? `${actor}\u001f${view}` : "";
}

function disclosureSections(record, actorSourceUuid, tab) {
  const key = disclosureContextKey(actorSourceUuid, tab);
  const sections = key && Object.hasOwn(record ?? {}, key) && Array.isArray(record[key])
    ? record[key]
    : [];
  return Object.freeze([...new Set(sections.map(String).filter(Boolean))]);
}

function storeDisclosure(state, sections) {
  const key = disclosureContextKey(activeActorSource(state), state.characterTab);
  if (!key) return state.characterDisclosureByContext ?? Object.freeze({});
  const entries = Object.entries(state.characterDisclosureByContext ?? {}).filter(([context]) => context !== key);
  entries.push([key, Object.freeze([...sections])]);
  return Object.freeze(Object.fromEntries(entries.slice(-128)));
}

export function hasCharacterDisclosure(state, sourceUuid = activeActorSource(state), tab = state.characterTab) {
  return Object.hasOwn(state.characterDisclosureByContext ?? {}, disclosureContextKey(sourceUuid, tab));
}

function arraysEqual(left = [], right = []) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

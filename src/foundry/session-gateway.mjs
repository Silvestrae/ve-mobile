import { localizeFoundry } from "./localization.mjs";
import { createActorDirectoryRecord, createActorViewRecord } from "./actor-view.mjs";
import { actorSourceRecord, actorSourceUuid, resolveActorSource, validSourceUuid } from "./character-source.mjs";
import { collectiveReferenceUuids } from "./collective-actor-view.mjs";

const TOKEN_GEOMETRY_FIELDS = new Set(["x", "y", "elevation", "rotation", "sort"]);

export const SESSION_INVALIDATION_MAP = Object.freeze({
  renderHotbar: Object.freeze(["scene"]),
  updateUser: Object.freeze(["scene", "actors", "combat", "user"]),
  createMacro: Object.freeze(["scene"]),
  updateMacro: Object.freeze(["scene"]),
  deleteMacro: Object.freeze(["scene"]),
  createFolder: Object.freeze(["scene"]),
  updateFolder: Object.freeze(["scene"]),
  deleteFolder: Object.freeze(["scene"]),
  createActor: Object.freeze(["actors"]),
  updateActor: Object.freeze(["actors"]),
  deleteActor: Object.freeze(["actors"]),
  createItem: Object.freeze(["actors"]),
  updateItem: Object.freeze(["actors"]),
  deleteItem: Object.freeze(["actors"]),
  createActiveEffect: Object.freeze(["actors", "combat"]),
  updateActiveEffect: Object.freeze(["actors", "combat"]),
  deleteActiveEffect: Object.freeze(["actors", "combat"]),
  createJournalEntry: Object.freeze(["journals"]),
  updateJournalEntry: Object.freeze(["journals"]),
  deleteJournalEntry: Object.freeze(["journals"]),
  createJournalEntryPage: Object.freeze(["journals"]),
  updateJournalEntryPage: Object.freeze(["journals"]),
  deleteJournalEntryPage: Object.freeze(["journals"]),
  createChatMessage: Object.freeze(["chat"]),
  updateChatMessage: Object.freeze(["chat"]),
  deleteChatMessage: Object.freeze(["chat"]),
  createCombat: Object.freeze(["combat"]),
  updateCombat: Object.freeze(["combat"]),
  deleteCombat: Object.freeze(["combat"]),
  createCombatant: Object.freeze(["combat"]),
  updateCombatant: Object.freeze(["combat"]),
  deleteCombatant: Object.freeze(["combat"]),
  createScene: Object.freeze(["scene", "combat"]),
  canvasReady: Object.freeze(["scene", "combat"]),
  canvasTearDown: Object.freeze(["scene", "combat"]),
  updateScene: Object.freeze(["scene", "combat"]),
  deleteScene: Object.freeze(["scene", "combat"]),
  createToken: Object.freeze(["scene", "combat"]),
  deleteToken: Object.freeze(["scene", "combat"]),
  controlToken: Object.freeze(["scene"]),
  targetToken: Object.freeze(["targets"])
});

/**
 * Permission-aware boundary around Foundry globals. Views receive only plain,
 * serializable records from this module.
 */
export function createFoundrySessionGateway({
  capabilitiesForActor = () => null,
  quickbarForActor = () => Object.freeze(Array.from({ length: 13 }, () => null)),
  hotbarForSnapshot = () => null,
  sceneForSnapshot = () => null,
  combatForSnapshot = () => null,
  combatControlsForSnapshot = () => Object.freeze({ isGM: false }),
  targetCountForSnapshot = () => Number(game?.user?.targets?.size ?? 0) || 0,
  performanceObserver = null
} = {}) {
  let refreshQueued = false;
  let targetPublicationDeferred = false;
  let targetRefreshPending = false;
  let flushTargetRefresh = () => {};
  let latestSnapshot = null;
  let latestDomainSignatures = Object.freeze({});
  let watchGeneration = 0;
  const pendingDomains = new Set();
  const pendingDirectoryActorIds = new Set();
  let pendingFullDirectoryRead = false;
  let pendingSelectedActorRead = false;
  let pendingControlledSelection = false;
  let pendingTokenActorSourceUuid = "";
  let pendingSceneSelectionReset = false;
  let selectedActorSourceUuid = "";
  let selectedReferenceSources = new Set();
  let heldCharacterSourceUuid = "";
  let characterSourceHoldGeneration = 0;

  const count = (name, amount) => performanceObserver?.increment?.(name, amount);
  const readDomain = (domain, reader) => {
    count(`authoritative.read.${domain}`);
    const finish = performanceObserver?.start?.(`authoritative.read.${domain}`) ?? (() => {});
    try {
      return reader();
    } finally {
      finish();
    }
  };

  const projectSelectedActor = (actor, user) => {
    selectedReferenceSources = new Set(collectiveReferenceUuids(actor));
    count("authoritative.actor.projected");
    count("authoritative.actor.detail.projected");
    const finish = performanceObserver?.start?.("authoritative.actor.detail.project") ?? (() => {});
    try {
      return Object.freeze({
        ...createActorViewRecord(actor, user, capabilitiesForActor, game.users),
        source: actorSourceRecord(actor),
        sourceUuid: actorSourceUuid(actor),
        quickbar: quickbarForActor(actor, user)
      });
    } finally {
      finish();
    }
  };

  const projectDirectoryActor = (actor) => {
    count("authoritative.actor.directory.projected");
    const finish = performanceObserver?.start?.("authoritative.actor.directory.project") ?? (() => {});
    try { return createActorDirectoryRecord(actor); } finally { finish(); }
  };

  const readActors = () => readDomain("actors.directory", () => {
    const user = game.user;
    return Object.freeze(visibleActors(user).map(projectDirectoryActor));
  });

  const patchActors = (previous, actorIds) => readDomain("actors.incremental", () => {
    const user = game.user;
    const records = new Map((previous ?? []).map((actor) => [String(actor.id), actor]));
    for (const actorId of actorIds) {
      const actor = game.actors?.get?.(actorId) ?? Array.from(game.actors ?? []).find((entry) => String(entry?.id ?? "") === actorId);
      if (isActorEligible(actor, user)) records.set(actorId, projectDirectoryActor(actor));
      else records.delete(actorId);
    }
    return Object.freeze([...records.values()].sort((left, right) => Number(right.id === user?.character?.id) - Number(left.id === user?.character?.id) || left.name.localeCompare(right.name)));
  });

  const preferredActorId = (actors) => actors.some((actor) => actor.id === game.user?.character?.id)
    ? game.user.character.id
    : "";

  const preferredActorSourceUuid = (actors) => {
    const preferredId = preferredActorId(actors);
    return actors.find((actor) => actor.id === preferredId)?.sourceUuid ?? "";
  };

  const controlledSourceUuid = () => {
    const token = Array.from(globalThis.canvas?.tokens?.controlled ?? [])[0]?.document ?? null;
    return actorSourceUuid(token?.actor);
  };

  const resolveSelectedActor = (actors, user) => {
    let actor = selectedActorSourceUuid ? resolveActorSource(selectedActorSourceUuid) : null;
    if (!isActorEligible(actor, user)) {
      selectedActorSourceUuid = preferredActorSourceUuid(actors);
      actor = selectedActorSourceUuid ? resolveActorSource(selectedActorSourceUuid) : null;
    }
    return actor && isActorEligible(actor, user) ? projectSelectedActor(actor, user) : null;
  };

  const readScene = () => readDomain("scene", () => {
    const scene = sceneForSnapshot();
    if (!scene) return scene;
    const sourceUuid = String(scene?.movement?.tokens?.find((token) => token.controlled)?.actorSourceUuid ?? "");
    const actor = sourceUuid ? resolveActorSource(sourceUuid) : null;
    return Object.freeze({
      ...scene,
      hotbar: hotbarForSnapshot(),
      quickbarActorSourceUuid: sourceUuid,
      quickbar: actor && isActorEligible(actor, game.user) ? quickbarForActor(actor, game.user) : null
    });
  });

  const read = () => {
    count("authoritative.read.full");
    count("snapshot.build.full");
    const finish = performanceObserver?.start?.("snapshot.build.full") ?? (() => {});
    try {
      const user = game.user;
      const actors = readActors();
      if (!selectedActorSourceUuid) selectedActorSourceUuid = controlledSourceUuid() || preferredActorSourceUuid(actors);
      const selectedActor = resolveSelectedActor(actors, user);
      const combat = readDomain("combat", () => Object.freeze({
        combat: combatForSnapshot(),
        controls: combatControlsForSnapshot()
      }));
      return Object.freeze({
        capturedAt: new Date().toISOString(),
        world: readDomain("world", () => ({
          id: game.world?.id ?? "",
          title: game.world?.title ?? game.world?.id ?? localizeFoundry("VEMOBILE.Interface.SessionGateway.FoundryWorld", "Foundry World"),
          systemId: game.system?.id ?? "",
          systemVersion: game.system?.version ?? ""
        })),
        user: readDomain("user", () => ({
          id: user?.id ?? "",
          name: user?.name ?? "Player",
          isGM: Boolean(user?.isGM)
        })),
        preferredActorId: preferredActorId(actors),
        preferredActorSourceUuid: preferredActorSourceUuid(actors),
        actors,
        selectedActorSourceUuid,
        selectedActor,
        scene: readScene(),
        combat: combat.combat,
        combatControls: combat.controls,
        journals: readDomain("journals", () => Object.freeze(visibleJournals(user).map(journalRecord))),
        chat: readDomain("chat", () => Object.freeze(visibleMessages().slice(-30).map(chatRecord)))
      });
    } finally {
      finish();
    }
  };

  const readIncremental = (domains, actorIds, fullActorRead, refreshSelectedActor, refreshControlledSelection, resetSceneSelection) => {
    if (!latestSnapshot) return read();
    count("snapshot.build.incremental");
    const finish = performanceObserver?.start?.("snapshot.build.incremental") ?? (() => {});
    try {
      const next = { ...latestSnapshot, capturedAt: new Date().toISOString() };
      if (domains.has("actors")) {
        next.actors = fullActorRead ? readActors() : actorIds.size ? patchActors(latestSnapshot.actors, actorIds) : latestSnapshot.actors;
        next.preferredActorId = preferredActorId(next.actors);
        next.preferredActorSourceUuid = preferredActorSourceUuid(next.actors);
        if (resetSceneSelection) {
          const current = selectedActorSourceUuid ? resolveActorSource(selectedActorSourceUuid) : null;
          if (current?.isToken) selectedActorSourceUuid = preferredActorSourceUuid(next.actors);
        }
        if (refreshControlledSelection && !heldCharacterSourceUuid) {
          const controlled = controlledSourceUuid();
          selectedActorSourceUuid = pendingTokenActorSourceUuid && (!controlled || controlled === selectedActorSourceUuid)
            ? pendingTokenActorSourceUuid
            : controlled || selectedActorSourceUuid;
        }
        const currentStillValid = selectedActorSourceUuid && resolveActorSource(selectedActorSourceUuid);
        if (refreshSelectedActor || refreshControlledSelection || resetSceneSelection || !currentStillValid) {
          next.selectedActor = resolveSelectedActor(next.actors, game.user);
          next.selectedActorSourceUuid = selectedActorSourceUuid;
        }
      }
      if (domains.has("user")) next.user = readDomain("user", () => ({ id: game.user?.id ?? "", name: game.user?.name ?? "Player", isGM: Boolean(game.user?.isGM) }));
      if (domains.has("scene")) next.scene = readScene();
      if (domains.has("combat")) {
        const combat = readDomain("combat", () => Object.freeze({
          combat: combatForSnapshot(),
          controls: combatControlsForSnapshot()
        }));
        next.combat = combat.combat;
        next.combatControls = combat.controls;
      }
      if (domains.has("journals")) next.journals = readDomain("journals", () => Object.freeze(visibleJournals(game.user).map(journalRecord)));
      if (domains.has("chat")) next.chat = readDomain("chat", () => Object.freeze(visibleMessages().slice(-30).map(chatRecord)));
      if (domains.has("targets") && !domains.has("scene")) next.scene = patchSceneTargetCount(latestSnapshot.scene, readDomain("targets", targetCountForSnapshot));
      return Object.freeze(next);
    } finally {
      finish();
    }
  };

  return Object.freeze({
    read,
    adopt(snapshot) {
      if (!snapshot) return;
      latestSnapshot = snapshot;
      selectedActorSourceUuid = String(snapshot.selectedActorSourceUuid ?? snapshot.selectedActor?.sourceUuid ?? selectedActorSourceUuid);
      latestDomainSignatures = snapshotDomainSignatures(snapshot);
    },
    selectCharacterSource(sourceUuid, expectedSession = {}) {
      assertSession(expectedSession);
      const uuid = validSourceUuid(sourceUuid);
      const actor = resolveActorSource(uuid);
      if (!actor || !isActorEligible(actor, game.user)) throw new Error(localizeFoundry("VEMOBILE.Interface.SessionGateway.ThisActorIsNoLongerAvailable", "This actor is no longer available."));
      selectedActorSourceUuid = uuid;
      if (!latestSnapshot) return read();
      const snapshot = Object.freeze({
        ...latestSnapshot,
        capturedAt: new Date().toISOString(),
        selectedActorSourceUuid,
        selectedActor: projectSelectedActor(actor, game.user)
      });
      latestSnapshot = snapshot;
      latestDomainSignatures = snapshotDomainSignatures(snapshot);
      return snapshot;
    },
    selectReferencedCharacterSource({ originSourceUuid, targetSourceUuid }, expectedSession = {}) {
      assertSession(expectedSession);
      const origin = resolveActorSource(validSourceUuid(originSourceUuid));
      const target = validSourceUuid(targetSourceUuid);
      if (selectedActorSourceUuid !== originSourceUuid || !origin || !isActorEligible(origin, game.user)
        || !collectiveReferenceUuids(origin).includes(target)) throw new Error(localizeFoundry("VEMOBILE.Interface.SessionGateway.ThisReferenceIsNoLongerAvailable", "This reference is no longer available."));
      return this.selectCharacterSource(target, expectedSession);
    },
    holdCharacterSource(sourceUuid) {
      const uuid = validSourceUuid(sourceUuid);
      const generation = ++characterSourceHoldGeneration;
      heldCharacterSourceUuid = uuid;
      return () => {
        if (generation === characterSourceHoldGeneration) heldCharacterSourceUuid = "";
      };
    },
    setTargetPublicationDeferred(deferred) {
      targetPublicationDeferred = Boolean(deferred);
      if (!targetPublicationDeferred) flushTargetRefresh();
    },
    watch(scope, onSnapshot, onError, { onJournalChange = () => {} } = {}) {
      // Foundry selects every owned token on its first draw for an unassigned
      // player. Mobile starts with an explicit chooser instead of adopting that
      // automatic group selection. Later user selections remain authoritative.
      if (!game.user?.character) {
        globalThis.canvas?.tokens?.releaseAll?.();
        selectedActorSourceUuid = "";
      }
      const generation = ++watchGeneration;
      const queueRefresh = (invalidation) => {
        if (invalidation.tokenActorChanged || invalidation.replacementTokenUuid) {
          const token = latestSnapshot?.scene?.movement?.tokens?.find((entry) =>
            entry.id === invalidation.tokenId && latestSnapshot.scene.id === invalidation.sceneId);
          if (token?.actorSourceUuid === selectedActorSourceUuid && (token.controlled || invalidation.replacementTokenUuid)) {
            const replacement = invalidation.replacementTokenUuid ? resolveTokenReplacement(invalidation.replacementTokenUuid) : null;
            const nextSourceUuid = invalidation.replacementTokenUuid
              ? actorSourceUuid(replacement?.parent?.id === invalidation.sceneId ? replacement.actor : null)
              : invalidation.sourceUuid;
            const nextActor = nextSourceUuid ? resolveActorSource(nextSourceUuid) : null;
            if (nextSourceUuid !== selectedActorSourceUuid && isActorEligible(nextActor, game.user)) {
              pendingTokenActorSourceUuid = nextSourceUuid;
              pendingControlledSelection = true;
            }
          }
        }
        for (const domain of invalidation.domains) {
          pendingDomains.add(domain);
          count(`invalidation.domain.${domain}`);
          count(`invalidation.event.${invalidation.hook}.${domain}`);
        }
        if (invalidation.directoryActorId) pendingDirectoryActorIds.add(invalidation.directoryActorId);
        if (invalidation.fullDirectoryRead) pendingFullDirectoryRead = true;
        if (invalidation.refreshSelectedActor) pendingSelectedActorRead = true;
        if (invalidation.sourceUuid && invalidation.sourceUuid === selectedActorSourceUuid) pendingSelectedActorRead = true;
        if (invalidation.sourceUuid && selectedReferenceSources.has(invalidation.sourceUuid)) pendingSelectedActorRead = true;
        if (invalidation.referenceTokenPrefix && [...selectedReferenceSources].some(uuid => uuid.startsWith(invalidation.referenceTokenPrefix))) pendingSelectedActorRead = true;
        if (invalidation.relatedActorId && invalidation.relatedActorId === String(latestSnapshot?.selectedActor?.id ?? "")) pendingSelectedActorRead = true;
        if (invalidation.controlledSelection) pendingControlledSelection = true;
        if (invalidation.sceneSelectionReset) pendingSceneSelectionReset = true;
        if (refreshQueued) {
          count("hook.coalesced");
          return;
        }
        refreshQueued = true;
        queueMicrotask(() => {
          if (generation !== watchGeneration) return;
          refreshQueued = false;
          try {
            const domains = new Set(pendingDomains);
            const actorIds = new Set(pendingDirectoryActorIds);
            const fullActorRead = pendingFullDirectoryRead;
            const refreshSelectedActor = pendingSelectedActorRead;
            const refreshControlledSelection = pendingControlledSelection;
            const resetSceneSelection = pendingSceneSelectionReset;
            pendingDomains.clear();
            pendingDirectoryActorIds.clear();
            pendingFullDirectoryRead = false;
            pendingSelectedActorRead = false;
            pendingControlledSelection = false;
            pendingSceneSelectionReset = false;
            const snapshot = readIncremental(domains, actorIds, fullActorRead, refreshSelectedActor, refreshControlledSelection, resetSceneSelection);
            pendingTokenActorSourceUuid = "";
            const changedDomains = new Set();
            for (const domain of domains) {
              count(`snapshot.signature.${domain}`);
              if (domain === "targets") {
                if (Number(snapshot?.scene?.movement?.targetCount ?? 0) !== Number(latestSnapshot?.scene?.movement?.targetCount ?? 0)) changedDomains.add("scene");
                continue;
              }
              if (snapshotDomainSignature(snapshot, domain) !== latestDomainSignatures[domain]) changedDomains.add(domain);
            }
            if (!changedDomains.size) {
              count("snapshot.deduplicated");
              return;
            }
            const published = { ...snapshot };
            for (const domain of domains) {
              const key = domain === "targets" ? "scene" : domain;
              if (!changedDomains.has(key)) published[key] = latestSnapshot[key];
            }
            if (domains.has("actors") && !changedDomains.has("actors")) published.preferredActorId = latestSnapshot.preferredActorId;
            latestSnapshot = Object.freeze(published);
            latestDomainSignatures = Object.freeze({
              ...latestDomainSignatures,
              ...Object.fromEntries([...changedDomains].map((domain) => [domain, snapshotDomainSignature(latestSnapshot, domain)]))
            });
            count("snapshot.publish");
            onSnapshot(latestSnapshot);
          } catch (error) {
            onError(error);
          }
        });
      };
      const queueTargetRefresh = () => {
        if (targetPublicationDeferred) {
          targetRefreshPending = true;
          count("hook.target.deferred");
          return;
        }
        queueRefresh({ hook: "targetToken", domains: ["targets"] });
      };
      const localFlushTargetRefresh = () => {
        if (!targetRefreshPending) return;
        targetRefreshPending = false;
        queueRefresh({ hook: "targetToken", domains: ["targets"] });
      };
      flushTargetRefresh = localFlushTargetRefresh;
      scope.own?.(() => {
        if (flushTargetRefresh === localFlushTargetRefresh) flushTargetRefresh = () => {};
        targetRefreshPending = false;
      });
      scope.own?.(() => {
        if (watchGeneration !== generation) return;
        watchGeneration += 1;
        refreshQueued = false;
        pendingDomains.clear();
        pendingDirectoryActorIds.clear();
        pendingFullDirectoryRead = false;
        pendingSelectedActorRead = false;
        pendingControlledSelection = false;
        pendingTokenActorSourceUuid = "";
        pendingSceneSelectionReset = false;
      });

      for (const hook of [...Object.keys(SESSION_INVALIDATION_MAP), "updateToken", "updateSetting"]) {
        scope.hook(hook, (...args) => {
          count(`hook.received.${hook}`);
          if (["createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage", "updateJournalEntry"].includes(hook)) {
            const entry = hook.endsWith("Page") ? args[0]?.parent : args[0];
            if (entry?.id) onJournalChange(String(entry.id));
          }
          if (hook === "targetToken") {
            const user = args[0];
            if (user && String(user.id ?? "") !== String(game.user?.id ?? "")) {
              count("hook.ignored");
              return;
            }
            queueTargetRefresh();
            return;
          }
          const invalidation = sessionInvalidationForHook(hook, ...args);
          if (!invalidation.domains.length) {
            count("hook.ignored");
            return;
          }
          queueRefresh(invalidation);
        });
      }

      // Hooks are owned before the baseline read. A hook raised during this
      // synchronous projection is coalesced into the following microtask.
      latestSnapshot = read();
      latestDomainSignatures = snapshotDomainSignatures(latestSnapshot);
      return latestSnapshot;
    },
    async readJournal(journalId, expectedSession = {}) {
      assertSession(expectedSession);
      const id = identifier(journalId, "journalId");
      const journal = game.journal?.get?.(id) ?? Array.from(game.journal ?? []).find((entry) => String(entry.id ?? "") === id);
      if (!journal || !canObserve(journal, game.user)) throw new Error(localizeFoundry("VEMOBILE.Interface.SessionGateway.ThisJournalIsNoLongerAvailable", "This journal is no longer available."));
      const pages = [];
      for (const page of Array.from(journal.pages ?? []).filter((entry) => canObserve(entry, game.user) && (journal.sheet?.isPageVisible?.(entry) ?? true))) {
        const type = String(page.type ?? "text");
        const record = {
          id: String(page.id ?? ""),
          name: String(page.name ?? localizeFoundry("VEMOBILE.Journals.UntitledPage", "Untitled page")),
          type,
          sort: Number(page.sort) || 0,
          level: Number(page.title?.level) || 1,
          src: String(page.src ?? ""),
          caption: String(page.image?.caption ?? "")
        };
        if (type === "text") record.toc = Object.freeze(Object.values(page.toc ?? {}).map((heading) => Object.freeze({
          text: String(heading.text ?? ""), slug: String(heading.slug ?? ""),
          level: Number(heading.level) || 1, order: Number(heading.order) || 0
        })).sort((left, right) => left.order - right.order));
        if (type === "text") record.html = await enrichJournalHtml(page, journal);
        record.canEdit = canOwn(page, game.user);
        pages.push(Object.freeze(record));
      }
      assertSession(expectedSession);
      if (game.journal?.get?.(id) !== journal || !canObserve(journal, game.user)) throw new Error(localizeFoundry("VEMOBILE.Interface.SessionGateway.ThisJournalIsNoLongerAvailable", "This journal is no longer available."));
      const currentPages = pages.filter((record) => {
        const current = journal.pages?.get?.(record.id) ?? Array.from(journal.pages ?? []).find((entry) => entry.id === record.id);
        return current && canObserve(current, game.user) && (journal.sheet?.isPageVisible?.(current) ?? true);
      });
      currentPages.sort((left, right) => left.sort - right.sort || left.name.localeCompare(right.name));
      return Object.freeze({ id, name: String(journal.name ?? "Journal"), img: String(journal.img ?? ""),
        canEdit: canOwn(journal, game.user), pages: Object.freeze(currentPages) });
    },
    async openNativeJournalEditor(journalId, pageId = "", expectedSession = {}) {
      assertSession(expectedSession);
      const id = identifier(journalId, "journalId");
      const journal = game.journal?.get?.(id);
      if (!journal || !canOwn(journal, game.user)) throw new Error(localizeFoundry("VEMOBILE.Interface.SessionGateway.YouCannotEditThisJournal", "You cannot edit this Journal."));
      const page = pageId ? journal.pages?.get?.(identifier(pageId, "pageId")) : null;
      if (pageId && (!page || !canOwn(page, game.user))) throw new Error(localizeFoundry("VEMOBILE.Interface.SessionGateway.YouCannotEditThisJournalPage", "You cannot edit this Journal page."));
      // Foundry v13's own JournalEntrySheet opens text and image editors from
      // page.sheet. Other page types use the native parent at the current page.
      const sheet = page && ["text", "image"].includes(String(page.type)) && typeof page.sheet?.render === "function"
        ? page.sheet : journal.sheet;
      if (typeof sheet?.render !== "function") throw new Error(localizeFoundry("VEMOBILE.Interface.SessionGateway.TheNativeJournalEditorIsUnavailable", "The native Journal editor is unavailable."));
      // Foundry 13.351's JournalEntrySheet is ApplicationV2, while its text
      // and image JournalPageSheet editors still use ApplicationV1.render.
      if (sheet.isV2 === false) await Promise.resolve(sheet.render(true, { veNativeEdit: true }));
      else await Promise.resolve(sheet.render({ force: true, veNativeEdit: true,
        ...(sheet === journal.sheet && page ? { pageId: page.id } : {}) }));
      assertSession(expectedSession);
      return Object.freeze({ opened: true });
    },
    async sendChat(content, sourceUuid = "") {
      const text = String(content ?? "").trim();
      if (!text || text.length > 5000) throw new Error(localizeFoundry("VEMOBILE.Interface.SessionGateway.ChatMessagesMustContainBetweenAndCharacters", "Chat messages must contain between 1 and 5,000 characters."));
      const actor = sourceUuid ? resolveActorSource(sourceUuid) : null;
      if (sourceUuid && (!actor || !isActorEligible(actor, game.user))) throw new Error(localizeFoundry("VEMOBILE.Interface.SessionGateway.ThisActorIsNoLongerAvailable", "This actor is no longer available."));
      const speaker = actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker({ user: game.user });
      return ChatMessage.create({ content: text, speaker, user: game.user.id });
    }
  });
}

export function sessionInvalidationForHook(hook, document, changes = {}) {
  if (hook === "updateUser") return Object.freeze({ hook, domains: SESSION_INVALIDATION_MAP.updateUser, fullDirectoryRead: true, refreshSelectedActor: true });
  if (hook === "updateActor") {
    const fields = changedPaths(changes);
    const directoryChanged = !document?.isToken && (fields.length === 0 || fields.some((field) => /^(?:name|img|type|folder|ownership|system\.details\.(?:level|cr|type)|system\.traits\.size)(?:\.|$)/u.test(field)));
    const sceneChanged = fields.length === 0 || fields.some((field) => /^(?:name|img|ownership|prototypeToken|flags\.ve-mobile\.quickbar)(?:\.|$)/u.test(field));
    const sourceUuid = actorSourceUuid(document);
    const directoryActorId = directoryChanged ? String(document?.id ?? "") : "";
    return Object.freeze({
      hook,
      domains: Object.freeze(["actors", ...(sceneChanged ? ["scene", "combat"] : [])]),
      sourceUuid,
      relatedActorId: document?.isToken ? "" : String(document?.id ?? ""),
      ...(directoryActorId ? { directoryActorId } : {})
    });
  }
  if (hook === "updateToken") {
    const fields = changedPaths(changes);
    const geometryOnly = fields.length > 0 && fields.every((field) => TOKEN_GEOMETRY_FIELDS.has(field));
    const sourceUuid = actorSourceUuid(document?.actor);
    const tokenActorChanged = fields.includes("actorId") || fields.includes("actorLink");
    return Object.freeze({
      hook, domains: geometryOnly ? Object.freeze([]) : Object.freeze(["actors", "scene", "combat"]), sourceUuid,
      ...(tokenActorChanged ? { referenceTokenPrefix: `Scene.${document?.parent?.id}.Token.${document?.id}.Actor.`, tokenActorChanged: true, tokenId: String(document?.id ?? ""), sceneId: String(document?.parent?.id ?? "") } : {})
    });
  }
  if (hook === "updateSetting") {
    const key = String(document?.key ?? document?.id ?? "");
    const namespace = String(document?.namespace ?? "");
    const fullKey = key.includes(".") ? key : namespace && key ? `${namespace}.${key}` : key;
    if (["dnd5e.levelingMode", "dnd5e.metricLengthUnits", "dnd5e.metricWeightUnits", "dnd5e.metricTravelUnits"].includes(fullKey)) return Object.freeze({ hook, domains: Object.freeze(["actors"]), refreshSelectedActor: true });
    const domains = ["core.hotbarLock", "core.macroScript"].includes(fullKey) ? Object.freeze(["scene"])
      : fullKey === "dnd5e.initiativeDexTiebreaker" ? Object.freeze(["combat"]) : Object.freeze([]);
    return Object.freeze({ hook, domains });
  }
  const configuredDomains = SESSION_INVALIDATION_MAP[hook] ?? Object.freeze([]);
  const actor = hook === "deleteToken" ? document?.actor : actorForHook(hook, document);
  const sourceUuid = actorSourceUuid(actor);
  const worldActor = actor && !actor.isToken;
  const classItemChanged = ["createItem", "updateItem", "deleteItem"].includes(hook) && document?.type === "class";
  const directoryActorId = worldActor && (["createActor", "deleteActor"].includes(hook) || classItemChanged) ? String(actor.id ?? "") : "";
  const controlledSelection = hook === "controlToken";
  const validatesSelectedSource = ["canvasReady", "canvasTearDown", "deleteScene", "deleteToken"].includes(hook);
  const sceneSelectionReset = ["canvasReady", "canvasTearDown", "deleteScene"].includes(hook);
  const replacementTokenUuid = hook === "deleteToken" ? String(changes?.replacements?.[document?.id] ?? "") : "";
  const domains = Object.freeze([...new Set([
    ...configuredDomains,
    ...(sourceUuid || controlledSelection || validatesSelectedSource ? ["actors"] : [])
  ])]);
  const fullDirectoryRead = hook === "createActor" || hook === "deleteActor" ? false : configuredDomains.includes("actors") && !sourceUuid && !controlledSelection && !validatesSelectedSource;
  return Object.freeze({
    hook,
    domains,
    sourceUuid,
    ...(worldActor ? { relatedActorId: String(actor.id ?? "") } : {}),
    ...(directoryActorId ? { directoryActorId } : {}),
    ...(fullDirectoryRead ? { fullDirectoryRead: true } : {}),
    ...(controlledSelection ? { controlledSelection: true } : {}),
    ...(hook === "deleteToken" ? { referenceTokenPrefix: `Scene.${document?.parent?.id}.Token.${document?.id}.Actor.`, refreshSelectedActor: true } : {}),
    ...(replacementTokenUuid ? { replacementTokenUuid, tokenId: String(document?.id ?? ""), sceneId: String(document?.parent?.id ?? "") } : {}),
    ...(sceneSelectionReset ? { sceneSelectionReset: true } : {})
  });
}

function resolveTokenReplacement(uuid) {
  if (!/^Scene\.[^.]+\.Token\.[^.]+$/u.test(uuid)) return null;
  try {
    const token = (globalThis.fromUuidSync ?? globalThis.foundry?.utils?.fromUuidSync)?.(uuid, { strict: false }) ?? null;
    return token?.uuid === uuid ? token : null;
  } catch {
    return null;
  }
}

function actorForHook(hook, document) {
  if (!["createActor", "updateActor", "deleteActor", "createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"].includes(hook)) return "";
  if (["createActor", "updateActor", "deleteActor"].includes(hook)) return document ?? null;
  let parent = document?.parent ?? document?.actor ?? null;
  for (let depth = 0; parent && depth < 3; depth += 1) {
    if (["character", "npc"].includes(parent.type) || parent.documentName === "Actor") return parent;
    if (parent.actor?.id) return parent.actor;
    parent = parent.parent ?? null;
  }
  return null;
}

function changedPaths(changes, prefix = "") {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return prefix ? [prefix] : [];
  const paths = [];
  for (const [key, value] of Object.entries(changes)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length) paths.push(...changedPaths(value, path));
    else paths.push(path);
  }
  return paths;
}

function patchSceneTargetCount(scene, targetCount) {
  if (!scene) return scene;
  return Object.freeze({
    ...scene,
    movement: Object.freeze({
      ...(scene.movement ?? {}),
      targetCount: Math.max(0, Number(targetCount) || 0)
    })
  });
}

function snapshotDomainSignatures(snapshot) {
  return Object.freeze(Object.fromEntries(["actors", "scene", "combat", "journals", "chat", "world", "user"]
    .map((domain) => [domain, snapshotDomainSignature(snapshot, domain)])));
}

function snapshotDomainSignature(snapshot, domain) {
  if (domain === "actors") return JSON.stringify({
    preferredActorSourceUuid: snapshot?.preferredActorSourceUuid ?? "",
    actors: snapshot?.actors ?? [],
    selectedActorSourceUuid: snapshot?.selectedActorSourceUuid ?? "",
    selectedActor: snapshot?.selectedActor ?? null
  });
  return JSON.stringify(snapshot?.[domain] ?? null);
}

export function snapshotPresentationSignature(snapshot) {
  if (!snapshot) return "null";
  const { capturedAt: _capturedAt, ...presentation } = snapshot;
  return JSON.stringify(presentation);
}

function visibleActors(user) {
  return Array.from(game.actors ?? [])
    .filter((actor) => isActorEligible(actor, user))
    .sort((a, b) => Number(b.id === user?.character?.id) - Number(a.id === user?.character?.id) || a.name.localeCompare(b.name));
}

/** The one eligibility policy shared by full and incremental Actor discovery. */
export function isActorEligible(actor, user) {
  if (["character", "group", "vehicle"].includes(actor?.type)) return canObserve(actor, user);
  if (actor?.type === "npc") return Boolean(user?.isGM) || canOwn(actor, user);
  return false;
}

function visibleJournals(user) {
  return Array.from(game.journal ?? [])
    .filter((journal) => canObserve(journal, user))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function visibleMessages() {
  return Array.from(game.messages ?? []).filter((message) => message.visible !== false);
}

function canObserve(document, user) {
  try {
    return document.testUserPermission?.(user, "OBSERVER") ?? document.visible ?? false;
  } catch {
    return false;
  }
}

function canOwn(document, user) {
  try {
    return document.testUserPermission?.(user, "OWNER") ?? false;
  } catch {
    return false;
  }
}

function journalRecord(journal) {
  return {
    id: String(journal.id ?? ""),
    name: String(journal.name ?? "Journal"),
    img: String(journal.img ?? ""),
    sort: Number(journal.sort) || 0,
    rootSorting: sortingMode(game.journal?.sortingMode),
    folderPath: journalFolderPath(journal),
    pages: Array.from(journal.pages ?? [])
      .filter((page) => canObserve(page, game.user))
      .map((page) => ({ id: page.id, name: page.name, type: page.type }))
  };
}

function journalFolderPath(journal) {
  const folders = [];
  const seen = new Set();
  let folder = journal.folder ?? null;
  while (folder && !seen.has(folder.id)) {
    seen.add(folder.id);
    folders.unshift({
      id: String(folder.id ?? ""),
      name: String(folder.name ?? "Folder"),
      sort: Number(folder.sort) || 0,
      sorting: sortingMode(folder.sorting)
    });
    folder = folder.folder ?? folder.parent ?? null;
  }
  return folders;
}

function sortingMode(value) {
  return value === "a" ? "a" : "m";
}

async function enrichJournalHtml(page, journal) {
  const editor = globalThis.TextEditor?.implementation ?? globalThis.foundry?.applications?.ux?.TextEditor?.implementation;
  const content = String(page.text?.content ?? "");
  if (typeof editor?.enrichHTML !== "function") return `<p>${escapeHtml(content)}</p>`;
  return String(await editor.enrichHTML(content, {
    async: true,
    documents: true,
    links: true,
    rolls: false,
    secrets: Boolean(page.isOwner ?? journal.isOwner),
    relativeTo: page
  }));
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function assertSession(expected) {
  if (!game?.user || !game?.world) throw new Error(localizeFoundry("VEMOBILE.Interface.CombatGateway.TheFoundrySessionIsNotReady", "The Foundry session is not ready."));
  if (expected.worldId && expected.worldId !== game.world.id) throw new Error(localizeFoundry("VEMOBILE.Interface.CombatGateway.TheActiveFoundryWorldHasChanged", "The active Foundry world has changed."));
  if (expected.userId && expected.userId !== game.user.id) throw new Error(localizeFoundry("VEMOBILE.Interface.CombatGateway.TheActiveFoundryUserHasChanged", "The active Foundry user has changed."));
}

function identifier(value, field) {
  const id = String(value ?? "").trim();
  if (!id || id.length > 128) throw new Error(localizeFoundry("VEMOBILE.Interface.CharacterSource.IsRequired", "{field} is required.", { field: (field) }));
  return id;
}

function chatRecord(message) {
  const source = message._source ?? message;
  return {
    id: message.id,
    speaker: message.alias ?? message.speaker?.alias ?? message.author?.name ?? "Unknown",
    content: plainText(source.content ?? ""),
    timestamp: Number(source.timestamp ?? Date.now()),
    isRoll: Boolean(message.isRoll || message.rolls?.length)
  };
}

function plainText(html) {
  const holder = document.createElement("div");
  holder.innerHTML = String(html ?? "");
  return holder.textContent?.trim() ?? "";
}

import { localizeFoundry } from "./localization.mjs";
const COLLECTIONS = Object.freeze(["User", "Folder", "Actor", "Scene", "Combat", "JournalEntry", "ChatMessage"]);
const COLLECTION_LABELS = Object.freeze({
  User: "users",
  Folder: "folders",
  Actor: "actors",
  Scene: "Scenes",
  Combat: "combat encounters",
  JournalEntry: "journals",
  ChatMessage: "chat messages"
});

/** Re-query relevant Foundry v13 world collections without reloading the page. */
export function createFoundryAuthoritativeSessionGateway({
  getGame = () => globalThis.game,
  getUi = () => globalThis.ui,
  diagnostics = null,
  performanceObserver = null,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  yieldControl = () => new Promise((resolve) => {
    const frame = globalThis.requestAnimationFrame;
    if (typeof frame === "function") frame(() => resolve());
    else queueMicrotask(resolve);
  })
} = {}) {
  return Object.freeze({
    async resync({ isCurrent = () => true, onProgress = () => {} } = {}) {
      performanceObserver?.increment?.("reconnect.authoritative.run");
      const finishTotal = performanceObserver?.start?.("reconnect.authoritative.total") ?? (() => {});
      const startedAt = now();
      const checkpointStartedAt = new Map();
      const timings = {};
      const collectionTimings = {};
      const progress = (checkpoint, detail, complete = false) => {
        if (!isCurrent()) return;
        const timestamp = now();
        if (!checkpointStartedAt.has(checkpoint)) checkpointStartedAt.set(checkpoint, timestamp);
        if (complete) timings[checkpoint] = Math.max(0, timestamp - checkpointStartedAt.get(checkpoint));
        onProgress(Object.freeze({ checkpoint, detail, timings: Object.freeze({ ...timings }) }));
      };
      const game = getGame();
      if (!game?.user || !game?.collections) throw new Error(localizeFoundry("VEMOBILE.Interface.AuthoritativeSessionGateway.TheFoundrySessionIsNotReadyForResynchronisation", "The Foundry session is not ready for resynchronization."));
      progress("collections", localizeFoundry("VEMOBILE.Interface.AppFrame.RefreshingWorldData2", "Refreshing world data…"));
      const finishFetch = performanceObserver?.start?.("reconnect.authoritative.fetch") ?? (() => {});
      let fetchFailed = false;
      const fetched = await Promise.all(COLLECTIONS.map(async (documentName) => {
        const collection = game.collections.get?.(documentName);
        const cls = collection?.documentClass ?? collection?.constructor?.documentClass;
        if (!collection || !cls || typeof cls.database?.get !== "function") return [documentName, collection, null];
        const collectionStartedAt = now();
        try {
          performanceObserver?.increment?.("reconnect.collection.fetched");
          const documents = await cls.database.get(cls, { query: {} }, game.user);
          const values = Array.from(documents ?? []);
          collectionTimings[documentName] = Math.max(0, now() - collectionStartedAt);
          performanceObserver?.increment?.("reconnect.document.fetched", values.length);
          // A collection count is a completion fact, never incremental progress.
          if (!fetchFailed) diagnostics?.record?.("debug", `Refreshed ${COLLECTION_LABELS[documentName]} (${values.length})`);
          return [documentName, collection, values];
        } catch (error) {
          fetchFailed = true;
          error.reconnectCheckpoint = "collections";
          error.reconnectDetail = localizeFoundry(`VEMOBILE.Recovery.Collection.${documentName}`, `Could not refresh ${COLLECTION_LABELS[documentName]}.`);
          throw error;
        }
      }));
      finishFetch();
      timings.collections = Math.max(0, now() - checkpointStartedAt.get("collections"));
      if (!isCurrent()) {
        finishTotal();
        return Object.freeze({ applied: false, reason: "stale-generation" });
      }
      const fetchedAt = now();
      // Let the reconnect shield paint before applying any necessary Foundry
      // document preparation on the main thread. This does not gate readiness.
      await yieldControl();
      if (!isCurrent()) {
        finishTotal();
        return Object.freeze({ applied: false, reason: "stale-generation" });
      }
      progress("foundry-session", localizeFoundry("VEMOBILE.Interface.AppFrame.SynchronisingSceneData2", "Synchronizing scene data…"));
      const finishReconcile = performanceObserver?.start?.("reconnect.authoritative.reconcile") ?? (() => {});
      const changedCollections = new Set();
      const work = { prepared: 0, updated: 0, added: 0, deleted: 0 };
      for (const [documentName, collection, documents] of fetched) {
        if (!collection || !documents) continue;
        const result = reconcileCollection(collection, documents, { documentName });
        for (const key of Object.keys(work)) work[key] += result[key];
        if (result.changed) changedCollections.add(collection);
      }
      for (const collection of changedCollections) collection?.initializeTree?.();
      performanceObserver?.increment?.("reconnect.collection.rebuilt", changedCollections.size);
      performanceObserver?.increment?.("reconnect.document.prepared", work.prepared);
      performanceObserver?.increment?.("reconnect.document.updated", work.updated);
      performanceObserver?.increment?.("reconnect.document.added", work.added);
      performanceObserver?.increment?.("reconnect.document.deleted", work.deleted);
      finishReconcile();
      const reconciledAt = now();

      if (!isCurrent()) {
        finishTotal();
        return Object.freeze({ applied: false, reason: "stale-generation" });
      }
      progress("foundry-session", localizeFoundry("VEMOBILE.Interface.AuthoritativeSessionGateway.RestoringGameMessages", "Restoring game messages…"));
      await Promise.resolve(getUi()?.chat?.render?.({ force: true }));
      progress("foundry-session", localizeFoundry("VEMOBILE.Interface.AuthoritativeSessionGateway.WorldDataReady", "World data ready"), true);
      const slowestCollection = Object.entries(collectionTimings).sort((left, right) => right[1] - left[1])[0] ?? null;
      const total = Math.max(0, now() - startedAt);
      diagnostics?.record?.("debug", `Authoritative resync timings | collections=${Math.round(fetchedAt - startedAt)}ms reconcile=${Math.round(reconciledAt - fetchedAt)}ms FoundrySession=${Math.round(timings["foundry-session"] ?? 0)}ms slowestCollection=${slowestCollection ? `${slowestCollection[0]}:${Math.round(slowestCollection[1])}ms` : "none"} total=${Math.round(total)}ms changedCollections=${changedCollections.size}`);
      finishTotal();
      return Object.freeze({
        applied: true,
        collections: Object.freeze(fetched.filter(([, , documents]) => documents).map(([name]) => name)),
        timings: Object.freeze({ ...timings, total }),
        slowestCollection: slowestCollection ? Object.freeze({ name: slowestCollection[0], durationMs: slowestCollection[1] }) : null
      });
    }
  });
}

function reconcileCollection(collection, authoritative, { documentName } = {}) {
  let changed = false;
  let prepared = 0;
  let updated = 0;
  let added = 0;
  let deleted = 0;
  const remote = new Map(authoritative.map((document) => [String(document.id ?? document._id ?? ""), document]).filter(([id]) => id));
  for (const local of Array.from(collection.values?.() ?? collection)) {
    const current = remote.get(String(local.id ?? ""));
    if (!current) {
      collection.delete?.(local.id);
      changed = true;
      deleted += 1;
      continue;
    }
    const source = current.toObject?.() ?? current._source ?? current;
    // Foundry's recursive updateSource merges embedded collections by ID and
    // does not remove records absent from the fresh Scene. Replace the Scene
    // source when embedded membership changed, so the later native Canvas draw
    // receives the complete authoritative layers (including deletions).
    const replaceEmbedded = documentName === "Scene" && embeddedMembershipChanged(local._source, source);
    const changes = local.updateSource?.(source, replaceEmbedded ? { recursive: false } : undefined);
    if (changes && Object.keys(changes).length) {
      local._safePrepareData?.();
      changed = true;
      prepared += 1;
      updated += 1;
    }
    remote.delete(String(local.id ?? ""));
  }
  for (const document of remote.values()) {
    document._safePrepareData?.();
    collection.set?.(document.id, document);
    changed = true;
    prepared += 1;
    added += 1;
  }
  return Object.freeze({ changed, prepared, updated, added, deleted });
}

function embeddedMembershipChanged(local, authoritative) {
  if (!local || !authoritative) return false;
  for (const [key, remote] of Object.entries(authoritative)) {
    if (!Array.isArray(remote) || !Array.isArray(local[key])) continue;
    const previous = local[key];
    if (!previous.some((entry) => entry?._id) && !remote.some((entry) => entry?._id)) continue;
    if (previous.length !== remote.length) return true;
    if (previous.some((entry, index) => String(entry?._id ?? "") !== String(remote[index]?._id ?? ""))) return true;
  }
  return false;
}

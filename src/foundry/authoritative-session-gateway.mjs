import { localizeFoundry } from "./localization.mjs";
const COLLECTIONS = Object.freeze(["User", "Folder", "Actor", "Scene", "Combat", "JournalEntry", "ChatMessage"]);
const SOURCE_KEYS = Object.freeze({ User: "users", Folder: "folders", Actor: "actors", Scene: "scenes",
  Combat: "combats", JournalEntry: "journal", ChatMessage: "messages" });
const COLLECTION_LABELS = Object.freeze({
  User: "users",
  Folder: "folders",
  Actor: "actors",
  Scene: "Scenes",
  Combat: "combat encounters",
  JournalEntry: "journals",
  ChatMessage: "chat messages"
});

/** Re-query permission-filtered world sources on Foundry 13/14 without hydrating unchanged documents. */
export function createFoundryAuthoritativeSessionGateway({
  getGame = () => globalThis.game,
  getUi = () => globalThis.ui,
  diagnostics = null,
  performanceObserver = null,
  requestSources = requestWorldSources,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  // rAF can stop entirely while a phone/browser tab is hidden. A reconnect
  // must not wait for a foreground animation frame to finish synchronizing.
  yieldControl = () => new Promise(resolve => globalThis.setTimeout(resolve, 0))
} = {}) {
  let initialSources = null;
  let knownSources = new WeakMap();
  let baselineSession = null;
  const sessionIdentity = game => ({ game, userId: game?.user?.id ?? game?.userId ?? game?.data?.userId, worldId: game?.world?.id });
  const sameSession = (left, right) => left?.game === right.game && left?.userId === right.userId && left?.worldId === right.worldId;
  const ensureSession = game => {
    const identity = sessionIdentity(game);
    if (!sameSession(baselineSession, identity)) {
      initialSources = null;
      knownSources = new WeakMap();
      baselineSession = identity;
    }
  };
  return Object.freeze({
    // init runs before native document construction. That construction can
    // rewrite its source (prototype overrides, system migrations, module data).
    // Keep exact wire signatures, not another copy of the prepared world.
    captureInitialSources() {
      const game = getGame();
      ensureSession(game);
      if (!game?.data || !baselineSession.userId || !baselineSession.worldId) return false;
      initialSources = new Map(COLLECTIONS.map(name => [name, new Map(
        (game.data[SOURCE_KEYS[name]] ?? []).map(source => [source._id, sourceSignature(source)]))]));
      return true;
    },
    bindInitialDocuments() {
      const game = getGame();
      ensureSession(game);
      if (!initialSources) return false;
      for (const [name, sources] of initialSources) {
        const collection = game.collections?.get?.(name);
        for (const [id, remote] of sources) {
          const document = collection?.get?.(id);
          if (document) knownSources.set(document, { remote, local: sourceSignature(document.toObject(true)) });
        }
      }
      initialSources = null;
      return true;
    },
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
      ensureSession(game);
      const userId = game.user.id;
      const worldId = game.world?.id;
      const currentSession = () => isCurrent() && getGame() === game && game.user?.id === userId && game.world?.id === worldId;
      progress("collections", localizeFoundry("VEMOBILE.Interface.AppFrame.RefreshingWorldData2", "Refreshing world data…"));
      const finishFetch = performanceObserver?.start?.("reconnect.authoritative.fetch") ?? (() => {});
      let fetchFailed = false;
      const fetched = await Promise.all(COLLECTIONS.map(async (documentName) => {
        const collection = game.collections.get?.(documentName);
        const cls = collection?.documentClass ?? collection?.constructor?.documentClass;
        if (!collection || !cls) return [documentName, collection, null, cls];
        const collectionStartedAt = now();
        try {
          performanceObserver?.increment?.("reconnect.collection.fetched");
          const sources = validateSources(await requestSources({ documentName, documentClass: cls, user: game.user }));
          const values = sources;
          collectionTimings[documentName] = Math.max(0, now() - collectionStartedAt);
          performanceObserver?.increment?.("reconnect.document.fetched", values.length);
          // A collection count is a completion fact, never incremental progress.
          if (!fetchFailed) diagnostics?.record?.("debug", `Refreshed ${COLLECTION_LABELS[documentName]} (${values.length})`);
          return [documentName, collection, values, cls];
        } catch (error) {
          fetchFailed = true;
          error.reconnectCheckpoint = "collections";
          error.reconnectDetail = localizeFoundry(`VEMOBILE.Recovery.Collection.${documentName}`, `Could not refresh ${COLLECTION_LABELS[documentName]}.`);
          throw error;
        }
      }));
      finishFetch();
      timings.collections = Math.max(0, now() - checkpointStartedAt.get("collections"));
      if (!currentSession()) {
        finishTotal();
        return Object.freeze({ applied: false, reason: "stale-generation" });
      }
      const fetchedAt = now();
      // Let the reconnect shield paint before applying any necessary Foundry
      // document preparation on the main thread. This does not gate readiness.
      await yieldControl();
      if (!currentSession()) {
        finishTotal();
        return Object.freeze({ applied: false, reason: "stale-generation" });
      }
      progress("foundry-session", localizeFoundry("VEMOBILE.Interface.AppFrame.SynchronisingSceneData2", "Synchronizing scene data…"));
      const finishReconcile = performanceObserver?.start?.("reconnect.authoritative.reconcile") ?? (() => {});
      const changedCollections = new Set();
      const work = { prepared: 0, updated: 0, added: 0, deleted: 0 };
      for (const [documentName, collection, documents, documentClass] of fetched) {
        if (!collection || !documents) continue;
        const result = await reconcileCollection(collection, documents, { documentClass, knownSources, isCurrent: currentSession, yieldControl, now });
        if (result.stale) {
          finishTotal();
          return Object.freeze({ applied: false, reason: "stale-generation" });
        }
        for (const key of Object.keys(work)) work[key] += result[key];
        for (const key of Object.keys(work)) performanceObserver?.increment?.(`reconnect.${documentName}.${key}`, result[key]);
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

      if (!currentSession()) {
        finishTotal();
        return Object.freeze({ applied: false, reason: "stale-generation" });
      }
      progress("foundry-session", localizeFoundry("VEMOBILE.Interface.AuthoritativeSessionGateway.RestoringGameMessages", "Restoring game messages…"));
      await Promise.resolve(getUi()?.chat?.render?.({ force: true }));
      if (!currentSession()) {
        finishTotal();
        return Object.freeze({ applied: false, reason: "stale-generation" });
      }
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

// Both supported ClientDatabaseBackends use this authenticated request before
// mapping result through documentClass.fromSource. Keep the full server-filtered
// sources and construct only new documents; `index:true` would change the query.
async function requestWorldSources({ documentName }) {
  const socket = globalThis.foundry?.helpers?.SocketInterface;
  if (typeof socket?.dispatch !== "function") throw new Error(localizeFoundry("VEMOBILE.Interface.AuthoritativeSessionGateway.DocumentTransportUnavailable", "Foundry's document connection is unavailable."));
  const response = await socket.dispatch("modifyDocument", {
    type: documentName,
    action: "get",
    operation: { query: {}, broadcast: false }
  });
  return response?.result;
}

function validateSources(sources) {
  if (!Array.isArray(sources)) throw new Error(localizeFoundry("VEMOBILE.Interface.AuthoritativeSessionGateway.InvalidDocumentCollection", "Foundry returned invalid world data."));
  const ids = new Set();
  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source) || typeof source._id !== "string" || !source._id || ids.has(source._id)) {
      throw new Error(localizeFoundry("VEMOBILE.Interface.AuthoritativeSessionGateway.InvalidDocumentSource", "Foundry returned an invalid document record."));
    }
    ids.add(source._id);
  }
  return sources;
}

async function reconcileCollection(collection, authoritative, { documentClass, knownSources, isCurrent, yieldControl, now }) {
  let changed = false;
  let prepared = 0;
  let updated = 0;
  let added = 0;
  let deleted = 0;
  const remote = new Map(authoritative.map(source => [source._id, source]));
  let sliceStartedAt = now();
  const yieldIfNeeded = async () => {
    if (now() - sliceStartedAt >= 12) {
      await yieldControl();
      sliceStartedAt = now();
    }
    return isCurrent();
  };
  for (const local of Array.from(collection.values?.() ?? collection)) {
    if (!isCurrent()) return { stale: true };
    const source = remote.get(String(local.id ?? ""));
    if (!source) {
      collection.delete?.(local.id);
      changed = true;
      deleted += 1;
    } else {
      const saved = local.toObject?.(true) ?? local._source;
      const remoteSignature = sourceSignature(source), localSignature = sourceSignature(saved);
      const known = knownSources.get(local);
      let applied = false;
      // Skip only when BOTH the authoritative wire record and this exact native
      // document's post-prepare source are unchanged. A missed server edit or a
      // local-only mutation invalidates this fast path, including permissions.
      if (known?.remote !== remoteSignature || known.local !== localSignature) {
        const cleaned = documentClass.cleanData(source, { partial: false, persisted: true });
        retainUnpersistedIds(cleaned, source, saved);
        if (!sourceEqual(saved, cleaned)) {
          const changes = local.updateSource(cleaned, { recursive: false });
          applied = true;
          if (changes && Object.keys(changes).length) {
            // updateSource reinitializes and prepares native Documents already.
            // A second prepareData call accumulates D&D5e class levels/bonuses.
            changed = true;
            prepared += 1;
            updated += 1;
          }
        }
      }
      knownSources.set(local, { remote: remoteSignature, local: applied ? sourceSignature(local.toObject?.(true) ?? local._source) : localSignature });
      remote.delete(String(local.id ?? ""));
    }
    if (!await yieldIfNeeded()) return { stale: true };
  }
  for (const source of remote.values()) {
    if (!isCurrent()) return { stale: true };
    const signature = sourceSignature(source);
    const document = documentClass.fromSource(source);
    collection.set?.(document.id, document);
    knownSources.set(document, { remote: signature, local: sourceSignature(document.toObject?.(true) ?? document._source) });
    changed = true;
    prepared += 1;
    added += 1;
    if (!await yieldIfNeeded()) return { stale: true };
  }
  return Object.freeze({ changed, prepared, updated, added, deleted });
}

function sourceSignature(source) {
  return JSON.stringify(source, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
}

function sourceEqual(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) return false;
  // Optional undefined fields have no wire representation. Native cleaning can
  // add them while updateSource drops them again; neither is a saved change.
  const keys = Object.keys(left).filter(key => left[key] !== undefined);
  return keys.length === Object.keys(right).filter(key => right[key] !== undefined).length
    && keys.every(key => Object.hasOwn(right, key) && sourceEqual(left[key], right[key]));
}

/** Preserve only IDs supplied by cleaning, never IDs present in server data. */
function retainUnpersistedIds(cleaned, raw, local) {
  if (!cleaned || !raw || !local || typeof cleaned !== "object" || typeof raw !== "object" || typeof local !== "object") return;
  if (Array.isArray(raw)) {
    if (!Array.isArray(cleaned) || !Array.isArray(local)) return;
    // Embedded documents match by their authoritative ID, even after reorder.
    // Anonymous legacy entries have only their containing slot as identity;
    // their other fields and array order are still compared normally.
    const byId = new Map(local.filter(value => value?._id !== undefined).map(value => [value._id, value]));
    raw.forEach((value, index) => retainUnpersistedIds(cleaned[index], value,
      value?._id !== undefined ? byId.get(value._id) : local[index]));
    return;
  }
  if (Array.isArray(cleaned) || Array.isArray(local)) return;
  if (raw._id !== undefined && raw._id !== local._id) return;
  if (raw._id === undefined && typeof cleaned._id === "string" && typeof local._id === "string") cleaned._id = local._id;
  for (const key of Object.keys(raw)) {
    if (key !== "_id") retainUnpersistedIds(cleaned[key], raw[key], local[key]);
  }
}

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
const HEADER_INDEX_FIELDS = Object.freeze(["_id", "_stats.modifiedTime"]);

/** Re-query permission-filtered world sources on Foundry 13/14 without hydrating unchanged documents. */
export function createFoundryAuthoritativeSessionGateway({
  getGame = () => globalThis.game,
  getUi = () => globalThis.ui,
  diagnostics = null,
  performanceObserver = null,
  requestHeaders = requestWorldHeaders,
  requestSources = requestWorldSources,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  // rAF can stop entirely while a phone/browser tab is hidden. A reconnect
  // must not wait for a foreground animation frame to finish synchronizing.
  yieldControl = () => new Promise(resolve => globalThis.setTimeout(resolve, 0))
} = {}) {
  let initialSources = null;
  let knownSources = new WeakMap();
  let baselineSession = null;
  // Capture the current world and user IDs that own the authoritative session.
  const sessionIdentity = game => ({ game, userId: game?.user?.id ?? game?.userId ?? game?.data?.userId, worldId: game?.world?.id });
  // Compare a captured session identity with the currently active world and user.
  const sameSession = (left, right) => left?.game === right.game && left?.userId === right.userId && left?.worldId === right.worldId;
  // Reset authoritative source caches when the owning world or user changes.
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
        (game.data[SOURCE_KEYS[name]] ?? []).map(source => [source._id, {
          remote: sourceSignature(source), revision: sourceRevision(source)
        }]))]));
      return true;
    },
    // Associate initial remote documents with their local source signatures for later provenance checks.
    bindInitialDocuments() {
      const game = getGame();
      ensureSession(game);
      if (!initialSources) return false;
      for (const [name, sources] of initialSources) {
        const collection = game.collections?.get?.(name);
        for (const [id, known] of sources) {
          const document = collection?.get?.(id);
          if (document) knownSources.set(document, {
            remote: known.remote,
            local: sourceSignature(document.toObject(true)),
            revision: known.revision
          });
        }
      }
      initialSources = null;
      return true;
    },
    async resync({ isCurrent = () => true, onProgress = () => {} } = {}) {
      // Fetch compact revision headers first, then retrieve only changed sources.
      // Session identity and caller generation guard each asynchronous boundary
      // so an old reconnect cannot overwrite a new world.
      performanceObserver?.increment?.("reconnect.authoritative.run");
      const finishTotal = performanceObserver?.start?.("reconnect.authoritative.total") ?? (() => {});
      const startedAt = now();
      const checkpointStartedAt = new Map();
      const timings = {};
      const collectionTimings = {};
      // Report bounded progress for the current authoritative source request.
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
      // Check whether the captured authoritative session and request remain active.
      const currentSession = () => isCurrent() && getGame() === game && game.user?.id === userId && game.world?.id === worldId;
      progress("collections", localizeFoundry("VEMOBILE.Interface.AppFrame.RefreshingWorldData2", "Refreshing world data…"));
      const finishFetch = performanceObserver?.start?.("reconnect.authoritative.fetch") ?? (() => {});
      let fetchFailed = false;
      const fetched = await Promise.all(COLLECTIONS.map(async (documentName) => {
        const collection = game.collections.get?.(documentName);
        const documentClass = collection?.documentClass ?? collection?.constructor?.documentClass;
        if (!collection || !documentClass) return [documentName, collection, null, documentClass];
        const collectionStartedAt = now();
        try {
          performanceObserver?.increment?.("reconnect.collection.fetched");
          const delta = await requestCollectionDelta({
            documentName, documentClass, user: game.user, collection, knownSources,
            requestHeaders, requestSources, diagnostics
          });
          collectionTimings[documentName] = Math.max(0, now() - collectionStartedAt);
          performanceObserver?.increment?.("reconnect.document.headers", delta.headers.length);
          performanceObserver?.increment?.("reconnect.document.fetched", delta.sources.length);
          // Collection counts are completion facts, never incremental progress.
          if (!fetchFailed) diagnostics?.record?.("debug", `Refreshed ${COLLECTION_LABELS[documentName]} (${delta.headers.length} headers, ${delta.sources.length} full records, ${delta.mode})`);
          return [documentName, collection, delta, documentClass];
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
      for (const [documentName, collection, delta, documentClass] of fetched) {
        if (!collection || !delta) continue;
        const result = await reconcileCollection(collection, delta, { documentClass, knownSources, isCurrent: currentSession, yieldControl, now });
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
        collections: Object.freeze(fetched.filter(([, , delta]) => delta).map(([name]) => name)),
        timings: Object.freeze({ ...timings, total }),
        slowestCollection: slowestCollection ? Object.freeze({ name: slowestCollection[0], durationMs: slowestCollection[1] }) : null
      });
    }
  });
}

// Ask Foundry for the smallest server-managed revision record that can announce
// additions, changes and deletions without transferring full Document sources.
async function requestWorldHeaders({ documentName }) {
  const socket = globalThis.foundry?.helpers?.SocketInterface;
  if (typeof socket?.dispatch !== "function") throw new Error(localizeFoundry("VEMOBILE.Interface.AuthoritativeSessionGateway.DocumentTransportUnavailable", "Foundry's document connection is unavailable."));
  const response = await socket.dispatch("modifyDocument", {
    type: documentName,
    action: "get",
    operation: { query: {}, index: true, indexFields: HEADER_INDEX_FIELDS, broadcast: false }
  });
  return response?.result;
}

// Both supported ClientDatabaseBackends use this authenticated request before
// mapping result through documentClass.fromSource. Request every source only for
// compatibility fallback; the normal path narrows the query to changed IDs.
async function requestWorldSources({ documentName, ids = null }) {
  // Use Foundry's authenticated socket transport and its normal permission
  // filtering instead of reading unrestricted database/world source data.
  const socket = globalThis.foundry?.helpers?.SocketInterface;
  if (typeof socket?.dispatch !== "function") throw new Error(localizeFoundry("VEMOBILE.Interface.AuthoritativeSessionGateway.DocumentTransportUnavailable", "Foundry's document connection is unavailable."));
  const response = await socket.dispatch("modifyDocument", {
    type: documentName,
    action: "get",
    operation: { query: ids?.length ? { _id__in: ids } : {}, broadcast: false }
  });
  return response?.result;
}

// Resolve one collection through revision headers and retain the old full-fetch
// path when indexed queries are unavailable or a concurrent deletion invalidates
// the two-stage result.
async function requestCollectionDelta({ documentName, documentClass, user, collection, knownSources,
  requestHeaders, requestSources, diagnostics }) {
  let headers;
  try {
    headers = validateHeaders(await requestHeaders({ documentName, documentClass, user }));
  } catch (error) {
    diagnostics?.record?.("warn", `Revision headers were unavailable for ${COLLECTION_LABELS[documentName]}; using a full collection refresh`, error);
    return fullCollectionDelta(validateSources(await requestSources({ documentName, documentClass, user })));
  }

  const ids = changedSourceIds(collection, headers, knownSources);
  if (!ids.length) return Object.freeze({ headers: Object.freeze(headers), sources: Object.freeze([]), mode: "headers-only" });
  const sources = validateSources(await requestSources({ documentName, documentClass, user, ids }));
  const byId = new Map(sources.map(source => [source._id, source]));
  if (ids.some(id => !byId.has(id))) {
    diagnostics?.record?.("warn", `Revision headers changed while refreshing ${COLLECTION_LABELS[documentName]}; using a full collection refresh`);
    return fullCollectionDelta(validateSources(await requestSources({ documentName, documentClass, user })));
  }

  // A source may change again between the header and source requests. Use its
  // newer revision while live socket events cover additions after the header.
  const currentHeaders = new Map(headers.map(header => [header._id, header]));
  for (const source of sources) currentHeaders.set(source._id, sourceHeader(source));
  return Object.freeze({
    headers: Object.freeze(Array.from(currentHeaders.values())),
    sources: Object.freeze(sources),
    mode: "delta"
  });
}

function fullCollectionDelta(sources) {
  return Object.freeze({
    headers: Object.freeze(sources.map(sourceHeader)),
    sources: Object.freeze(sources),
    mode: "full-fallback"
  });
}

function validateHeaders(headers) {
  if (!Array.isArray(headers)) throw new Error(localizeFoundry("VEMOBILE.Interface.AuthoritativeSessionGateway.InvalidDocumentCollection", "Foundry returned invalid world data."));
  const ids = new Set();
  for (const header of headers) {
    if (!header || typeof header !== "object" || Array.isArray(header) || typeof header._id !== "string" || !header._id || ids.has(header._id)) {
      throw new Error(localizeFoundry("VEMOBILE.Interface.AuthoritativeSessionGateway.InvalidDocumentSource", "Foundry returned an invalid document record."));
    }
    ids.add(header._id);
  }
  return headers;
}

function changedSourceIds(collection, headers, knownSources) {
  const changed = [];
  for (const header of headers) {
    const local = collection?.get?.(header._id);
    if (!local) {
      changed.push(header._id);
      continue;
    }
    const known = knownSources.get(local);
    const localSignature = sourceSignature(local.toObject?.(true) ?? local._source);
    const revision = sourceRevision(header);
    if (revision === null || known?.revision !== revision || known.local !== localSignature) changed.push(header._id);
  }
  return changed;
}

// Validate each returned document source for type, stable identity, uniqueness, and expected provenance.
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

async function reconcileCollection(collection, delta, { documentClass, knownSources, isCurrent, yieldControl, now }) {
  // Reuse unchanged document objects and prepare only changed/new sources;
  // yield between bounded slices so a large world does not monopolize the UI.
  let changed = false;
  let prepared = 0;
  let updated = 0;
  let added = 0;
  let deleted = 0;
  const remote = new Map(delta.headers.map(header => [header._id, header]));
  const sources = new Map(delta.sources.map(source => [source._id, source]));
  let sliceStartedAt = now();
  // Yield between large source batches while cancelling if the session becomes stale.
  const yieldIfNeeded = async () => {
    if (now() - sliceStartedAt >= 12) {
      await yieldControl();
      sliceStartedAt = now();
    }
    return isCurrent();
  };
  for (const local of Array.from(collection.values?.() ?? collection)) {
    if (!isCurrent()) return { stale: true };
    const id = String(local.id ?? "");
    const header = remote.get(id);
    if (!header) {
      collection.delete?.(local.id);
      changed = true;
      deleted += 1;
    } else {
      const saved = local.toObject?.(true) ?? local._source;
      const source = sources.get(id);
      const localSignature = sourceSignature(saved);
      const localRevision = sourceRevision(saved);
      const known = knownSources.get(local);
      let applied = false;
      if (source) {
        const remoteSignature = sourceSignature(source);
        const remoteRevision = sourceRevision(source);
        if (localRevision !== null && remoteRevision !== null && localRevision > remoteRevision) {
          // A live socket event overtook the two-stage query. Preserve that newer
          // native source instead of rolling it back to the fetched revision.
          knownSources.set(local, { remote: localSignature, local: localSignature, revision: localRevision });
        } else {
          const cleaned = documentClass.cleanData(source, { partial: false, persisted: true });
          retainUnpersistedIds(cleaned, source, saved);
          // A changed remote revision or local-only mutation reaches this full
          // source path. Prepare only when native cleaning finds a real change.
          if ((known?.remote !== remoteSignature || known.local !== localSignature) && !sourceEqual(saved, cleaned)) {
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
          knownSources.set(local, {
            remote: remoteSignature,
            local: applied ? sourceSignature(local.toObject?.(true) ?? local._source) : localSignature,
            revision: remoteRevision
          });
        }
      } else {
        const revision = sourceRevision(header);
        // A headers-only record is trustworthy only when both its server revision
        // and this exact native Document's prepared source still match the bound baseline.
        if (localRevision !== null && revision !== null && localRevision > revision) {
          knownSources.set(local, { remote: localSignature, local: localSignature, revision: localRevision });
        } else if (revision === null || known?.revision !== revision || known.local !== localSignature) {
          throw new Error(localizeFoundry("VEMOBILE.Interface.AuthoritativeSessionGateway.InvalidDocumentSource", "Foundry returned an invalid document record."));
        }
      }
      remote.delete(id);
    }
    if (!await yieldIfNeeded()) return { stale: true };
  }
  for (const header of remote.values()) {
    if (!isCurrent()) return { stale: true };
    const source = sources.get(header._id);
    // An unchanged header can outlive a live deletion which already removed the
    // local Document after changed IDs were selected. Do not recreate stale data.
    if (!source) continue;
    const signature = sourceSignature(source);
    const document = documentClass.fromSource(source);
    collection.set?.(document.id, document);
    knownSources.set(document, {
      remote: signature,
      local: sourceSignature(document.toObject?.(true) ?? document._source),
      revision: sourceRevision(source)
    });
    changed = true;
    prepared += 1;
    added += 1;
    if (!await yieldIfNeeded()) return { stale: true };
  }
  return Object.freeze({ changed, prepared, updated, added, deleted });
}

function sourceHeader(source) {
  const revision = sourceRevision(source);
  return Object.freeze({
    _id: String(source?._id ?? ""),
    _stats: Object.freeze({ modifiedTime: revision })
  });
}

function sourceRevision(source) {
  const value = source?._stats?.modifiedTime;
  if (value === null || value === undefined || value === "") return null;
  const revision = Number(value);
  return Number.isFinite(revision) && revision >= 0 ? revision : null;
}

// Build a stable signature for source data used to detect unchanged records.
function sourceSignature(source) {
  return JSON.stringify(source, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
}

// Compare source signatures without comparing live Foundry documents.
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

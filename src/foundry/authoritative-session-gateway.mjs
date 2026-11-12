import { localizeFoundry } from "./localization.mjs";
import { captureRevisionSource, createRevisionDescriptor, documentRevisionSignature } from "./authoritative-source-revisions.mjs";
import { createResyncChangeJournal } from "./authoritative-resync-changes.mjs";

const COLLECTIONS = Object.freeze(["User", "Folder", "Actor", "Scene", "Combat", "JournalEntry", "ChatMessage"]);
const SOURCE_KEYS = Object.freeze({ User: "users", Folder: "folders", Actor: "actors", Scene: "scenes",
  Combat: "combats", JournalEntry: "journal", ChatMessage: "messages" });
const COLLECTION_LABELS = Object.freeze({ User: "users", Folder: "folders", Actor: "actors", Scene: "Scenes",
  Combat: "combat encounters", JournalEntry: "journals", ChatMessage: "chat messages" });
const STALE_RECOVERY = Symbol("stale authoritative recovery");
const MAX_RECONCILIATION_PASSES = 4;
const MAX_PENDING_YIELDS = 64;

/** Recover native world sources using complete child revisions where supported, retaining full-source fallbacks. */
export function createFoundryAuthoritativeSessionGateway({
  getGame = () => globalThis.game,
  getUi = () => globalThis.ui,
  getHooks = () => globalThis.Hooks,
  diagnostics = null,
  performanceObserver = null,
  requestHeaders = requestWorldHeaders,
  requestSources = requestWorldSources,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  // Hidden tabs may never deliver rAF; recovery and cancellation must still make progress.
  yieldControl = () => new Promise(resolve => globalThis.setTimeout(resolve, 0))
} = {}) {
  let initialSources = null;
  let knownSources = new WeakMap();
  let descriptors = new WeakMap();
  let baselineSession = null;
  let knownAuthority = null;
  let activeController = null;
  // Cache shape inspection by native class within the current session, never across worlds/users.
  const descriptorFor = documentClass => {
    if (!documentClass || !["function", "object"].includes(typeof documentClass)) return null;
    if (!descriptors.has(documentClass)) descriptors.set(documentClass, createRevisionDescriptor(documentClass));
    return descriptors.get(documentClass);
  };
  // Native construction can rewrite game.data; only wire signatures and compact owned child metadata survive init.
  const sessionIdentity = game => ({ game, userId: game?.user?.id ?? game?.userId ?? game?.data?.userId, worldId: game?.world?.id });
  const sameSession = (left, right) => left?.game === right.game && left?.userId === right.userId && left?.worldId === right.worldId;
  const ensureSession = game => {
    const identity = sessionIdentity(game);
    if (!sameSession(baselineSession, identity)) {
      activeController?.abort();
      initialSources = null;
      knownSources = new WeakMap();
      descriptors = new WeakMap();
      knownAuthority = null;
      baselineSession = identity;
    }
  };

  return Object.freeze({
    // This capture deliberately does not access schemas before native document initialization.
    captureInitialSources() {
      const game = getGame();
      ensureSession(game);
      if (!game?.data || !baselineSession.userId || !baselineSession.worldId) return false;
      knownAuthority = userAuthoritySignature(game.data.users?.find(source => source._id === baselineSession.userId));
      initialSources = new Map(COLLECTIONS.map(name => [name, new Map(
        (game.data[SOURCE_KEYS[name]] ?? []).map(source => [source._id, {
          remote: sourceSignature(source), revisionSource: captureRevisionSource(source)
        }]))]));
      return true;
    },
    // Bind wire revisions to these exact prepared instances; replacement documents cannot borrow their baselines.
    bindInitialDocuments() {
      const game = getGame();
      ensureSession(game);
      if (!initialSources) return false;
      for (const [name, sources] of initialSources) {
        const collection = game.collections?.get?.(name);
        const descriptor = descriptorFor(collection?.documentClass ?? collection?.constructor?.documentClass);
        for (const [id, captured] of sources) {
          const document = collection?.get?.(id);
          if (document) knownSources.set(document, { remote: captured.remote,
            local: sourceSignature(document.toObject(true)),
            revision: documentRevisionSignature(captured.revisionSource, descriptor) });
        }
      }
      initialSources = null;
      return true;
    },
    async resync({ isCurrent = () => true, onProgress = () => {}, signal = null } = {}) {
      const game = getGame();
      if (!game?.user || !game?.collections) throw sessionNotReady();
      ensureSession(game);
      activeController?.abort();
      const controller = activeController = new AbortController();
      const stopForCaller = () => controller.abort();
      signal?.addEventListener("abort", stopForCaller, { once: true });
      if (signal?.aborted) controller.abort();
      const userId = game.user.id, worldId = game.world?.id;
      const baselines = knownSources;
      let recoveryAuthority = knownAuthority;
      // Every await and mutation rechecks caller ownership, native identity and the current gateway request.
      const current = () => !controller.signal.aborted && activeController === controller && isCurrent()
        && getGame() === game && game.user?.id === userId && game.world?.id === worldId;
      const assertCurrent = () => { if (!current()) throw STALE_RECOVERY; };
      const wait = promise => waitForRecovery(promise, controller.signal).then(value => { assertCurrent(); return value; });
      const contexts = COLLECTIONS.flatMap(documentName => {
        const collection = game.collections.get?.(documentName);
        const documentClass = collection?.documentClass ?? collection?.constructor?.documentClass;
        return collection && documentClass ? [{ documentName, collection, documentClass,
          descriptor: descriptorFor(documentClass) }] : [];
      });
      const assertCollection = context => {
        assertCurrent();
        if (game.collections.get?.(context.documentName) !== context.collection) throw STALE_RECOVERY;
      };
      let journal = null;
      const changedCollections = new Set();
      const startedAt = now();
      const work = { prepared: 0, updated: 0, added: 0, deleted: 0 };
      const collectionTimings = {}, timings = {};
      const finishTotal = performanceObserver?.start?.("reconnect.authoritative.total") ?? (() => {});
      performanceObserver?.increment?.("reconnect.authoritative.run");
      // Native sources apply before post-mutation hooks. Received broadcasts must reach that boundary first.
      const settleNativeUpdates = async () => {
        for (let attempt = 0; journal.hasPending(); attempt++) {
          assertCurrent();
          if (attempt >= MAX_PENDING_YIELDS) throw changingWorld();
          await wait(yieldControl());
        }
      };
      const progress = (checkpoint, detail, complete = false) => {
        assertCurrent();
        onProgress(Object.freeze({ checkpoint, detail, complete, timings: Object.freeze({ ...timings }) }));
      };
      // User roles/permissions can change source visibility without changing any other document's revision.
      const checkAuthority = deltas => {
        const users = deltas.find(delta => delta.documentName === "User");
        if (!users || journal.version("User") !== users.version) return;
        const authority = userAuthoritySignature(users.sources.get(userId));
        if (authority !== recoveryAuthority && recoveryAuthority !== null) {
          for (const context of contexts) if (context.documentName !== "User") journal.invalidate(context.documentName);
        }
        recoveryAuthority = authority;
      };
      // Validate every initial collection before the first reconciliation round can mutate any of them.
      const fetchCollection = async context => {
        assertCollection(context);
        const collectionStartedAt = now();
        performanceObserver?.increment?.("reconnect.collection.fetched");
        try {
          const delta = await readCollectionDelta(context, { baselines, journal, requestHeaders, requestSources,
            user: game.user, wait, assertCurrent: () => assertCollection(context), yieldControl, now });
          collectionTimings[context.documentName] = (collectionTimings[context.documentName] ?? 0) + Math.max(0, now() - collectionStartedAt);
          performanceObserver?.increment?.("reconnect.document.headers", delta.headerCount);
          performanceObserver?.increment?.("reconnect.document.fetched", delta.sources.size);
          diagnostics?.record?.("debug", `Refreshed ${COLLECTION_LABELS[context.documentName]} (${delta.inventory.size} records, ${delta.sources.size} full sources, ${delta.mode})`);
          return delta;
        } catch (error) {
          if (error === STALE_RECOVERY) throw error;
          const { documentName } = context;
          const failure = error instanceof Error ? error : new Error(String(error));
          failure.reconnectCheckpoint = "collections";
          failure.reconnectDetail = localizeFoundry(`VEMOBILE.Recovery.Collection.${documentName}`, `Could not refresh ${COLLECTION_LABELS[documentName]}.`);
          throw failure;
        }
      };

      try {
        assertCurrent();
        journal = createResyncChangeJournal({ game, hooks: getHooks(), contexts, isCurrent: current });
        // Aborting releases subscriptions immediately, even when an obsolete socket request never returns.
        controller.signal.addEventListener("abort", journal.dispose, { once: true });
        progress("collections", localizeFoundry("VEMOBILE.Interface.AppFrame.RefreshingWorldData2", "Refreshing world data…"));
        const finishFetch = performanceObserver?.start?.("reconnect.authoritative.fetch") ?? (() => {});
        let deltas;
        try { deltas = await Promise.all(contexts.map(fetchCollection)); }
        finally { finishFetch(); }
        checkAuthority(deltas);
        timings.collections = Math.max(0, now() - startedAt);
        // Paint recovery before native preparation, without depending on a foreground animation frame.
        await wait(yieldControl());
        progress("foundry-session", localizeFoundry("VEMOBILE.Interface.AppFrame.SynchronisingSceneData2", "Synchronizing scene data…"));
        const reconciliationStartedAt = now();
        const finishReconcile = performanceObserver?.start?.("reconnect.authoritative.reconcile") ?? (() => {});
        try {
          for (let pass = 0; pass < MAX_RECONCILIATION_PASSES; pass++) {
            await settleNativeUpdates();
            for (const delta of deltas) {
              assertCollection(delta);
              if (collectionSettled(delta, journal)) continue;
              if (journal.version(delta.documentName) !== delta.version) continue;
              const result = await reconcileCollection(delta, { baselines, journal, wait,
                assertCurrent: () => assertCollection(delta), yieldControl, now });
              for (const key of Object.keys(work)) {
                work[key] += result[key];
                performanceObserver?.increment?.(`reconnect.${delta.documentName}.${key}`, result[key]);
              }
              if (result.changed) changedCollections.add(delta.collection);
            }
            progress("foundry-session", localizeFoundry("VEMOBILE.Interface.AuthoritativeSessionGateway.RestoringGameMessages", "Restoring game messages…"));
            await wait(Promise.resolve(getUi()?.chat?.render?.({ force: true })));
            // New events or changed native instance membership invalidate only affected collections.
            const needsRefresh = deltas.filter(delta => !collectionSettled(delta, journal));
            if (!needsRefresh.length && !journal.hasPending()) {
              for (const collection of changedCollections) collection.initializeTree?.();
              if (deltas.every(delta => collectionSettled(delta, journal)) && !journal.hasPending()) break;
            }
            if (pass === MAX_RECONCILIATION_PASSES - 1) throw changingWorld();
            await settleNativeUpdates();
            const refreshed = new Map(await Promise.all(deltas.filter(delta => !collectionSettled(delta, journal))
              .map(async delta => [delta.documentName, await fetchCollection(delta)])));
            deltas = deltas.map(delta => refreshed.get(delta.documentName) ?? delta);
            checkAuthority(deltas);
          }
        } finally { finishReconcile(); }
        timings["foundry-session"] = Math.max(0, now() - reconciliationStartedAt);
        for (const key of Object.keys(work)) performanceObserver?.increment?.(`reconnect.document.${key}`, work[key]);
        performanceObserver?.increment?.("reconnect.collection.rebuilt", changedCollections.size);
        assertCurrent();
        knownAuthority = recoveryAuthority;
        progress("foundry-session", localizeFoundry("VEMOBILE.Interface.AuthoritativeSessionGateway.WorldDataReady", "World data ready"), true);
        const total = Math.max(0, now() - startedAt);
        const slowestCollection = Object.entries(collectionTimings).sort((left, right) => right[1] - left[1])[0] ?? null;
        diagnostics?.record?.("debug", `Authoritative resync timings | collections=${Math.round(timings.collections)}ms FoundrySession=${Math.round(timings["foundry-session"])}ms total=${Math.round(total)}ms changedCollections=${changedCollections.size}`);
        return Object.freeze({ applied: true, collections: Object.freeze(contexts.map(context => context.documentName)),
          timings: Object.freeze({ ...timings, total }),
          slowestCollection: slowestCollection ? Object.freeze({ name: slowestCollection[0], durationMs: slowestCollection[1] }) : null });
      } catch (error) {
        if (error === STALE_RECOVERY || !current()) return Object.freeze({ applied: false, reason: "stale-generation" });
        // Leave coherent directory trees after partial preparation while the existing failure path requests a full reload.
        for (const collection of changedCollections) { try { collection.initializeTree?.(); } catch { /* Preserve the original failure. */ } }
        throw error;
      } finally {
        journal?.dispose();
        if (journal) controller.signal.removeEventListener("abort", journal.dispose);
        signal?.removeEventListener("abort", stopForCaller);
        controller.abort();
        if (activeController === controller) activeController = null;
        finishTotal();
      }
    }
  });
}

/** Await transport/render work without accepting a cancelled recovery's late result. */
function waitForRecovery(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(STALE_RECOVERY);
    if (signal.aborted) { Promise.resolve(promise).catch(() => {}); reject(STALE_RECOVERY); return; }
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

// Both requests use Foundry's authenticated backend and its current source filtering.
async function requestWorldHeaders({ documentName, indexFields }) {
  return requestWorldDocuments(documentName, { query: {}, index: true, indexFields, broadcast: false });
}
async function requestWorldSources({ documentName, ids = null }) {
  return requestWorldDocuments(documentName, { query: ids ? { _id__in: ids } : {}, broadcast: false });
}
// Unchanged indexed records never become Documents; no unrestricted server database access is introduced.
async function requestWorldDocuments(documentName, operation) {
  const socket = globalThis.foundry?.helpers?.SocketInterface;
  if (typeof socket?.dispatch !== "function") throw new Error(localizeFoundry("VEMOBILE.Interface.AuthoritativeSessionGateway.DocumentTransportUnavailable", "Foundry's document connection is unavailable."));
  const response = await socket.dispatch("modifyDocument", { type: documentName, action: "get", operation });
  return response?.result;
}

/** Capture exact instance/source provenance before requesting data; large scans yield in bounded slices. */
async function captureLocalSources(context, { wait, assertCurrent, yieldControl, now }) {
  const local = new Map();
  let sliceStartedAt = now();
  for (const document of context.collection.values?.() ?? context.collection) {
    assertCurrent();
    local.set(String(document.id), { document, signature: sourceSignature(document.toObject?.(true) ?? document._source) });
    if (now() - sliceStartedAt >= 12) { await wait(yieldControl()); sliceStartedAt = now(); }
  }
  return local;
}

/** Fetch complete parents for changed child trees, local mutations, replacement instances and observed live events. */
async function readCollectionDelta(context, environment) {
  const { documentName, documentClass, descriptor } = context;
  const { baselines, journal, requestHeaders, requestSources, user, wait, assertCurrent } = environment;
  const local = await captureLocalSources(context, environment);
  const version = journal.version(documentName);
  const args = { documentName, documentClass, user };
  // Full fallback inventories come from the normal full response, never from inaccessible/missing indexed IDs.
  const full = async mode => {
    const sources = validateSources(await wait(requestSources(args)));
    return { ...context, local, version, inventory: new Map(sources.map(source => [source._id, source])),
      sources: new Map(sources.map(source => [source._id, source])), headerCount: 0, mode, committed: false };
  };
  // User redaction creates transient timestamps on v14. Unknown shapes or unavailable observers retain full reads.
  if (documentName === "User" || !descriptor || !journal.available || typeof requestHeaders !== "function") return full("full");
  let headers;
  try { headers = validateSources(await wait(requestHeaders({ ...args, indexFields: descriptor.indexFields }))); }
  catch (error) { if (error === STALE_RECOVERY) throw error; return full("index-fallback"); }
  assertCurrent();
  // Do not spend another full-source request on an inventory already overtaken by a live event.
  if (journal.version(documentName) !== version) return { ...context, local, version,
    inventory: new Map(headers.map(header => [header._id, header])), sources: new Map(),
    headerCount: headers.length, mode: "interrupted", committed: false };
  const ids = [];
  for (const header of headers) {
    const before = local.get(header._id);
    const known = before ? baselines.get(before.document) : null;
    const revision = documentRevisionSignature(header, descriptor);
    if (!before || revision === null || known?.revision !== revision || known.local !== before.signature
      || journal.needsSource(documentName, header._id)) ids.push(header._id);
  }
  const sources = ids.length ? validateSources(await wait(requestSources({ ...args, ids }))) : [];
  const expected = new Set(ids);
  if (sources.length !== ids.length || sources.some(source => !expected.has(source._id))) return full("source-fallback");
  return { ...context, local, version, inventory: new Map(headers.map(header => [header._id, header])),
    sources: new Map(sources.map(source => [source._id, source])), headerCount: headers.length,
    mode: ids.length ? "delta" : "headers", committed: false };
}

// Reject malformed/duplicate root identities before any initial fetched collection is mutated.
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

/** Apply one read generation only while its inventory and exact native instance/source provenance remain current. */
async function reconcileCollection(delta, { baselines, journal, wait, assertCurrent, yieldControl, now }) {
  const { documentName, collection, documentClass, descriptor, local, inventory, sources } = delta;
  const result = { changed: false, prepared: 0, updated: 0, added: 0, deleted: 0 };
  const expectedOwners = new Map();
  let sliceStartedAt = now();
  const retry = id => { journal.invalidate(documentName, id); return result; };
  // Membership/replacement changes invalidate even when a local mutation did not emit a native event.
  for (const document of collection.values?.() ?? collection) if (local.get(String(document.id))?.document !== document) return retry(document.id);
  for (const [id, before] of local) if (collection.get?.(id) !== before.document) return retry(id);
  for (const id of new Set([...local.keys(), ...inventory.keys()])) {
    assertCurrent();
    if (journal.version(documentName) !== delta.version) return result;
    const before = local.get(id), document = collection.get?.(id);
    if (document !== before?.document) return retry(id);
    const saved = document?.toObject?.(true) ?? document?._source;
    const localSignature = document ? sourceSignature(saved) : null;
    if (document && localSignature !== before.signature) return retry(id);
    if (!inventory.has(id)) {
      if (document) { collection.delete?.(id); result.changed = true; result.deleted += 1; }
    } else {
      const source = sources.get(id);
      if (!source) {
        const known = document ? baselines.get(document) : null;
        const revision = documentRevisionSignature(inventory.get(id), descriptor);
        if (!document || revision === null || known?.revision !== revision || known.local !== localSignature) return retry(id);
        expectedOwners.set(id, document);
      } else {
        const remote = sourceSignature(source);
        const revision = documentRevisionSignature(source, descriptor);
        if (document) {
          const known = baselines.get(document);
          let applied = false;
          if (known?.remote !== remote || known.local !== localSignature) {
            const cleaned = documentClass.cleanData(source, { partial: false, persisted: true });
            retainUnpersistedIds(cleaned, source, saved);
            if (!sourceEqual(saved, cleaned)) {
              const changes = document.updateSource(cleaned, { recursive: false });
              applied = true;
              if (changes && Object.keys(changes).length) { result.changed = true; result.prepared += 1; result.updated += 1; }
            }
          }
          baselines.set(document, { remote, revision,
            local: applied ? sourceSignature(document.toObject?.(true) ?? document._source) : localSignature });
          expectedOwners.set(id, document);
        } else {
          const added = documentClass.fromSource(source);
          collection.set?.(added.id, added);
          baselines.set(added, { remote, revision, local: sourceSignature(added.toObject?.(true) ?? added._source) });
          expectedOwners.set(id, added);
          result.changed = true; result.prepared += 1; result.added += 1;
        }
      }
    }
    if (now() - sliceStartedAt >= 12) { await wait(yieldControl()); sliceStartedAt = now(); }
  }
  delta.expectedOwners = expectedOwners;
  delta.committed = journal.version(documentName) === delta.version;
  return result;
}

// Final membership checks are cheap; the scoped native journal invalidates mutations after earlier rows yielded.
function collectionSettled(delta, journal) {
  if (!delta.committed || journal.version(delta.documentName) !== delta.version) return false;
  const current = new Map(Array.from(delta.collection.values?.() ?? delta.collection, document => [String(document.id), document]));
  if (current.size !== delta.expectedOwners.size) { journal.invalidate(delta.documentName); return false; }
  for (const [id, document] of delta.expectedOwners) if (current.get(id) !== document) { journal.invalidate(delta.documentName, id); return false; }
  return true;
}

// Bounded instability uses the existing localized failure/full-reload path, never a false ready result.
function sessionNotReady() {
  return new Error(localizeFoundry("VEMOBILE.Interface.AuthoritativeSessionGateway.TheFoundrySessionIsNotReadyForResynchronisation", "The Foundry session is not ready for resynchronization."));
}
function changingWorld() {
  const error = sessionNotReady();
  error.reconnectCheckpoint = "collections";
  error.code = "resync-world-changing";
  return error;
}

// Build a stable signature for source data used to detect unchanged records.
function sourceSignature(source) {
  return JSON.stringify(source, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
}

// Ignore User redaction timestamps and presentation fields while retaining native role/permission boundaries.
function userAuthoritySignature(source) {
  return source && typeof source.role === "number"
    ? sourceSignature({ role: source.role, permissions: source.permissions ?? {} }) : null;
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

const MAX_TRACKED_IDS = 4096;

/** Observe only this recovery's live world mutations; disposal releases every hook and socket listener. */
export function createResyncChangeJournal({ game, hooks, contexts, isCurrent = () => true }) {
  const states = new Map(contexts.map(context => [context.documentName, {
    collection: context.collection, version: 0, ids: new Set(), all: false
  }]));
  const cleanups = [];
  const pending = new Map();
  let pendingCount = 0;
  let overflow = false;
  let disposed = false;
  const socket = game?.socket;
  const available = Boolean(hooks?.on && hooks?.off && socket?.on && socket?.off);

  // A bounded set forces full reads once a very busy collection exceeds targeted invalidation capacity.
  const invalidate = (documentName, id = null) => {
    if (disposed) return;
    const state = states.get(documentName);
    if (!state) return;
    state.version += 1;
    if (!id || state.ids.size >= MAX_TRACKED_IDS) {
      state.all = true;
      state.ids.clear();
    } else if (!state.all) state.ids.add(id);
  };
  // Resolve only the explicit tracked world root of a UUID; compendiums and unrelated world documents are ignored.
  const rootFromUuid = uuid => {
    const parts = typeof uuid === "string" ? uuid.split(".") : [];
    return parts.length >= 2 && states.has(parts[0]) && parts[1]
      ? { documentName: parts[0], id: parts[1] } : null;
  };
  // Synthetic Actor writes belong to their Scene, never to an Actor with a coincident world ID.
  const documentRoot = document => {
    if (!document || document.pack || document.inCompendium) return null;
    if (document.isToken) return rootFromUuid(document.token?.uuid ?? document.token?.document?.uuid);
    const explicit = rootFromUuid(document.uuid);
    if (explicit) return explicit;
    let ancestor = document;
    for (let depth = 0; ancestor && depth < 32; depth++, ancestor = ancestor.parent) {
      const documentName = ancestor.documentName ?? ancestor.constructor?.documentName;
      if (states.has(documentName) && !ancestor.parent && ancestor.id) return { documentName, id: ancestor.id };
    }
    return null;
  };
  // Test whether a broadcast can still mutate an existing local target while Foundry awaits its parent resolution.
  const existingTarget = (type, id, parentUuid, root) => {
    let document = states.get(root.documentName)?.collection.get?.(root.id);
    if (!parentUuid) return document;
    const parts = parentUuid.split(".");
    for (let index = 2; document && index + 1 < parts.length; index += 2) {
      document = document.getEmbeddedDocument?.(parts[index], parts[index + 1], { strict: false });
    }
    return document?.getEmbeddedDocument?.(type, id, { strict: false });
  };
  // Superseded owners release resources immediately on the next callback, including callers without an AbortSignal.
  const active = () => {
    if (disposed) return false;
    if (isCurrent()) return true;
    dispose();
    return false;
  };
  // Native post-mutation hooks mean source application is complete, even when module post-operation work continues.
  const applied = (action, document) => {
    if (!active()) return;
    const key = `${action}:${document?.uuid ?? ""}`;
    const count = pending.get(key) ?? 0;
    if (count) {
      if (count === 1) pending.delete(key);
      else pending.set(key, count - 1);
      pendingCount -= 1;
    }
    const root = documentRoot(document);
    if (root) invalidate(root.documentName, root.id);
    // A current-user mutation may change backend visibility while all world document timestamps stay equal.
    if (root?.documentName === "User" && root.id === game.user?.id) {
      for (const name of states.keys()) if (name !== "User") invalidate(name);
    }
  };
  // Observe receipt as well as application: Foundry's socket handlers await parent/loading work before updating sources.
  const observeResponse = response => {
    if (!active() || response?.error || response?.operation?.pack) return;
    const { type, action, operation = {}, result } = response ?? {};
    if (!["create", "update", "delete"].includes(action) || !Array.isArray(result)) return;
    const parentUuid = operation.parentUuid ?? operation.parent?.uuid ?? null;
    for (const record of result) {
      const id = action === "delete" ? record : record?._id;
      if (typeof id !== "string" || !id) continue;
      const root = parentUuid ? rootFromUuid(parentUuid) : (states.has(type) ? { documentName: type, id } : null);
      if (!root) continue;
      invalidate(root.documentName, root.id);
      // An update/delete for an already-absent target cannot overwrite that target locally and may emit no hook.
      if (action !== "create" && !existingTarget(type, id, parentUuid, root)) continue;
      if (pendingCount >= MAX_TRACKED_IDS) { overflow = true; continue; }
      const uuid = parentUuid ? `${parentUuid}.${type}.${id}` : `${type}.${id}`;
      const key = `${action}:${uuid}`;
      pending.set(key, (pending.get(key) ?? 0) + 1);
      pendingCount += 1;
    }
  };
  // Malformed/native resolution failures must block recovery rather than interrupt Foundry's own socket listeners.
  const received = response => {
    try { observeResponse(response); }
    catch { overflow = true; }
  };
  // v14 batches may mix parent operations and side effects; every constituent response owns its own completion hooks.
  const receivedBatch = batch => {
    if (Array.isArray(batch?.results)) for (const response of batch.results) received(response);
  };
  // Releasing this journal is idempotent and never masks the original fetch/preparation failure.
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const cleanup of cleanups.reverse()) {
      try { cleanup(); } catch { /* Native teardown may already have removed this owner. */ }
    }
    cleanups.length = 0;
    pending.clear();
    pendingCount = 0;
    states.clear();
  }

  try {
    if (available) {
      const types = new Set(contexts.map(context => context.documentName));
      // Schema-derived child types include native Scene/Token/ActorDelta provenance without module-specific allowlists.
      const collectTypes = descriptor => {
        if (!descriptor) return;
        if (descriptor.documentName) types.add(descriptor.documentName);
        for (const child of descriptor.children) collectTypes(child.descriptor);
      };
      for (const context of contexts) collectTypes(context.descriptor);
      for (const type of types) for (const action of ["create", "update", "delete"]) {
        const name = `${action}${type}`;
        const hookId = hooks.on(name, document => {
          try { applied(action, document); }
          catch { overflow = true; } // An unresolvable native mutation must fail recovery, never break Foundry's hook dispatch.
        });
        cleanups.push(() => hooks.off(name, hookId));
      }
      socket.on("modifyDocument", received);
      cleanups.push(() => socket.off("modifyDocument", received));
      socket.on("modifyDocumentBatch", receivedBatch);
      cleanups.push(() => socket.off("modifyDocumentBatch", receivedBatch));
    }
  } catch (error) {
    dispose();
    throw error;
  }

  return Object.freeze({
    available,
    version: documentName => states.get(documentName)?.version ?? -1,
    needsSource: (documentName, id) => {
      const state = states.get(documentName);
      return Boolean(state?.all || state?.ids.has(id));
    },
    hasPending: () => overflow || pendingCount > 0,
    invalidate,
    dispose
  });
}

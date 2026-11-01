/** Browser-local read cursor; message contents never enter storage or UI records. */
export function createChatReadTracker({ readGame, readDocument, getStorage = () => globalThis.localStorage }) {
  let key = "", cursor = null, messages = new Map(), unread = new Set(), view = null;
  const listeners = new Map(), memory = new Map();
  // Build the storage key for the current user, world, and chat read state.
  const contextKey = () => {
    const game = readGame();
    return game?.world?.id && game?.user?.id
      ? `ve-mobile.chat-read.v1:${encodeURIComponent(game.world.id)}:${encodeURIComponent(game.user.id)}` : "";
  };
  // Resolve the current latest visible message in the native chat collection.
  const currentMessage = id => {
    const collection = readGame()?.messages;
    return Array.isArray(collection) ? collection.find(message => String(message.id) === String(id)) : collection?.get?.(id);
  };
  // Check whether a message is visible to the current user.
  const visible = () => Array.from(readGame()?.messages?.contents ?? readGame()?.messages ?? [])
    .filter(message => message.visible !== false && message.id)
    .map(message => ({ id: String(message.id), timestamp: Number(message.timestamp ?? message._source?.timestamp) || 0 }));
  // Select messages newer than the stored read cursor.
  const afterCursor = message => message.timestamp > cursor.timestamp
    || (message.timestamp === cursor.timestamp && !cursor.ids.includes(message.id));
  // Persist the read cursor for the current context.
  const save = () => {
    if (!key) return;
    memory.set(key, cursor);
    try { getStorage()?.setItem(key, JSON.stringify(cursor)); } catch { /* Keep session state when storage is blocked. */ }
  };
  // Mark all currently visible messages as read and publish the resulting cursor.
  const readAll = () => {
    const timestamp = Array.from(messages.values()).reduce((latest, message) => Math.max(latest, message.timestamp), cursor?.timestamp ?? 0);
    cursor = { timestamp, ids: Array.from(messages.values()).filter(message => message.timestamp === timestamp).map(message => message.id) };
    unread.clear(); save();
  };
  // Reconcile persisted read state with current visible messages and stale ownership.
  const reconcile = () => {
    const nextKey = contextKey();
    const rows = visible();
    if (key !== nextKey || !cursor) {
      key = nextKey; cursor = memory.get(key) ?? null;
      if (!cursor && key) try { cursor = JSON.parse(getStorage()?.getItem(key) ?? "null"); } catch { /* Invalid or unavailable storage uses a fresh baseline. */ }
      if (!cursor || !Number.isFinite(cursor.timestamp) || !Array.isArray(cursor.ids) || !cursor.ids.every(id => typeof id === "string")) cursor = null;
      messages = new Map(rows.map(message => [message.id, message]));
      unread = new Set(cursor ? rows.filter(afterCursor).map(message => message.id) : []);
      if (!cursor) readAll();
    } else {
      const next = new Map(rows.map(message => [message.id, message]));
      unread = new Set([...unread].filter(id => next.has(id)));
      for (const row of rows) if (!messages.has(row.id) && afterCursor(row)) unread.add(row.id);
      messages = next;
    }
  };
  // Reset local read state when its user or world context changes.
  const ensureContext = () => { if (key !== contextKey() || !cursor) reconcile(); };
  // Publish the updated unread/read snapshot to the chat UI.
  const publish = () => {
    for (const [listener, previous] of listeners) if (previous !== unread.size) {
      listeners.set(listener, unread.size); listener(Object.freeze({ count: unread.size }));
    }
  };
  // Advance the read cursor only when the target message is currently visible.
  const readIfVisible = () => {
    const document = readDocument(), host = view?.host;
    if (!host?.isConnected || document?.visibilityState === "hidden") return;
    const scroll = host.querySelector?.(".chat-scroll") ?? host.querySelector?.(".chat-log");
    if (!scroll || scroll.clientHeight <= 0 || scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop > 4) return;
    const latest = Array.from(messages.keys()).at(-1);
    if (latest && !Array.from(host.querySelectorAll?.("[data-message-id]") ?? []).some(row => row.dataset.messageId === latest)) return;
    if (unread.size) { readAll(); publish(); }
  };
  // Refresh unread state from the current visible chat messages.
  const refresh = () => { reconcile(); readIfVisible(); publish(); };
  return Object.freeze({
    checkRead: readIfVisible,
    // Track chat read-state changes for the lifetime of the supplied owner scope.
    watch(scope, listener) {
      reconcile(); listeners.set(listener, -1); publish();
      scope.own(() => listeners.delete(listener));
      scope.hook("createChatMessage", message => {
        ensureContext();
        message = currentMessage(message?.id);
        const known = messages.has(String(message?.id));
        if (!known && message?.visible !== false && message?.id) {
          const id = String(message.id);
          messages.set(id, { id, timestamp: Number(message.timestamp ?? message._source?.timestamp) || 0 });
          unread.add(id);
        }
        readIfVisible(); publish();
      });
      scope.hook("updateChatMessage", message => {
        ensureContext();
        message = currentMessage(message?.id) ?? message;
        const id = String(message?.id);
        if (message?.visible === false) { messages.delete(id); unread.delete(id); }
        else if (!messages.has(id)) reconcile();
        readIfVisible(); publish();
      });
      scope.hook("deleteChatMessage", message => {
        ensureContext();
        if (currentMessage(message?.id)) return;
        messages.delete(String(message?.id)); unread.delete(String(message?.id));
        readIfVisible(); publish();
      });
      for (const name of ["updateUser", "renderChatLog"]) scope.hook(name, refresh);
      const document = readDocument();
      if (document?.addEventListener) scope.listen(document, "visibilitychange", refresh);
    },
    // Bind read tracking to messages currently rendered in the owned chat host.
    attach(host, scope) {
      const owner = { host }; view = owner;
      scope.own(() => { if (view === owner) view = null; });
      // Handle a new message and update unread state only when it is visible to this user.
      const check = () => { if (!scope.disposed && view === owner) readIfVisible(); };
      scope.listen(host, "scroll", check, { capture: true, passive: true });
      scope.listen(host, "load", check, { capture: true, passive: true });
      const Observer = readDocument()?.defaultView?.MutationObserver;
      if (Observer) {
        const observer = new Observer(check);
        observer.observe(host.querySelector?.(".chat-log") ?? host, { childList: true, subtree: true });
        scope.own(() => observer.disconnect());
      }
      queueMicrotask(check);
    }
  });
}

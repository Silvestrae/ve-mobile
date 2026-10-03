import { localizeFoundry } from "./localization.mjs";
const CHATLOG_PRUNE_ID = "chatlog-prune";
const MIDI_QOL_ID = "midi-qol";
const DEFAULT_BATCH_SIZE = 25;

/**
 * Inspect Chat Log Prune without depending on its implementation or API.
 * The module exposes no runtime API; its client setting and replacement class
 * are the stable observable integration points.
 */
export function inspectChatLogPrune(game = globalThis.game, config = globalThis.CONFIG) {
  const module = game?.modules?.get?.(CHATLOG_PRUNE_ID);
  const installed = Boolean(module);
  const moduleActive = Boolean(module?.active);
  const setting = readPruneSetting(game);
  const className = String(config?.ui?.chat?.name ?? "");
  const classActive = /ChatLogPrune/u.test(className);
  // The module's default is enabled. Treat an active module as the owner even
  // if VE's init hook runs before its setting/class hook; only an explicit
  // stored/registered false releases ownership.
  const active = moduleActive && setting !== false;
  return Object.freeze({
    installed,
    moduleActive,
    settingEnabled: setting,
    classActive,
    active,
    version: module?.version ?? null
  });
}

/** Install VE's bounded ChatLog subclass only when Chat Log Prune is not the owner. */
export function installVeChatWindowClass({
  game = globalThis.game,
  config = globalThis.CONFIG,
  foundry = globalThis.foundry,
  hooks = globalThis.Hooks
} = {}) {
  const prune = inspectChatLogPrune(game, config);
  if (prune.active) return Object.freeze({ installed: false, owner: "ChatLog Prune", prune });
  const midiLegacy = inspectMidiLegacyPruning(game, config);
  if (midiLegacy.active) return Object.freeze({ installed: false, owner: "Midi-QOL legacy", prune, midiLegacy });
  const BaseChatLog = config?.ui?.chat;
  if (typeof BaseChatLog !== "function") {
    return Object.freeze({ installed: false, owner: "none", prune, reason: localizeFoundry("VEMOBILE.Interface.ChatDomGateway.ChatLogClassUnavailable", "ChatLog class unavailable") });
  }
  if (BaseChatLog.veMobileBoundedChat === true) {
    return Object.freeze({ installed: true, owner: "VE", prune, ChatLogClass: BaseChatLog });
  }

  const Semaphore = foundry?.utils?.Semaphore;
  class VeMobileBoundedChatLog extends BaseChatLog {
    static veMobileBoundedChat = true;
    #veActive = false;
    #veRendering = false;
    #veRenderingForward = false;
    #veQueue = typeof Semaphore === "function" ? new Semaphore(1) : { add: (fn, ...args) => fn(...args) };
    #veForwardListener = null;
    #veLogElement = null;
    #veLimit = configuredBatchSize(config);

    veMobileSetBoundedWindow(active, limit = configuredBatchSize(config)) {
      this.#veActive = Boolean(active && !this.isPopout);
      this.#veLimit = Math.max(1, Number(limit) || configuredBatchSize(config));
      if (this.#veActive) this.#vePruneTop();
    }

    async scrollBottom(options = {}) {
      const result = await super.scrollBottom(options);
      if (this.#veActive) this.#vePruneTop();
      return result;
    }

    async renderBatch(size) {
      if (!this.#veActive) return super.renderBatch(size);
      if (this.#veRendering) return;
      this.#veRendering = true;
      return this.#veQueue.add(async () => {
        try {
          const log = this.element?.querySelector?.(".chat-log");
          const messages = game?.messages?.contents ?? [];
          const oldest = log?.firstElementChild?.dataset?.messageId;
          let end = oldest ? messages.findIndex((message) => message.id === oldest) : messages.length;
          if (end < 0) end = messages.length;
          const start = Math.max(0, end - Math.max(1, Number(size) || this.#veLimit));
          const present = renderedMessageIds(log);
          const elements = [];
          for (let index = start; index < end; index += 1) {
            const message = messages[index];
            if (!message?.visible || present.has(message.id)) continue;
            try {
              const element = await this.constructor.renderMessage(message);
              elements.push(element);
              present.add(message.id);
              if (!this.isPopout) message.logged = true;
            } catch (error) {
              hooks?.onError?.("VeMobileBoundedChatLog#renderBatch", error, {
                msg: `Chat message ${message?.id ?? "unknown"} failed to render`, log: "error"
              });
            }
          }
          if (elements.length) log?.prepend?.(...elements);
          this.#vePruneBottom();
        } finally {
          this.#veRendering = false;
        }
      });
    }

    _attachLogListeners(element, options) {
      super._attachLogListeners(element, options);
      this.#veDetachForwardListener();
      this.#veForwardListener = () => {
        if (!this.#veActive || this.#veRenderingForward) return;
        const denominator = element.scrollHeight - element.clientHeight;
        const ratio = denominator > 0 ? element.scrollTop / denominator : 1;
        if (ratio < 0.99) return;
        void this.#veRenderForward(configuredBatchSize(config));
      };
      this.#veLogElement = element;
      element.addEventListener("scroll", this.#veForwardListener, { passive: true });
    }

    async close(options = {}) {
      this.#veActive = false;
      this.#veDetachForwardListener();
      return super.close(options);
    }

    #veDetachForwardListener() {
      if (this.#veLogElement && this.#veForwardListener) {
        this.#veLogElement.removeEventListener?.("scroll", this.#veForwardListener);
      }
      this.#veLogElement = null;
      this.#veForwardListener = null;
    }

    #vePruneTop() {
      const log = this.element?.querySelector?.(".chat-log");
      if (!log) return;
      const threshold = this.#veLimit * 2;
      if ((log.children?.length ?? 0) < threshold) return;
      while ((log.children?.length ?? 0) > this.#veLimit) this.#veRemove(log.firstElementChild);
    }

    #vePruneBottom() {
      const log = this.element?.querySelector?.(".chat-log");
      if (!log) return;
      const threshold = this.#veLimit * 2;
      if ((log.children?.length ?? 0) < threshold) return;
      while ((log.children?.length ?? 0) > this.#veLimit) this.#veRemove(log.lastElementChild);
    }

    #veRemove(element) {
      const messageId = element?.dataset?.messageId;
      if (!messageId) return element?.remove?.();
      if (!this.isPopout) {
        const message = game?.messages?.get?.(messageId);
        if (message) message.logged = false;
      }
      // Removing the card releases its element-owned listeners with the DOM
      // node. Application roots and ChatMessage documents remain untouched.
      element.remove?.();
    }

    async #veRenderForward(size) {
      if (this.#veRenderingForward) return;
      this.#veRenderingForward = true;
      return this.#veQueue.add(async () => {
        try {
          const log = this.element?.querySelector?.(".chat-log");
          const messages = game?.messages?.contents ?? [];
          const newest = log?.lastElementChild?.dataset?.messageId;
          let start = newest ? messages.findIndex((message) => message.id === newest) + 1 : messages.length;
          if (!(start > 0)) return;
          const present = renderedMessageIds(log);
          const elements = [];
          for (let index = start; index < messages.length && elements.length < size; index += 1) {
            const message = messages[index];
            if (!message?.visible || present.has(message.id)) continue;
            try {
              elements.push(await this.constructor.renderMessage(message));
              present.add(message.id);
              if (!this.isPopout) message.logged = true;
            } catch (error) {
              hooks?.onError?.("VeMobileBoundedChatLog#renderForward", error, {
                msg: `Chat message ${message?.id ?? "unknown"} failed to render`, log: "error"
              });
            }
          }
          if (elements.length) log?.append?.(...elements);
          this.#vePruneTop();
        } finally {
          this.#veRenderingForward = false;
        }
      });
    }
  }

  config.ui.chat = VeMobileBoundedChatLog;
  return Object.freeze({ installed: true, owner: "VE", prune, ChatLogClass: VeMobileBoundedChatLog });
}

export function createChatDomGateway({
  readGame = () => globalThis.game,
  readUi = () => globalThis.ui,
  readConfig = () => globalThis.CONFIG,
  readDocument = () => globalThis.document
} = {}) {
  const limit = () => configuredBatchSize(readConfig());
  let veActive = false;
  return Object.freeze({
    activate(chat = readUi()?.chat) {
      if (inspectChatLogPrune(readGame(), readConfig()).active) { veActive = false; return false; }
      if (inspectMidiLegacyPruning(readGame(), readConfig()).active) { veActive = false; return false; }
      chat?.veMobileSetBoundedWindow?.(true, limit());
      veActive = typeof chat?.veMobileSetBoundedWindow === "function";
      return veActive;
    },
    deactivate(chat = readUi()?.chat) {
      chat?.veMobileSetBoundedWindow?.(false, limit());
      veActive = false;
    },
    snapshot() {
      const game = readGame();
      const document = readDocument();
      const prune = inspectChatLogPrune(game, readConfig());
      const midiLegacy = inspectMidiLegacyPruning(game, readConfig());
      const nativeRows = document?.querySelectorAll?.("#chat .chat-log > [data-message-id], #chat-popout .chat-log > [data-message-id]")?.length ?? 0;
      const veRows = document?.querySelectorAll?.(".ve-native-chat-screen .chat-log > [data-message-id]")?.length ?? 0;
      const veClass = Boolean(readConfig()?.ui?.chat?.veMobileBoundedChat);
      return Object.freeze({
        chatLogPruneInstalled: prune.installed,
        chatLogPruneActive: prune.active,
        chatLogPruneVersion: prune.version,
        midiQolLegacyPruningActive: midiLegacy.active,
        nativeRenderedRows: nativeRows,
        veRenderedRows: veRows,
        veWindowLimit: limit(),
        nativePruningOwner: prune.active ? "ChatLog Prune" : midiLegacy.active ? "Midi-QOL legacy" : (veClass && veActive ? "VE" : "none")
      });
    }
  });
}

export function inspectMidiLegacyPruning(game = globalThis.game, config = globalThis.CONFIG) {
  const module = game?.modules?.get?.(MIDI_QOL_ID);
  if (!module?.active) return Object.freeze({ active: false, version: module?.version ?? null });
  const enabled = readOptionalSetting(game, MIDI_QOL_ID, "pruneChatLog");
  const className = String(config?.ui?.chat?.name ?? "");
  const classActive = /ChatLogMidi/u.test(className);
  const supportedLegacyBuild = /^13\.0\./u.test(String(module.version ?? ""));
  return Object.freeze({
    active: classActive || (supportedLegacyBuild && enabled !== false),
    classActive,
    settingEnabled: enabled,
    version: module.version ?? null
  });
}

export function configuredBatchSize(config = globalThis.CONFIG) {
  return Math.max(1, Number(config?.ChatMessage?.batchSize) || DEFAULT_BATCH_SIZE);
}

function readPruneSetting(game) {
  try {
    const registered = game?.settings?.settings?.get?.(`${CHATLOG_PRUNE_ID}.enabled`);
    if (registered) return Boolean(game.settings.get(CHATLOG_PRUNE_ID, "enabled"));
    const stored = game?.settings?.storage?.get?.("client")?.get?.(`${CHATLOG_PRUNE_ID}.enabled`);
    if (stored && Object.hasOwn(stored, "value")) return stored.value !== false;
  } catch {
    return null;
  }
  return null;
}

function readOptionalSetting(game, namespace, key) {
  try {
    const registered = game?.settings?.settings?.get?.(`${namespace}.${key}`);
    if (registered) return game.settings.get(namespace, key);
    for (const scope of ["client", "world"]) {
      const stored = game?.settings?.storage?.get?.(scope)?.get?.(`${namespace}.${key}`);
      if (stored && typeof stored === "object" && Object.hasOwn(stored, "value")) return stored.value;
    }
    return game?.settings?.get?.(namespace, key) ?? null;
  } catch { return null; }
}

function renderedMessageIds(log) {
  return new Set(Array.from(log?.children ?? []).map((element) => element?.dataset?.messageId).filter(Boolean));
}

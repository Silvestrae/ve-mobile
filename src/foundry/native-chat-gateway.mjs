import { localizeFoundry } from "./localization.mjs";
/**
 * Temporarily hosts Foundry's live ChatLog inside VE Mobile.
 *
 * The element is moved rather than cloned so Foundry, the game system, and
 * modules retain ownership of rendering, listeners, context menus, and input.
 */
import { mountChatComposerDock } from "./chat-composer-dock.mjs";

export function createFoundryNativeChatGateway({
  readUi = () => globalThis.ui,
  readDocument = () => globalThis.document,
  readGame = () => globalThis.game,
  chatDomGateway = null
} = {}) {
  return Object.freeze({
    mount(host, scope) {
      const foundryUi = readUi();
      const documentRef = readDocument();
      const chat = foundryUi?.chat;
      const element = chat?.element;
      const chatForm = element?.querySelector?.(".chat-form");
      const input = documentRef?.getElementById?.("chat-message");
      const controls = documentRef?.getElementById?.("chat-controls");
      const originalParent = element?.parentElement;
      const theme = readFoundryTheme(documentRef);

      if (!host?.append || !scope?.own || !scope?.listen || !element || !chatForm || !input || !controls || !originalParent) {
        return Object.freeze({ ok: false, reason: localizeFoundry("VEMOBILE.Interface.NativeChatGateway.FoundryChatIsNotAvailable", "Foundry chat is not available.") });
      }

      const elementPlacement = placementOf(element);
      const inputPlacement = placementOf(input);
      const controlsPlacement = placementOf(controls);
      // Foundry's inactive Chat composer can live in its notification area.
      // Dice Tray follows that input, so capture it before moving the input.
      const diceTray = input.parentElement?.querySelector?.(".dice-tray") ?? null;
      const dicePlacement = diceTray ? placementOf(diceTray) : null;
      const wasActive = element.classList.contains("active");
      const originalToggleDescriptor = Object.getOwnPropertyDescriptor(chat, "_toggleNotifications");
      const originalToggle = chat._toggleNotifications;
      let restorePolyglot = () => {};
      let dockScope = null;
      let dockContent = null;
      let restored = false;

      const embedNativeControls = () => (dockContent ?? chatForm).append(controls, input);
      const mobileToggle = () => embedNativeControls();
      const restore = () => {
        if (restored) return;
        restored = true;

        if (chat._toggleNotifications === mobileToggle) {
          if (originalToggleDescriptor) Object.defineProperty(chat, "_toggleNotifications", originalToggleDescriptor);
          else delete chat._toggleNotifications;
        }
        element.classList.remove("ve-native-chat");
        if (!wasActive) element.classList.remove("active");
        if (dockScope !== scope) dockScope?.dispose?.();
        restorePlacement(controls, controlsPlacement);
        restorePlacement(input, inputPlacement);
        // The module may replace its tray while VE is open. Restore the live
        // replacement rather than resurrecting its removed node.
        const liveTray = chatForm.querySelector?.(".dice-tray") ?? (diceTray?.isConnected !== false ? diceTray : null);
        if (liveTray) {
          if (dicePlacement) restorePlacement(liveTray, dicePlacement);
          else input.insertAdjacentElement?.("afterend", liveTray);
        }
        restorePolyglot();
        restorePlacement(element, elementPlacement);
        try {
          originalToggle?.call(chat);
        } catch (error) {
          console.warn("VE Mobile | Foundry chat controls could not be restored", error);
        }
      };

      scope.own(restore);
      try {
        // Do not activate or expand Foundry's desktop sidebar here. Those APIs
        // can invoke layout-dependent module hooks on narrow mobile viewports.
        // Hosting the already-live controls preserves their native listeners
        // without involving the desktop sidebar lifecycle.
        chat._toggleNotifications = mobileToggle;
        host.classList?.add(theme);
        element.classList.add("active", "ve-native-chat");
        host.append(element);
        chatDomGateway?.activate?.(chat);
        scope.own(() => chatDomGateway?.deactivate?.(chat));
        embedNativeControls();
        if (diceTray) chatForm.append(diceTray);
        dockScope = scope.child?.("chat-composer-dock") ?? scope;
        mountChatComposerDock({ form: chatForm, input, host: element, document: documentRef, scope: dockScope });
        dockContent = chatForm.querySelector?.(".ve-chat-composer-content") ?? null;
        mountChatVisualViewport({ host, input, document: documentRef, scope });
        bindManualChatFocus(host, input, scope);
        queueMicrotask(() => {
          if (scope.disposed || restored) return;
          Promise.resolve(chat.scrollBottom?.({ waitImages: true })).catch((error) => {
            console.warn("VE Mobile | Native chat could not scroll to the newest message", error);
          });
        });
      } catch (error) {
        restore();
        console.error("VE Mobile | Native chat mount failed", error);
        return Object.freeze({ ok: false, reason: localizeFoundry("VEMOBILE.Interface.NativeChatGateway.FoundryChatCouldNotBeMounted", "Foundry chat could not be mounted.") });
      }

      try {
        restorePolyglot = mountPolyglotChatSelector({
          chat,
          chatForm,
          controls,
          input,
          document: documentRef,
          game: readGame(),
          sidebar: foundryUi?.sidebar,
          scope
        });
      } catch (error) {
        // An optional module must never tear down Foundry's native Chat.
        console.warn("VE Mobile | Polyglot selector could not be mounted", error);
      }

      return Object.freeze({ ok: true });
    }
  });
}

/** Size and position Chat's real layout box to the visible viewport. Android
 * can pan the visual viewport independently of the layout viewport for the
 * software keyboard; a 100dvh root then leaves composer hit targets in the
 * old layout region while the browser displays a panned portion of the page. */
export function mountChatVisualViewport({ host, input, document, scope }) {
  const browser = document?.defaultView;
  if (!host || !browser || !scope?.own || !scope?.listen) return;
  const names = ["--ve-chat-viewport-top", "--ve-chat-viewport-left", "--ve-chat-viewport-width", "--ve-chat-viewport-height"];
  let root = null;
  let previous = null;
  let disposed = false;
  let frame = null;
  let panePrevious = null;
  let rootObserver = null;
  let observedRoot = null;
  let splitViewportBaseline = null;
  const restorePane = () => {
    if (!panePrevious) return;
    host.classList.remove("ve-chat-visual-pane");
    if (panePrevious.value) host.style.setProperty("--ve-chat-pane-height", panePrevious.value, panePrevious.priority);
    else host.style.removeProperty("--ve-chat-pane-height");
    panePrevious = null;
  };
  const restore = () => {
    if (!root) return;
    root.classList.remove("ve-chat-visual-viewport");
    for (const [name, value, priority] of previous) {
      if (value) root.style.setProperty(name, value, priority);
      else root.style.removeProperty(name);
    }
    root = null;
    previous = null;
  };
  const reconcile = () => {
    if (disposed || scope.disposed || host.isConnected === false) return;
    const currentRoot = host.closest?.(".ve-mobile-app");
    if (!currentRoot || currentRoot.dataset?.route !== "chat") return;
    if (observedRoot !== currentRoot && typeof browser.MutationObserver === "function") {
      rootObserver ??= new browser.MutationObserver(update);
      rootObserver.disconnect();
      rootObserver.observe(currentRoot, { attributes: true, attributeFilter: ["data-route", "data-split-screen", "data-form-factor"] });
      observedRoot = currentRoot;
    }
    if (currentRoot.dataset?.splitScreen === "true") {
      // The Scene and navigation keep their layout; only a focused composer
      // needs its own pane clipped to the keyboard's visible bottom edge.
      restore();
      const pane = host.parentElement?.getBoundingClientRect?.();
      if (!pane || !host.style || !host.classList) { restorePane(); return; }
      const bounds = readChatVisualViewport(browser, document);
      const focused = document.activeElement === input;
      if (!splitViewportBaseline || splitViewportBaseline.width !== bounds.width) {
        splitViewportBaseline = { width: bounds.width, height: focused ? pane.height : bounds.height };
      } else if (!focused) {
        splitViewportBaseline.height = Math.max(splitViewportBaseline.height, bounds.height);
      }
      // iOS retains textarea focus after dismissing its keyboard, and its
      // browser controls can make visualViewport shorter even without one.
      // Clip only for a substantial drop from the keyboard-free viewport.
      const keyboardInset = splitViewportBaseline.height - bounds.height;
      if (!focused || keyboardInset < Math.max(100, splitViewportBaseline.height * 0.15)) { restorePane(); return; }
      panePrevious ??= { value: host.style.getPropertyValue("--ve-chat-pane-height"), priority: host.style.getPropertyPriority("--ve-chat-pane-height") };
      const height = Math.max(1, Math.min(pane.height, bounds.top + bounds.height - pane.top - (Number(browser.scrollY) || 0)));
      host.style.setProperty("--ve-chat-pane-height", `${height}px`);
      host.classList.add("ve-chat-visual-pane");
      return;
    }
    splitViewportBaseline = null;
    restorePane();
    if (root !== currentRoot) {
      restore();
      root = currentRoot;
      previous = names.map(name => [name, root.style.getPropertyValue(name), root.style.getPropertyPriority(name)]);
    }
    const bounds = readChatVisualViewport(browser, document);
    for (const [name, value] of names.map((name, index) => [name, [bounds.top, bounds.left, bounds.width, bounds.height][index]])) {
      const pixels = `${value}px`;
      if (root.style.getPropertyValue(name) !== pixels) root.style.setProperty(name, pixels);
    }
    root.classList.add("ve-chat-visual-viewport");
  };
  const update = () => {
    reconcile();
    if (frame !== null || typeof browser.requestAnimationFrame !== "function") return;
    frame = browser.requestAnimationFrame(() => { frame = null; reconcile(); });
  };
  const visualViewport = browser.visualViewport;
  scope.listen(visualViewport, "resize", update, { passive: true });
  scope.listen(visualViewport, "scroll", update, { passive: true });
  scope.listen(browser, "resize", update, { passive: true });
  scope.listen(browser, "orientationchange", update, { passive: true });
  scope.listen(input, "focus", update);
  scope.listen(input, "blur", update);
  scope.own(() => {
    disposed = true;
    if (frame !== null) browser.cancelAnimationFrame?.(frame);
    rootObserver?.disconnect();
    restorePane();
    restore();
  });
  queueMicrotask(update);
}

export function readChatVisualViewport(browser, document) {
  const viewport = browser?.visualViewport;
  const finite = (value) => Number.isFinite(value) ? value : null;
  const scrollY = finite(browser?.scrollY) ?? 0;
  const scrollX = finite(browser?.scrollX) ?? 0;
  return Object.freeze({
    top: finite(viewport?.pageTop) ?? scrollY + (finite(viewport?.offsetTop) ?? 0),
    left: finite(viewport?.pageLeft) ?? scrollX + (finite(viewport?.offsetLeft) ?? 0),
    width: Math.max(1, finite(viewport?.width) ?? finite(document?.documentElement?.clientWidth) ?? finite(browser?.innerWidth) ?? 1),
    height: Math.max(1, finite(viewport?.height) ?? finite(document?.documentElement?.clientHeight) ?? finite(browser?.innerHeight) ?? 1)
  });
}

/** Mount only Polyglot's language selector without impersonating a Chat popout. */
export function mountPolyglotChatSelector({ chat, chatForm, controls, input, document, game, sidebar, scope } = {}) {
  if (!game?.modules?.get?.("polyglot")?.active || !game.polyglot?._enableChatFeatures) return () => {};
  let selector = null;
  let original = null;
  let wasHidden = false;
  let createdForMobile = false;
  let mobileRow = null;
  let disposed = false;
  const createMissingSelector = () => {
    if (!document?.createElement || !chatForm || !input) return null;
    const container = document.createElement("div");
    const select = document.createElement("select");
    if (!container || !select) return null;
    container.id = "polyglot";
    container.className = "polyglot polyglot-lang-select flexrow";
    container.dataset.veMobilePolyglotFallback = "true";
    select.id = "polyglot-language";
    select.name = "polyglot-language";
    container.append?.(select);
    container.addEventListener?.("contextmenu", async () => {
      const setting = !game.settings?.get?.("polyglot", "checkbox");
      await game.settings?.set?.("polyglot", "checkbox", setting);
      game.polyglot.toggleSelector?.();
    });
    select.addEventListener?.("change", (event) => {
      game.polyglot.lastSelection = event?.target?.value;
    });
    createdForMobile = true;
    return container;
  };
  const reconcile = () => {
    if (disposed) return false;
    const next = chatForm?.querySelector?.(".polyglot-lang-select")
      ?? document?.querySelector?.(".polyglot-lang-select")
      ?? (selector?.isConnected !== false ? selector : null)
      ?? createMissingSelector();
    if (!next) return false;
    if (selector !== next) {
      selector = next;
      original = createdForMobile ? null : placementOf(selector);
      wasHidden = selector.hidden;
    }
    game.polyglot.renderChatLog = true;
    selector.hidden = false;
    const phone = document?.body?.dataset?.veMobileFormFactor !== "tablet";
    if (phone && document?.createElement && input?.insertAdjacentElement) {
      if (!mobileRow?.isConnected) {
        mobileRow = document.createElement("div");
        mobileRow.className = "ve-polyglot-chat-row";
        mobileRow.setAttribute?.("aria-label", localizeFoundry("VEMOBILE.Interface.NativeChatGateway.ChatLanguage", "Chat language"));
        input.insertAdjacentElement("beforebegin", mobileRow);
      }
      mobileRow.append(selector);
    } else if (controls?.append) {
      mobileRow?.remove?.();
      mobileRow = null;
      controls.append(selector);
    } else input.insertAdjacentElement?.("beforebegin", selector);
    return true;
  };
  const refreshLanguages = () => {
    if (disposed || !reconcile() || !game?.ready) return;
    try {
      // Foundry can replace Chat's input on route exit. Polyglot retains its
      // TomSelect instance across that render and otherwise updates the old,
      // detached select while the new one remains empty.
      const currentSelect = selector?.querySelector?.("select#polyglot-language");
      const oldTomSelect = game.polyglot.tomSelect;
      if (currentSelect && oldTomSelect && oldTomSelect.input !== currentSelect) {
        try { oldTomSelect.destroy(); }
        finally { game.polyglot.tomSelect = undefined; }
      }
      void Promise.resolve(game.polyglot.updateUserLanguages?.()).catch((error) => {
        console.warn("VE Mobile | Polyglot languages could not be refreshed", error);
      });
    } catch (error) {
      console.warn("VE Mobile | Polyglot languages could not be refreshed", error);
    }
  };
  reconcile();
  // renderChat mounts this live ChatLog before its VE host is inserted.
  // Polyglot's TomSelect constructor queries document by selector ID, so it
  // must run after the host becomes connected in the same render turn.
  queueMicrotask(refreshLanguages);
  scope?.hook?.("ready", () => queueMicrotask(refreshLanguages));
  scope?.hook?.("renderChatLog", () => queueMicrotask(refreshLanguages));
  scope?.hook?.("renderSidebarTab", (application) => {
    if (application === chat || application?.id === "chat") queueMicrotask(refreshLanguages);
  });
  return () => {
    disposed = true;
    if (original?.parent) {
      restorePlacement(selector, original);
      selector.hidden = wasHidden;
    } else if (selector) {
      input?.insertAdjacentElement?.("beforebegin", selector);
      selector.hidden = !sidebar?.expanded || !chat?.active;
    }
    mobileRow?.remove?.();
  };
}

export function placementOf(element) {
  return Object.freeze({ parent: element?.parentElement ?? null, nextSibling: element?.nextSibling ?? null });
}

export function restorePlacement(element, placement) {
  const { parent, nextSibling } = placement ?? {};
  if (!element || !parent) return;
  if (nextSibling?.parentElement === parent) parent.insertBefore(element, nextSibling);
  else parent.append(element);
}

export function readFoundryTheme(documentRef) {
  const interfaceElement = documentRef?.getElementById?.("interface");
  const body = documentRef?.body;
  if (interfaceElement?.classList?.contains("theme-light") || body?.classList?.contains("theme-light")) return "theme-light";
  return "theme-dark";
}

/** Permit software-keyboard focus only following a direct tap on the textarea. */
export function bindManualChatFocus(host, input, scope, { now = defaultNow, allowance = 750 } = {}) {
  let directInputTapAt = Number.NEGATIVE_INFINITY;
  scope.listen(host, "pointerdown", (event) => {
    const directInputTap = event.target === input || input.contains?.(event.target);
    // Dice Tray intentionally selects the native textarea on pointerdown.
    // Preserve that user gesture while the software keyboard is open.
    const diceButtonTap = Boolean(event.target?.closest?.(".ve-chat-dice-layer .dice-tray button"));
    directInputTapAt = directInputTap || diceButtonTap ? now() : Number.NEGATIVE_INFINITY;
    if (!directInputTap && !diceButtonTap && input.ownerDocument?.activeElement === input) input.blur();
  }, { capture: true });
  scope.listen(input, "focus", () => {
    if (now() - directInputTapAt > allowance) input.blur();
  }, { capture: true });
}

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

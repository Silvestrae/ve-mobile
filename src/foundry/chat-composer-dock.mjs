const STORAGE_PREFIX = "ve-mobile:chat-composer-dock:v1:";
const HANDLE_HEIGHT = 44;

/** Own one native Chat form as the lower dock without replacing its controls. */
export function mountChatComposerDock({ form, input, host, document, scope, getStorage = () => globalThis.localStorage }) {
  if (!form?.append || !document?.createElement || !scope?.own) return null;
  const mode = document.body?.dataset?.veMobileFormFactor === "tablet" ? "tablet" : "phone";
  const key = `${STORAGE_PREFIX}${mode}`;
  const saved = readDockState(getStorage(), key);
  const original = {
    height: form.style.height,
    flexBasis: form.style.flexBasis,
    hidden: form.hidden
  };
  const content = document.createElement("div");
  content.className = "ve-chat-composer-content";
  const diceLayer = document.createElement("div");
  diceLayer.className = "ve-chat-dice-layer";
  content.append(...form.childNodes);
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "ve-chat-composer-handle";
  handle.setAttribute("aria-controls", input.id || "chat-message");
  const icon = document.createElement("i");
  icon.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  handle.append(icon, label);
  form.append(handle, diceLayer, content);
  let disposed = false;
  scope.own(() => {
    disposed = true;
    content.inert = false;
    content.hidden = false;
    diceLayer.inert = false;
    diceLayer.hidden = false;
    form.replaceChildren(...diceLayer.childNodes, ...content.childNodes);
    form.classList.remove("ve-chat-composer-dock", "ve-chat-composer-collapsed");
    form.style.height = original.height;
    form.style.flexBasis = original.flexBasis;
    form.hidden = original.hidden;
  });
  const placeDiceTray = () => {
    if (disposed) return;
    const tray = content.querySelector?.(".dice-tray") ?? form.querySelector?.(".dice-tray");
    if (tray && tray.parentElement !== diceLayer) diceLayer.append(tray);
  };
  form.classList.add("ve-chat-composer-dock");
  let collapsed = saved.collapsed;
  placeDiceTray();
  const Observer = document.defaultView?.MutationObserver;
  const observer = Observer ? new Observer(placeDiceTray) : null;
  observer?.observe?.(form, { childList: true, subtree: true });
  scope.own(() => observer?.disconnect?.());
  const log = host.querySelector?.(".chat-scroll");
  const tabBar = host.querySelector?.(".damage-log-nav");
  const scrollAnchor = () => {
    if (!log) return null;
    const distance = log.scrollHeight - log.clientHeight - log.scrollTop;
    return { nearBottom: distance <= 32, top: log.scrollTop };
  };
  const restoreScroll = (anchor) => {
    if (!anchor || !log) return;
    log.scrollTop = anchor.nearBottom ? Math.max(0, log.scrollHeight - log.clientHeight) : anchor.top;
  };
  const labels = () => ({
    collapse: localize("VEMOBILE.Chat.ComposerCollapse", "Hide message box"),
    expand: localize("VEMOBILE.Chat.ComposerExpand", "Show message box")
  });
  const refresh = (anchor = scrollAnchor()) => {
    if (disposed) return;
    const damage = Boolean(host.querySelector?.('.damage-log-nav [data-tab="damage-log"].active'));
    form.hidden = damage;
    form.classList.toggle("ve-chat-composer-collapsed", collapsed);
    content.hidden = collapsed || damage;
    content.inert = collapsed || damage;
    diceLayer.hidden = collapsed || damage;
    diceLayer.inert = collapsed || damage;
    handle.setAttribute("aria-expanded", String(!collapsed));
    label.textContent = collapsed ? labels().expand : labels().collapse;
    handle.setAttribute("aria-label", label.textContent);
    handle.title = label.textContent;
    icon.className = collapsed ? "fa-solid fa-chevron-up" : "fa-solid fa-chevron-down";
    if (damage) form.style.height = "";
    else if (collapsed) form.style.height = `${HANDLE_HEIGHT}px`;
    else form.style.height = "";
    restoreScroll(anchor);
  };
  const persist = () => {
    try { getStorage()?.setItem?.(key, JSON.stringify({ collapsed })); } catch {}
  };
  const localize = (key, fallback) => {
    const value = globalThis.game?.i18n?.localize?.(key);
    return !value || value === key ? fallback : value;
  };
  scope.listen(handle, "click", () => {
    const anchor = scrollAnchor();
    collapsed = !collapsed;
    refresh(anchor);
    persist();
  });
  scope.listen(input, "focus", () => {
    if (collapsed) { collapsed = false; refresh(); persist(); }
  });
  if (tabBar) scope.listen(tabBar, "click", () => queueMicrotask(() => refresh()));
  refresh();
  return Object.freeze({ get collapsed() { return collapsed; }, refresh });
}

export function readDockState(storage, key) {
  try {
    const value = JSON.parse(storage?.getItem?.(key) ?? "null");
    return { collapsed: value?.collapsed === true };
  } catch { return { collapsed: false }; }
}

import { localizeFoundry } from "./localization.mjs";
import { resolveActorSource, speakerMatchesActor } from "./character-source.mjs";

const ACTION_UPDATE_SETTLE_MS = 180;
const EXPECTED_NATIVE_ROLL_MS = 120_000;

/** Render and live-update one native Foundry chat-message action thread. */
export function createFoundryActionSessionGateway({
  getGame = () => globalThis.game,
  getDocument = () => globalThis.document,
  getUi = () => globalThis.ui
} = {}) {
  return Object.freeze({
    async mount(host, session, scope, { onCompactVisibility = () => {} } = {}) {
      const rootMessageId = identifier(session?.rootMessageId);
      if (!host?.replaceChildren || !rootMessageId || !scope?.hook) {
        return Object.freeze({ ok: false, reason: localizeFoundry("VEMOBILE.Interface.ActionSessionGateway.ThatActionMessageIsUnavailable", "That action message is unavailable.") });
      }

      const document = getDocument();
      const compact = session?.compact === true;
      const theme = actionSessionTheme(host, document);
      host.classList?.remove?.("theme-light", "theme-dark");
      host.classList?.add("chat-popout", "themed", theme);
      let renderedIds = new Set();
      let hasRendered = false;
      let queue = Promise.resolve();
      let disposed = false;
      let renderTimer = null;
      let pendingResultScroll = false;
      let renderedSnapshot = "";
      let expectedNativeRollUntil = 0;
      const nativeRenderedCards = new Map();
      const renderingMessageIds = new Set();
      // Mounting is itself the result of an explicit item use. Its automation
      // can continue after the native use call returns or on a GM client.
      let expectedItemActivityUntil = Date.now() + EXPECTED_NATIVE_ROLL_MS;
      let existingActivityMessageIds = new Set(messageDocuments(getGame()).map(messageIdentifier));
      const explicitlyCapturedIds = new Set(Array.from(session?.messageIds ?? [], identifier).filter(Boolean));
      const initialMessages = messageDocuments(getGame());
      const rootCreatedAt = messageTimestamp(initialMessages.find(message => messageIdentifier(message) === rootMessageId));
      if (rootCreatedAt > 0 && rootCreatedAt <= Date.now() && Date.now() - rootCreatedAt <= EXPECTED_NATIVE_ROLL_MS) {
        for (const message of initialMessages) {
          if (messageTimestamp(message) >= rootCreatedAt && isVisibleItemActivity(message, session, getGame())) explicitlyCapturedIds.add(messageIdentifier(message));
        }
      }

      const render = async (scrollToResult = false) => {
        if (disposed || scope.disposed) return false;
        const messages = collectActionMessages(getGame(), rootMessageId, explicitlyCapturedIds);
        renderedIds = new Set(messages.map(messageIdentifier));
        const initialRender = !hasRendered;
        const previousScrollTop = Number(host.scrollTop) || 0;
        const nearBottom = !initialRender
          && Number(host.scrollHeight) - previousScrollTop - Number(host.clientHeight) < 72;
        const elements = [];
        const compactRecords = [];
        let compactDetails = null;
        for (const message of messages) {
          if (!canRenderMessage(message)) continue;
          try {
            const id = messageIdentifier(message);
            const nativeCard = nativeRenderedCards.get(id);
            let element;
            if (compact && nativeCard?.cloneNode) element = nativeCard.cloneNode(true);
            else {
              // renderHTML emits native hooks itself. Do not turn our fallback
              // render into another refresh or replay module hooks unnecessarily.
              renderingMessageIds.add(id);
              try {
                const rendered = await message.renderHTML();
                element = rendered?.jquery ? rendered[0] : rendered;
              } finally { renderingMessageIds.delete(id); }
            }
            if (!element?.setAttribute) continue;
            element.setAttribute("data-message-id", messageIdentifier(message));
            element.classList?.add("ve-action-session-message");
            if (compact) {
              if (messageIdentifier(message) === rootMessageId) compactDetails = compactActionDetailsElement(element, document);
              const summary = compactActionMessageElement(element, document, getUi?.()?.chat?.element, host);
              compactRecords.push({
                id: messageIdentifier(message),
                originId: originatingMessageId(message),
                activity: compactMessageActivity(message),
                saveTargetId: nativeSaveTargetId(message),
                summary,
                targets: collectRenderedActionTargets(element, new Map())
              });
            } else {
              prepareActionMessageElement(element);
              elements.push(element);
            }
          } catch (error) {
            console.warn(`VE Mobile | Could not render action message ${messageIdentifier(message)}`, error);
          }
        }
        if (disposed || scope.disposed) return false;
        if (compact) elements.push(...compactActivityElements(document, session, compactRecords));
        if (compact && !elements.length) {
          host.replaceChildren();
          renderedSnapshot = "";
          hasRendered = true;
          onCompactVisibility(false);
          return true;
        }
        if (compact) {
          host.dataset.rollCount = String(elements.reduce((count, group) => count + markOddCompactRoll(Array.from(group.children ?? [])), 0));
          if (compactDetails) elements.unshift(compactDetails);
        }
        if (!elements.length) {
          const unavailable = document.createElement("p");
          unavailable.className = "ve-action-session-unavailable";
          unavailable.textContent = localizeFoundry("VEMOBILE.Interface.ActionSessionGateway.ThisChatMessageIsNoLongerAvailableToYou", "This chat message is no longer available to you.");
          elements.push(unavailable);
        }
        const nextSnapshot = elements.map((element) => String(element?.outerHTML ?? "")).join("\u001e");
        if (!initialRender && nextSnapshot && nextSnapshot === renderedSnapshot) return true;
        if (initialRender || elements.some((element) => !messageIdentifierFromElement(element))) {
          host.replaceChildren(...elements);
        } else {
          reconcileActionMessageElements(host, elements);
        }
        renderedSnapshot = nextSnapshot;
        hasRendered = true;
        if (compact) onCompactVisibility(true);
        if (!initialRender && (scrollToResult || nearBottom)) host.scrollTop = host.scrollHeight;
        else host.scrollTop = initialRender ? 0 : previousScrollTop;
        return true;
      };

      const scheduleRender = (scrollToResult = false) => {
        queue = queue.then(() => render(scrollToResult), () => render(scrollToResult));
        return queue;
      };
      const requestRender = (scrollToResult = false) => {
        pendingResultScroll ||= scrollToResult;
        if (renderTimer !== null) clearTimeout(renderTimer);
        renderTimer = scope.timeout(() => {
          renderTimer = null;
          const shouldScroll = pendingResultScroll;
          pendingResultScroll = false;
          void scheduleRender(shouldScroll);
        }, ACTION_UPDATE_SETTLE_MS);
      };
      const belongs = (message) => {
        const id = messageIdentifier(message);
        const origin = originatingMessageId(message);
        if (id === rootMessageId || renderedIds.has(id) || explicitlyCapturedIds.has(id) || renderedIds.has(origin)) return true;
        if (Date.now() <= expectedItemActivityUntil && !existingActivityMessageIds.has(id) && isVisibleItemActivity(message, session, getGame())) {
          explicitlyCapturedIds.add(id);
          return true;
        }
        if (Date.now() <= expectedNativeRollUntil && isVisibleActorRoll(message, session, getGame())) {
          explicitlyCapturedIds.add(id);
          expectedNativeRollUntil = 0;
          return true;
        }
        return collectActionMessages(getGame(), rootMessageId, explicitlyCapturedIds)
          .some((candidate) => messageIdentifier(candidate) === id);
      };

      scope.hook("createChatMessage", (message) => {
        if (belongs(message)) requestRender(true);
      });
      scope.hook("updateChatMessage", (message) => {
        if (belongs(message)) {
          nativeRenderedCards.delete(messageIdentifier(message));
          requestRender(false);
        }
      });
      scope.hook("deleteChatMessage", (message) => {
        nativeRenderedCards.delete(messageIdentifier(message));
        if (belongs(message)) requestRender(false);
      });
      scope.hook("renderChatMessageHTML", (message, rendered) => {
        if (disposed || scope.disposed || renderingMessageIds.has(messageIdentifier(message)) || !belongs(message)) return;
        const element = rendered?.jquery ? rendered[0] : rendered;
        // Modules can finish/redact a card during rendering without updating its
        // document. Read that final native presentation after the settle window.
        if (compact && element?.cloneNode) nativeRenderedCards.set(messageIdentifier(message), element);
        requestRender(false);
      });
      scope.hook("diceSoNiceRollComplete", (messageId) => {
        const id = identifier(messageId);
        if (!id) return;
        const message = messageDocuments(getGame()).find((candidate) => messageIdentifier(candidate) === id);
        if (message && belongs(message)) requestRender(true);
      });
      if (!compact) bindActionDescriptionToggles(host, scope);
      bindNativeChatCardActions(host, rootMessageId, getUi, scope, () => {
        expectedNativeRollUntil = Date.now() + EXPECTED_NATIVE_ROLL_MS;
        expectedItemActivityUntil = expectedNativeRollUntil;
        existingActivityMessageIds = new Set(messageDocuments(getGame()).map(messageIdentifier));
      });
      scope.own(() => { disposed = true; nativeRenderedCards.clear(); });

      await scheduleRender(false);
      return Object.freeze({ ok: true });
    }
  });
}

/** The final roll occupies both columns when the flattened roll count is odd. */
export function markOddCompactRoll(elements) {
  const entries = elements.filter((element) => element.classList?.contains("ve-action-session-compact-entry"));
  let rollCount = 0;
  let run = [];
  const finishRun = () => {
    if (run.length % 2) run.at(-1)?.classList?.add("ve-action-session-compact-last-roll");
    run = [];
  };
  for (const entry of entries) {
    for (const row of Array.from(entry.children ?? [])) {
      if (row.classList?.contains?.("ve-action-session-compact-save-heading")) { finishRun(); continue; }
      run.push(row);
      rollCount += 1;
    }
  }
  finishRun();
  return rollCount;
}

/** Native activity identity groups cards without changing their chat provenance. */
export function compactMessageActivity(message) {
  if (!canRenderMessage(message) || message?.isContentVisible === false) return null;
  let activity;
  try { activity = message.getAssociatedActivity?.(); } catch { /* Use native flags if the activity was removed. */ }
  const flags = message.flags?.dnd5e ?? message._source?.flags?.dnd5e ?? {};
  const uuid = identifier(activity?.uuid ?? flags.activity?.uuid);
  const id = identifier(activity?.id ?? flags.activity?.id);
  const itemUuid = identifier(activity?.item?.uuid ?? flags.item?.uuid);
  const key = uuid || (id && itemUuid ? `${itemUuid}.Activity.${id}` : "");
  if (!key) return null;
  return { key, label: String(activity?.name ?? "").trim().slice(0, 120), type: identifier(activity?.type ?? flags.activity?.type) };
}

function nativeSaveTargetId(message) {
  // Midi may create a generic ChatMessage for a save, without a dnd5e roll type.
  // Its native speaker/request still identifies the target; the owning activity
  // and visible roll UI determine whether it is a redundant saving throw.
  const tokenId = identifier(message.speaker?.token ?? message._source?.speaker?.token);
  if (tokenId) return tokenId;
  const request = message.flags?.["midi-qol"]?.requestId ?? message._source?.flags?.["midi-qol"]?.requestId;
  return /^Scene\.[^.]+\.Token\.([^.]+)$/u.exec(String(request ?? ""))?.[1] ?? "";
}

/** Each activity owns its native rolls and outcomes. Only the root uses cast-time target previews. */
export function compactActivityElements(document, session, records) {
  if (!records.some(record => record.summary)) return [];
  const rootId = identifier(session?.rootMessageId);
  const byId = new Map(records.map(record => [record.id, record]));
  const groups = new Map();
  const resolveActivity = (record, visited = new Set()) => {
    if (!record || visited.has(record.id)) return null;
    if (record.activity) return record.activity;
    if (record.id === rootId) return { key: `message:${rootId}`, label: "" };
    visited.add(record.id);
    return resolveActivity(byId.get(record.originId), visited);
  };
  const rootActivity = resolveActivity(byId.get(rootId));
  const rootKey = rootActivity?.key || `message:${rootId}`;
  for (const record of records) {
    const activity = resolveActivity(record);
    // Unknown unlinked cards stay separate; their targets cannot contaminate the root.
    const key = activity?.key || (record.id === rootId ? rootKey : `message:${record.id}`);
    const group = groups.get(key) ?? { key, type: activity?.type, label: activity?.label || kindLabel(activity?.type), records: [], targets: new Map() };
    if (!group.label && activity?.label) group.label = activity.label;
    group.records.push(record);
    for (const [id, target] of record.targets) {
      const previous = group.targets.get(id);
      group.targets.set(id, { ...previous, ...target, attack: target.attack ?? previous?.attack ?? null, save: target.save ?? previous?.save ?? null });
    }
    groups.set(key, group);
  }
  const elements = [];
  for (const group of groups.values()) {
    const entries = [];
    for (const record of group.records) {
      if (!record.summary) continue;
      const save = group.targets.get(record.saveTargetId)?.save;
      // A linked target's standalone save is already represented by its visible native outcome.
      // Keep it when the outcome is hidden or cannot be matched to that exact target and total.
      if (save?.total) {
        for (const row of Array.from(record.summary.children ?? [])) {
          const kind = row.getAttribute?.("data-ve-roll-kind");
          const isSave = kind === "save" || (!kind && group.type === "save" && row.getAttribute?.("data-ve-roll-d20") === "true");
          if (isSave && row.getAttribute?.("data-ve-roll-total") === save.total) row.remove?.();
        }
      }
      if (record.summary.children.length) entries.push(record.summary);
    }
    if (!entries.length && !group.targets.size) continue;
    const section = document.createElement("div");
    section.className = "ve-action-session-compact-activity";
    section.setAttribute("role", "group");
    section.setAttribute("data-message-id", `activity:${group.key}`);
    const label = group.label || localizeFoundry("VEMOBILE.Interface.ActionSessionGateway.Activity", "Activity");
    section.setAttribute("aria-label", label);
    const heading = document.createElement("h3");
    heading.className = "ve-action-session-compact-activity-name";
    heading.textContent = label;
    section.append(heading, ...entries);
    const isRoot = group.key === rootKey;
    const targets = compactActionTargetsElement(document, `activity:${group.key}`, isRoot ? session?.targetIds : [], group.targets, isRoot ? session?.targetPreviews : []);
    if (targets && (group.targets.size || (isRoot && session?.targetIds?.length))) section.append(targets);
    elements.push(section);
  }
  // A single activity keeps the familiar minimal card; names explain multi-activity cards.
  if (elements.length === 1) elements[0].querySelector?.(".ve-action-session-compact-activity-name")?.remove?.();
  return elements;
}

/** Keep the mounted message nodes and patch their contents without a visual teardown. */
export function reconcileActionMessageElements(host, nextElements) {
  if (!host?.children) return false;
  const currentById = new Map(Array.from(host.children).map((element) => [messageIdentifierFromElement(element), element]));
  const retained = new Set();
  let position = 0;
  for (const next of nextElements) {
    const id = messageIdentifierFromElement(next);
    if (!id) continue;
    const current = currentById.get(id);
    if (current) {
      patchActionMessageElement(current, next);
    }
    const mounted = current ?? next;
    if (host.children[position] !== mounted) {
      if (host.insertBefore) host.insertBefore(mounted, host.children[position] ?? null);
      else host.append?.(mounted);
    }
    retained.add(mounted);
    position += 1;
  }
  for (const current of Array.from(host.children)) {
    if (!retained.has(current)) current.remove?.();
  }
  return true;
}

/** Patch attributes and child nodes in place, retaining the modal's local collapse state. */
export function patchActionMessageElement(current, next) {
  if (!current || !next || current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) return false;
  const collapsed = Array.from(current.querySelectorAll?.(".description.collapsible") ?? [])
    .map((element) => element.classList?.contains?.("collapsed") ?? true);
  const targetsOpen = current.querySelector?.(".ve-action-session-compact-targets")?.open ?? false;
  const itemDetailsOpen = current.classList?.contains?.("ve-action-session-compact-item-details") ? current.open : null;
  const rollsOpen = new Map(Array.from(current.querySelectorAll?.("details[data-ve-roll-key]") ?? [])
    .map((element) => [element.getAttribute("data-ve-roll-key"), element.open]));
  patchNode(current, next);
  if (itemDetailsOpen !== null) current.open = itemDetailsOpen;
  for (const disclosure of current.querySelectorAll?.("details[data-ve-roll-key]") ?? []) {
    disclosure.open = rollsOpen.get(disclosure.getAttribute("data-ve-roll-key")) ?? false;
  }
  const targetDisclosure = current.querySelector?.(".ve-action-session-compact-targets");
  if (targetDisclosure) targetDisclosure.open = targetsOpen;
  Array.from(current.querySelectorAll?.(".description.collapsible") ?? []).forEach((element, index) => {
    const isCollapsed = collapsed[index] ?? true;
    element.classList?.toggle?.("collapsed", isCollapsed);
    element.querySelector?.(":scope > .summary")?.setAttribute?.("aria-expanded", String(!isCollapsed));
  });
  return true;
}

function patchNode(current, next) {
  if (current.nodeType === 3 || current.nodeType === 8) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  if (current.nodeType !== 1) return;
  syncAttributes(current, next);
  const nextChildren = Array.from(next.childNodes ?? []);
  for (let index = 0; index < nextChildren.length; index += 1) {
    const nextChild = nextChildren[index];
    const currentChild = current.childNodes?.[index];
    if (!currentChild) {
      current.append?.(nextChild.cloneNode?.(true) ?? nextChild);
      continue;
    }
    if (currentChild.nodeType !== nextChild.nodeType || currentChild.nodeName !== nextChild.nodeName) {
      currentChild.replaceWith?.(nextChild.cloneNode?.(true) ?? nextChild);
      continue;
    }
    patchNode(currentChild, nextChild);
  }
  while ((current.childNodes?.length ?? 0) > nextChildren.length) current.lastChild?.remove?.();
}

function syncAttributes(current, next) {
  const nextNames = new Set(Array.from(next.attributes ?? []).map(({ name }) => name));
  for (const { name } of Array.from(current.attributes ?? [])) {
    if (!nextNames.has(name)) current.removeAttribute?.(name);
  }
  for (const { name, value } of Array.from(next.attributes ?? [])) {
    if (current.getAttribute?.(name) !== value) current.setAttribute?.(name, value);
  }
}

function prepareActionMessageElement(element) {
  for (const description of element.querySelectorAll?.(".description.collapsible") ?? []) {
    description.classList?.add?.("collapsed");
    const summary = description.querySelector?.(":scope > .summary");
    summary?.setAttribute?.("role", "button");
    summary?.setAttribute?.("tabindex", "0");
    summary?.setAttribute?.("aria-expanded", "false");
  }
}

/** Copy only the item information exposed by this user's native chat card. */
export function compactActionDetailsElement(element, document) {
  const messageId = messageIdentifierFromElement(element);
  if (!messageId || !document?.createElement) return null;
  const parts = Array.from(element.querySelectorAll?.(".description.collapsible > .summary .subtitle, .description.collapsible > .details, .chat-card > .supplement, .chat-card > .card-footer") ?? [])
    .filter(part => !nativeVisibilityHidden(part) && !part.closest?.("[data-concealed]"));
  if (!parts.length) return null;
  const details = document.createElement("details");
  details.className = "ve-action-session-message ve-action-session-compact-item-details";
  details.setAttribute("data-message-id", messageId);
  const heading = document.createElement("summary");
  heading.textContent = localizeFoundry("VEMOBILE.Interface.ActionSessionGateway.DescriptionDetails", "Description & details");
  const content = document.createElement("div");
  content.className = "ve-action-session-compact-item-content";
  for (const part of parts) {
    const copy = part.cloneNode?.(true);
    if (!copy) continue;
    copy.classList?.remove?.("collapsible-content", "details");
    content.append(copy);
  }
  if (!content.children.length) return null;
  details.append(heading, content);
  return details;
}

/** Extract only permission-safe, rendered roll UI from a native action card. */
export function compactActionMessageElement(element, document, chatElement, modalHost) {
  const messageId = messageIdentifierFromElement(element);
  if (!messageId || !document?.createElement) return null;
  const rows = [];
  const rolledCounts = new Map();
  const suppressedControls = new Map();
  for (const roll of element.querySelectorAll?.(".dice-roll") ?? []) {
    if (nativeVisibilityHidden(roll) || roll.closest?.(".description") || roll.parentElement?.closest?.(".dice-roll")) continue;
    // Midi embeds copies of target dice in outcome tooltips. The Targets row
    // already owns these results; native standalone save messages own their dice.
    if (roll.closest?.(".midi-qol-save-class, .midi-qol-hit-class")) continue;
    const totalNode = roll.querySelector?.(".dice-total");
    if (nativeVisibilityHidden(totalNode)) continue;
    const total = String(totalNode?.textContent ?? "").trim();
    if (!total) continue;
    const kind = rollKind(roll.className) || rollKind(roll.parentElement?.className) || rollKind(element.className);
    const formulaNode = roll.querySelector?.(".dice-formula");
    const formula = !nativeVisibilityHidden(formulaNode) ? String(formulaNode?.textContent ?? "").trim().slice(0, 80) : "";
    const tooltip = roll.querySelector?.(".dice-tooltip");
    // Native rendering is the permission boundary. Never rebuild hidden dice from Roll data.
    const breakdown = !nativeVisibilityHidden(tooltip) ? tooltip.cloneNode?.(true) : null;
    const row = document.createElement(breakdown ? "details" : "div");
    row.className = "ve-action-session-compact-result";
    row.setAttribute("data-ve-roll-kind", kind);
    row.setAttribute("data-ve-roll-total", total);
    if (/\d+d20(?:\D|$)/iu.test(formula)) row.setAttribute("data-ve-roll-d20", "true");
    const heading = breakdown ? document.createElement("summary") : row;
    if (breakdown) heading.className = "ve-action-session-compact-result-heading";
    const label = document.createElement("span");
    label.className = "ve-action-session-compact-label";
    label.textContent = kindLabel(kind) || formula || localizeFoundry("VEMOBILE.Interface.ActionSessionGateway.Roll", "Roll");
    if (formula && kind) label.title = formula;
    const value = document.createElement("strong");
    value.className = "ve-action-session-compact-total";
    value.textContent = total;
    if (kind === "damage" || kind === "healing") {
      const totalIcons = Array.from(totalNode.querySelectorAll?.("dnd5e-icon[src], img[src]") ?? []);
      const icons = totalIcons.length ? totalIcons : Array.from(tooltip?.querySelectorAll?.(".total img[src], .total dnd5e-icon[src]") ?? []);
      const seen = new Set();
      for (const nativeIcon of icons) {
        if (nativeVisibilityHidden(nativeIcon)) continue;
        const src = nativeIcon.getAttribute("src");
        if (!src || seen.has(src)) continue;
        seen.add(src);
        const icon = document.createElement("img");
        icon.className = "ve-action-session-compact-damage-icon";
        icon.setAttribute("src", src);
        const name = nativeIcon.getAttribute("aria-label") || nativeIcon.getAttribute("alt") || nativeIcon.getAttribute("data-tooltip") || "";
        icon.setAttribute("alt", name);
        if (name) icon.setAttribute("title", name);
        value.append(icon);
      }
    }
    heading.append(label, value);
    const activityUuid = roll.closest?.("[data-activity-uuid]")?.getAttribute?.("data-activity-uuid") ?? "";
    const key = `${kind}:${activityUuid}`;
    if (breakdown) {
      row.setAttribute("data-ve-roll-key", `${messageId}:${key}:${rolledCounts.get(key) ?? 0}`);
      breakdown.classList?.add("ve-action-session-compact-breakdown");
      removeRepeatedDieValues(breakdown);
      row.append(heading, breakdown);
    }
    rows.push({ kind, element: row });
    rolledCounts.set(key, (rolledCounts.get(key) ?? 0) + 1);
  }
  const nativeControls = Array.from(element.querySelectorAll?.("[data-action]") ?? []);
  const hasRollAction = rows.length > 0 || nativeControls.some(control => /^roll(?:[A-Z]|$)/u.test(String(control.dataset?.action ?? "")) && !nativeVisibilityHidden(control) && !control.closest?.(".description"));
  for (const control of nativeControls) {
    const action = String(control.dataset?.action ?? "");
    const followupActivity = hasRollAction && action === "use" && Boolean(control.closest?.(".activities [data-activity-uuid]"));
    if ((!/^roll(?:[A-Z]|$)/u.test(action) && !followupActivity) || nativeVisibilityHidden(control) || control.closest?.(".description")) continue;
    if (!findNativeChatAction(chatElement, control, messageId, modalHost)) continue;
    const kind = rollKind(action);
    const activityUuid = control.closest?.("[data-activity-uuid]")?.getAttribute?.("data-activity-uuid") ?? "";
    const key = `${kind}:${activityUuid}`;
    const matchedKey = rolledCounts.has(key) ? key : `${kind}:`;
    const suppressed = suppressedControls.get(matchedKey) ?? 0;
    if (kind && suppressed < (rolledCounts.get(matchedKey) ?? 0)) {
      suppressedControls.set(matchedKey, suppressed + 1);
      continue;
    }
    const row = document.createElement("div");
    row.className = "ve-action-session-compact-control";
    if (activityUuid) row.setAttribute("data-activity-uuid", activityUuid);
    const button = control.cloneNode?.(true);
    if (!button) continue;
    button.dataset.veNativeOrdinal = String(Array.from(element.querySelectorAll?.("[data-action]") ?? [])
      .filter((candidate) => candidate.dataset?.action === action).indexOf(control));
    button.textContent = String(control.textContent ?? control.getAttribute?.("aria-label") ?? kindLabel(kind) ?? "Roll").trim().slice(0, 60) || localizeFoundry("VEMOBILE.Interface.ActionSessionGateway.Roll", "Roll");
    button.classList?.add("ve-action-session-compact-roll");
    if (button.tagName === "BUTTON") button.type = "button";
    row.append(button);
    rows.push({ kind, element: row });
  }
  // Workflow save cards may contain a DC and target outcomes without a roll
  // button. Preserve the visible native heading rather than inventing a roll.
  for (const heading of element.querySelectorAll?.(".midi-qol-save-heading") ?? []) {
    if (nativeVisibilityHidden(heading) || !heading.querySelector?.(".midi-qol-saveDC")) continue;
    const text = String(heading.textContent ?? "").trim().replace(/\s+/gu, " ").slice(0, 160);
    if (!text) continue;
    const row = document.createElement("div");
    row.className = "ve-action-session-compact-result ve-action-session-compact-save-heading";
    row.textContent = text;
    rows.push({ kind: "save", element: row });
  }
  if (!rows.length) return null;
  const rank = { attack: 0, check: 1, damage: 2, healing: 3, save: 4 };
  rows.sort((left, right) => (rank[left.kind] ?? 4) - (rank[right.kind] ?? 4));
  const summary = document.createElement("div");
  summary.className = "ve-action-session-message ve-action-session-compact-entry";
  summary.setAttribute("data-message-id", messageId);
  summary.append(...rows.map(({ element: row }) => row));
  return summary;
}

/** Keep sums and modifiers, but a single die face already labels its own value. */
export function removeRepeatedDieValues(breakdown) {
  for (const part of breakdown?.querySelectorAll?.(".tooltip-part") ?? []) {
    const dice = Array.from(part.querySelectorAll?.(".dice-rolls > li") ?? []);
    if (dice.length !== 1 || nativeVisibilityHidden(dice[0]) || dice[0].classList?.contains("constant")) continue;
    const face = String(dice[0].textContent ?? "").trim();
    if (!/^-?\d+$/u.test(face)) continue;
    const value = part.querySelector?.(".total .value, .part-total");
    if (!value || nativeVisibilityHidden(value) || String(value.textContent ?? "").trim() !== face) continue;
    value.remove?.();
  }
}

/** Read only target details that the native chat renderer left visible to this user. */
export function collectRenderedActionTargets(element, targets) {
  for (const row of element.querySelectorAll?.(".midi-qol-hit-class, .midi-qol-save-class") ?? []) {
    if (nativeVisibilityHidden(row)) continue;
    const id = identifier(row.getAttribute?.("data-id") ?? row.dataset?.id);
    const nameNode = Array.from(row.querySelectorAll?.(".midi-qol-target-name.title") ?? [])
      .find((node) => !nativeVisibilityHidden(node) && String(node.textContent ?? "").trim());
    const name = String(nameNode?.textContent ?? "").trim();
    if (!id || !name) continue;
    const image = row.querySelector?.("img.midi-qol-target-img, :scope > img");
    const src = !nativeVisibilityHidden(image) ? String(image?.getAttribute?.("src") ?? "") : "";
    const current = targets.get(id) ?? { id, name, img: src, attack: null, save: null };
    current.name = name;
    if (src) current.img = src;
    if (row.classList?.contains("midi-qol-hit-class")) {
      const icon = row.querySelector?.(".midi-qol-hit-symbol");
      const outcome = !nativeVisibilityHidden(icon) ? nativeOutcome(icon) || classOutcome(row) : classOutcome(row);
      current.attack = outcome;
    } else {
      const icon = row.querySelector?.(".midi-qol-save-symbol, :scope > i.fas");
      const outcome = !nativeVisibilityHidden(icon) ? nativeOutcome(icon) || classOutcome(row) : classOutcome(row);
      const total = row.querySelector?.(".midi-qol-save-total");
      const totalText = Array.from(total?.childNodes ?? []).filter((node) => node.nodeType === 3).map((node) => node.textContent).join("");
      current.save = { outcome, total: !nativeVisibilityHidden(total) ? totalText.trim().slice(0, 12) : "" };
    }
    targets.set(id, current);
  }
  return targets;
}

function nativeVisibilityHidden(node) {
  if (!node) return true;
  for (let current = node; current; current = current.parentElement) {
    if (current.hidden || current.style?.display === "none" || current.style?.visibility === "hidden") return true;
  }
  return false;
}

function nativeOutcome(icon) {
  if (icon?.classList?.contains("fa-check")) return "success";
  if (icon?.classList?.contains("fa-times") || icon?.classList?.contains("fa-xmark")) return "failure";
  return "";
}

function classOutcome(row) {
  if (row.classList?.contains("success")) return "success";
  if (row.classList?.contains("failure")) return "failure";
  return "";
}

/** One disclosure belongs to one activity, including its separate result messages. */
export function compactActionTargetsElement(document, rootMessageId, targetIds = [], visibleTargets = new Map(), targetPreviews = []) {
  if (!document?.createElement) return null;
  const ids = [...new Set(Array.from(targetIds ?? [], identifier).filter(Boolean))];
  const allowedIds = new Set(ids);
  const shown = new Map(Array.from(targetPreviews ?? [])
    .filter((target) => allowedIds.has(identifier(target?.id)))
    .map((target) => [identifier(target.id), { ...target, attack: null, save: null }]));
  for (const [id, target] of visibleTargets) shown.set(id, target);
  const available = [...shown.values()];
  const count = new Set([...ids, ...shown.keys()]).size;
  const wrapper = document.createElement("div");
  wrapper.className = "ve-action-session-compact-target-section";
  wrapper.setAttribute("data-message-id", `targets:${rootMessageId}`);
  if (count === 1) {
    const single = document.createElement("div");
    single.className = "ve-action-session-compact-single-target";
    const label = document.createElement("span");
    label.className = "ve-action-session-compact-single-target-label";
    label.textContent = localizeFoundry("VEMOBILE.ActionSession.TargetLabel", "Target:");
    single.append(label);
    if (available.length) single.append(compactActionTargetRow(document, available[0]));
    else {
      const unavailable = document.createElement("span");
      unavailable.className = "ve-action-session-compact-target-unavailable";
      unavailable.textContent = localizeFoundry("VEMOBILE.Interface.ActionSessionGateway.DetailsPendingOrHidden", "Details pending or hidden");
      single.append(unavailable);
    }
    wrapper.append(single);
    return wrapper;
  }
  const details = document.createElement("details");
  details.className = "ve-action-session-compact-targets";
  const heading = document.createElement("summary");
  heading.textContent = localizeFoundry("VEMOBILE.Interface.ActionSessionGateway.Targets", "Targets: {count}", { count: (count) });
  details.append(heading);
  const list = document.createElement("div");
  list.className = "ve-action-session-compact-target-list";
  for (const target of available) list.append(compactActionTargetRow(document, target));
  if (!available.length) {
    const unavailable = document.createElement("p");
    unavailable.textContent = count ? localizeFoundry("VEMOBILE.Interface.ActionSessionGateway.TargetDetailsArePendingOrHidden", "Target details are pending or hidden.") : localizeFoundry("VEMOBILE.Interface.ActionSessionGateway.NoTargetsRecorded", "No targets recorded.");
    list.append(unavailable);
  }
  details.append(list);
  wrapper.append(details);
  return wrapper;
}

function compactActionTargetRow(document, target) {
  const row = document.createElement("div");
  row.className = "ve-action-session-compact-target";
  if (target.img) {
    const img = document.createElement("img");
    img.src = target.img;
    img.alt = "";
    row.append(img);
  }
  const name = document.createElement("span");
  name.className = "ve-action-session-compact-target-name";
  name.textContent = target.name;
  row.append(name);
  const addOutcome = (kind, result) => {
    if (!result) return;
    const badge = document.createElement("span");
    const outcome = typeof result === "string" ? result : result.outcome;
    badge.className = `ve-action-session-compact-target-outcome${outcome ? ` is-${outcome}` : ""}`;
    const savingThrow = outcome === "success" ? ["SaveSucceeded", "Saving throw succeeded"] : outcome === "failure" ? ["SaveFailed", "Saving throw failed"] : ["SaveHidden", "Saving throw result hidden"];
    badge.setAttribute("aria-label", kind === "save" ? localizeFoundry(`VEMOBILE.ActionSession.${savingThrow[0]}`, savingThrow[1]) : outcome === "success" ? localizeFoundry("VEMOBILE.Interface.ActionSessionGateway.Hit", "Hit") : outcome === "failure" ? localizeFoundry("VEMOBILE.Interface.ActionSessionGateway.Miss", "Miss") : localizeFoundry("VEMOBILE.Interface.ActionSessionGateway.AttackResultHidden", "Attack result hidden"));
    const symbol = outcome === "success" ? "✓" : outcome === "failure" ? "✕" : "";
    badge.textContent = kind === "save" && result.total !== undefined && result.total !== null ? `${result.total}${symbol ? ` ${symbol}` : ""}` : symbol;
    if (badge.textContent) row.append(badge);
  };
  addOutcome("attack", target.attack);
  addOutcome("save", target.save);
  return row;
}

function rollKind(value) {
  const text = String(value ?? "").toLowerCase();
  for (const kind of ["attack", "save", "check", "damage", "healing"]) {
    if (text.includes(kind)) return kind;
  }
  return "";
}

function kindLabel(kind) {
  return kind ? kind[0].toUpperCase() + kind.slice(1) : "";
}

function bindActionDescriptionToggles(host, scope) {
  const toggle = (event) => {
    const summary = event.target?.closest?.(".description.collapsible > .summary");
    const description = summary?.parentElement;
    if (!summary || !description || !host.contains?.(description)) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    const collapsed = description.classList?.toggle?.("collapsed");
    summary.setAttribute?.("aria-expanded", String(!collapsed));
  };
  scope.listen(host, "click", toggle, { capture: true });
  scope.listen(host, "keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    toggle(event);
  }, { capture: true });
}

/**
 * Forward actions from the rendered modal copy to Foundry's live chat card.
 *
 * D&D5e and workflow modules bind stateful action handlers to the card owned by
 * ChatLog. Re-rendering a ChatMessage is useful for presentation, but invoking
 * an action on that extra rendering can detach the workflow from the document
 * that ChatLog broadcasts to other clients. The live card remains mounted in
 * Foundry's sidebar while VE Mobile is on the character route, so let it own
 * the action and keep the modal as a view of that shared document.
 */
export function bindNativeChatCardActions(host, rootMessageId, getUi, scope, onNativeRollRequested = () => {}) {
  if (!host?.querySelectorAll || !scope?.listen) return false;
  scope.listen(host, "click", (event) => {
    const modalAction = event.target?.closest?.("[data-action]");
    const modalMessage = modalAction?.closest?.(".ve-action-session-message[data-message-id]");
    if (!modalAction || !modalMessage || !host.contains?.(modalMessage)) return;

    const messageId = identifier(modalMessage.getAttribute?.("data-message-id") ?? modalMessage.dataset?.messageId);
    if (!messageId) return;
    const liveAction = findNativeChatAction(getUi?.()?.chat?.element, modalAction, messageId, host);
    if (!liveAction || liveAction === modalAction || typeof liveAction.click !== "function") return;

    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    if (/^roll/u.test(String(modalAction.dataset.action)) || modalAction.dataset.action === "use") onNativeRollRequested(modalAction.dataset.action);
    liveAction.click();
  }, { capture: true });
  return Boolean(identifier(rootMessageId));
}

/** Locate the equivalent action within the one ChatLog-owned message card. */
export function findNativeChatAction(chatElement, modalAction, messageId, modalHost = null) {
  const id = identifier(messageId);
  if (!id || !chatElement?.querySelectorAll || !modalAction?.dataset?.action) return null;
  const liveMessages = Array.from(chatElement.querySelectorAll("[data-message-id]")).filter((element) => {
    const candidateId = identifier(element?.getAttribute?.("data-message-id") ?? element?.dataset?.messageId);
    return candidateId === id && !modalHost?.contains?.(element);
  });
  if (!liveMessages.length) return null;

  const action = String(modalAction.dataset.action);
  const modalMessage = modalAction.closest?.("[data-message-id]");
  const modalPeers = Array.from(modalMessage?.querySelectorAll?.("[data-action]") ?? [])
    .filter((candidate) => candidate?.dataset?.action === action);
  const ordinal = Math.max(0, modalPeers.indexOf(modalAction));
  const nativeOrdinal = modalAction.dataset?.veNativeOrdinal === undefined ? null : Number(modalAction.dataset.veNativeOrdinal);
  const fingerprint = actionFingerprint(modalAction);

  for (const liveMessage of liveMessages) {
    const candidates = Array.from(liveMessage.querySelectorAll?.("[data-action]") ?? [])
      .filter((candidate) => candidate?.dataset?.action === action);
    if (!candidates.length) continue;
    if (Number.isSafeInteger(nativeOrdinal) && nativeOrdinal >= 0 && candidates[nativeOrdinal]) return candidates[nativeOrdinal];
    const exact = candidates.find((candidate) => actionFingerprint(candidate) === fingerprint);
    if (exact) return exact;
    if (candidates[ordinal]) return candidates[ordinal];
    return candidates[0];
  }
  return null;
}

function actionFingerprint(element) {
  const activityUuid = element.closest?.("[data-activity-uuid]")?.dataset?.activityUuid ?? "";
  const values = [
    element.dataset?.action,
    activityUuid,
    element.dataset?.itemUuid,
    element.dataset?.uuid,
    element.dataset?.id,
    element.dataset?.type,
    element.dataset?.mode,
    element.dataset?.index,
    element.getAttribute?.("name"),
    element.getAttribute?.("value")
  ];
  return values.map((value) => String(value ?? "")).join("\u001f");
}

function messageIdentifierFromElement(element) {
  return identifier(element?.getAttribute?.("data-message-id") ?? element?.dataset?.messageId);
}

/** Resolve a root message and every recursively-associated result in time order. */
export function collectActionMessages(game, rootMessageId, explicitlyCapturedIds = []) {
  const rootId = identifier(rootMessageId);
  if (!rootId) return [];
  const messages = messageDocuments(game);
  if (!messages.some((message) => messageIdentifier(message) === rootId)) return [];
  const included = new Set([rootId, ...Array.from(explicitlyCapturedIds, identifier).filter(Boolean)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const message of messages) {
      const id = messageIdentifier(message);
      if (!id || included.has(id) || !included.has(originatingMessageId(message))) continue;
      included.add(id);
      changed = true;
    }
  }
  return messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => included.has(messageIdentifier(message)))
    .sort((left, right) => messageTimestamp(left.message) - messageTimestamp(right.message) || left.index - right.index)
    .map(({ message }) => message);
}

/** Accept only the visible roll created for the actor whose native action was explicitly pressed. */
export function isVisibleActorRoll(message, session, game) {
  const id = messageIdentifier(message);
  if (!id || !canRenderMessage(message)) return false;
  const source = message?._source ?? message;
  const rollType = String(message?.getFlag?.("dnd5e", "roll.type")
    ?? message?.flags?.dnd5e?.roll?.type
    ?? source?.flags?.dnd5e?.roll?.type
    ?? "");
  const hasRoll = Array.from(message?.rolls ?? source?.rolls ?? []).length > 0;
  if (!rollType && !hasRoll) return false;

  const actorSourceUuid = identifier(session?.actorSourceUuid);
  if (actorSourceUuid) {
    const actor = resolveActorSource(actorSourceUuid, { game });
    if (!actor || !speakerMatchesActor(message, actor)) return false;
  } else {
    const expectedActorId = identifier(session?.actorId);
    const actorId = identifier(message?.speaker?.actor ?? source?.speaker?.actor);
    if (expectedActorId && actorId !== expectedActorId) return false;
  }

  const expectedAuthorId = identifier(game?.user?.id);
  const authorId = identifier(message?.author?.id ?? message?.user?.id ?? source?.user);
  return !expectedAuthorId || !authorId || authorId === expectedAuthorId;
}

/** Accept a GM-executed secondary activity only during an explicitly requested
 * native roll. Premade automations can author a separate card through a socket,
 * without linking it with originatingMessage or using the casting player's ID.
 */
export function isVisibleItemActivity(message, session, game) {
  if (!messageIdentifier(message) || !canRenderMessage(message) || !session?.itemId) return false;
  const actor = session.actorSourceUuid ? resolveActorSource(session.actorSourceUuid, { game }) : game?.actors?.get?.(session.actorId);
  if (!actor || !speakerMatchesActor(message, actor)) return false;
  const author = message.author ?? message.user;
  if (identifier(author?.id) !== identifier(game?.user?.id) && author?.isGM !== true) return false;
  let item;
  try { item = message.getAssociatedItem?.(); } catch { return false; }
  if (item) return identifier(item.id) === identifier(session.itemId) && (!item.parent || item.parent === actor || item.parent.uuid === actor.uuid);
  const reference = message.flags?.dnd5e?.item ?? message._source?.flags?.dnd5e?.item;
  const expectedUuid = `${actorSourceUuidForSession(actor, session)}.Item.${identifier(session.itemId)}`;
  return identifier(reference?.uuid) === expectedUuid;
}

function actorSourceUuidForSession(actor, session) {
  return String(session.actorSourceUuid || actor.uuid || `Actor.${actor.id}`);
}

function messageDocuments(game) {
  try {
    return Array.from(game?.messages ?? []);
  } catch {
    return [];
  }
}

function messageIdentifier(message) {
  return identifier(message?.id ?? message?._id ?? message?._source?._id);
}

function originatingMessageId(message) {
  try {
    return identifier(message?.getFlag?.("dnd5e", "originatingMessage")
      ?? message?.flags?.dnd5e?.originatingMessage
      ?? message?._source?.flags?.dnd5e?.originatingMessage);
  } catch {
    return "";
  }
}

function messageTimestamp(message) {
  const timestamp = Number(message?.timestamp ?? message?._source?.timestamp);
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function canRenderMessage(message) {
  // A blind/self-hidden roll can still be visible to its author as Foundry's
  // permission-safe redacted card. Never inspect or reproduce its result;
  // message.renderHTML() is responsible for producing the native ??? state.
  return message?.visible !== false;
}

function identifier(value) {
  return String(value ?? "").trim().slice(0, 128);
}

export function actionSessionTheme(host, document) {
  // This is a freshly-rendered native chat card. Its theme must match Foundry,
  // rather than VE Mobile's optional shell theme, so system/module styles keep
  // their normal palette and contrast rules.
  const interfaceElement = document?.getElementById?.("interface");
  const body = document?.body;
  return interfaceElement?.classList?.contains("theme-light") || body?.classList?.contains("theme-light")
    ? "theme-light"
    : "theme-dark";
}

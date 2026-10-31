import { bindLongPress } from "../../../../ui/long-press.mjs";
import { icon, node } from "../../../../ui/dom.mjs";
import { localizedText } from "../../../../ui/localized-text.mjs";

const CANDIDATE_SELECTOR = "[data-pf2e-shortcut]";
const QUICKBAR_SLOTS = 50;

/** Bind hold-to-add only to explicit PF2e shortcut icon descriptors. */
export function bindPf2eShortcutIcons(root, actor, commands, scope) {
  if (!root || !actor?.capabilities?.owner || !actor.sourceUuid || scope?.disposed) return;
  let preferences = readPreferences(commands);
  if (!preferences?.quickbarEnabled) return;

  let prompt = null;
  let promptScope = null;
  let anchor = null;

  const dismiss = () => {
    prompt?.remove();
    prompt = null;
    anchor = null;
    promptScope?.dispose();
    promptScope = null;
  };
  const show = candidate => {
    preferences = readPreferences(commands);
    const descriptor = readDescriptor(candidate);
    if (!descriptor || !canAdd(descriptor, actor, commands, preferences) || !isCurrent(commands, actor, scope)) return;
    dismiss();

    const native = preferences.quickbarSource === "foundry";
    const full = !native && Array.isArray(actor.quickbar)
      && Array.from({ length: QUICKBAR_SLOTS }, (_, index) => actor.quickbar[index]).every(Boolean);
    const addLabel = native
      ? localizedText(commands.localize, "VEMOBILE.Character.Labels.AddtoHotbar", "Add to Hotbar")
      : localizedText(commands.localize, "VEMOBILE.Character.Labels.AddtoQuickbar", "Add to Quickbar");
    const fullLabel = localizedText(commands.localize, "VEMOBILE.Character.Presenter.QuickbarFull", "Quickbar full");
    const currentPromptScope = scope.child("pf2e-shortcut-prompt");
    promptScope = currentPromptScope;
    anchor = candidate;
    prompt = node("button", {
      className: `ve-quickbar-add-prompt${full ? " is-full" : ""}`,
      attrs: {
        type: "button",
        disabled: full,
        "aria-label": full ? fullLabel : `${addLabel}: ${descriptor.label}`
      },
      on: full ? undefined : { click: async event => {
        event.preventDefault?.();
        const currentPrompt = prompt;
        if (!currentPrompt || currentPrompt.disabled || scope.disposed) return;
        const latestPreferences = readPreferences(commands);
        if (!actor.capabilities?.owner || !canAdd(descriptor, actor, commands, latestPreferences)
          || !isCurrent(commands, actor, scope)) {
          showError(currentPrompt, localizedText(commands.localize, "VEMOBILE.PF2E.Character.ShortcutUnavailable", "This shortcut is no longer available."));
          return;
        }
        currentPrompt.disabled = true;
        currentPrompt.setAttribute("aria-busy", "true");
        try {
          if (latestPreferences.quickbarSource === "foundry") {
            await commands.addHotbarItem({ actorSourceUuid: actor.sourceUuid, itemId: descriptor.itemId });
          } else {
            await commands.addQuickbarAction(actor.sourceUuid, descriptor);
          }
          if (!isCurrent(commands, actor, scope)) {
            dismiss();
            return;
          }
          globalThis.navigator?.vibrate?.(5);
          if (prompt === currentPrompt) dismiss();
        } catch (error) {
          if (prompt !== currentPrompt || scope.disposed || !isCurrent(commands, actor, scope)) return;
          showError(currentPrompt, error?.message ?? localizedText(commands.localize, "VEMOBILE.Character.Presenter.CouldNotAdd", "Could not add"));
        }
      } },
      children: [icon(full ? "fa-lock" : "fa-plus"), node("span", { text: full ? fullLabel : preferences.quickbarSource === "foundry"
        ? localizedText(commands.localize, "VEMOBILE.Character.Presenter.AddToHotbar", "Add to Hotbar?")
        : localizedText(commands.localize, "VEMOBILE.Character.Presenter.AddToQuickbar2", "Add to Quickbar?") })]
    }, currentPromptScope);
    root.append(prompt);
    positionPrompt(root, candidate, prompt);
  };

  for (const candidate of root.querySelectorAll(CANDIDATE_SELECTOR)) {
    // Mobile browsers can cancel an image pointer before emitting contextmenu.
    // Own the whole icon button so padding taps and the release click follow
    // the same gesture, while pan-y still leaves vertical scrolling available.
    const target = candidate.closest?.(".ve-pf2e-row-primary") ?? candidate;
    bindLongPress(target, scope, () => show(candidate), { claimPointer: true });
  }
  scope.listen(document, "pointerdown", event => {
    if (!prompt || prompt.contains?.(event.target) || anchor?.contains?.(event.target)) return;
    dismiss();
  }, { capture: true, passive: true });
  scope.listen(document, "scroll", dismiss, { capture: true, passive: true });
  scope.own(dismiss);
}

function canAdd(descriptor, actor, commands, preferences) {
  if (!preferences?.quickbarEnabled || !actor?.capabilities?.owner) return false;
  if (preferences.quickbarSource === "foundry") {
    return descriptor.kind === "item" && typeof commands.addHotbarItem === "function";
  }
  return typeof commands.addQuickbarAction === "function";
}

function readPreferences(commands) {
  try { return commands.readCharacterPreferences?.() ?? null; }
  catch { return null; }
}

function isCurrent(commands, actor, scope) {
  return !scope?.disposed && typeof commands.pf2eActionCurrent === "function"
    && commands.pf2eActionCurrent(actor.sourceUuid) === true;
}

function readDescriptor(candidate) {
  let value;
  try { value = JSON.parse(candidate?.dataset?.pf2eShortcut ?? ""); }
  catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const kind = value.kind;
  const label = typeof value.label === "string" ? value.label.trim().slice(0, 120) : "";
  const img = typeof value.img === "string" ? value.img.slice(0, 500) : "";
  if (!label || !["item", "skill"].includes(kind)) return null;
  if (kind === "item" && typeof value.itemId === "string" && value.itemId.length > 0 && value.itemId.length <= 100) {
    return Object.freeze({ kind, itemId: value.itemId, label, img });
  }
  if (kind === "skill" && typeof value.skill === "string" && /^[a-z0-9][a-z0-9-]{0,99}$/u.test(value.skill)) {
    return Object.freeze({ kind, skill: value.skill, label, img });
  }
  return null;
}

function showError(prompt, message) {
  prompt.disabled = false;
  prompt.removeAttribute("aria-busy");
  prompt.replaceChildren(icon("fa-triangle-exclamation"), node("span", { text: message }));
  prompt.classList.add("is-error");
}

function positionPrompt(root, candidate, prompt) {
  const rootRect = root.getBoundingClientRect();
  const anchorRect = candidate.getBoundingClientRect();
  const promptRect = prompt.getBoundingClientRect();
  const halfWidth = promptRect.width / 2;
  const desiredLeft = anchorRect.left - rootRect.left + anchorRect.width / 2;
  const left = Math.max(halfWidth + 6, Math.min(rootRect.width - halfWidth - 6, desiredLeft));
  const above = anchorRect.top - rootRect.top - promptRect.height - 8;
  const preferredTop = above >= 4 ? above : anchorRect.bottom - rootRect.top + 8;
  const top = Math.max(4, Math.min(rootRect.height - promptRect.height - 4, preferredTop));
  prompt.style.left = `${Number.isFinite(left) ? left : 6}px`;
  prompt.style.top = `${Number.isFinite(top) ? top : 4}px`;
}

import { localizedText } from "../../ui/localized-text.mjs";

/** Send one-off sheet feedback through the injected native notification boundary.
 * The caller checks its pane/editor lifetime; the kernel checks the exact Actor
 * and current mobile session again. No notification occupies sheet layout space. */
export function notifyCharacter(commands, actorSourceUuid, message, type = "info") {
  if (!message) return false;
  return commands.notifyCharacterStatus?.({ actorSourceUuid, message: String(message), type }) ?? false;
}

/** Keep deliberate command guidance, but replace unexpected exceptions with the
 * caller's action-specific copy. Diagnostics retain the original failure; an
 * uncertain native action may have partly completed, so never promise no change. */
export function characterErrorMessage(commands, error, fallback, { readOnly = false } = {}) {
  // These VE gateway errors deliberately carry localized public guidance.
  // COMMAND_FAILED with a cause is the generic native-exception wrapper;
  // a deliberate command failure without that wrapper keeps its public copy.
  if (["CommandError", "QuickbarError", "HotbarError"].includes(error?.name) && error.message
    && (error.code !== "COMMAND_FAILED" || !Object.hasOwn(error, "cause"))) return String(error.message);
  commands.recordCharacterError?.(error?.cause ?? error);
  const recovery = readOnly
    ? localizedText(commands.localize, "VEMOBILE.Character.Errors.Reopen", "Close and reopen this view to try again.")
    : localizedText(commands.localize, "VEMOBILE.Character.Errors.CheckState", "Check the sheet and chat before trying again.");
  return `${fallback || localizedText(commands.localize, "VEMOBILE.Character.CommandGateway.TheFoundryActionFailed", "The Foundry action failed.")} ${recovery}`;
}

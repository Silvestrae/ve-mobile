import { localizedText } from "../../ui/localized-text.mjs";
import { node } from "../../ui/dom.mjs";
import { renderPf2eCharacters } from "./systems/pf2e/presenter.mjs";
import { renderCharacters as renderDnd5eCharacters } from "./systems/dnd5e/presenter.mjs";

export * from "./systems/dnd5e/presenter.mjs";

// Existing renderer-only consumers may omit world metadata; preserve their historical D&D5e presentation.
export function renderCharacters(options) {
  const { state, commands } = options;
  const world = state?.snapshot?.world;
  const hasSystemId = Boolean(world && Object.hasOwn(world, "systemId"));
  const systemId = world?.systemId;
  if (systemId === "pf2e") return renderPf2eCharacters(options);
  if (!hasSystemId || systemId === "dnd5e") {
    return renderDnd5eCharacters(options);
  }
  return node("section", { className: "ve-character-screen ve-character-unsupported-system", children: [
    node("p", { className: "ve-empty", text: localizedText(commands?.localize, "VEMOBILE.Character.Presenter.NoSupportedCharactersAreAvailableToThisUser", "No supported characters are available to this user.") })
  ] });
}

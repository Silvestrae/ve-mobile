import { localizeFoundry } from "./localization.mjs";

export class CommandError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "CommandError";
    this.code = code;
  }
}


export function canOwn(actor, user) {
  if (!actor || !user) return false;
  try {
    if (typeof actor.testUserPermission === "function") return actor.testUserPermission(user, "OWNER");
    return Boolean(actor.isOwner && user.id === globalThis.game?.user?.id);
  } catch {
    return false;
  }
}

export function assertSession(game, expected, getConnectionGeneration = () => 0) {
  if (!game?.user || !game?.world) throw new CommandError("SESSION_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.BiographyGateway.TheFoundrySessionIsNotReady", "The Foundry session is not ready."));
  if (expected.worldId && expected.worldId !== game.world.id) {
    throw new CommandError("STALE_SESSION", localizeFoundry("VEMOBILE.Character.BiographyGateway.TheActiveFoundryWorldHasChanged", "The active Foundry world has changed."));
  }
  if (expected.userId && expected.userId !== game.user.id) {
    throw new CommandError("STALE_SESSION", localizeFoundry("VEMOBILE.Character.BiographyGateway.TheActiveFoundryUserHasChanged", "The active Foundry user has changed."));
  }
  if (expected.connectionGeneration !== undefined && expected.connectionGeneration !== getConnectionGeneration()) {
    throw new CommandError("STALE_SESSION", localizeFoundry("VEMOBILE.Character.CommandGateway.TheConnectionChangedWhileThisActionWasRunning", "The connection changed while this action was running."));
  }
}

export function identifier(value, field) {
  const id = String(value ?? "").trim();
  if (!id || id.length > 128) throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.IsRequired", "{field} is required.", { field: (field) }));
  return id;
}

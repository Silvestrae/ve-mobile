import { localizeFoundry } from "./localization.mjs";
/** Native Foundry document identity for the Actor currently shown by Character. */
export function actorSourceUuid(actor) {
  const nativeUuid = String(actor?.uuid ?? "").trim();
  if (nativeUuid) return nativeUuid;
  const actorId = String(actor?.id ?? "").trim();
  if (!actorId) return "";
  const tokenUuid = String(actor?.token?.uuid ?? actor?.parent?.uuid ?? "").trim();
  return actor?.isToken && tokenUuid ? `${tokenUuid}.Actor.${actorId}` : `Actor.${actorId}`;
}

export function actorSourceRecord(actor) {
  const sourceUuid = actorSourceUuid(actor);
  const token = actor?.isToken ? actor.token ?? actor.parent ?? null : null;
  return Object.freeze({
    sourceUuid,
    actorId: String(actor?.id ?? ""),
    synthetic: Boolean(actor?.isToken),
    tokenUuid: String(token?.uuid ?? ""),
    sceneId: String(token?.parent?.id ?? ""),
    tokenId: String(token?.id ?? "")
  });
}

/** Re-resolve on every command; never retain a live Document across generations. */
export function resolveActorSource(sourceUuid, {
  game = globalThis.game,
  fromUuidSync = globalThis.fromUuidSync ?? globalThis.foundry?.utils?.fromUuidSync
} = {}) {
  const uuid = validSourceUuid(sourceUuid);
  let actor = null;
  try {
    actor = fromUuidSync?.(uuid, { strict: false }) ?? null;
  } catch {
    actor = null;
  }
  if (!actor && uuid.startsWith("Actor.")) {
    const actorId = uuid.slice("Actor.".length);
    actor = game?.actors?.get?.(actorId)
      ?? collectionValues(game?.actors).find((entry) => String(entry?.id ?? "") === actorId)
      ?? null;
  }
  if (!actor || String(actor.documentName ?? "Actor") !== "Actor") return null;
  return actorSourceUuid(actor) === uuid ? actor : null;
}

export function validSourceUuid(value, field = "actorSourceUuid") {
  const uuid = String(value ?? "").trim();
  if (!uuid || uuid.length > 512) throw new Error(localizeFoundry("VEMOBILE.Interface.CharacterSource.IsRequired", "{field} is required.", { field: (field) }));
  if (!/^Actor\.[^.]+$|^Scene\.[^.]+\.Token\.[^.]+\.Actor\.[^.]+$/u.test(uuid)) {
    throw new Error(localizeFoundry("VEMOBILE.Interface.CharacterSource.IsInvalid", "{field} is invalid.", { field: (field) }));
  }
  return uuid;
}

export function speakerMatchesActor(message, actor) {
  const source = message?._source ?? message;
  const speaker = message?.speaker ?? source?.speaker ?? {};
  if (String(speaker.actor ?? "") !== String(actor?.id ?? "")) return false;
  if (!actor?.isToken) return true;
  return String(speaker.scene ?? "") === String(actor.token?.parent?.id ?? "")
    && String(speaker.token ?? "") === String(actor.token?.id ?? "");
}

function collectionValues(collection) {
  if (!collection) return [];
  try { return Array.from(collection); } catch { return Object.values(collection); }
}

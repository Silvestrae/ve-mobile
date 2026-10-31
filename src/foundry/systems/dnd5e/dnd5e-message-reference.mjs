/**
 * D&D5e 6 stores chat references on system data; 5.x uses dnd5e flags.
 * The prepared 6.x origin is a ForeignDocumentField (a ChatMessage), while
 * its source is an ID. Read identity only, without resolving documents or
 * exposing live system data in VE's serializable action records.
 */
export function readDnd5eMessageOriginId(message) {
  const modern = message?.system?.origin ?? message?._source?.system?.origin;
  const id = referenceId(modern);
  if (id) return id;
  let legacy;
  try { legacy = message?.getFlag?.("dnd5e", "originatingMessage"); } catch { /* Older/removed flag schema. */ }
  return referenceId(legacy ?? message?.flags?.dnd5e?.originatingMessage
    ?? message?._source?.flags?.dnd5e?.originatingMessage);
}

export function readDnd5eMessageItem(message) {
  return messageReference(message, "item");
}

export function readDnd5eMessageActivity(message) {
  return messageReference(message, "activity");
}

/** Native 5.x flags and 6.x typed messages describe the same roll differently.
 * Core initiative cards use a core flag in both Foundry versions.
 */
export function readDnd5eMessageRoll(message) {
  const source = message?._source ?? message;
  const flags = message?.flags ?? source?.flags ?? {};
  const legacy = flags.dnd5e?.roll ?? {};
  const system = message?.system ?? source?.system ?? {};
  const messageType = text(message?.type ?? source?.type);
  const type = flags.core?.initiativeRoll ? "initiative"
    : system.type === "death" ? "death"
      : messageType === "save" ? "save"
        : messageType === "check" ? system.skill ? "skill" : system.tool ? "tool" : "ability"
          : text(legacy.type ?? system.type);
  const modern = messageType === "check" || messageType === "save";
  return Object.freeze({ type,
    ability: text(modern ? system.ability : legacy.ability ?? system.ability),
    skill: text(modern ? system.skill : legacy.skillId ?? legacy.skill ?? system.skill),
    tool: text(modern ? system.tool : legacy.toolId ?? legacy.tool ?? system.tool) });
}

function messageReference(message, kind) {
  const reference = message?.system?.[kind] ?? message?._source?.system?.[kind]
    ?? message?.flags?.dnd5e?.[kind] ?? message?._source?.flags?.dnd5e?.[kind];
  return {
    id: text(reference?.id), uuid: text(reference?.uuid),
    type: text(reference?.type), name: text(reference?.name)
  };
}

function referenceId(reference) {
  return text(typeof reference === "string" ? reference : reference?.id ?? reference?._id);
}

function text(value) {
  return typeof value === "string" ? value.trim().slice(0, 256) : "";
}

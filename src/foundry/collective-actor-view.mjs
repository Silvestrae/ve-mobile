import { actorSourceUuid, resolveActorSource } from "./character-source.mjs";

const SUPPORTED_TYPES = new Set(["character", "npc", "group", "vehicle"]);

/** D&D5e 5.3.x prepared model values, never PC-shaped substitutes. These
 * projections read only referenced identities/vitals; no member Item graph. */
export function collectiveActorData(actor, user) {
  return actor.type === "group" ? groupData(actor, user) : vehicleData(actor, user);
}

export function canNavigateReferencedActor(actor, user) {
  return Boolean(actor && SUPPORTED_TYPES.has(actor.type)
    && (actor.type === "npc" ? user?.isGM || permitted(actor, user, "OWNER") : permitted(actor, user)));
}

/** Stable UUIDs also serve as the selected projection's invalidation inputs.
 * Source membership is used to retain deleted/malformed references that the
 * prepared Group model removes. Vehicle UUIDs retain exact token provenance. */
export function collectiveReferenceUuids(actor) {
  const system = actor?.system ?? {};
  if (actor?.type === "group") {
    return [...new Set([...groupReferences(actor).map(groupReferenceUuid), actorSourceUuid(system.primaryVehicle)].filter(Boolean))];
  }
  if (actor?.type !== "vehicle") return [];
  return [...values(system.crew?.value), ...values(system.passengers?.value), ...values(system.draft?.value),
    ...values(actor.items).filter(item => item.system?.isMountable).flatMap(item => values(item.system.crew?.value))]
    .filter(value => typeof value === "string" && value.length <= 512);
}

function groupReferences(actor) {
  return values(actor.system?._source?.members ?? actor._source?.system?.members ?? actor.system?.members);
}

function groupReferenceUuid(reference) {
  const value = reference?.actor ?? reference;
  if (value && typeof value === "object") return actorSourceUuid(value);
  if (typeof value !== "string" || !value.trim() || value.length > 512) return "";
  return value.includes(".") ? value : `Actor.${value}`;
}

function referenceActor(uuid) {
  try { return resolveActorSource(uuid); } catch { return null; }
}

function referenceRecord(uuid, user, { quantity = 1, vitals = false } = {}) {
  const actor = referenceActor(uuid);
  if (!actor || !permitted(actor, user)) return Object.freeze({ available: false, canNavigate: false, quantity });
  const system = actor.system ?? {};
  const record = {
    available: true, canNavigate: canNavigateReferencedActor(actor, user),
    sourceUuid: actorSourceUuid(actor), name: String(actor.name ?? ""), img: String(actor.img ?? ""),
    type: String(actor.type ?? ""), quantity
  };
  if (vitals) {
    const hp = system.attributes?.hp;
    record.hp = hp && numeric(hp.value) !== null ? {
      value: numeric(hp.value), max: numeric(hp.effectiveMax ?? hp.max), temp: numeric(hp.temp)
    } : null;
    record.ac = numeric(system.attributes?.ac?.value);
    record.level = actor.type === "character" ? numeric(system.details?.level?.value ?? system.details?.level) : null;
    record.hitDice = system.attributes?.hd ? { value: numeric(system.attributes.hd.value), max: numeric(system.attributes.hd.max) } : null;
    record.speed = movementRows(system.attributes?.movement);
    record.skills = ["prc", "ste", "sur"].flatMap(key => {
      const skill = system.skills?.[key];
      if (!skill) return [];
      return [{ key, label: label(config().skills?.[key]?.label, key), total: numeric(skill.total), passive: numeric(skill.passive) }];
    });
  }
  return Object.freeze(record);
}

function groupData(actor, user) {
  const system = actor.system ?? {};
  const members = groupReferences(actor).map(ref => referenceRecord(groupReferenceUuid(ref), user, { vitals: true }));
  // Native aggregates depend on members. Hide them when any member is unreadable
  // rather than disclose statistics indirectly through a prepared aggregate.
  const primaryVehicle = system.primaryVehicle ? referenceRecord(actorSourceUuid(system.primaryVehicle), user) : null;
  const allReadable = members.every(member => member.available) && (!primaryVehicle || primaryVehicle.available);
  let travel = null;
  if (allReadable && typeof system.getTravelPace === "function") {
    try {
      const native = system.getTravelPace();
      const field = system.primaryVehicle?.system?.attributes?.travel ?? system.attributes?.travel;
      travel = { pace: label(native?.pace?.label, native?.pace?.value), slowed: Boolean(native?.pace?.slowed),
        rows: travelRows(native?.paces, field?.units, "day") };
    } catch { /* No invented travel calculation if the native model is unavailable. */ }
  }
  return {
    members, aggregateRestricted: !allReadable,
    averageLevel: allReadable && members.some(member => member.type === "character") ? numeric(system.level) : null,
    pooledExperience: allReadable ? numeric(system.details?.xp?.value) : null,
    travel,
    primaryVehicle
  };
}

function vehicleData(actor, user) {
  const system = actor.system ?? {};
  const attributes = system.attributes ?? {};
  const traits = system.traits ?? {};
  const hp = attributes.hp ?? {};
  const flags = key => Boolean(actor.getFlag?.("dnd5e", key));
  const assigned = new Map();
  const components = values(actor.items).filter(item => item.system?.isMountable).map(item => {
    const data = item.system;
    for (const uuid of values(data.crew?.value)) assigned.set(uuid, (assigned.get(uuid) ?? 0) + 1);
    return {
      itemId: String(item.id ?? ""), ac: numeric(data.armor?.value), cover: numeric(data.cover),
      hp: numeric(data.hp?.value) !== null || numeric(data.hp?.max) !== null ? {
        value: numeric(data.hp?.value), max: numeric(data.hp?.max), threshold: numeric(data.hp?.dt),
        conditions: String(data.hp?.conditions ?? "")
      } : null,
      speed: numeric(data.speed?.value) === null ? null : {
        value: numeric(data.speed.value), units: String(data.speed.units ?? ""), conditions: String(data.speed.conditions ?? "")
      },
      crewCapacity: numeric(data.crew?.max), crew: referenceRows(data.crew?.value, user)
    };
  });
  const crew = referenceRows(system.crew?.value, user).map(record => ({ ...record,
    assigned: record.sourceUuid ? Math.min(record.quantity, assigned.get(record.sourceUuid) ?? 0) : null }));
  const variant = typeof system.details?.type === "string" ? system.details.type : system.details?.type?.value;
  return {
    variant: String(variant ?? ""), variantLabel: label(config().vehicleTypes?.[variant], variant || "Vehicle"),
    hp: numeric(hp.value) === null && numeric(hp.max) === null ? null : {
      value: numeric(hp.value), max: numeric(hp.effectiveMax ?? hp.max), temp: numeric(hp.temp),
      damageThreshold: numeric(hp.dt), mishapThreshold: numeric(hp.mt)
    },
    ac: numeric(attributes.ac?.value), initiative: flags("showVehicleInitiative") ? numeric(attributes.init?.total) : null,
    quality: flags("showVehicleQuality") ? numeric(attributes.quality?.value) : null,
    showAbilities: flags("showVehicleAbilities"), movement: movementRows(attributes.movement),
    travelSpeed: travelRows(attributes.travel?.speeds, attributes.travel?.units, "hour"),
    travelPace: travelRows(attributes.travel?.paces, attributes.travel?.units, "day"),
    actions: attributes.actions?.stations === false && numeric(attributes.actions?.max) !== null ? {
      value: numeric(attributes.actions.value), max: numeric(attributes.actions.max), spent: numeric(attributes.actions.spent),
      thresholds: Object.fromEntries(Object.entries(attributes.actions.thresholds ?? {}).map(([key, value]) => [key, numeric(value)]))
    } : null,
    capacity: { cargo: measure(attributes.capacity?.cargo, "weight"), legacyCreatures: String(attributes.capacity?.creature ?? "") },
    size: label(config().actorSizes?.[traits.size]?.label, traits.size),
    dimensions: [
      ["keel", measure(traits.keel, "length")], ["beam", measure(traits.beam, "length")],
      ["weight", measure(traits.weight, "weight")], ["price", measure(attributes.price, "currency")]
    ].filter(([, value]) => value !== null).map(([key, value]) => ({ key, value })),
    legacyDimensions: String(traits.dimensions ?? ""),
    crew, passengers: referenceRows(system.passengers?.value, user), draft: referenceRows(system.draft?.value, user),
    crewCapacity: numeric(system.crew?.max), passengerCapacity: numeric(system.passengers?.max), components,
    // Retained legacy cargo names are authored free text, not resolved Actor identities.
    legacyCrew: legacyPassengers(system.cargo?.crew), legacyPassengers: legacyPassengers(system.cargo?.passengers)
  };
}

function referenceRows(references, user) {
  const grouped = new Map();
  for (const uuid of values(references)) {
    const key = typeof uuid === "string" ? uuid : "";
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  return [...grouped].map(([uuid, quantity]) => referenceRecord(uuid, user, { quantity }));
}

function legacyPassengers(rows) {
  return values(rows).map(row => ({ name: String(row?.name ?? ""), quantity: numeric(row?.quantity) })).filter(row => row.name);
}

function travelRows(data, unit, period) {
  return ["land", "water", "air"].flatMap(key => {
    const value = numeric(data?.[key]);
    if (value === null) return [];
    let formatted;
    try { formatted = globalThis.dnd5e?.utils?.formatTravelSpeed?.(value, unit, { period }); } catch { /* unit fallback */ }
    const unitConfig = config().travelUnits?.[unit];
    const units = period === "day" ? unitConfig?.abbreviationDay : unitConfig?.abbreviationHour;
    return [{ key, label: label(config().travelTypes?.[key]?.label, key), value,
      text: String(formatted ?? `${value} ${label(units, unit ?? "")}`).trim() }];
  });
}

function movementRows(movement) {
  return ["walk", "burrow", "climb", "fly", "swim"].flatMap(key => {
    const value = numeric(movement?.[key]);
    if (value === null) return [];
    let formatted;
    try { formatted = globalThis.dnd5e?.utils?.formatLength?.(value, movement.units); } catch { /* unit fallback */ }
    return [{ key, label: label(config().movementTypes?.[key], key), value,
      text: String(formatted ?? `${value} ${movement.units ?? ""}`).trim(), hover: key === "fly" && Boolean(movement.hover) }];
  });
}

function measure(data, type) {
  const value = numeric(data?.value);
  if (value === null) return null;
  const units = data.units ?? data.denomination ?? "";
  try {
    const formatter = type === "weight" ? globalThis.dnd5e?.utils?.formatWeight : type === "length" ? globalThis.dnd5e?.utils?.formatLength : null;
    if (formatter) return String(formatter(value, units));
  } catch { /* Preserve value and authored units. */ }
  return `${value} ${units}`.trim();
}

function numeric(value) { return (typeof value !== "number" && typeof value !== "string") || value === "" || !Number.isFinite(Number(value)) ? null : Number(value); }
function values(collection) {
  if (!collection || typeof collection === "string") return [];
  try { return Array.from(collection.values?.() ?? (collection[Symbol.iterator] ? collection : Object.values(collection))); }
  catch { return []; }
}
function config() { return globalThis.CONFIG?.DND5E ?? {}; }
function label(key, fallback = "") {
  if (typeof key === "object") key = key?.label;
  if (!key) return String(fallback);
  return String(globalThis.game?.i18n?.localize?.(key) ?? key);
}
function permitted(actor, user, level = "OBSERVER") {
  try { return Boolean(actor?.testUserPermission?.(user, level) ?? (level === "OWNER" ? actor?.isOwner : actor?.visible)); } catch { return false; }
}

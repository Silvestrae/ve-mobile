import { localizedNumber } from "../ui/localized-text.mjs";
import { localizeFoundry } from "./localization.mjs";
import { characterHeaderRecord } from "./character-header.mjs";
import { normalizeBannerClassification } from "../kernel/header-banner.mjs";
import { collectiveActorData } from "./collective-actor-view.mjs";

const ABILITY_LABELS = Object.freeze({
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma"
});

const SKILL_LABELS = Object.freeze({
  acr: "Acrobatics",
  ani: "Animal Handling",
  arc: "Arcana",
  ath: "Athletics",
  dec: "Deception",
  his: "History",
  ins: "Insight",
  itm: "Intimidation",
  inv: "Investigation",
  med: "Medicine",
  nat: "Nature",
  prc: "Perception",
  prf: "Performance",
  per: "Persuasion",
  rel: "Religion",
  slt: "Sleight of Hand",
  ste: "Stealth",
  sur: "Survival"
});

const SENSE_LABELS = Object.freeze({
  darkvision: "Darkvision",
  blindsight: "Blindsight",
  tremorsense: "Tremorsense",
  truesight: "Truesight"
});

const PROFICIENCY_LABELS = Object.freeze({
  lgt: "Light",
  med: "Medium",
  hvy: "Heavy",
  shl: "Shield",
  sim: "Simple",
  mar: "Martial",
  thief: "Thieves' Tools",
  forg: "Forgery Kit",
  pois: "Poisoner's Kit",
  herb: "Herbalism Kit",
  navg: "Navigator's Tools",
  smith: "Smith's Tools",
  tinker: "Tinker's Tools",
  cook: "Cook's Utensils",
  alchemist: "Alchemist's Supplies",
  bagpipes: "Bagpipes",
  brewer: "Brewer's Supplies",
  calligrapher: "Calligrapher's Supplies",
  card: "Playing Cards",
  carpenter: "Carpenter's Tools",
  cartographer: "Cartographer's Tools",
  chess: "Dragonchess Set",
  cobbler: "Cobbler's Tools",
  dice: "Dice Set",
  disg: "Disguise Kit",
  drum: "Drum",
  dulcimer: "Dulcimer",
  flute: "Flute",
  glassblower: "Glassblower's Tools",
  horn: "Horn",
  jeweler: "Jeweler's Tools",
  lute: "Lute",
  lyre: "Lyre",
  mason: "Mason's Tools",
  painter: "Painter's Supplies",
  panflute: "Pan Flute",
  potter: "Potter's Tools",
  shawm: "Shawm",
  viol: "Viol",
  weaver: "Weaver's Tools",
  woodcarver: "Woodcarver's Tools",
  harvesting: "Harvesting Kit"
});

const INVENTORY_TYPES = new Set(["weapon", "equipment", "consumable", "tool", "loot", "container", "backpack"]);
const FEATURE_TYPES = new Set(["feat", "class", "subclass", "background", "race", "species"]);
export const CURRENCY_DENOMINATIONS = Object.freeze(["pp", "gp", "ep", "sp", "cp"]);
const PREPARING_SPELL_METHODS = new Set(["pact", "spell"]);

/** Minimal world-Actor record used only by Character discovery and its chooser. */
export function createActorDirectoryRecord(actor) {
  const system = actor?.system ?? {};
  const classes = actor?.type === "character" ? Array.from(actor?.items ?? []).filter((item) => item.type === "class") : [];
  const level = actor?.type === "character"
    ? number(system.details?.level?.value ?? system.details?.level, classes.reduce((total, item) => total + number(item.system?.levels), 0))
    : null;
  return Object.freeze({
    id: String(actor?.id ?? ""),
    sourceUuid: String(actor?.uuid ?? `Actor.${String(actor?.id ?? "")}`),
    name: String(actor?.name ?? localizeFoundry("VEMOBILE.Character.ActorView.UnknownActor", "Unknown actor")),
    img: String(actor?.img ?? ""),
    type: String(actor?.type ?? ""),
    sort: number(actor?.sort),
    folderPath: actorFolderPath(actor),
    level,
    classes: Object.freeze(classes.map((item) => Object.freeze({ id: String(item.id ?? ""), name: String(item.name ?? ""), levels: number(item.system?.levels) }))),
    npc: actor?.type === "npc" ? Object.freeze(npcIdentityRecord(system)) : null
  });
}

/** Convert a permitted D&D5e actor into a transport-safe renderer record. */
export function createActorViewRecord(actor, user, capabilitiesForActor = () => null, users = globalThis.game?.users ?? []) {
  if (["group", "vehicle"].includes(actor.type)) return createCollectiveViewRecord(actor, user, capabilitiesForActor);
  const system = actor.system ?? {};
  const attributes = system.attributes ?? {};
  const hp = attributes.hp ?? {};
  const items = Array.from(actor.items ?? []);
  const classes = items.filter((item) => item.type === "class");
  const abilities = abilityRecords(system.abilities);
  const skills = skillRecords(system.skills);
  const toolProficiencies = toolProficiencyRecords(system, items);
  const traits = traitRecords(system, items);
  const hitDice = hitDiceRecord(system, classes);
  const resources = resourceRecords(system, items, hitDice);
  const itemRecords = items.map((item) => itemViewRecord(actor, item, user));
  const inventory = itemRecords.filter((item) => INVENTORY_TYPES.has(item.type));
  const spells = items.filter((item) => item.type === "spell").map((item) => spellViewRecord(actor, item, user));
  // The native NPC sheet also exposes weapons in Features, while retaining
  // their ordinary inventory representation.
  const features = itemRecords.filter((item) => FEATURE_TYPES.has(item.type) || (actor.type === "npc" && item.type === "weapon"));
  const favourites = favouriteItemRecords(actor, items, [...itemRecords, ...spells]);
  const effects = effectRecords(actor);
  const conditions = conditionRecords(actor);
  const level = actor.type === "character"
    ? number(system.details?.level?.value ?? system.details?.level, classes.reduce((total, item) => total + number(item.system?.levels), 0))
    : null;
  const armorClass = numericOrNull(attributes.ac?.value ?? attributes.ac);
  const speed = movementRecord(attributes.movement);
  const npc = actor.type === "npc" ? npcIdentityRecord(system) : null;
  const themeClassKeys = actor.type === "npc" ? [npcTheme(actor, users)] : classThemes(classes);

  return {
    id: String(actor.id ?? ""),
    sourceUuid: String(actor.uuid ?? `Actor.${actor.id}`),
    name: String(actor.name ?? localizeFoundry("VEMOBILE.Character.ActorView.UnknownActor", "Unknown actor")),
    img: actor.img ?? "",
    type: actor.type,
    header: {
      ...characterHeaderRecord(actor),
      bannerClassification: normalizeBannerClassification(system.details?.type),
      bannerSpecies: (typeof system.details?.race === "string" ? system.details.race : system.details?.race?.name) || originName(items, ["race", "species"])
    },
    npc,
    npcResources: actor.type === "npc" ? npcResourceRecord(system) : null,
    sort: number(actor.sort),
    folderPath: actorFolderPath(actor),
    level,
    classes: classes.map((item) => ({ id: item.id, name: item.name, levels: number(item.system?.levels), hitDie: String(item.system?.hd?.denomination ?? "").toLowerCase() })),
    species: originName(items, ["race", "species"]),
    background: originName(items, ["background"]),
    hp: {
      value: number(hp.value),
      max: Math.max(0, number(hp.effectiveMax, number(hp.max) + number(hp.tempmax))),
      temp: number(hp.temp)
    },
    deathSaves: {
      successes: clamp(number(attributes.death?.success), 0, 3),
      failures: clamp(number(attributes.death?.failure), 0, 3)
    },
    inspiration: Boolean(attributes.inspiration),
    hitDice,
    ac: armorClass,
    initiative: numericOrNull(attributes.init?.total ?? attributes.init?.mod),
    movement: speed.value,
    speed,
    proficiency: numericOrNull(attributes.prof),
    themeClassKey: themeClassKeys[0] ?? "neutral",
    themeClassKeys,
    capabilities: capabilitiesForActor(actor, user),
    abilities,
    skills,
    toolProficiencies,
    traits,
    currency: currencyRecord(system.currency),
    encumbrance: encumbranceRecord(attributes.encumbrance),
    biography: biographyRecord(system.details, actor.type),
    resources,
    favourites,
    favouritesDiagnostics: favouriteDiagnostics(actor, favourites),
    inventory,
    spells,
    features,
    effects,
    conditions,
    counts: {
      inventory: inventory.length,
      spells: spells.length,
      features: features.length,
      effects: effects.length,
      favourites: favourites.length
    },
    items: itemRecords.slice(0, 80)
  };
}

function createCollectiveViewRecord(actor, user, capabilitiesForActor) {
  const system = actor.system ?? {};
  const items = Array.from(actor.items ?? []);
  const records = items.map(item => itemViewRecord(actor, item, user));
  const stations = new Set(items.filter(item => item.system?.isMountable).map(item => String(item.id)));
  const inventory = records.filter(item => INVENTORY_TYPES.has(item.type) && !stations.has(item.id));
  const features = records.filter(item => stations.has(item.id) || !INVENTORY_TYPES.has(item.type));
  const effects = effectRecords(actor);
  const description = actor.type === "group" ? system.description?.full : system.details?.biography?.value;
  return {
    id: String(actor.id ?? ""), sourceUuid: String(actor.uuid ?? `Actor.${actor.id}`), type: actor.type,
    name: String(actor.name ?? ""), img: String(actor.img ?? ""), sort: number(actor.sort), folderPath: actorFolderPath(actor),
    themeClassKey: "neutral", themeClassKeys: ["neutral"], classes: [],
    header: { bannerClassification: null, bannerSpecies: "" },
    collective: collectiveActorData(actor, user), capabilities: capabilitiesForActor(actor, user),
    hp: actor.type === "vehicle" ? collectiveHealth(system.attributes?.hp) : null,
    abilities: actor.type === "vehicle" ? abilityRecords(system.abilities) : [],
    traits: actor.type === "vehicle" ? traitRecords(system, []) : [],
    currency: currencyRecord(system.currency), encumbrance: encumbranceRecord(system.attributes?.encumbrance),
    biography: { characteristics: [], description: biographyPlainText(safeItemHtml(description)),
      summary: actor.type === "group" ? biographyPlainText(safeItemHtml(system.description?.summary)) : "" },
    resources: [], favourites: [], spells: [], inventory, features, effects,
    conditions: actor.type === "vehicle" ? conditionRecords(actor) : [], items: records,
    counts: { inventory: inventory.length, features: features.length, spells: 0, effects: effects.length, favourites: 0 }
  };
}

function collectiveHealth(hp) {
  if (!hp || (numericOrNull(hp.value) === null && numericOrNull(hp.max) === null)) return null;
  return { value: numericOrNull(hp.value), max: numericOrNull(hp.effectiveMax ?? hp.max), temp: numericOrNull(hp.temp) };
}

/** Resolve native D&D5e favourites to owned Items. A sole Activity favourite
 * retains its exact Activity identity when the row invokes the action. */
function favouriteItemRecords(actor, items, itemRecords) {
  const native = Array.from(actor?.system?.favorites ?? []);
  const byItemId = new Map(items.map((item) => [String(item.id ?? ""), item]));
  const recordsByItemId = new Map(itemRecords.map((item) => [item.id, item]));
  const directIds = new Map();
  const activityIds = new Map();
  for (const item of items) {
    const itemId = String(item.id ?? "");
    const relativeUuid = relativeItemUuid(item, actor);
    if (relativeUuid) directIds.set(relativeUuid, itemId);
    for (const activity of collectionValues(item.system?.activities)) {
      const activityId = String(activity?.relativeUUID ?? (relativeUuid && activity?.id ? `${relativeUuid}.Activity.${activity.id}` : ""));
      if (activityId) activityIds.set(activityId, { itemId, activityId: String(activity.id ?? "") });
    }
  }

  const grouped = new Map();
  for (const [index, favorite] of native.entries()) {
    const favoriteId = stringValue(favorite?.id);
    if (!favoriteId) continue;
    const activityMatch = activityIds.get(favoriteId);
    let itemId = directIds.get(favoriteId) ?? activityMatch?.itemId ?? "";
    if (!itemId) itemId = favouriteResolvedItemId(actor, favoriteId, byItemId);
    const item = recordsByItemId.get(itemId);
    if (!item) continue;
    const current = grouped.get(itemId) ?? {
      item,
      favouriteIds: [],
      favouriteKinds: [],
      favouriteActivityIds: [],
      hasItemFavourite: false,
      favouriteSort: Number.isFinite(Number(favorite?.sort)) ? Number(favorite.sort) : index
    };
    current.favouriteIds.push(favoriteId);
    current.favouriteKinds.push(stringValue(favorite?.type) || "item");
    if (activityMatch?.activityId) current.favouriteActivityIds.push(activityMatch.activityId);
    if (directIds.has(favoriteId)) current.hasItemFavourite = true;
    current.favouriteSort = Math.min(current.favouriteSort, Number.isFinite(Number(favorite?.sort)) ? Number(favorite.sort) : index);
    grouped.set(itemId, current);
  }

  return Object.freeze(Array.from(grouped.values())
    .sort((left, right) => left.favouriteSort - right.favouriteSort || left.item.sort - right.item.sort || left.item.name.localeCompare(right.item.name))
    .map(({ item, favouriteIds, favouriteKinds, favouriteActivityIds, hasItemFavourite, favouriteSort }) => Object.freeze({
      ...item,
      ...(!hasItemFavourite && new Set(favouriteActivityIds).size === 1
        ? { activityId: favouriteActivityIds[0] } : {}),
      favorite: true,
      favouriteIds: Object.freeze([...new Set(favouriteIds)]),
      favouriteKinds: Object.freeze([...new Set(favouriteKinds)]),
      favouriteSort
    })));
}

function favouriteResolvedItemId(actor, favoriteId, byItemId) {
  try {
    const resolved = (globalThis.fromUuidSync ?? globalThis.foundry?.utils?.fromUuidSync)?.(favoriteId, { relative: actor });
    const item = resolved?.documentName === "Item" ? resolved : resolved?.item;
    const itemId = String(item?.id ?? "");
    return itemId && byItemId.has(itemId) && (item.parent === actor || item.actor === actor || actor.items?.get?.(itemId) === item) ? itemId : "";
  } catch {
    return "";
  }
}

function favouriteDiagnostics(actor, favourites) {
  const actorFavoriteCount = Array.from(actor?.system?.favorites ?? []).length;
  const game = globalThis.game;
  const tidyDetected = Boolean(game?.modules?.get?.("tidy5e-sheet")?.active);
  let configuredSource = "core";
  try { configuredSource = String(game?.settings?.get?.("ve-mobile", "characterFavouritesSource") ?? "core"); } catch { configuredSource = "core"; }
  if (!["core", "tidy", "both", "off"].includes(configuredSource)) configuredSource = "core";
  const staleConfiguration = !tidyDetected && ["tidy", "both"].includes(configuredSource);
  const sourceMode = staleConfiguration ? "core" : configuredSource;
  return Object.freeze({
    enabled: sourceMode !== "off",
    sourceMode,
    configuredSource,
    staleConfiguration,
    tidyDetected,
    actorFavoriteCount,
    coreCount: actorFavoriteCount,
    tidyCount: tidyDetected ? actorFavoriteCount : 0,
    effectiveCount: sourceMode === "off" ? 0 : favourites.length
  });
}

function itemActionFields(actor, item, user) {
  const system = item.system ?? {};
  const owned = Boolean(item.parent === actor || actor.items?.get?.(item.id) === item || itemsContain(actor.items, item))
    && canOwn(actor, user) && item.isOwner !== false;
  const favoriteId = owned ? relativeItemUuid(item, actor) : "";
  const favoriteApplicable = Boolean(favoriteId && "favorites" in (actor.system ?? {})
    && typeof actor.system?.hasFavorite === "function"
    && typeof actor.system?.addFavorite === "function"
    && typeof actor.system?.removeFavorite === "function");
  return {
    favoriteApplicable,
    favorite: favoriteApplicable ? Boolean(actor.system.hasFavorite(favoriteId)) : false,
    canEquip: owned && Object.hasOwn(system, "equipped") && typeof item.update === "function",
    canAttune: owned && ["required", "optional"].includes(stringValue(system.attunement))
      && typeof system.attuned === "boolean" && typeof item.update === "function",
    canEdit: owned && typeof item.sheet?.render === "function"
  };
}

/** Action-menu data only: no descriptions, enrichment, effects or Actor projection. */
export function createItemMenuRecord(actor, item, user, { activityId = "", favouriteContext = false } = {}) {
  const relativeUuid = relativeItemUuid(item, actor);
  const favouriteIds = Array.from(actor.system?.favorites ?? [])
    .map(entry => String(entry?.id ?? ""))
    .filter(id => id === relativeUuid || id.startsWith(`${relativeUuid}.Activity.`));
  return Object.freeze({ id: String(item.id), name: String(item.name ?? localizeFoundry("VEMOBILE.Character.ActorView.UnknownItem", "Unknown item")),
    type: String(item.type ?? "item"), img: String(item.img ?? ""),
    equipped: item.system?.equipped ?? null, attuned: item.system?.attuned ?? null,
    ...itemActionFields(actor, item, user),
    ...(favouriteContext ? { favorite: favouriteIds.length > 0 } : {}),
    ...(item.type === "spell" ? spellPreparationRecord(actor, item, user, resolveItemSourceItem(actor, item)) : {}),
    favouriteIds: Object.freeze(favouriteIds), ...(activityId ? { activityId: String(activityId) } : {}) });
}

function itemViewRecord(actor, item, user) {
  const system = item.system ?? {};
  const sourceItem = resolveItemSourceItem(actor, item);
  const usesMax = number(system.uses?.max);
  const detail = itemDetailRecord(item);
  return {
    id: String(item.id ?? ""),
    name: String(item.name ?? localizeFoundry("VEMOBILE.Character.ActorView.UnknownItem", "Unknown item")),
    img: item.img ?? "",
    type: String(item.type ?? "item"),
    typeLabel: itemTypeLabel(item),
    quantity: number(system.quantity, 1),
    quantityApplicable: Object.hasOwn(system, "quantity"),
    equipped: typeof system.equipped === "boolean" ? system.equipped : null,
    equippedApplicable: Object.hasOwn(system, "equipped"),
    attuned: typeof system.attuned === "boolean" ? system.attuned : null,
    attunement: stringValue(system.attunement),
    attunementApplicable: ["required", "optional"].includes(stringValue(system.attunement)),
    sort: number(item.sort),
    containerId: stringValue(system.container),
    containerCapacity: containerCapacityRecord(item),
    uses: usesMax > 0 ? { value: clamp(number(system.uses?.value), 0, usesMax), max: usesMax } : null,
    usesLabel: itemUsesLabel(system.uses, item.labels?.uses),
    activationType: stringValue(system.activation?.type),
    ...itemActionFields(actor, item, user),
    source: humanLabel(system.source?.label),
    sourceItem: sourceItem ? { id: String(sourceItem.id ?? ""), name: String(sourceItem.name ?? ""), type: String(sourceItem.type ?? "") } : null,
    usableActivity: collectionValues(system.activities).some((activity) => activity?.canUse),
    useMode: collectionValues(system.activities).some((activity) => activity?.canUse) ? "activity" : "chat-card",
    level: number(system.level),
    activation: localized(item.labels?.activation),
    npcGroup: actor.type === "npc" ? npcFeatureGroup(item) : null,
    npcGroupLabel: actor.type === "npc" ? npcFeatureGroupLabel(item) : "",
    range: localized(item.labels?.range),
    ...detail
  };
}

function itemTypeLabel(item) {
  const system = item.system ?? {};
  const prepared = humanLabel(system.type?.label);
  if (prepared) return prepared;
  const typeKey = stringValue(system.type?.value);
  const category = typeKey ? globalThis.CONFIG?.Item?.dataModels?.[item.type]?.itemCategories?.[typeKey] : null;
  return humanLabel(typeof category === "string" ? category : category?.label) || titleCase(item.type);
}

function itemDetailRecord(item) {
  const system = item.system ?? {};
  const identified = system.identified !== false;
  const rawDescription = identified ? stringValue(system.description?.value) : stringValue(system.unidentified?.description);
  const descriptionHtml = rawDescription ? safeItemHtml(rawDescription) : "";
  const properties = identified ? itemProperties(item) : [];
  const activities = identified ? itemActivities(item) : [];
  const damage = Array.from(new Set(activities.flatMap((activity) => activity.damage ?? []).filter(Boolean)));
  const details = itemDetailEntries(item, damage);
  const effects = identified ? itemEffects(item) : [];
  return {
    descriptionHtml,
    details,
    properties,
    activities,
    effects
  };
}

function itemDetailEntries(item, damage = []) {
  const system = item.system ?? {};
  const labels = item.labels ?? {};
  const entries = [];
  const add = (label, value) => {
    const prepared = humanLabel(value);
    if (!prepared || entries.some((entry) => entry.key === label && entry.value === prepared)) return;
    entries.push({ key: label, label: detailLabel(label), value: prepared });
  };
  add("Type", itemTypeLabel(item));
  add("Damage", damage.join(" · "));
  add("Level", labels.level);
  add("School", labels.school);
  add("Casting Time", labels.activation);
  add("Range", labels.range);
  add("Target", labels.target);
  add("Duration", labels.concentrationDuration ?? labels.duration);
  add("Components", labels.components?.full ?? labels.components?.vsm);

  const quantity = numericOrNull(system.quantity);
  if (quantity !== null) add("Quantity", String(quantity));
  const weight = numericOrNull(system.weight?.value);
  if (weight !== null && weight > 0) add("Weight", `${weight} ${stringValue(system.weight?.units)}`.trim());
  const price = numericOrNull(system.price?.value);
  if (price !== null && price > 0) add("Price", `${price} ${stringValue(system.price?.denomination)}`.trim());
  add("Rarity", globalThis.CONFIG?.DND5E?.itemRarity?.[system.rarity] ?? system.rarity);
  if (typeof system.equipped === "boolean") add("Equipped", localized(system.equipped ? "Yes" : "No"));
  if (typeof system.attuned === "boolean" && system.attunement && system.attunement !== "none") add("Attuned", localized(system.attuned ? "Yes" : "No"));
  return entries;
}

function itemProperties(item) {
  const system = item.system ?? {};
  const labels = item.labels ?? {};
  const labelProperties = Array.isArray(labels.properties) ? labels.properties : [];
  const values = [
    ...arrayValue(system.cardProperties),
    ...arrayValue(system.equippableItemCardProperties),
    ...labelProperties.map((property) => property?.label)
  ];
  return Array.from(new Set(values.map(humanLabel).filter(Boolean)));
}

function itemActivities(item) {
  return collectionValues(item.system?.activities)
    .filter((activity) => activity?.canConfigure !== false)
    .map((activity) => {
      let context = activity;
      try {
        context = activity.prepareSheetContext?.() ?? activity;
      } catch {
        context = activity;
      }
      const labels = context.labels ?? activity.labels ?? {};
      const details = [];
      const add = (label, value) => {
        const prepared = humanLabel(value);
        if (prepared) details.push({ key: label, label: detailLabel(label), value: prepared });
      };
      add("Activation", labels.activation);
      add("Range", labels.range);
      add("Target", labels.target);
      add("Duration", labels.concentrationDuration ?? labels.duration);
      add("Recovery", labels.recovery ?? labels.recharge);
      add("Uses", context.uses?.label ?? activity.uses?.label);
      add("Attack", labels.modifier ?? labels.toHit);

      const saveDc = numericOrNull(context.save?.dc?.value ?? activity.save?.dc?.value);
      if (saveDc !== null) {
        const abilities = collectionValues(context.save?.ability ?? activity.save?.ability)
          .map((ability) => humanLabel(globalThis.CONFIG?.DND5E?.abilities?.[ability]?.label ?? ability))
          .filter(Boolean);
        add("Save", `DC ${saveDc}${abilities.length ? ` ${abilities.join(" / ")}` : ""}`);
      }

      const damageLabels = labels.damage ?? labels.damages ?? [];
      const preparedDamage = arrayValue(damageLabels)
        .map((entry) => humanLabel(typeof entry === "string" ? entry : entry?.label ?? entry?.formula))
        .filter(Boolean);
      const damage = preparedDamage.length ? preparedDamage : rawActivityDamage(context, activity);
      return {
        id: String(context._id ?? activity.id ?? ""),
        name: String(context.name ?? activity.name ?? item.name ?? "Activity"),
        type: humanLabel(activity.constructor?.metadata?.title ?? activity.type),
        img: context.img ?? activity.img ?? "",
        activationType: stringValue(context.activation?.type ?? activity.activation?.type),
        range: humanLabel(labels.range),
        uses: activityUsesLabel(context.uses ?? activity.uses, labels.uses),
        details,
        damage
      };
    });
}

function activityUsesLabel(uses = {}, preparedLabel = "") {
  const label = humanLabel(preparedLabel ?? uses?.label);
  if (label) return label;
  const max = numericOrNull(uses?.max);
  if (!(max > 0)) return "";
  const spent = Math.max(0, numericOrNull(uses?.spent) ?? 0);
  const remaining = Math.max(0, max - spent);
  const recovery = collectionValues(uses?.recovery)
    .map((entry) => stringValue(entry?.period ?? entry?.type ?? entry))
    .find(Boolean);
  return recovery ? `${remaining} / ${recoveryLabel(recovery)}` : `${remaining} / ${max}`;
}

function itemUsesLabel(uses = {}, preparedLabel = "") {
  const label = humanLabel(preparedLabel);
  if (label) return label;
  const max = numericOrNull(uses?.max);
  if (!(max > 0)) return "";
  const value = clamp(number(uses?.value), 0, max);
  const recovery = collectionValues(uses?.recovery)
    .map((entry) => stringValue(entry?.period ?? entry?.type ?? entry))
    .find(Boolean);
  return recovery ? `${value} / ${recoveryLabel(recovery)}` : `${value} / ${max}`;
}

function recoveryLabel(value) {
  const key = stringValue(value).toLowerCase();
  if (["lr", "long", "longrest", "long-rest"].includes(key)) return "LR";
  if (["sr", "short", "shortrest", "short-rest"].includes(key)) return "SR";
  return humanLabel(value);
}

function rawActivityDamage(context, activity) {
  return collectionValues(context.damage?.parts ?? activity.damage?.parts).map((part) => {
    const customFormula = part?.custom?.enabled ? stringValue(part.custom.formula) : "";
    const directFormula = stringValue(part?.formula);
    const diceNumber = numericOrNull(part?.number);
    const denomination = numericOrNull(part?.denomination);
    const bonus = stringValue(part?.bonus);
    const diceFormula = diceNumber !== null && diceNumber > 0 && denomination !== null && denomination > 0
      ? `${diceNumber}d${denomination}${bonus ? ` ${/^[+-]/u.test(bonus) ? bonus : `+ ${bonus}`}` : ""}`
      : bonus;
    const formula = customFormula || directFormula || diceFormula;
    const types = collectionValues(part?.types).map((type) => {
      const key = String(type ?? "");
      return humanLabel(globalThis.CONFIG?.DND5E?.damageTypes?.[key]?.label) || titleCase(key);
    }).filter(Boolean);
    return [formula, types.join(" / ")].filter(Boolean).join(" ");
  }).filter(Boolean);
}

function itemEffects(item) {
  return collectionValues(item.effects).map((effect) => ({
    id: String(effect.id ?? ""),
    name: String(effect.name ?? "Effect"),
    img: effect.img ?? effect.icon ?? "",
    disabled: Boolean(effect.disabled),
    isSuppressed: Boolean(effect.isSuppressed)
  }));
}

function safeItemHtml(value) {
  let html = String(value ?? "");
  let previous;
  do {
    previous = html;
    html = html.replace(/<(section|div)\b[^>]*class=(["'])[^"']*\bsecret\b[^"']*\2[^>]*>[\s\S]*?<\/\1>/giu, "");
  } while (html !== previous);
  return html
    .replace(/<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/giu, "")
    .replace(/\son[a-z]+\s*=\s*(["'])[^"']*\1/giu, "")
    .replace(/\s(?:href|src)\s*=\s*(["'])\s*javascript:[^"']*\1/giu, "")
    .trim();
}

function actorFolderPath(actor) {
  const path = [];
  const seen = new Set();
  let folder = actor?.folder ?? null;
  while (folder && !seen.has(folder.id)) {
    const id = String(folder.id ?? "");
    if (!id) break;
    seen.add(id);
    path.push({ id, name: String(folder.name ?? localizeFoundry("VEMOBILE.Character.ActorView.UnnamedFolder", "Unnamed folder")), sort: number(folder.sort) });
    folder = folder.folder ?? null;
  }
  return path.reverse();
}

function biographyRecord(details = {}, actorType = "character") {
  const isNpc = actorType === "npc";
  const characteristics = [
    ["alignment", "Alignment"],
    ["faith", "Faith"],
    ["gender", "Gender"],
    ["age", "Age"],
    ["height", "Height"],
    ["weight", "Weight"],
    ["eyes", "Eyes"],
    ["hair", "Hair"],
    ["skin", "Skin"]
  ].map(([key, label]) => ({ key, label, value: String(details?.[key] ?? "").trim() }));
  return {
    characteristics: isNpc ? [] : characteristics,
    ideal: biographyPlainText(details?.ideal),
    bond: biographyPlainText(details?.bond),
    flaw: biographyPlainText(details?.flaw),
    trait: biographyPlainText(details?.trait),
    appearance: biographyPlainText(details?.appearance)
  };
}

function currencyRecord(currency = {}) {
  return Object.freeze(Object.fromEntries(CURRENCY_DENOMINATIONS.map((denomination) => {
    const value = Number(currency?.[denomination]);
    return [denomination, Number.isFinite(value) && Number.isInteger(value) && value >= 0 ? value : 0];
  })));
}

function encumbranceRecord(encumbrance = {}) {
  const thresholds = encumbrance?.thresholds ?? {};
  const stops = encumbrance?.stops ?? {};
  return Object.freeze({
    value: numericOrNull(encumbrance?.value),
    max: numericOrNull(encumbrance?.max ?? thresholds.maximum),
    pct: numericOrNull(encumbrance?.pct),
    thresholds: Object.freeze({
      maximum: numericOrNull(thresholds.maximum ?? encumbrance?.max),
      encumbered: numericOrNull(thresholds.encumbered),
      heavilyEncumbered: numericOrNull(thresholds.heavilyEncumbered)
    }),
    stops: Object.freeze({
      encumbered: numericOrNull(stops.encumbered),
      heavilyEncumbered: numericOrNull(stops.heavilyEncumbered)
    })
  });
}

/** Plain-text normalization for D&D5e StringFields; never returns executable markup. */
export function biographyPlainText(value) {
  let text = String(value ?? "");
  if (/&lt;\/?(?:p|div|br|li|ul|ol|h[1-6])\b/iu.test(text)) text = decodeBasicEntities(text);
  return decodeBasicEntities(text
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/(?:p|div|li|ul|ol|h[1-6])\s*>/giu, "\n")
    .replace(/<li\b[^>]*>/giu, "• ")
    .replace(/<[^>]*>/gu, "")
  ).replace(/\r\n?/gu, "\n").replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
}

function decodeBasicEntities(value) {
  return String(value)
    .replace(/&nbsp;/giu, " ")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#0*39;|&apos;/giu, "'")
    .replace(/&amp;/giu, "&");
}

function npcIdentityRecord(system = {}) {
  const details = system.details ?? {};
  const type = details.type ?? {};
  const typeKey = stringValue(typeof type === "string" ? type : type.value);
  const configuredType = typeKey ? globalThis.CONFIG?.DND5E?.creatureTypes?.[typeKey] : null;
  const creatureType = humanLabel(type.label)
    || (typeKey === "custom" ? humanLabel(type.custom) : localized(configuredType?.label))
    || titleCase(typeKey);
  const sizeKey = stringValue(system.traits?.size);
  const configuredSize = sizeKey ? globalThis.CONFIG?.DND5E?.actorSizes?.[sizeKey] : null;
  const size = localized(configuredSize?.label) || titleCase(sizeKey);
  const challengeRating = numericOrNull(details.cr);
  const alignment = humanLabel(details.alignment);
  const habitat = npcHabitatLabel(details.habitat);
  const xp = numericOrNull(details.xp?.value);
  return {
    challengeRating,
    challengeRatingLabel: formatChallengeRating(challengeRating),
    creatureType: creatureType || "NPC",
    creatureTypeKey: typeKey,
    size,
    sizeKey,
    alignment,
    habitat,
    xp,
    xpLabel: xp === null ? "" : localizedNumber(xp, globalThis.game?.i18n?.lang ?? "en")
  };
}

/** Mirror NPC sheet sidebar habitat formatting, including "any" precedence. */
function npcHabitatLabel(habitat = {}) {
  const entries = Array.from(habitat?.value ?? []);
  const any = entries.some((entry) => entry?.type === "any");
  const labels = entries.flatMap(({ type, subtype } = {}) => {
    const configured = globalThis.CONFIG?.DND5E?.habitats?.[type];
    if (!configured?.label || (any && type !== "any")) return [];
    let label = localized(configured.label);
    if (subtype) {
      const key = "DND5E.Habitat.Subtype";
      label = globalThis.game?.i18n?.format?.(key, { type: label, subtype }) || `${label} (${subtype})`;
    }
    return [label];
  });
  labels.push(...String(habitat?.custom ?? "").split(";").map((entry) => entry.trim()).filter(Boolean));
  return labels.sort((a, b) => a.localeCompare(b, globalThis.game?.i18n?.lang || undefined)).join(", ");
}

function npcResourceRecord(system = {}) {
  const resources = system.resources ?? {};
  const max = Math.max(0, number(resources.legact?.max));
  const spent = clamp(number(resources.legact?.spent), 0, max);
  const modern = system.source?.rules
    ? system.source.rules === "2024"
    : globalThis.dnd5e?.settings?.rulesVersion === "modern";
  const lair = resources.lair ?? {};
  const hasLair = modern ? Boolean(lair.value) : Boolean(lair.initiative);
  return { legendary: max ? { max, remaining: max - spent } : null,
    lair: hasLair ? { initiative: numericOrNull(lair.initiative) } : null };
}

function npcFeatureGroup(item) {
  const first = collectionValues(item.system?.activities)[0];
  const type = stringValue(first?.activation?.type);
  const config = globalThis.CONFIG?.DND5E?.activityActivationTypes?.[type];
  if (item.system?.properties?.has?.("trait") || !type || config?.passive) return "passive";
  return config ? type : "passive";
}

function npcFeatureGroupLabel(item) {
  const group = npcFeatureGroup(item);
  if (group === "passive") return localized("DND5E.Features") || "Features";
  const config = globalThis.CONFIG?.DND5E?.activityActivationTypes?.[group];
  return localized(config?.header ?? config?.label) || titleCase(group);
}

function formatChallengeRating(value) {
  if (value === null) return "";
  return ({ 0.125: "1/8", 0.25: "1/4", 0.5: "1/2" })[value] ?? String(value);
}

function arrayValue(value) {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function collectionValues(value) {
  if (!value) return [];
  if (Array.isArray(value.contents)) return value.contents;
  try {
    return Array.from(value);
  } catch {
    return typeof value === "object" ? Object.values(value) : [];
  }
}

function spellPreparationRecord(actor, item, user, sourceItem) {
  const system = item.system ?? {};
  const methodKey = stringValue(system.method);
  const preparationState = spellPreparationState(system.prepared);
  const linked = Boolean(system.linkedActivity?.item);
  const cached = Boolean(item.getFlag?.("dnd5e", "cachedFor"));
  const rechargeExcluded = Boolean(item.hasRecharge);
  const owned = Boolean(item.parent === actor || actor.items?.get?.(item.id) === item || itemsContain(actor.items, item))
    && canOwn(actor, user) && item.isOwner !== false;
  const nonClassItemSourced = Boolean(sourceItem && String(sourceItem.type).toLowerCase() !== "class");
  const preparationEligible = PREPARING_SPELL_METHODS.has(methodKey)
    && (preparationState === 0 || preparationState === 1)
    && !nonClassItemSourced && !linked && !cached && !rechargeExcluded;
  const canPrepare = preparationEligible && owned;
  return { preparationState, canPrepare, preparationEligible, linked, cached, rechargeExcluded, owned };
}

function spellViewRecord(actor, item, user) {
  const record = itemViewRecord(actor, item, user);
  const system = item.system ?? {};
  const methodKey = stringValue(system.method);
  const methodDefinition = methodKey ? globalThis.CONFIG?.DND5E?.spellcasting?.[methodKey] : null;
  const { preparationState, canPrepare, preparationEligible, linked, cached, rechargeExcluded, owned }
    = spellPreparationRecord(actor, item, user, record.sourceItem);
  return {
    ...record,
    level: Math.max(0, number(system.level)),
    prepared: preparationState,
    preparationState,
    canPrepare,
    preparationEligible,
    alwaysPrepared: preparationState === 2,
    linked,
    cached,
    rechargeExcluded,
    owned,
    preparationStatus: spellPreparationStatus(preparationState, methodDefinition ?? { prepares: PREPARING_SPELL_METHODS.has(methodKey) }),
    castingTime: spellCastingTime(item),
    spellcastingMethod: methodKey ? {
      key: methodKey,
      label: localized(methodDefinition?.label) || titleCase(methodKey),
      order: number(methodDefinition?.order, 100)
    } : null
  };
}

function spellPreparationState(value) {
  if (typeof value === "boolean") return Number(value);
  const state = Number(value);
  return Number.isInteger(state) && state >= 0 && state <= 2 ? state : 0;
}

function spellPreparationStatus(value, method) {
  const states = globalThis.CONFIG?.DND5E?.spellPreparationStates ?? {};
  const normalized = spellPreparationState(value);
  const state = Object.values(states).find((entry) => entry?.value === normalized);
  if (normalized === 2 || normalized === states.always?.value) return localized(state?.label) || localizeFoundry("VEMOBILE.Character.ActorView.AlwaysPrepared", "Always Prepared");
  if (!method?.prepares) return "";
  return localized(state?.label) || (normalized === 1 ? "Prepared" : "Unprepared");
}

function canOwn(document, user) {
  try {
    return document?.testUserPermission?.(user, "OWNER") ?? Boolean(document?.isOwner);
  } catch {
    return false;
  }
}

function relativeItemUuid(item, actor) {
  if (typeof item?.getRelativeUUID !== "function") return "";
  try {
    return stringValue(item.getRelativeUUID(actor));
  } catch {
    return "";
  }
}

function itemsContain(collection, item) {
  try {
    return Array.from(collection ?? []).includes(item);
  } catch {
    return false;
  }
}

function spellCastingTime(item) {
  const prepared = stringValue(item.labels?.activation) || stringValue(item.labels?.activations?.[0]?.simple);
  if (prepared) return prepared;
  const activation = item.system?.activation ?? {};
  const type = stringValue(activation.type);
  if (!type) return "";
  const definition = globalThis.CONFIG?.DND5E?.activityActivationTypes?.[type];
  const label = localized(definition?.label) || titleCase(type);
  const value = numericOrNull(activation.value ?? activation.cost);
  return definition?.scalar && value ? `${value} ${label}` : label;
}

function containerCapacityRecord(item) {
  if (!["backpack", "container"].includes(item.type)) return null;
  const capacity = item.system?.capacity ?? {};
  const countMax = numericOrNull(capacity.count);
  if (countMax !== null && countMax > 0) {
    return { value: roundTenth(item.system?.contentsCount), max: countMax, units: localized("DND5E.Items") || "items" };
  }
  const weightMax = numericOrNull(capacity.weight?.value);
  if (weightMax !== null && weightMax > 0) {
    const unitKey = capacity.weight?.units;
    const unitLabel = globalThis.CONFIG?.DND5E?.weightUnits?.[unitKey]?.label;
    return { value: roundTenth(item.system?.contentsWeight), max: weightMax, units: localized(unitLabel) || stringValue(unitKey) };
  }
  return { value: 0, max: null, units: "" };
}

export function resolveItemSourceItem(actor, item) {
  if (item.type === "subclass") {
    const classIdentifier = stringValue(item.system?.classIdentifier);
    const parentClass = classIdentifier ? Array.from(actor.items ?? []).find((candidate) => candidate.type === "class" && String(candidate.identifier ?? candidate.system?.identifier ?? "") === classIdentifier) : null;
    if (parentClass) return parentClass;
  }

  const reference = stringValue(item.system?.sourceItem);
  if (reference) {
    const identified = actor.identifiedItems?.get?.(reference);
    const identifiedItem = typeof identified?.first === "function"
      ? identified.first()
      : Array.isArray(identified)
        ? identified[0]
        : identified?.type
          ? identified
          : null;
    if (identifiedItem) return identifiedItem;
    const separator = reference.indexOf(":");
    const type = separator >= 0 ? reference.slice(0, separator) : "";
    const identifier = separator >= 0 ? reference.slice(separator + 1) : reference;
    const matching = Array.from(actor.items ?? []).find((candidate) => candidate.type === type && String(candidate.identifier ?? candidate.system?.identifier ?? "") === identifier);
    if (matching) return matching;
  }

  const root = item.getFlag?.("dnd5e", "advancementRoot")
    ?? item.flags?.dnd5e?.advancementRoot
    ?? item.getFlag?.("dnd5e", "advancementOrigin")
    ?? item.flags?.dnd5e?.advancementOrigin;
  if (typeof root === "string" && root) {
    const itemId = root.split(".")[0];
    const grantingItem = actor.items?.get?.(itemId) ?? Array.from(actor.items ?? []).find((candidate) => candidate.id === itemId);
    if (grantingItem) return grantingItem;
  }
  return item.system?.linkedActivity?.item ?? null;
}

function effectRecords(actor) {
  return applicableEffects(actor)
    .filter((effect) => !effect.isConcealed)
    .filter((effect) => effect.dependentOrigin?.active !== false)
    .filter((effect) => effect.parent?.system?.identified !== false)
    .map((effect) => {
      const statuses = Array.from(effect.statuses ?? []).map(String);
      const source = effectSourceRecord(actor, effect, statuses);
      const effectId = String(effect.id ?? "");
      const effectUuid = String(effect.uuid ?? "");
      const parentId = String(effect.parent?.id ?? "");
      const parentItem = actor.items?.get?.(parentId)
        ?? Array.from(actor.items?.values?.() ?? actor.items ?? []).find((item) => String(item?.id ?? "") === parentId);
      const effectParentId = parentItem?.effects?.get?.(effectId) === effect ? String(parentItem.id) : "";
      return {
        id: effectUuid || effectId,
        effectId,
        effectUuid,
        effectParentId,
        name: String(effect.name ?? "Effect"),
        sort: number(effect.sort),
        img: effect.img ?? effect.icon ?? "",
        statuses,
        isTemporary: Boolean(effect.isTemporary),
        isCondition: statuses.some((status) => {
          const condition = globalThis.CONFIG?.DND5E?.conditionTypes?.[status];
          return Boolean(condition && !condition.pseudo);
        }),
        disabled: Boolean(effect.disabled),
        isSuppressed: Boolean(effect.isSuppressed),
        description: effectDescription(effect),
        source: [source.name, source.type && source.type !== source.name ? source.type : ""].filter(Boolean).join(" · "),
        sourceName: source.name,
        sourceType: source.type,
        duration: effectDurationLabel(effect)
      };
    });
}

function applicableEffects(actor) {
  let source;
  try { source = actor.allApplicableEffects ? actor.allApplicableEffects() : actor.effects ?? []; }
  catch { source = actor.effects ?? []; }
  return Array.from(source ?? []);
}

function conditionRecords(actor) {
  const definitions = globalThis.CONFIG?.DND5E?.conditionTypes ?? {};
  const effects = applicableEffects(actor).filter((effect) => !effect.disabled && !effect.isSuppressed);
  return Object.entries(definitions).filter(([id, definition]) => validKey(id) && !definition?.pseudo).map(([id, definition]) => {
    const effect = effects.find((candidate) => Array.from(candidate.statuses ?? []).map(String).includes(id));
    const maximumLevel = Number.isFinite(Number(definition?.levels)) ? Math.max(1, Math.floor(Number(definition.levels))) : null;
    let level = null;
    if (maximumLevel && effect) {
      const value = effect.getFlag?.("dnd5e", "exhaustionLevel") ?? effect.flags?.dnd5e?.exhaustionLevel;
      level = clamp(Math.floor(number(value, 1)), 1, maximumLevel);
    }
    return Object.freeze({
      id,
      label: localized(definition?.name ?? definition?.label) || titleCase(id),
      img: stringValue(definition?.img),
      active: Boolean(effect),
      level,
      maximumLevel
    });
  });
}

function effectSourceRecord(actor, effect, statuses = []) {
  const conditionId = statuses.find((status) => {
    const definition = globalThis.CONFIG?.DND5E?.conditionTypes?.[status];
    return Boolean(definition && !definition.pseudo);
  });
  let document = effectOriginDocument(actor, effect);
  if (document?.documentName === "Activity" || document?.constructor?.metadata?.name === "Activity") {
    document = document.item ?? (document.parent?.documentName === "Item" ? document.parent : document.parent?.item) ?? document;
  }
  if (document?.documentName === "Item" || document?.type && document?.parent?.documentName === "Actor") {
    const name = humanLabel(document.name);
    const type = effectItemType(document);
    if (name) return Object.freeze({ name, type });
  }
  if (conditionId) {
    const definition = globalThis.CONFIG?.DND5E?.conditionTypes?.[conditionId];
    return Object.freeze({ name: localized(definition?.name ?? definition?.label) || titleCase(conditionId), type: "Condition" });
  }
  if (document?.documentName === "Actor" || document === actor) return Object.freeze({ name: "Actor", type: "Actor" });
  const prepared = humanLabel(typeof effect.sourceName === "string" ? effect.sourceName : "");
  if (prepared) return Object.freeze({ name: prepared, type: "" });
  if (stringValue(effect.origin)) return Object.freeze({ name: "", type: "" });
  if (effect.parent === actor || effect.parent?.documentName === "Actor") return Object.freeze({ name: "Actor", type: "Actor" });
  return Object.freeze({ name: "", type: "" });
}

function effectOriginDocument(actor, effect) {
  if (effect.parent?.documentName === "Item") return effect.parent;
  const origin = stringValue(effect.origin);
  if (!origin) return effect.parent ?? null;
  const candidates = [origin];
  const actorUuid = stringValue(actor?.uuid);
  const actorId = stringValue(actor?.id);
  if (actorUuid.startsWith("Scene.") && actorId && origin.startsWith(`Actor.${actorId}.`)) {
    candidates.unshift(`${actorUuid}${origin.slice(`Actor.${actorId}`.length)}`);
  }
  const resolve = globalThis.fromUuidSync ?? globalThis.foundry?.utils?.fromUuidSync;
  if (typeof resolve === "function") {
    for (const candidate of candidates) {
      try {
        const document = resolve(candidate, { relative: actor });
        if (document) return document;
      } catch {
        // Deleted or inaccessible origins are intentionally omitted from presentation.
      }
    }
  }
  return null;
}

function effectItemType(item) {
  const type = stringValue(item?.type).toLowerCase();
  if (type === "spell") return "Spell";
  if (["equipment", "weapon", "consumable", "tool", "loot", "container", "backpack"].includes(type)) return type === "equipment" ? "Equipment" : titleCase(type);
  if (["feat", "class", "subclass", "background", "race", "species"].includes(type)) return "Feature";
  return localized(globalThis.CONFIG?.DND5E?.itemTypes?.[type]?.label) || titleCase(type) || "Item";
}

function effectDescription(effect) {
  const value = effect?.description ?? effect?.system?.description?.value ?? effect?.flags?.dnd5e?.description ?? "";
  return plainEffectText(value, 280);
}

function plainEffectText(value, maximum = 280) {
  const html = typeof value === "string" ? value : typeof value?.value === "string" ? value.value : "";
  if (!html) return "";
  const safeHtml = html.replace(/<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/giu, " ");
  let text = safeHtml;
  try {
    const template = globalThis.document?.createElement?.("template");
    if (template) {
      template.innerHTML = safeHtml;
      text = template.content?.textContent ?? template.textContent ?? "";
    } else text = safeHtml.replace(/<[^>]*>/gu, " ");
  } catch { text = safeHtml.replace(/<[^>]*>/gu, " "); }
  text = text.replace(/&nbsp;/giu, " ").replace(/&amp;/giu, "&").replace(/&lt;/giu, "<").replace(/&gt;/giu, ">").replace(/\s+/gu, " ").trim();
  if (!text || /^(?:@?UUID\b|Compendium\.|Actor\.|Item\.|Scene\.)/iu.test(text)) return "";
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1).trimEnd()}…`;
}

function effectDurationLabel(effect) {
  const prepared = humanLabel(effect?.duration?.label);
  const rawRemaining = effect?.duration?.remaining;
  if (rawRemaining === null || rawRemaining === undefined || rawRemaining === "") return /^expired$/iu.test(prepared) ? "" : prepared;
  if (prepared && !/^\d{5,}\s+seconds?$/iu.test(prepared)) return prepared;
  const remaining = Number(rawRemaining);
  if (remaining === 0) return "Expired";
  if (!Number.isFinite(remaining) || remaining < 0) return "";
  const type = String(effect?.duration?.type ?? "").toLowerCase();
  if (type === "turns" || type === "rounds") return `${Math.ceil(remaining)} ${Math.ceil(remaining) === 1 ? "round" : "rounds"}`;
  if (remaining >= 3600) return `${roundTenth(remaining / 3600)} hr`;
  if (remaining >= 60) return `${roundTenth(remaining / 60)} min`;
  return `${Math.ceil(remaining)} sec`;
}

function abilityRecords(source = {}) {
  return Object.entries(source).filter(([key]) => validKey(key)).map(([key, ability]) => ({
    key,
    short: key.toUpperCase(),
    label: ABILITY_LABELS[key] ?? key.toUpperCase(),
    score: number(ability?.value),
    modifier: number(ability?.mod),
    saveModifier: number(ability?.save, number(ability?.mod)),
    proficiency: number(ability?.proficient ?? ability?.proficiency?.multiplier ?? ability?.prof?.multiplier)
  }));
}

function skillRecords(source = {}) {
  return Object.entries(source).filter(([key]) => validKey(key)).map(([key, skill]) => ({
    key,
    label: SKILL_LABELS[key] ?? key.toUpperCase(),
    ability: String(skill?.ability ?? "").toUpperCase(),
    modifier: number(skill?.total, number(skill?.mod)),
    proficiency: number(skill?.proficient ?? skill?.prof?.multiplier ?? skill?.value),
    passive: numericOrNull(skill?.passive)
  })).sort((first, second) => first.label.localeCompare(second.label));
}

function toolProficiencyRecords(system, items) {
  const records = [];
  const tools = system.tools ?? {};
  for (const [key, tool] of Object.entries(tools)) {
    const proficiency = number(tool?.effectValue ?? tool?.value);
    if (proficiency <= 0) continue;
    records.push({
      key,
      label: toolLabel(key, items),
      proficiency,
      ability: String(tool?.ability ?? "").toUpperCase(),
      modifier: number(tool?.total, number(tool?.mod))
    });
  }

  const legacy = system.traits?.toolProf;
  for (const key of collectionValues(legacy?.value)) {
    if (records.some((record) => record.key === key)) continue;
    records.push({ key, label: toolLabel(key, items), proficiency: 1, ability: "", modifier: 0 });
  }
  appendCustomRecords(records, legacy?.custom, (label, index) => ({ key: `custom:${index}:${label}`, label, proficiency: 1, ability: "", modifier: 0 }));
  return records.sort((first, second) => first.label.localeCompare(second.label));
}

function traitRecords(system, items) {
  const senses = senseRecords(system.attributes?.senses);
  const resistance = simpleTraitRecords(system.traits?.dr, "damageTypes");
  const immunity = simpleTraitRecords(system.traits?.di, "damageTypes");
  const conditionImmunity = simpleTraitRecords(system.traits?.ci, "conditionTypes");
  const vulnerability = simpleTraitRecords(system.traits?.dv, "damageTypes");
  const damageModification = damageModificationRecords(system.traits?.dm, items);
  const armor = simpleTraitRecords(system.traits?.armorProf, "armorProficiencies");
  const weapons = simpleTraitRecords(system.traits?.weaponProf, "weaponProficiencies", items);
  const languages = languageRecords(system.traits?.languages);
  return [
    { key: "senses", label: localizeFoundry("VEMOBILE.Character.ActorView.Senses", "Senses"), icon: "fa-eye", entries: senses },
    { key: "resistances", label: localizeFoundry("VEMOBILE.Character.ActorView.Resistances", "Resistances"), icon: "fa-shield", entries: resistance },
    { key: "immunities", label: localizeFoundry("VEMOBILE.Character.ActorView.DamageImmunities", "Damage Immunities"), icon: "fa-shield", entries: immunity },
    { key: "condition-immunities", label: localizeFoundry("VEMOBILE.Character.ActorView.ConditionImmunities", "Condition Immunities"), icon: "fa-shield", entries: conditionImmunity },
    { key: "vulnerabilities", label: localizeFoundry("VEMOBILE.Character.ActorView.Vulnerabilities", "Vulnerabilities"), icon: "fa-heart-crack", entries: vulnerability },
    { key: "damage-modification", label: localizeFoundry("VEMOBILE.Character.ActorView.DamageModification", "Damage Modification"), icon: "fa-heart-circle-minus", entries: damageModification },
    { key: "armor", label: localizeFoundry("VEMOBILE.Character.ActorView.Armor", "Armor"), icon: "fa-shield-halved", entries: armor },
    { key: "weapons", label: localizeFoundry("VEMOBILE.Character.ActorView.Weapons", "Weapons"), icon: "fa-swords", entries: weapons },
    { key: "languages", label: localizeFoundry("VEMOBILE.Character.ActorView.Languages", "Languages"), icon: "fa-flag", entries: languages }
  ].filter((trait) => trait.entries.length);
}

function senseRecords(source = {}) {
  const ranges = source?.ranges ?? source ?? {};
  const units = stringValue(source?.units) || "ft";
  const entries = Object.entries(ranges)
    .filter(([key, value]) => validKey(key) && number(value) > 0)
    .map(([key, value]) => ({ label: localized(globalThis.CONFIG?.DND5E?.senses?.[key]) || SENSE_LABELS[key] || titleCase(key), value: `${number(value)} ${units}` }));
  appendCustomRecords(entries, source?.special, (label) => ({ label, value: "" }));
  return entries;
}

function simpleTraitRecords(source, configKey, items = []) {
  const entries = collectionValues(source?.value).map((key) => ({ label: configuredTraitLabel(key, configKey, items), value: "" }));
  appendCustomRecords(entries, source?.custom, (label) => ({ label, value: "" }));
  return uniqueTraitRecords(entries);
}

function damageModificationRecords(source, items = []) {
  const entries = Object.entries(source?.amount ?? {})
    .filter(([key, value]) => validKey(key) && value !== null && value !== undefined && String(value).trim())
    .map(([key, value]) => ({ label: configuredTraitLabel(key, "damageTypes", items), value: String(value) }));
  return uniqueTraitRecords(entries);
}

function languageRecords(source = {}) {
  const prepared = source?.labels;
  const entries = [
    ...collectionValues(prepared?.languages).map((label) => ({ label: String(label), value: "" })),
    ...collectionValues(prepared?.ranged).map((label) => ({ label: String(label), value: "" }))
  ];
  if (!entries.length) {
    for (const key of collectionValues(source?.value)) {
      entries.push({ label: configLabel(globalThis.CONFIG?.DND5E?.languages, key) || titleCase(key), value: "" });
    }
    appendCustomRecords(entries, source?.custom, (label) => ({ label, value: "" }));
  }
  return uniqueTraitRecords(entries);
}

function appendCustomRecords(records, custom, makeRecord) {
  const values = String(custom ?? "").split(/\s*;\s*/u).map((value) => value.trim()).filter(Boolean);
  values.forEach((value, index) => records.push(makeRecord(value, index)));
}

function uniqueTraitRecords(records) {
  const seen = new Set();
  return records.filter((record) => {
    const key = `${record.label}\u0000${record.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function configuredTraitLabel(key, configKey, items = []) {
  const item = items.find((candidate) => [candidate.identifier, candidate.system?.identifier, candidate.system?.type?.baseItem, candidate.system?.type?.value].some((value) => String(value ?? "") === String(key)));
  return item?.name || configLabel(globalThis.CONFIG?.DND5E?.[configKey], key) || PROFICIENCY_LABELS[key] || titleCase(key);
}

function toolLabel(key, items) {
  const config = globalThis.CONFIG?.DND5E ?? {};
  const definition = config.tools?.[key] ?? config.vehicleTypes?.[key];
  const item = items.find((candidate) => [candidate.identifier, candidate.system?.identifier, candidate.system?.type?.baseItem, candidate.system?.type?.value].some((value) => String(value ?? "") === String(key)));
  return item?.name
    || configLabel(config.toolProficiencies, key)
    || localized(definition?.label)
    || PROFICIENCY_LABELS[key]
    || titleCase(key);
}

function configLabel(config, key) {
  const direct = config?.[key];
  const directLabel = localized(direct?.label ?? direct);
  if (directLabel) return directLabel;
  for (const entry of Object.values(config ?? {})) {
    const child = entry?.children?.[key];
    const childLabel = localized(child?.label ?? child);
    if (childLabel) return childLabel;
  }
  return "";
}

function resourceRecords(system, items, hitDice) {
  const resources = [];
  for (const [key, slot] of Object.entries(system.spells ?? {})) {
    const level = /^spell(\d+)$/u.exec(key)?.[1];
    if (!level && key !== "pact") continue;
    const max = number(slot?.override, number(slot?.max));
    if (max <= 0) continue;
    resources.push({
      id: `spell-slot:${key}`,
      label: level ? localizeFoundry("VEMOBILE.Character.ActorView.LevelSpellSlots", "Level {level} spell slots", { level: (level) }) : localizeFoundry("VEMOBILE.Character.ActorView.PactSpellSlots", "Pact spell slots"),
      value: clamp(number(slot?.value), 0, max),
      max,
      detail: level ? localizeFoundry("VEMOBILE.Character.ActorView.Level", "Level {level}", { level: (level) }) : localizeFoundry("VEMOBILE.Character.ActorView.Pact", "Pact"),
      slotLevel: level ? Number(level) : Math.max(0, number(slot?.level)),
      kind: "spell-slot"
    });
  }

  if (hitDice?.max > 0) {
    resources.push({ id: "hit-dice", label: localizeFoundry("VEMOBILE.Character.ActorView.HitDice", "Hit Dice"), value: hitDice.value, max: hitDice.max, detail: hitDice.pools.length === 1 ? hitDice.pools[0].denomination : hitDice.pools.length > 1 ? localizeFoundry("VEMOBILE.Character.ActorView.Mixed", "Mixed") : "", kind: "hit-dice" });
  }

  for (const [key, resource] of Object.entries(system.resources ?? {})) {
    const max = number(resource?.max);
    const label = String(resource?.label ?? "").trim();
    if (max <= 0 || !label) continue;
    resources.push({ id: `character:${key}`, label, value: clamp(number(resource?.value), 0, max), max, detail: "", kind: "character" });
  }

  for (const item of items) {
    const max = number(item.system?.uses?.max);
    if (max <= 0) continue;
    resources.push({ id: `item:${item.id}`, label: item.name, value: clamp(number(item.system?.uses?.value), 0, max), max, detail: item.type, kind: "item" });
  }
  return resources;
}

function hitDiceRecord(system, classes) {
  const aggregate = system.attributes?.hd;
  const max = Math.max(0, number(aggregate?.max));
  if (!max) return null;

  const pools = new Map();
  for (const item of classes) {
    const denomination = String(item.system?.hd?.denomination ?? "").toLowerCase();
    if (!/^d\d{1,3}$/u.test(denomination)) continue;
    const poolMax = Math.max(0, number(item.system?.hd?.max, number(item.system?.levels)));
    const poolValue = clamp(number(item.system?.hd?.value, poolMax - number(item.system?.hd?.spent)), 0, poolMax);
    const current = pools.get(denomination) ?? { denomination, value: 0, max: 0 };
    current.value += poolValue;
    current.max += poolMax;
    pools.set(denomination, current);
  }

  if (!pools.size) {
    const rawDenomination = aggregate?.denomination;
    const denomination = String(rawDenomination ?? "").startsWith("d") ? String(rawDenomination).toLowerCase() : `d${number(rawDenomination)}`;
    if (/^d\d{1,3}$/u.test(denomination) && denomination !== "d0") {
      pools.set(denomination, { denomination, value: clamp(number(aggregate?.value), 0, max), max });
    }
  }

  return Object.freeze({
    value: clamp(number(aggregate?.value), 0, max),
    max,
    pools: Object.freeze(Array.from(pools.values())
      .sort((first, second) => number(second.denomination.slice(1)) - number(first.denomination.slice(1)))
      .map(pool => Object.freeze({ ...pool })))
  });
}

function movementRecord(movement = {}) {
  const configured = globalThis.CONFIG?.DND5E?.movementTypes ?? { walk: { label: localizeFoundry("VEMOBILE.Character.ActorView.Walk", "Walk") }, burrow: { label: localizeFoundry("VEMOBILE.Character.ActorView.Burrow", "Burrow") }, climb: { label: localizeFoundry("VEMOBILE.Character.ActorView.Climb", "Climb") }, fly: { label: localizeFoundry("VEMOBILE.Character.ActorView.Fly", "Fly") }, swim: { label: localizeFoundry("VEMOBILE.Character.ActorView.Swim", "Swim") } };
  const modes = Object.entries(configured).flatMap(([key, config]) => {
    const value = numericOrNull(movement[key]);
    if (config?.hidden || value === null || value <= 0) return [];
    return [{ key, label: localized(config?.label) || titleCase(key), value,
      hover: key === "fly" && Boolean(movement.hover) }];
  });
  const preferred = modes.find((entry) => entry.key === "walk") ?? modes[0];
  return { value: preferred?.value ?? 0, units: String(movement.units ?? "ft"), mode: preferred?.key ?? "walk", modes };
}

function originName(items, types) {
  return items.find((item) => types.includes(item.type))?.name ?? "";
}

function classTheme(classes) {
  return classThemes(classes)[0] ?? "neutral";
}

function classThemes(classes) {
  const supported = new Set(["artificer", "barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "psion", "ranger", "rogue", "sorcerer", "warlock", "wizard"]);
  const recognized = [...new Set(classes
    .map((item) => String(item.name ?? "").trim().toLowerCase())
    .filter((key) => supported.has(key)))];
  return recognized.length ? recognized : ["neutral"];
}

function npcTheme(actor, users) {
  const playerOwned = Array.from(users ?? []).some((candidate) => {
    if (!candidate || candidate.isGM) return false;
    try { return actor?.testUserPermission?.(candidate, "OWNER") ?? false; } catch { return false; }
  });
  return playerOwned ? "neutral" : "bestiary";
}

function number(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value.id === "string") return value.id.trim();
  return "";
}

function localized(value) {
  const text = stringValue(value);
  if (!text) return "";
  try {
    return globalThis.game?.i18n?.localize?.(text) || text;
  } catch {
    return text;
  }
}

function humanLabel(value) {
  const text = localized(value).trim();
  if (!text || /^(?:@?UUID\b|Compendium\.|Actor\.|Item\.|Scene\.)/iu.test(text) || /^[A-Za-z0-9_-]{12,}$/u.test(text)) return "";
  return text;
}

function titleCase(value) {
  return String(value ?? "")
    .replace(/[-_]+/gu, " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function roundTenth(value) {
  return Math.round(number(value) * 10) / 10;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function validKey(value) {
  return /^[a-z0-9_-]{1,32}$/u.test(value);
}

// Stable detail keys are separate from native translated display labels.
function detailLabel(key) {
  const keys = {"Type":"Type","Damage":"Damage","Level":"Level","School":"School","Casting Time":"SpellCastTime","Range":"Range","Target":"Target","Duration":"Duration","Components":"Components","Quantity":"Quantity","Weight":"Weight","Price":"Price","Rarity":"Rarity","Equipped":"Equipped","Attuned":"Attuned","Activation":"ItemActivation","Recovery":"Recovery","Uses":"Uses","Attack":"Attack","Save":"SavingThrowShort"};
  return localizeFoundry(`DND5E.${keys[key]}`, key);
}

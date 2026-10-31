import { pf2eClassThemeKey } from "../../../kernel/pf2e-class-appearance.mjs";
import { localizeFoundry } from "../../localization.mjs";
import { customAcModifiers } from "./character-edits.mjs";
import { strikeControlRecords } from "./strike-controls.mjs";
import { spellPreparationRecord, spellManagementRecord } from "./spell-preparation.mjs";
import { inventoryControlRecord, effectControlRecord } from "./inventory-effect-controls.mjs";
import { playControlRecord, ammunitionRecord } from "./play-controls.mjs";
import { ritualAction, spellReferenceAction } from "./spell-reference-actions.mjs";
import { pf2eResourceRecords, pf2eLimitedUseRecords } from "./resource-controls.mjs";
import { persistentDamageRecord } from "./persistent-damage.mjs";

const SPELL_SLOT_GROUPS = Object.freeze(Array.from({ length: 11 }, (_, rank) => `slot${rank}`));
const MOVEMENT_SPEED_TYPES = Object.freeze(["land", "swim", "climb", "fly", "burrow"]);
const MOVEMENT_ACTION_TYPES = new Set(["swim", "climb"]);

/** Minimal PF2e Actor record used by character discovery and its chooser. */
export function createActorDirectoryRecord(actor) {
  const system = actor?.system ?? {};
  const items = Array.from(actor?.items ?? []);
  const classes = actor?.type === "character" ? items.filter((item) => item?.type === "class") : [];
  const level = actorLevel(actor, system, classes);
  return {
    id: string(actor?.id),
    sourceUuid: string(actor?.uuid),
    name: string(actor?.name, localizeFoundry("VEMOBILE.Character.ActorView.UnknownActor", "Unknown actor")),
    img: string(actor?.img),
    type: string(actor?.type),
    themeClassKey: actorThemeKey(actor, classes),
    themeClassKeys: [actorThemeKey(actor, classes)],
    sort: finite(actor?.sort),
    folderPath: folderPath(actor),
    header: { labels: { level: localizeFoundry("PF2E.LevelLabel", "Level") } },
    level,
    classes: classes.map((item) => ({
      id: string(item?.id),
      name: string(item?.name),
      levels: finite(item?.system?.levels ?? item?.system?.level?.value)
    })),
    npc: actor?.type === "npc" ? npcIdentity(system) : null
  };
}

/** Convert a PF2e Actor into a transport-safe renderer record. */
export function createActorViewRecord(actor, user, capabilitiesForActor = () => null, users = globalThis.game?.users ?? []) {
  const system = actor?.system ?? {};
  const attributes = system.attributes ?? {};
  const hp = attributes.hp ?? {};
  const items = Array.from(actor?.items ?? []);
  const classes = actor?.type === "character" ? items.filter((item) => item?.type === "class") : [];
  const physicalItems = items.filter((item) => item && isPhysical(item));
  const features = items.filter((item) => item && ["feat", "action", "campaignFeature"].includes(item.type));
  const hpRecord = [hp.value, hp.max, hp.temp].some((value) => typeof value === "number" && Number.isFinite(value))
    ? { value: finite(hp.value), max: finite(hp.max), temp: finite(hp.temp) }
    : null;
  const armorClass = firstFinite(actor?.attributes?.ac?.value, system.attributes?.ac?.value, system.attributes?.ac);
  const speed = speedRecord(actor, system);
  const pf2e = {
    identity: identityRecord(actor, system, classes),
    details: supplementaryRecords(actor, system, user, items),
    attributes: abilityRecords(actor),
    classDC: classDcRecord(actor),
    shield: shieldRecord(actor, system),
    armorClass: user?.isGM || actor.testUserPermission?.(user, "OWNER") === true ? {
      value: armorClass,
      modifiers: Array.from(actor.attributes?.ac?.modifiers ?? system.attributes?.ac?.modifiers ?? []).map(entry => ({
        slug: string(entry.slug), label: string(entry.label), value: finite(entry.modifier), type: string(entry.type),
        enabled: entry.enabled !== false && entry.ignored !== true
      })),
      customModifiers: customAcModifiers(actor)
    } : null,
    bulk: bulkRecord(actor),
    perception: statisticRecord(actor?.perception, "perception", actor?.type),
    saves: statisticMap(actor?.saves, actor?.type),
    skills: skillRecords(actor?.skills, actor?.type),
    strikes: strikeRecords(actor),
    play: playControlRecord(actor),
    spellcasting: spellcastingRecords(actor),
    spellBrowsing: spellBrowsingRecords(actor),
    featGroups: featGroupRecords(actor),
    inventory: physicalItems.map((item) => ({...itemRecord(item),inventoryControls:inventoryControlRecord(actor,item)})),
    features: features.map((item) => featureRecord(item)),
    biography: biographyRecord(actor, system, user),
    conditions: conditionRecords(actor, items),
    persistentDamage: persistentDamageRecord(actor),
    recovery: actor.type === "character" ? Object.fromEntries(["dying", "wounded"].map(slug => {
      const counter = actor.attributes?.[slug] ?? attributes[slug];
      return [slug, { value: Math.max(0, finite(counter?.value)), max: Math.max(0, finite(counter?.max)) }];
    })) : null,
    availableConditions: availableConditionRecords(),
    resources: typeof actor.getResource === "function" ? pf2eResourceRecords(actor).filter(r => r.max > 0 || r.slug === "hero-points").map(r => ({ ...r, id: r.slug === "hero-points" ? "heroPoints" : r.slug, label: localizeFoundry(r.label, r.label) })) : resourceRecords(system),
    limitedUses: pf2eLimitedUseRecords(actor)
  };
  const record = {
    id: string(actor?.id),
    sourceUuid: string(actor?.uuid),
    name: string(actor?.name, localizeFoundry("VEMOBILE.Character.ActorView.UnknownActor", "Unknown actor")),
    img: string(actor?.img),
    type: string(actor?.type),
    themeClassKey: actorThemeKey(actor, classes),
    themeClassKeys: [actorThemeKey(actor, classes)],
    sort: finite(actor?.sort),
    folderPath: folderPath(actor),
    level: actorLevel(actor, system, classes),
    header: { labels: { level: localizeFoundry("PF2E.LevelLabel", "Level") } },
    classes: classes.map((item) => ({ id: string(item?.id), name: string(item?.name), levels: finite(item?.system?.levels ?? item?.system?.level?.value) })),
    npc: actor?.type === "npc" ? npcIdentity(system) : null,
    hp: hpRecord,
    armorClass,
    ac: armorClass,
    movement: speed?.value ?? null,
    speed,
    capabilities: typeof capabilitiesForActor === "function" ? capabilitiesForActor(actor, user) : null,
    pf2e
  };
  // `users` is accepted to match the shared actor projection signature. PF2e
  // records currently have no observer-specific identity fields to resolve.
  void users;
  return record;
}

function actorThemeKey(actor, classes) {
  if (actor?.type === "npc") return "bestiary";
  if (actor?.type !== "character") return "neutral";
  const item = actor?.class ?? classes[0];
  const slug = string(item?.slug ?? item?.system?.slug).toLowerCase();
  return pf2eClassThemeKey(slug);
}

function actorLevel(actor, system, classes) {
  if (actor?.type === "character") {
    return firstFinite(system.details?.level?.value, system.details?.level, classes.reduce((sum, item) => sum + finite(item?.system?.levels ?? item?.system?.level?.value), 0));
  }
  return firstFinite(system.details?.level?.value, system.details?.level?.value, system.details?.level);
}

function identityRecord(actor, system, classes) {
  const ancestry = actor?.ancestry;
  const heritage = actor?.heritage;
  const characterClass = actor?.class ?? classes[0] ?? null;
  const identity = {
    ancestry: string(ancestry?.name),
    heritage: string(heritage?.name),
    className: string(characterClass?.name),
    classSlug: string(characterClass?.slug ?? characterClass?.system?.slug ?? characterClass?.system?.identifier),
    ancestrySlug: string(ancestry?.slug ?? ancestry?.system?.slug ?? ancestry?.system?.identifier),
    level: actorLevel(actor, system, classes),
    traits: traitLabels(system.traits?.value, "creatureTraits")
  };
  return identity;
}

/** Prepared native labels preserve sense ranges and IWR exceptions without reimplementing rules. */
function supplementaryRecords(actor, system, user, items) {
  const attributes = actor?.attributes ?? system.attributes ?? {};
  const languages = system.details?.languages ?? {};
  const speeds = actor?.movement?.speeds ?? system.movement?.speeds ?? {};
  const currency = actor?.inventory?.currency;
  const currencyGoldValue = nullableFinite(currency?.goldValue);
  const totalWealthGoldValue = nullableFinite(actor?.inventory?.totalWealth?.goldValue);
  const invested = actor?.inventory?.invested;
  const proficiencies = system.proficiencies ?? {};
  return {
    background: string(actor?.background?.name), backgroundItemId: string(actor?.background?.id),
    deity: string(actor?.deity?.name), deityImg: string(actor?.deity?.img), deityItemId: string(actor?.deity?.id),
    size: configLabel("actorSizes", string(system.traits?.size?.value ?? system.traits?.size)),
    experience: actor.type === "character" && system.details?.xp ? { value: finite(system.details.xp.value), max: finite(system.details.xp.max) } : null,
    languages: [...traitLabels(languages.value, "languages"), string(languages.details)].filter(Boolean),
    senses: collectionValues(actor?.perception?.senses).map(sense => string(sense.label)).filter(Boolean),
    speeds: MOVEMENT_SPEED_TYPES.map(slug => {
      const speed = speeds[slug] ?? (slug === "land" ? speeds.walk : undefined);
      const preparedValue = firstFinite(typeof speed === "object" ? speed?.value : speed);
      const value = preparedValue ? preparedValue : null;
      const record = { slug, label: configLabel("speedTypes", slug), value, unit: string(speed?.unit ?? system.movement?.units, "ft") };
      if (value === null && MOVEMENT_ACTION_TYPES.has(slug) && typeof globalThis.game?.pf2e?.actions?.[slug] === "function") record.action = slug;
      return record;
    }),
    defenses: Object.fromEntries(["immunities", "weaknesses", "resistances"].map(key => [key,
      Array.from(attributes[key] ?? system.attributes?.[key] ?? []).map(entry => string(entry.label)).filter(Boolean)
    ])),
    currency: currency ? Object.fromEntries(["pp", "gp", "sp", "cp"].map(key => [key, finite(currency[key])])) : null,
    ...(currencyGoldValue === null ? {} : { currencyGoldValue }),
    ...(totalWealthGoldValue === null ? {} : { totalWealthGoldValue }),
    invested: invested ? { value: finite(invested.value), max: finite(invested.max) } : null,
    proficiencies: ["attacks", "defenses", "classDCs"].flatMap(group => Object.entries(proficiencies[group] ?? {}).filter(([, data]) => data && data.visible !== false).map(([slug, data]) => {
      const rank = firstFinite(data.rank);
      const rankKey = rank === null ? null : proficiencyKey(rank);
      return {
        group, label: localizeFoundry(string(data.label), string(data.label)) || configLabel(group === "attacks" ? "weaponCategories" : group === "defenses" ? "armorCategories" : "classTraits", slug),
        ...(rank === null ? {} : { rank, ...(rankKey ? { rankAbbreviation: localizeFoundry(`PF2E.SETTINGS.Variant.Proficiency.Rank.${rankKey}`, rankKey.slice(0, 1)) } : {}) }),
        rankLabel: localizeFoundry(`PF2E.ProficiencyLevel${finite(data.rank)}`, proficiencyKey(finite(data.rank)) ?? ""),
        value: group === "classDCs" ? firstFinite(data.dc) : firstFinite(data.value)
      };
    })),
    divineIntercessions: collectionValues(actor?.divineIntercessions)
      .filter(item => item?.id && collectionGet(actor?.items, item.id))
      .map(item => ({ id: string(item.id), name: string(item.name), img: string(item.img) })),
    afflictions: collectionValues(actor?.itemTypes?.affliction)
      .filter(item => item?.id && collectionGet(actor?.items, item.id) && (user?.isGM || item.isIdentified === true))
      .map(item => ({ id: string(item.id), name: string(item.name), img: string(item.img) })),
    effects: items.filter(item => item.type === "effect" && (user?.isGM || (item.isIdentified !== false && !item.system?.unidentified))).map(item => ({
      id: string(item.id), name: string(item.name), img: string(item.img), effectControls:effectControlRecord(actor,item), expired: Boolean(item.isExpired ?? item.system?.expired),
      badge: typeof item.badge?.value === "number" || typeof item.badge?.value === "string" ? String(item.badge.value) : "",
      duration: item.system?.duration ? [item.system.duration.unit === "unlimited" ? null : firstFinite(item.system.duration.value), configLabel("timeUnits", string(item.system.duration.unit))].filter(value => value !== null && value !== "").join(" ") : ""
    }))
  };
}

function abilityRecords(actor) {
  const abilities = actor?.abilities ?? actor?.system?.abilities;
  if (!abilities || typeof abilities !== "object") return [];
  const labels = globalThis.CONFIG?.PF2E?.abilities ?? {};
  return Object.entries(abilities).map(([slug, ability]) => ({
    slug,
    label: localizeFoundry(string(labels[slug], `PF2E.Ability${humanize(slug).replace(/\s/gu, "")}`), humanize(slug)),
    modifier: firstFinite(ability?.mod, ability?.modifier, ability?.value),
    ...(actor.system?.details?.keyability?.value === slug ? { key: true } : {}),
    ...(actor.system?.build?.attributes?.apex === slug ? { apex: true } : {})
  })).filter((ability) => ability.modifier !== null);
}

function classDcRecord(actor) {
  const statistic = actor?.classDC;
  if (!statistic) return null;
  const value = firstFinite(statistic?.dc?.value, statistic?.value);
  return value === null ? null : { label: string(statistic?.label), value };
}

function shieldRecord(actor, system) {
  const shield = actor?.attributes?.shield ?? system?.attributes?.shield;
  if (!shield || typeof shield !== "object") return null;
  const itemId = string(shield.itemId);
  const hp = shield.hp ?? {};
  if (!itemId && ![shield.ac, shield.hardness, hp.value, hp.max].some((value) => firstFinite(value) > 0)) return null;
  const item = collectionGet(actor?.items, itemId);
  return {
    name: string(item?.name ?? shield.name),
    itemId,
    hp: { value: finite(hp.value), max: finite(hp.max), brokenThreshold: finite(hp.brokenThreshold) },
    hardness: finite(shield.hardness),
    ac: finite(shield.ac),
    raisedArmorClass: raisedShieldArmorClass(actor, shield),
    raised: Boolean(shield.raised),
    broken: Boolean(shield.broken),
    destroyed: Boolean(shield.destroyed)
  };
}

function raisedShieldArmorClass(actor, shield) {
  if (shield.broken || shield.destroyed) return null;
  if (shield.raised) return firstFinite(actor.attributes?.ac?.value, actor.system?.attributes?.ac?.value);
  const { Modifier, StatisticModifier } = globalThis.game?.pf2e ?? {};
  const dc = actor.getStatistic?.("ac")?.dc;
  if (typeof Modifier !== "function" || typeof StatisticModifier !== "function" || !Array.isArray(dc?.modifiers)) return null;
  // Mirror native ArmorStatistic's raised-shield modifier, while letting PF2e
  // test predicates, adjustments and circumstance stacking. Never raise a shield
  // or mutate the Actor merely to render this preview.
  const adjustments = [...new Set(["all", "dex-based", "ac"].flatMap(domain => actor.synthetics?.modifierAdjustments?.[domain] ?? []))]
    .filter(adjustment => adjustment.slug === null || adjustment.slug === "raised-shield");
  const modifier = new Modifier({ label: shield.name, slug: "raised-shield", type: "circumstance", modifier: shield.ac, adjustments });
  const options = new Set([...(dc.options ?? []), "self:shield:raised"]);
  const statistic = new StatisticModifier("ac", [...dc.modifiers.map(entry => entry.clone()), modifier], options);
  return firstFinite(10 + statistic.totalModifier);
}

function bulkRecord(actor) {
  const bulk = actor?.inventory?.bulk;
  if (!bulk) return null;
  const value = typeof bulk.value?.toString === "function" ? string(bulk.value.toString()) : "";
  if (!value) return null;
  return {
    value,
    encumberedAfter: firstFinite(bulk.encumberedAfter),
    max: firstFinite(bulk.max)
  };
}

function proficiencyKey(rank) {
  return ["Untrained", "Trained", "Expert", "Master", "Legendary"][Math.trunc(rank)] ?? null;
}

function configLabel(configKey, slug) {
  const key = globalThis.CONFIG?.PF2E?.[configKey]?.[slug];
  if (typeof key !== "string") return humanize(slug);
  return localizeFoundry(key, humanize(slug));
}

function traitLabels(value, configKey) {
  const config = globalThis.CONFIG?.PF2E?.[configKey] ?? {};
  const traits = Array.isArray(value) ? value : value instanceof Set ? [...value] : [];
  return traits.map((trait) => {
    const slug = string(typeof trait === "string" ? trait : trait?.slug ?? trait?.name);
    if (!slug) return "";
    if (typeof trait === "object" && typeof trait.label === "string") return trait.label;
    const mapping = config[slug];
    const key = typeof mapping === "string" ? mapping : mapping?.label;
    return typeof key === "string" ? localizeFoundry(key, humanize(slug)) : humanize(slug);
  }).filter(Boolean);
}

function actionCostRecord(cost) {
  if (!cost || typeof cost !== "object") return null;
  const type = string(cost.type ?? cost.value?.type);
  const rawValue = cost.value?.value ?? cost.value;
  const value = firstFinite(rawValue);
  if (!type && value === null) return null;
  const glyphs = globalThis.CONFIG?.PF2E?.actionTypes ?? {};
  const label = type === "action" && value !== null
    ? `${localizeFoundry(globalThis.CONFIG?.PF2E?.actionsNumber?.[value] ?? `PF2E.ActionNumber${value}`, numberWord(value))} ${value === 1
      ? localizeFoundry(glyphs.action ?? "PF2E.ActionTypeAction", "Action")
      : localizeFoundry("PF2E.ActionActionsLabel", "Actions")}`
    : typeof glyphs[type] === "string"
      ? localizeFoundry(glyphs[type], humanize(type))
      : humanize(type);
  return { type: type || "action", value, label };
}

function spellActionCostRecord(time) {
  const value = string(time).trim();
  if (!value) return null;
  if (/^[123]$/u.test(value)) {
    const count = Number(value);
    return actionCostRecord({ type: "action", value: count });
  }
  if (value === "reaction" || value === "free") {
    const key = value === "reaction" ? "PF2E.ActionTypeReaction" : "PF2E.ActionTypeFree";
    return { type: value, value: null, label: localizeFoundry(key, humanize(value)) };
  }
  return { type: "time", value: null, label: value };
}

function numberWord(value) {
  return ["", "One", "Two", "Three"][Math.trunc(value)] ?? String(value);
}

function spellSlotRecords(entry, category) {
  const slots = entry?.system?.slots ?? {};
  return Object.entries(slots).map(([key, slot]) => {
    const rank = Number(key.replace(/^slot/u, ""));
    if (!Number.isInteger(rank) || rank < 0) return null;
    const prepared = Array.isArray(slot?.prepared) ? slot.prepared : [];
    const preparedCount = prepared.filter((record) => Boolean(record?.id)).length;
    const remainingPrepared = prepared.filter((record) => Boolean(record?.id) && !record?.expended).length;
    const value = category === "prepared" && !entry?.isFlexible ? remainingPrepared : firstFinite(slot?.value);
    const max = firstFinite(slot?.max);
    if (value === null && max === null && preparedCount === 0) return null;
    return { rank, value, max, preparedCount };
  }).filter(Boolean).sort((a, b) => a.rank - b.rank);
}

function npcIdentity(system) {
  const traits = system.traits?.value;
  return {
    creatureType: string(system.details?.creatureType ?? system.details?.type?.value ?? system.details?.type),
    level: actorLevel({ type: "npc" }, system, []),
    rarity: string(system.traits?.rarity),
    size: string(system.traits?.size?.value ?? system.traits?.size),
    traits: Array.isArray(traits) ? traits.map((trait) => string(trait)).filter(Boolean) : []
  };
}

function folderPath(actor) {
  const names = [];
  const seen = new Set();
  let folder = actor?.folder ?? null;
  while (folder && !seen.has(folder)) {
    seen.add(folder);
    if (folder.name) names.unshift(string(folder.name));
    folder = folder.folder ?? null;
  }
  return names;
}

function statisticMap(value, actorType) {
  const entries = value instanceof Map ? [...value.entries()] : Object.entries(value ?? {});
  return entries.map(([slug, statistic]) => statisticRecord(statistic, slug, actorType)).filter(Boolean);
}

function skillRecords(value, actorType) {
  const entries = value instanceof Map ? [...value.entries()] : Object.entries(value ?? {});
  return entries.map(([slug, statistic]) => {
    const record = statisticRecord(statistic, slug, actorType);
    return record && statistic?.lore === true ? { ...record, lore: true } : record;
  }).filter(Boolean);
}

function statisticRecord(statistic, slug = "", actorType = "") {
  if (!statistic) return null;
  const check = statistic.check;
  const rank = actorType === "npc" ? null : nullableFinite(statistic.rank);
  const rankKey = rank == null ? null : proficiencyKey(rank);
  return {
    slug: string(statistic.slug ?? slug),
    label: string(statistic.label),
    modifier: firstFinite(statistic.mod, check?.mod, statistic.totalModifier, statistic.value),
    rank,
    rankLabel: rankKey ? localizeFoundry(`PF2E.ProficiencyLevel${Math.trunc(rank)}`, humanize(rankKey)) : null,
    rankAbbreviation: rankKey ? localizeFoundry(`PF2E.SETTINGS.Variant.Proficiency.Rank.${rankKey}`, rankKey.slice(0, 1)) : null
  };
}

function strikeRecords(actor) {
  const actions = Array.from(actor?.system?.actions ?? []);
  return actions.filter((action) => action && action.item).map((action) => {
    const itemId = string(action.item.id);
    const slug = string(action.slug);
    return {
      id: `${itemId}:${slug}`,
      itemId,
      slug,
      label: string(action.label ?? action.item.name),
      img: string(action.item.img),
      ready: typeof action.ready === "boolean" ? action.ready : true,
      ...strikeControlRecords(action),
      ...(action.ammunition ? {ammunition: ammunitionRecord(action)} : {}),
      traits: [...new Set([
        ...traitLabels(action.traits, "actionTraits"),
        ...traitLabels(action.weaponTraits ?? action.item.traits, "npcAttackTraits")
      ])],
      actionCost: actionCostRecord({ type: "action", value: 1 }),
      variants: Array.from(action.variants ?? []).map((variant, index) => ({ index, label: string(variant?.label) })),
      damage: typeof action.damage === "function" || Boolean(action.damage)
    };
  });
}

function spellcastingRecords(actor) {
  // Native creatures always include an ephemeral ritual collection, even noncasters.
  // Ritual procedures remain in the native editor; only owned casting entries belong here.
  const entries = Array.from(actor?.spellcasting?.regular ?? actor?.spellcasting?.contents ?? actor?.spellcasting ?? [])
    .filter(entry => entry?.category !== "ritual" && entry?.isRitual !== true);
  return entries.map((entry) => {
    const category = string(entry?.category ?? entry?.system?.prepared?.value);
    const slots = spellSlotRecords(entry, category);
    const spells = collectionValues(entry?.spells);
    const preparation = spellPreparationRecord(entry);
    const management = spellManagementRecord(entry);
    const options = [];
    if (category === "prepared" && !entry?.isFlexible) {
      for (let rank = 0; rank < SPELL_SLOT_GROUPS.length; rank += 1) {
        const slots = entry?.system?.slots?.[SPELL_SLOT_GROUPS[rank]]?.prepared;
        if (!Array.isArray(slots)) continue;
        slots.forEach((slot, slotId) => {
          if (!slot?.id) return;
          const spell = collectionGet(entry?.spells, slot.id);
          if (!spell) return;
          options.push(spellOption(spell, entry, spellCastRank(spell, rank), slotId, slot.expended));
        });
      }
    }
    for (const spell of spells) {
      const rank = spellRank(spell);
      const cantripOrFocus = Boolean(spell?.isCantrip || spell?.isFocusSpell || spell?.system?.traits?.value?.includes?.("cantrip") || spell?.system?.traits?.value?.includes?.("focus"));
      if (category === "prepared" && !entry?.isFlexible) {
        continue;
      }
      if (category === "spontaneous") {
        // Cantrips live at the native rank-0 group even though their effective
        // cast rank is scaled to the actor's level; they never consume slots.
        const currentSlot = entry?.system?.slots?.[SPELL_SLOT_GROUPS[rank]];
        options.push(spellOption(spell, entry, rank, null, cantripOrFocus ? false : finite(currentSlot?.value) <= 0));
        if (!cantripOrFocus && spell?.system?.location?.signature) {
          for (let castRank = Math.max(1, finite(spell?.baseRank ?? spell?.system?.level?.value)); castRank < SPELL_SLOT_GROUPS.length; castRank += 1) {
            const slot = entry?.system?.slots?.[SPELL_SLOT_GROUPS[castRank]];
            if (finite(slot?.max) <= 0 || castRank === rank) continue;
            options.push(spellOption(spell, entry, castRank, null, finite(slot?.value) <= 0));
          }
        }
      } else if (category === "prepared" && entry?.isFlexible) {
        if (cantripOrFocus) {
          options.push(spellOption(spell, entry, rank, null, false));
        } else if (spell?.system?.location?.signature) {
          for (let castRank = Math.max(1, finite(spell?.baseRank ?? spell?.system?.level?.value)); castRank < SPELL_SLOT_GROUPS.length; castRank += 1) {
            const slot = entry?.system?.slots?.[SPELL_SLOT_GROUPS[castRank]];
            if (finite(slot?.max) <= 0) continue;
            options.push(spellOption(spell, entry, castRank, null, finite(slot?.value) <= 0));
          }
        }
      } else {
        const atWill = Boolean(spell?.atWill);
        const uses = spell?.system?.location?.uses?.value;
        const focusUnavailable = category === "focus" && !(spell?.isCantrip || spell?.system?.traits?.value?.includes?.("cantrip"))
          && finite(actor?.system?.resources?.focus?.value) <= 0;
        options.push(spellOption(spell, entry, rank, null, focusUnavailable || (!cantripOrFocus && !atWill && typeof uses === "number" && uses <= 0)));
      }
    }
    return {
      entryId: string(entry?.id),
      label: string(entry?.name),
      category,
      categoryLabel: configLabel("preparationType", category),
      tradition: string(entry?.tradition ?? entry?.system?.tradition?.value),
      traditionLabel: configLabel("magicTraditions", string(entry?.tradition ?? entry?.system?.tradition?.value)),
      attackModifier: firstFinite(entry?.statistic?.mod, entry?.statistic?.check?.mod),
      dc: firstFinite(entry?.statistic?.dc?.value),
      slots,
      options,
      ...(preparation ? { preparation } : {}),
      ...(management ? {management} : {})
    };
  });
}

function spellBrowsingRecords(actor) {
  const rituals = collectionValues(actor?.itemTypes?.spell)
    .filter((spell) => spell?.isRitual === true || Boolean(spell?.system?.ritual))
    .map((spell) => ({
      id: string(spell?.id),
      name: string(spell?.name),
      img: string(spell?.img),
      rank: spellRank(spell),
      timeLabel: string(spell?.system?.time?.value),
      castAction: ritualAction(actor, spell)
    }));

  // PF2e prepares these ephemeral collections for eligible consumables. Use
  // only their embedded spell's native parentItem link; do not infer eligibility.
  const activations = collectionValues(actor?.spellcasting?.collections).flatMap((collection) => {
    if (collection?.entry?.category !== "items") return [];
    return collectionValues(collection).flatMap((spell) => {
      const item = spell?.parentItem;
      if (!item?.id) return [];
      return [{
        id: string(item.id),
        name: string(item.name),
        img: string(item.img),
        spellName: string(spell?.name),
        rank: spellRank(spell),
        castAction: spellReferenceAction(actor, spell, collection, item)
      }];
    });
  });

  return { rituals, activations };
}

function featGroupRecords(actor) {
  const groups = collectionValues(actor?.feats);
  if (actor?.feats?.bonus) groups.push(actor.feats.bonus);
  const ownedIds = new Set(collectionValues(actor?.items).map((item) => string(item?.id)).filter(Boolean));
  return groups.flatMap((group) => {
    const entries = [];
    const visit = (slot, parentId = "", depth = 0) => {
      const item = slot?.feat;
      const id = string(item?.id);
      if (id && ownedIds.has(id)) {
        const level = firstFinite(item?.level, item?.system?.level?.value);
        const slotLabel = typeof slot?.label === "string" && slot.label.trim() ? slot.label : "";
        entries.push({
          id,
          name: string(item?.name),
          img: string(item?.img),
          levelLabel: depth > 0 ? "" : slotLabel || (level === null ? "" : String(level)),
          ...(parentId ? { parentId } : {}),
          depth
        });
        for (const child of Array.from(slot?.children ?? [])) visit(child, id, depth + 1);
      }
    };
    for (const slot of Array.from(group?.feats ?? [])) visit(slot);
    return entries.length ? [{ id: string(group?.id), label: localizeFoundry(string(group?.label), humanize(group?.id)), entries }] : [];
  });
}

function spellOption(spell, entry, rank, slotId, expended) {
  const traits = spell?.system?.traits?.value;
  const time = string(spell?.system?.time?.value);
  return {
    spellId: string(spell?.id),
    entryId: string(entry?.id),
    rank: finite(rank),
    slotId: typeof slotId === "number" ? slotId : null,
    expended: Boolean(expended),
    name: string(spell?.name),
    img: string(spell?.img),
    isCantrip: Boolean(spell?.isCantrip || traits?.includes?.("cantrip")),
    isFocus: Boolean(spell?.isFocusSpell || traits?.includes?.("focus")),
    isAtWill: Boolean(spell?.atWill),
    isSignature: Boolean(spell?.system?.location?.signature),
    actionCost: spellActionCostRecord(time),
    timeLabel: time,
    range: string(spell?.system?.range?.value),
    defense: spell?.system?.defense?.save?.statistic
      ? [spell.system.defense.save.basic ? localizeFoundry("PF2E.Item.Spell.Defense.BasicSave", "Basic") : "", configLabel("saves", spell.system.defense.save.statistic)].filter(Boolean).join(" ")
      : spell?.isAttack ? localizeFoundry("PF2E.ArmorClassShortLabel", "AC") : "",
    duration: string(spell?.system?.duration?.value),
    traits: traitLabels(traits, "spellTraits")
  };
}

function spellRank(spell) {
  const rank = firstFinite(spell?.rank, spell?.system?.location?.heightenedLevel, spell?.system?.level?.value) ?? 0;
  return Math.max(1, rank);
}

function spellCastRank(spell, slotRank) {
  if (typeof spell?.computeCastRank === "function") return finite(spell.computeCastRank(slotRank));
  const traits = spell?.system?.traits?.value;
  const scalesAutomatically = Boolean(spell?.isCantrip || spell?.isFocusSpell || traits?.includes?.("cantrip") || traits?.includes?.("focus"));
  return scalesAutomatically ? spellRank(spell) : Math.max(spellRank(spell), slotRank);
}

function itemRecord(item) {
  const system = item?.system ?? {};
  const category = string(system.category);
  const containerId = string(item?.container?.id);
  const containerCapacity = preparedContainerCapacity(item?.capacity);
  return {
    id: string(item?.id),
    name: string(item?.name),
    img: string(item?.img),
    type: string(item?.type),
    typeLabel: localizeFoundry(`TYPES.Item.${string(item?.type)}`, humanize(string(item?.type))),
    quantity: finite(system.quantity),
    bulk: item?.bulk ? string(item.bulk.toString()) : "",
    container: string(item?.container?.name),
    ...(containerId ? { containerId } : {}),
    ...(category ? { category } : {}),
    ...(containerCapacity ? { containerCapacity } : {}),
    carryType: string(system.equipped?.carryType),
    handsHeld: finite(system.equipped?.handsHeld),
    inSlot: typeof system.equipped?.inSlot === "boolean" ? system.equipped.inSlot : null,
    invested: typeof system.equipped?.invested === "boolean" ? system.equipped.invested : null,
    identified: item?.isIdentified !== false
  };
}

function preparedContainerCapacity(capacity) {
  if (!capacity || typeof capacity !== "object") return null;
  const value = preparedBulkString(capacity.value);
  const max = preparedBulkString(capacity.max);
  return value || max ? { value, max } : null;
}

function preparedBulkString(value) {
  if (value == null) return "";
  return typeof value?.toString === "function" ? string(value.toString()) : string(value);
}

function featureRecord(item) {
  const system = item?.system ?? {};
  const actionType = string(system.actionType?.value ?? system.actionType);
  const frequency = system.frequency;
  return {
    id: string(item?.id),
    name: string(item?.name),
    img: string(item?.img),
    type: string(item?.type),
    actions: nullableFinite(system.actions?.value ?? system.actionCost?.value),
    actionType: ["action", "reaction", "free", "passive"].includes(actionType) ? actionType : null,
    actionCost: actionCostRecord(item?.actionCost ?? system.actionType),
    traitSlugs: traitSlugs(system.traits?.value ?? item?.traits),
    traits: traitLabels(item?.traits ?? system.traits?.value, item?.type === "feat" ? "featTraits" : item?.type === "campaignFeature" ? "kingmakerTraits" : "actionTraits"),
    frequency: frequency && typeof frequency === "object" ? {
      value: nullableFinite(frequency.value),
      max: nullableFinite(frequency.max),
      per: string(frequency.per)
    } : null
  };
}

function traitSlugs(value) {
  const traits = Array.isArray(value) ? value : value instanceof Set ? [...value] : [];
  return traits.map(trait => string(typeof trait === "string" ? trait : trait?.slug)).filter(Boolean);
}

function biographyRecord(actor, system, user) {
  if (actor?.type === "npc") {
    // Rich notes travel only through asynchronous native enrichment, which
    // applies secret visibility before publishing HTML.
    return {};
  }
  if (actor?.type !== "character") return null;
  const details = system.details ?? {};
  const biography = details.biography ?? {};
  const visible = section => actor.testUserPermission?.(user, "OWNER") === true || user?.isGM === true
    || (biography.visibility?.[section] ?? (section === "appearance")) === true;
  return {
    // Rich text is read through the enrichment gateway. Publish only its native
    // document revision here so a rich-only edit still refreshes that surface.
    revision: finite(actor._stats?.modifiedTime ?? actor._source?._stats?.modifiedTime),
    age: string(details.age?.value),
    gender: string(details.gender?.value),
    ethnicity: string(details.ethnicity?.value),
    nationality: string(details.nationality?.value),
    ...(visible("appearance") ? { height: string(details.height?.value), weight: string(details.weight?.value) } : {}),
    ...(visible("backstory") ? { birthPlace: string(biography.birthPlace) } : {}),
    ...(visible("personality") ? {
      attitude: string(biography.attitude), beliefs: string(biography.beliefs),
      edicts: stringArray(biography.edicts), anathema: stringArray(biography.anathema)
    } : {})
  };
}

function conditionRecords(actor, items) {
  const conditions = Array.from(actor?.itemTypes?.condition ?? items.filter((item) => item?.type === "condition"));
  return conditions.map((condition) => ({
    id: string(condition?.id),
    slug: string(condition?.slug ?? condition?.system?.slug),
    label: string(condition?.name),
    img: string(condition?.img),
    locked: condition?.isLocked === true,
    value: nullableFinite(condition?.system?.value?.value),
    active: condition?.active !== false
  }));
}

function availableConditionRecords() {
  const types = globalThis.CONFIG?.PF2E?.conditionTypes ?? {};
  const nativeConditions = globalThis.game?.pf2e?.ConditionManager?.conditions;
  return Object.entries(types).map(([slug, localizationKey]) => {
    const condition = nativeConditions?.get?.(slug);
    return {
      slug, label: localizeFoundry(string(localizationKey), humanize(slug)),
      img: string(condition?.img), valued: condition?.system?.value?.isValued === true,
      nativeEditor: slug === "persistent-damage"
    };
  });
}

function resourceRecords(system) {
  const resources = system.resources ?? {};
  return [
    resourceRecord("heroPoints", localizeFoundry("PF2E.Actor.Resource.HeroPoints", "Hero Points"), resources.heroPoints),
    resourceRecord("focus", localizeFoundry("PF2E.Actor.Resource.Focus", "Focus Points"), resources.focus)
  ].filter(Boolean);
}

function resourceRecord(id, label, value) {
  if (!value || typeof value !== "object") return null;
  return { id, label, value: finite(value.value), max: finite(value.max) };
}

function speedRecord(actor, system) {
  const speeds = actor?.movement?.speeds ?? system.movement?.speeds ?? {};
  const land = speeds.land ?? speeds.walk ?? system.attributes?.speed;
  if (land && typeof land === "object") {
    return { value: finite(land.value), unit: string(land.unit ?? system.movement?.units, "ft") };
  }
  return land === undefined ? null : { value: finite(land), unit: string(system.movement?.units, "ft") };
}

function isPhysical(item) {
  return Boolean(item?.isOfType?.("physical") || ["weapon", "armor", "shield", "equipment", "consumable", "treasure", "backpack", "ammo", "kit", "melee"].includes(item?.type));
}

function collectionGet(collection, id) {
  return collection?.get?.(id) ?? Array.from(collection ?? []).find((item) => item?.id === id) ?? null;
}

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection.contents)) return collection.contents;
  if (collection instanceof Map) return [...collection.values()];
  return Array.from(collection);
}

function firstFinite(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function nullableFinite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finite(value) {
  return firstFinite(value) ?? 0;
}

function string(value, fallback = "") {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function stringArray(value) {
  return Array.isArray(value) ? value.map((entry) => string(entry)).filter(Boolean) : [];
}

function humanize(value) {
  return string(value).replace(/[-_]+/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

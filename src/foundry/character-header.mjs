/** Header-only projection; never retains documents or mutates advancement data. */
export function characterHeaderRecord(actor, game = globalThis.game, config = globalThis.CONFIG?.DND5E) {
  const defaults = {
    hitPoints: "Hit Points", tempHp: "Temp HP", inspiration: "Heroic Inspiration",
    level: "Level", hitDice: "Hit Dice & Rest", armourClass: "Armor Class",
    proficiency: "Proficiency bonus", proficiencyAbbr: "PB",
    speed: "Speed", initiative: "Initiative", on: "On", off: "Off",
    xp: "XP", experience: "Experience progress", boons: "Epic boons earned"
  };
  const labels = Object.fromEntries(Object.entries(defaults).map(([name, fallback]) => {
    const key = `VEMOBILE.Character.Header.${name}`;
    const translated = game?.i18n?.localize?.(key);
    return [name, translated && translated !== key ? translated : fallback];
  }));
  const details = actor.system?.details ?? {};
  const preparedLevel = details.level?.value ?? details.level;
  const level = actor.type === "character" && Number.isSafeInteger(preparedLevel) && preparedLevel >= 0 ? preparedLevel : null;
  const text = value => typeof value === "string" ? value.trim() : "";
  const localized = value => text(value) ? text(game?.i18n?.localize?.(value) || value) : "";
  const type = details.type;
  const typeKey = typeof type === "string" ? type : type?.value;
  const creatureType = text(type?.label) || (typeKey === "custom" ? text(type?.custom) : localized(config?.creatureTypes?.[typeKey]?.label));
  const size = localized(config?.actorSizes?.[actor.system?.traits?.size]?.label);
  // NPC type and size already appear in their native identity lines.
  const metadata = [actor.type === "character" ? creatureType : "", actor.type === "character" ? size : "", text(details.alignment)].filter(Boolean);
  return { labels, level, metadata, locale: String(game?.i18n?.lang || "en"), experience: characterExperienceRecord(actor, game) };
}

export function characterExperienceRecord(actor, game = globalThis.game) {
  if (actor?.type !== "character") return null;
  let mode;
  try { mode = game?.settings?.get?.("dnd5e", "levelingMode"); } catch { return null; }
  if (!["xp", "xpBoons"].includes(mode)) return null;
  const xp = actor.system?.details?.xp;
  const finite = value => typeof value === "number" && Number.isFinite(value);
  if (!xp || !finite(xp.value) || xp.value < 0 || !finite(xp.min) || xp.min < 0 || !finite(xp.pct)) return null;
  const capped = xp.max === Infinity;
  if (!capped && (!finite(xp.max) || xp.max <= xp.min)) return null;
  // D&D5e 5.3 prepares within-level (or epic-boon) pct. Total XP / max is not equivalent.
  return {
    value: xp.value,
    min: xp.min,
    next: capped ? null : xp.max,
    percent: Math.max(0, Math.min(100, xp.pct)),
    boonsEarned: capped && mode === "xpBoons" && Number.isSafeInteger(xp.boonsEarned) && xp.boonsEarned >= 0 ? xp.boonsEarned : null
  };
}

import { CommandError } from "../../command-support.mjs";
import { localizeFoundry } from "../../localization.mjs";

const fail = () => { throw new CommandError("STALE_VALUE", localizeFoundry("VEMOBILE.PF2E.Play.Changed", "This option changed or is unavailable. Refresh and try again.")); };
const exactItem = (actor, id) => {
  const item = typeof id === "string" ? actor.items?.get?.(id) : null;
  if (!item || item.actor !== actor) fail();
  return item;
};
const nativeToggles = actor => Object.values(actor.synthetics?.toggles ?? {}).flatMap(group => Object.values(group ?? {}));
const selected = toggle => toggle.suboptions?.find(option => option.selected)?.value ?? null;

export function playControlRecord(actor) {
  return {
    toggles: nativeToggles(actor).filter(toggle => actor.items?.get?.(toggle.itemId)).map(toggle => ({
      itemId: String(toggle.itemId), domain: String(toggle.domain), option: String(toggle.option),
      label: localizeFoundry(toggle.label, toggle.label), checked: Boolean(toggle.checked), enabled: Boolean(toggle.enabled), alwaysActive: Boolean(toggle.alwaysActive),
      suboptions: Array.from(toggle.suboptions ?? []).map(option => ({value:String(option.value),label:localizeFoundry(option.label,option.label),selected:Boolean(option.selected)}))
    })),
    exploration: Array.from(actor.system?.exploration ?? []).filter(id => actor.items?.get?.(id)),
    blasts: blastRecords(actor)
  };
}

function blastController(actor) {
  const Blast = globalThis.game?.pf2e?.ElementalBlast;
  if (actor.type !== "character" || typeof Blast !== "function"
    || !Array.from(actor.items ?? []).some(item => item.type === "action" && item.slug === "elemental-blast")) return null;
  return new Blast(actor);
}
function blastRecords(actor) {
  const controller = blastController(actor);
  return Array.from(controller?.configs ?? []).map(config => ({
    itemId: String(config.item.id), element: String(config.element), label:localizeFoundry(config.label,config.label),img:String(config.img),
    ready:config.ready === true, actionCost: config.actionCost, range: String(config.range?.label ?? ""),
    maps: Object.fromEntries(["melee","ranged"].map(usage => [usage,[0,1,2].map(index => String(config.maps?.[usage]?.[`map${index}`] ?? ""))])),
    damageTypes:config.damageTypes.map(type => ({value:String(type.value),label:String(type.label),selected:Boolean(type.selected)}))
  }));
}

/** Native PF2e ammunition has two forms: linked inventory ammo, and loaded subitems. */
export function ammunitionRecord(strike) {
  const ammo = strike.ammunition, weapon = strike.item;
  if (!ammo || !weapon) return null;
  const reload = ammo.requiresReload === true;
  const options = Array.from(reload ? ammo.loaded ?? [] : ammo.compatible ?? []).map(item => {
    const document = reload ? null : weapon.actor?.items?.get?.(item.id);
    return { id:String(item.id),name:String(item.name ?? document?.name ?? item.label),quantity:Number(item.quantity ?? document?.quantity ?? 0) };
  });
  return { reload, selectedId: reload ? ammo.selected?.id ?? null : weapon.system?.selectedAmmoId ?? null, options };
}

export async function editPlayControl(actor, payload, context) {
  context?.assertCurrent();
  if (payload.operation === "toggle") {
    exactItem(actor,payload.itemId);
    const toggle = nativeToggles(actor).find(toggle => toggle.itemId === payload.itemId && toggle.domain === payload.domain && toggle.option === payload.option);
    if (!toggle || !toggle.enabled || typeof actor.toggleRollOption !== "function" || typeof payload.checked !== "boolean"
      || Boolean(toggle.checked) !== payload.originalChecked || selected(toggle) !== payload.originalSelection
      || toggle.alwaysActive && !payload.checked) fail();
    const options = toggle.suboptions ?? [];
    if (options.length ? !options.some(option => option.value === payload.selection) : payload.selection !== null) fail();
    return actor.toggleRollOption(toggle.domain,toggle.option,toggle.itemId,payload.checked,payload.selection);
  }
  if (payload.operation === "exploration") {
    if (actor.type !== "character" || typeof payload.active !== "boolean") fail();
    const item = exactItem(actor,payload.itemId);
    if (!["action","feat"].includes(item.type) || !item.system?.traits?.value?.includes("exploration")) fail();
    const ids = Array.from(actor.system?.exploration ?? []).filter(id => actor.items.get(id));
    if (ids.includes(item.id) !== payload.originalActive) fail();
    const next = payload.active ? [...new Set([...ids,item.id])] : ids.filter(id => id !== item.id);
    return actor.update({"system.exploration":next});
  }
  if (payload.operation === "ammunition") {
    const weapon = exactItem(actor,payload.itemId);
    const strike = Array.from(actor.system?.actions ?? []).find(strike => strike.item === weapon && strike.slug === payload.slug);
    const record = strike && ammunitionRecord(strike);
    if (!record || record.selectedId !== payload.originalSelectedId || payload.ammoId !== null && typeof payload.ammoId !== "string") fail();
    if (!record.reload) {
      const ammo = payload.ammoId === null ? null : exactItem(actor,payload.ammoId);
      if (ammo && (!record.options.some(option => option.id === ammo.id && option.quantity > 0) || ammo.isAmmoFor?.(weapon) !== true)) fail();
      return weapon.update({"system.selectedAmmoId":ammo?.id ?? null});
    }
    // Reloading weapons select a loaded native subitem by sort order, as the sheet does.
    if (!record.options.some(option => option.id === payload.ammoId && option.quantity > 0)) fail();
    const source = weapon.toObject().system.subitems;
    if (!Array.isArray(source)) fail();
    const compatible = new Set(record.options.map(option => option.id));
    const empty = new Set(record.options.filter(option => option.quantity <= 0).map(option => option.id));
    const ordered = source.filter(item => !empty.has(item._id)).sort((a,b) => (a.sort ?? 0)-(b.sort ?? 0));
    const category = item => !compatible.has(item._id) ? 0 : item._id === payload.ammoId ? 1 : 2;
    ordered.sort((a,b) => category(a)-category(b)).forEach((item,index) => {item.sort=index;});
    return weapon.update({"system.subitems":ordered});
  }
  if (payload.operation === "blast") {
    const item = exactItem(actor,payload.itemId);
    if (item.slug !== "elemental-blast") fail();
    const blast = blastController(actor);
    const config = blast?.configs.find(config => config.element === payload.element && config.item === item);
    if (!config) fail();
    if (payload.mode === "channel") {
      const channel = Array.from(actor.items).find(item => item.type === "action" && item.slug === "channel-elements" && item.system.selfEffect);
      if (!channel || typeof globalThis.game?.pf2e?.rollItemMacro !== "function") fail();
      return globalThis.game.pf2e.rollItemMacro(channel.uuid);
    }
    if (!config.ready || !config.damageTypes.some(type => type.value === payload.damageType)) fail();
    if (payload.mode === "damage-type") {
      if ((config.damageTypes.find(type=>type.selected)?.value ?? null) !== payload.originalDamageType) fail();
      return blast.setDamageType({element:payload.element,damageType:payload.damageType});
    }
    if (typeof payload.melee !== "boolean") fail();
    const options = {element:payload.element,damageType:payload.damageType,melee:payload.melee};
    if (payload.mode === "attack" && Number.isSafeInteger(payload.mapIncreases) && payload.mapIncreases >= 0 && payload.mapIncreases <= 2) return blast.attack({...options,mapIncreases:payload.mapIncreases});
    if (payload.mode === "damage" || payload.mode === "critical") return blast.damage({...options,outcome:payload.mode === "critical" ? "criticalSuccess" : "success"});
  }
  fail();
}

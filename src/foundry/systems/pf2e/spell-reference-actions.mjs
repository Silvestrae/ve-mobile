import { CommandError } from '../../command-support.mjs';
import { localizeFoundry } from '../../localization.mjs';

const invalid = () => { throw new CommandError('INVALID_INPUT', localizeFoundry('VEMOBILE.PF2E.InventoryEffect.Changed', 'This item changed. Refresh and try again.')); };
const values = collection => Array.from(collection?.contents ?? collection?.values?.() ?? collection ?? []);

export function spellReferenceAction(actor, spell, collection, parentItem = null) {
  if (!collection?.id || typeof collection.entry?.cast !== 'function') return null;
  if (parentItem) {
    if (collection.entry.category !== 'items' || typeof parentItem.consume !== 'function') return null;
    return {kind:'activation', collectionId:collection.id, spellId:spell.id, itemId:parentItem.id,
      originalUses:parentItem.uses?.value ?? null, originalQuantity:parentItem.quantity ?? null};
  }
  if (collection.entry.category !== 'ritual' || !spell.isRitual) return null;
  return {kind:'ritual', collectionId:collection.id, spellId:spell.id, itemId:spell.id};
}

export function ritualAction(actor, spell) {
  const collection=values(actor.spellcasting?.collections).find(c=>c.entry?.category==='ritual' && c.get?.(spell.id)===spell);
  return spellReferenceAction(actor,spell,collection);
}

// Called behind USE_ITEM's current-world/owner gate and actor-wide duplicate lock.
export function useSpellReference(actor,payload) {
  const collection=actor.spellcasting?.collections?.get?.(payload.collectionId);
  const spell=collection?.get?.(payload.spellId);
  if (!spell || typeof collection.entry?.cast!=='function') invalid();
  if(payload.kind==='ritual') {
    if(collection.entry.category!=='ritual' || !spell.isRitual || spell.id!==payload.itemId || actor.items?.get?.(spell.id)!==spell)invalid();
    return collection.entry.cast(spell,{message:true});
  }
  const parent=spell.parentItem;
  if(payload.kind!=='activation' || collection.entry.category!=='items' || !parent || actor.items?.get?.(payload.itemId)!==parent
    || typeof parent.consume!=='function' || parent.quantity<1 || parent.uses?.value === 0 || (parent.uses?.value??null)!==payload.originalUses
    || (parent.quantity??null)!==payload.originalQuantity)invalid();
  // Same path as PF2e's native cast-spell handler: consume performs embedded casting.
  return parent.consume();
}

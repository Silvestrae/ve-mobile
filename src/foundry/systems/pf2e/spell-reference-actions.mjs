import { CommandError } from '../../command-support.mjs';
import { localizeFoundry } from '../../localization.mjs';

// Raise the localized error for a stale or unsupported spell reference.
const invalid = () => { throw new CommandError('INVALID_INPUT', localizeFoundry('VEMOBILE.PF2E.InventoryEffect.Changed', 'This item changed. Refresh and try again.')); };
// Read supported values from the PF2e spell-reference collection.
const values = collection => Array.from(collection?.contents ?? collection?.values?.() ?? collection ?? []);

/** Build a validated action reference for a spell shown outside its spellbook. */
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

/** Resolve a ritual's native casting entry and produce its ritual action data. */
export function ritualAction(actor, spell) {
  const collection=values(actor.spellcasting?.collections).find(spellCollection=>spellCollection.entry?.category==='ritual' && spellCollection.get?.(spell.id)===spell);
  return spellReferenceAction(actor,spell,collection);
}

/** Re-resolve the referenced item and hand the requested action to PF2e APIs. */
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

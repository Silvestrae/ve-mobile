import { CommandError, canOwn } from "../../command-support.mjs";
import { localizeFoundry } from "../../localization.mjs";

const unavailable = () => { throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.PF2E.Unavailable", "This PF2e action is unavailable.")); };
const invalid = () => { throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.PF2E.InvalidInput", "This PF2e action is invalid or has changed. Refresh and try again.")); };
const stale = () => { throw new CommandError("STALE_VALUE", localizeFoundry("VEMOBILE.PF2E.ResourceChanged", "This resource changed. Refresh and try again.")); };
const integer = value => Number.isSafeInteger(value) && value >= 0;
const CORE_RESOURCES = Object.freeze(["hero-points", "mythic-points", "focus"]);

/**
 * Return current PF2e actor resources as plain records. Native getResource is
 * authoritative for value/max/label (including legacy infused reagents); the
 * synthetics map supplies dynamically-added resource slugs and optional native
 * itemUUID provenance. No live PF2e object escapes this adapter.
 */
export function pf2eResourceRecords(actor) {
  if (typeof actor?.getResource !== "function") return Object.freeze([]);
  const resources = new Map();
  for (const [key, synthetic] of Object.entries(actor.synthetics?.resources ?? {})) {
    const slug = typeof synthetic?.slug === "string" && synthetic.slug ? synthetic.slug : key;
    addResource(resources, actor, slug, synthetic);
  }
  for (const slug of [...CORE_RESOURCES, ...(actor.type === "character" ? ["infused-reagents"] : [])]) {
    addResource(resources, actor, slug);
  }
  return Object.freeze([...resources.values()].sort((a, b) => a.slug.localeCompare(b.slug)));
}

function addResource(records, actor, slug, synthetic) {
  let native;
  try { native = actor.getResource(slug); } catch { return; }
  if (!native || typeof native.slug !== "string" || !integer(native.value) || !integer(native.max)) return;
  const record = {
    slug: native.slug,
    label: typeof native.label === "string" ? native.label : native.slug,
    value: native.value,
    max: native.max
  };
  // The SpecialResource rule belongs to its granting embedded item.
  // itemUUID is an optional physical backing item, not the granting source.
  const source = synthetic?.item;
  if (source?.id && source.actor === actor && actor.items?.get?.(source.id) === source) record.sourceItemId = source.id;
  if (typeof synthetic?.itemUUID === "string" && synthetic.itemUUID) record.backingItemUuid = synthetic.itemUUID;
  records.set(native.slug, Object.freeze(record));
}

/**
 * Apply a bounded resource edit through PF2e's native updateResource API.
 * The enclosing command gateway must resolve the source Actor by UUID, verify
 * exact current Actor identity and OWNER permission, and provide assertCurrent;
 * this function rechecks current resource identity/value/bounds before writing.
 */
export function setPf2eResource(actor, payload, context = {}) {
  const slug = payload?.resource;
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/u.test(slug)) invalid();
  if (!actor || typeof actor.getResource !== "function" || typeof actor.updateResource !== "function") unavailable();
  if (!pf2eResourceRecords(actor).some(resource => resource.slug === slug && resource.max > 0)) unavailable();
  const current = actor.getResource(slug);
  if (!current || current.slug !== slug || !integer(current.value) || !integer(current.max) || current.max > 999999) unavailable();
  if (payload.originalValue !== current.value || (payload.originalMax !== undefined && payload.originalMax !== current.max)) stale();
  if (!integer(payload.value) || payload.value > current.max) invalid();
  context.assertCurrent?.();
  return actor.updateResource(current.slug, payload.value);
}

/** List item frequency and charged uses separately, using PF2e's live fields. */
export function pf2eLimitedUseRecords(actor) {
  const items = Array.from(actor?.items?.values?.() ?? actor?.items ?? []);
  const records = [];
  for (const item of items) {
    if (!item?.id || item.actor !== actor) continue;
    const frequency = item.system?.frequency;
    const uses = item.system?.uses;
    const limitedFrequency = frequency && integer(frequency.value) && integer(frequency.max) && frequency.max > 0
      ? Object.freeze({ value: frequency.value, max: frequency.max, per: String(frequency.per ?? ""),
        label: localizeFoundry(globalThis.CONFIG?.PF2E?.frequencies?.[frequency.per] ?? "", String(frequency.per ?? "")) }) : null;
    const limitedUses = uses && integer(uses.value) && integer(uses.max) && uses.max > 0
      ? Object.freeze({ value: uses.value, max: uses.max, ...(uses.autoDestroy === true ? { min: 1 } : {}) }) : null;
    if (!limitedFrequency && !limitedUses) continue;
    records.push(Object.freeze({
      itemId: String(item.id), name: String(item.name ?? ""), type: String(item.type ?? ""),
      ...(limitedFrequency ? { frequency: limitedFrequency } : {}),
      ...(limitedUses ? { uses: limitedUses } : {})
    }));
  }
  return Object.freeze(records);
}

/**
 * Update an item's PF2e frequency or uses value through Document.update.
 * The command gateway owns Actor identity/session/permission checks; this
 * function re-resolves the exact embedded item and rejects stale/out-of-range
 * edits. PF2e consumption flows remain native item actions, not these setters.
 */
export function setPf2eItemLimit(actor, payload, context = {}) {
  const itemId = payload?.itemId;
  if (typeof itemId !== "string" || !itemId || itemId.length > 128) invalid();
  const item = actor?.items?.get?.(itemId);
  if (!item || item.actor !== actor || item.id !== itemId || typeof item.update !== "function") unavailable();
  const field = payload.kind;
  if (field !== "frequency" && field !== "uses") invalid();
  const state = item.system?.[field];
  if (!state || !integer(state.value) || !integer(state.max) || state.max < 1) unavailable();
  if (payload.originalValue !== state.value || payload.originalMax !== state.max) stale();
  const minimum = field === "uses" && state.autoDestroy === true ? 1 : 0;
  if (!integer(payload.value) || payload.value < minimum || payload.value > state.max) invalid();
  context.assertCurrent?.();
  return item.update({ [`system.${field}.value`]: payload.value });
}

/** Optional helper for adapters that need to expose the same permission rule. */
export function canEditPf2eResources(actor, user) {
  return canOwn(actor, user);
}

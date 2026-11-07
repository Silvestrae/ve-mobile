import { SEEDED_CLASS_SCENES } from "./scenes.mjs";
import { locationRecipes } from "./locations.mjs";
import { habitatScenes, habitatLocations } from "./habitats.mjs";
import { renderLocation, selectLocation } from "./location-renderer.mjs";

export { SEEDED_CLASS_SCENES, locationRecipes as SEEDED_CLASS_LOCATIONS,
  habitatScenes as SEEDED_HABITAT_SCENES, habitatLocations as SEEDED_HABITAT_LOCATIONS };

// Keep class seed domains and recipe order stable for existing characters.
export function seededLocationFor(classId,name) {
  return Object.hasOwn(locationRecipes,classId) ? selectLocation(classId,name,locationRecipes[classId]) : null;
}

// The name chooses a location first. That location owns its focal subject and inventory.
export function renderSeededClassArtwork(classId, characterName) {
  if (!Object.hasOwn(SEEDED_CLASS_SCENES,classId)) return null;
  return renderLocation(SEEDED_CLASS_SCENES[classId],characterName,seededLocationFor(classId,characterName));
}

// Habitats use a separate seed domain from classes and from one another.
export function seededHabitatLocationFor(habitatId,name) {
  if (!Object.hasOwn(habitatScenes,habitatId)) return null;
  return selectLocation(habitatScenes[habitatId].id,name,habitatLocations[habitatId]);
}

// Use the same compositor for creature habitats and general adventurers.
export function renderSeededHabitatArtwork(habitatId,name) {
  if (!Object.hasOwn(habitatScenes,habitatId)) return null;
  return renderLocation(habitatScenes[habitatId],name,seededHabitatLocationFor(habitatId,name));
}

import { renderSeededClassArtwork, renderSeededHabitatArtwork } from "../artwork/seeded-classes/index.mjs";

const recentImages = new Map();
const maxRecentImages = 12;
const desktopCrop = Object.freeze({ x:100,y:50,zoom:1 });
const phoneCrop = Object.freeze({ x:85,y:50,zoom:1 });

// Classes and habitats share a bounded cache without holding Foundry documents or object URLs.
function seededArtworkUrl(domain, sceneId, actorName, drawArtwork) {
  const name = String(actorName ?? "").normalize("NFC").trim();
  const cacheKey = JSON.stringify([domain,sceneId,name]);
  let url = recentImages.get(cacheKey);
  if (url) {
    recentImages.delete(cacheKey);
  } else {
    const drawing = drawArtwork(sceneId,name);
    if (!drawing) return null;
    url = "data:image/svg+xml," + encodeURIComponent(drawing.svg);
  }
  recentImages.set(cacheKey,url);
  if (recentImages.size>maxRecentImages) recentImages.delete(recentImages.keys().next().value);
  return url;
}

// Preserve the class catalogue identity and give the SVG its own framing.
export function seededClassCandidate(catalogueEntry, classId, actorName) {
  const url = seededArtworkUrl("class", classId, actorName, renderSeededClassArtwork);
  return url ? Object.freeze({ ...catalogueEntry, url, crop:desktopCrop, phoneCrop }) : catalogueEntry;
}

// An unsupported creature type can fall back to the generic seed in the header resolver.
export function seededHabitatCandidate(habitatId, actorName) {
  const url = seededArtworkUrl("habitat", habitatId, actorName, renderSeededHabitatArtwork);
  return url ? Object.freeze({ id:"seeded-"+habitatId, kind:"procedural", url, crop:desktopCrop, phoneCrop }) : null;
}

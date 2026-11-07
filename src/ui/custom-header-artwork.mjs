// Load user artwork independently of sheet rendering and release it with its header.
export function loadCustomHeaderArtwork(header, candidates, scope) {
  header.style.removeProperty("--ve-class-art");
  delete header.dataset.bannerCatalogue;
  const url = candidates[0]?.url;
  if (!url || typeof Image !== "function") return;
  const image = new Image();
  image.decoding = "async";
  let active = true;
  // Clearing handlers and the request also releases slow or unavailable sources.
  const release = () => { image.onload = null; image.onerror = null; image.removeAttribute?.("src"); };
  scope.own(() => { active = false; release(); });
  image.onload = () => {
    if (active && !scope.disposed) {
      // CSS variables resolve relative URLs against the stylesheet, while the
      // native image resolves against the document (including hosted prefixes).
      const resolvedUrl = image.currentSrc || image.src || url;
      header.style.setProperty("--ve-class-art", `url(${JSON.stringify(resolvedUrl)})`);
      header.dataset.bannerCatalogue = "true";
    }
    release();
  };
  image.onerror = release;
  image.src = url;
}

// Apply a ready image and its reviewed framing without affecting header layout.
export function applyBannerArtwork(header, candidate, image, scope) {
  header.style.setProperty("--ve-class-art", `url("${candidate.url}")`);
  header.dataset.bannerCatalogue = "true";
  if (!candidate.crop || !image.naturalWidth || !image.naturalHeight) return;
  let paintedPosition;
  let paintedSize;
  // Match the review editor: cover the header first, then zoom the covered image.
  function resizeArtwork() {
    // A cached image may be applied before the header enters its phone or tablet surface.
    const form = header.closest?.("[data-form-factor]")?.dataset?.formFactor;
    const crop = (form === "phone" ? candidate.phoneCrop : null) ?? candidate.crop;
    const position = `${crop.x}% ${crop.y}%`;
    if (position !== paintedPosition) {
      paintedPosition = position;
      header.style.setProperty("--ve-banner-position", position);
    }
    const cover = Math.max(header.clientWidth / image.naturalWidth, header.clientHeight / image.naturalHeight);
    if (!cover) return;
    const scale = cover * crop.zoom;
    const size = `${image.naturalWidth * scale}px ${image.naturalHeight * scale}px`;
    if (size === paintedSize) return;
    paintedSize = size;
    header.style.setProperty("--ve-banner-size", size);
  }

  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resizeArtwork) : null;
  scope.own(() => {
    observer?.disconnect();
    header.style.removeProperty("--ve-banner-position");
    header.style.removeProperty("--ve-banner-size");
  });
  observer?.observe(header, { box: "border-box" });
  resizeArtwork();
}

/** Build safe CSS values for a plain token texture geometry record. */
export function tokenPortraitStyle(portrait = {}) {
  const finite = (value, fallback) => value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : fallback;
  const rawWidth = finite(portrait.width, 1);
  const rawHeight = finite(portrait.height, 1);
  const width = rawWidth > 0 ? rawWidth : 1;
  const height = rawHeight > 0 ? rawHeight : 1;
  const scaleX = finite(portrait.scaleX, 1);
  const scaleY = finite(portrait.scaleY, 1);
  const offsetX = finite(portrait.offsetX, 0);
  const offsetY = finite(portrait.offsetY, 0);
  const anchorX = finite(portrait.anchorX, 0.5);
  const anchorY = finite(portrait.anchorY, 0.5);
  const fitWidth = Math.min(1, width / height);
  const fitHeight = Math.min(1, height / width);
  return [
    `--ve-token-footprint-width:${fitWidth * 100}%`,
    `--ve-token-footprint-height:${fitHeight * 100}%`,
    `--ve-token-scale-x:${scaleX}`,
    `--ve-token-scale-y:${scaleY}`,
    `--ve-token-offset-x:${offsetX}`,
    `--ve-token-offset-y:${offsetY}`,
    `--ve-token-anchor-x:${anchorX}`,
    `--ve-token-anchor-y:${anchorY}`
  ].join(";");
}

export function tokenPortraitFit(portrait = {}) {
  return ["fill", "cover", "contain", "width", "height"].includes(portrait.fit) ? portrait.fit : "fill";
}

/** Joystick art has a unit head footprint, independently of the map token size. */
export function joystickPortraitStyle(portrait = {}) {
  return tokenPortraitStyle({ scaleX: Number(portrait.scaleX) < 0 ? -1 : 1, scaleY: Number(portrait.scaleY) < 0 ? -1 : 1 });
}

/** Recognise a centred circular opaque border, rejecting ambiguous/rectangular art. */
export function circularPortraitDiameter(pixels, size) {
  const center = size / 2, radii = [];
  for (let ray = 0; ray < 96; ray++) {
    const angle = ray * Math.PI * 2 / 96;
    let outer = 0;
    for (let radius = 1; radius < size * .71; radius += .5) {
      const x = Math.floor(center + Math.cos(angle) * radius), y = Math.floor(center + Math.sin(angle) * radius);
      if (x < 0 || y < 0 || x >= size || y >= size) break;
      if (pixels[(y * size + x) * 4 + 3] >= 128) outer = radius;
    }
    radii.push(outer);
  }
  let best = [];
  for (const radius of radii) {
    if (radius < size * .12 || radius > size * .5) continue;
    const matching = radii.filter(value => Math.abs(value - radius) <= size * .018);
    if (matching.length > best.length) best = matching;
  }
  if (best.length < radii.length * .6) return null;
  best.sort((a, b) => a - b);
  return Math.min(1, (best[Math.floor(best.length / 2)] * 2 + 1) / size);
}

/** Bounded image-only analysis; no canvas/Foundry state or long-lived image cache. */
export function fitJoystickPortrait(image, portrait, scope) {
  const fit = () => {
    if (scope.disposed || !image.naturalWidth || !image.naturalHeight) return;
    try {
      const size = 128, sample = image.ownerDocument.createElement("canvas");
      sample.width = sample.height = size;
      const context = sample.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      const factor = size / Math.max(image.naturalWidth, image.naturalHeight);
      const width = image.naturalWidth * factor, height = image.naturalHeight * factor;
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      const diameter = circularPortraitDiameter(context.getImageData(0, 0, size, size).data, size);
      if (!diameter) return;
      const scale = 1 / diameter;
      image.style.setProperty("--ve-token-scale-x", String(scale * (Number(portrait?.scaleX) < 0 ? -1 : 1)));
      image.style.setProperty("--ve-token-scale-y", String(scale * (Number(portrait?.scaleY) < 0 ? -1 : 1)));
    } catch { /* External images without CORS retain the unit-size fallback. */ }
  };
  scope.listen(image, "load", fit);
  if (image.complete) fit();
}

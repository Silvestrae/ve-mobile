/**
 * Capture the world point currently shown at the centre of a visible Scene
 * region. The returned record is transport-safe and independent of callers.
 */
export function captureVisibleSceneAnchor(canvas, bounds) {
  if (!usableBounds(bounds) || typeof canvas?.canvasCoordinatesFromClient !== "function") return null;
  const client = boundsCenter(bounds);
  const world = canvas.canvasCoordinatesFromClient(client);
  const scale = Number(canvas.stage?.scale?.x);
  if (![world?.x, world?.y, scale].every(Number.isFinite) || !(scale > 0)) return null;
  return Object.freeze({
    worldX: Number(world.x),
    worldY: Number(world.y),
    scale
  });
}

/** Keep a Scene point at its actual client coordinate across a VE pane resize.
 * Foundry v13 centres the stage on its full renderer, independent of VE's
 * clipped Scene viewport; moving the point to a new pane centre would pan it.
 */
export function captureFixedSceneAnchor(canvas, bounds) {
  const visible = captureVisibleSceneAnchor(canvas, bounds);
  const pivotX = Number(canvas?.stage?.pivot?.x);
  const pivotY = Number(canvas?.stage?.pivot?.y);
  if (!visible || ![pivotX, pivotY].every(Number.isFinite)) return null;
  const client = boundsCenter(bounds);
  return Object.freeze({ ...visible, clientX: client.x, clientY: client.y, pivotX, pivotY });
}

/** Compensate only when Foundry's renderer transform actually moved. Reading
 * stage geometry avoids a needless pan (and its hooks) for a pure DOM resize.
 */
export function restoreFixedSceneAnchor(canvas, anchor, bounds) {
  if (!usableBounds(bounds) || !usableFixedAnchor(anchor) || typeof canvas?.pan !== "function") return false;
  const stage = canvas.stage;
  const position = { x: Number(stage?.position?.x), y: Number(stage?.position?.y) };
  const pivot = { x: Number(stage?.pivot?.x), y: Number(stage?.pivot?.y) };
  const scale = Number(stage?.scale?.x);
  if (![position.x, position.y, pivot.x, pivot.y, scale].every(Number.isFinite)) return false;
  // A user pan or zoom during the layout transition takes precedence.
  if (Math.abs(pivot.x - anchor.pivotX) > 0.001 || Math.abs(pivot.y - anchor.pivotY) > 0.001
    || Math.abs(scale - anchor.scale) > 0.000001) return false;
  const clientX = position.x + (anchor.worldX - pivot.x) * scale;
  const clientY = position.y + (anchor.worldY - pivot.y) * scale;
  if (Math.abs(clientX - anchor.clientX) <= 0.25 && Math.abs(clientY - anchor.clientY) <= 0.25) return true;
  canvas.pan(cameraViewForVisibleAnchor(anchor, { x: anchor.clientX, y: anchor.clientY }, position));
  return true;
}

/**
 * Centre a captured world point in a new visible Scene region while retaining
 * its zoom. Foundry's stage remains centred on the full renderer, so the pivot
 * is offset by the target region's centre relative to the stage position.
 */
export function restoreVisibleSceneAnchor(canvas, anchor, bounds) {
  if (!usableBounds(bounds) || !usableAnchor(anchor) || typeof canvas?.pan !== "function") return false;
  const client = boundsCenter(bounds);
  const stageX = Number(canvas.stage?.position?.x);
  const stageY = Number(canvas.stage?.position?.y);
  if (![stageX, stageY].every(Number.isFinite)) return false;
  canvas.pan(cameraViewForVisibleAnchor(anchor, client, { x: stageX, y: stageY }));
  return true;
}

export function cameraViewForVisibleAnchor(anchor, client, stagePosition) {
  const scale = Number(anchor.scale);
  return Object.freeze({
    x: Number(anchor.worldX) - (Number(client.x) - Number(stagePosition.x)) / scale,
    y: Number(anchor.worldY) - (Number(client.y) - Number(stagePosition.y)) / scale,
    scale
  });
}

export function boundsCenter(bounds) {
  return Object.freeze({
    x: Number(bounds.left) + Number(bounds.width) / 2,
    y: Number(bounds.top) + Number(bounds.height) / 2
  });
}

function usableBounds(bounds) {
  return [bounds?.left, bounds?.top, bounds?.width, bounds?.height].every(Number.isFinite)
    && bounds.width > 0 && bounds.height > 0;
}

function usableAnchor(anchor) {
  return [anchor?.worldX, anchor?.worldY, anchor?.scale].every(Number.isFinite) && anchor.scale > 0;
}

function usableFixedAnchor(anchor) {
  return usableAnchor(anchor) && [anchor.clientX, anchor.clientY, anchor.pivotX, anchor.pivotY].every(Number.isFinite);
}

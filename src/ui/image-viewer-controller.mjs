// Pointer geometry for the shared image viewer; its task scope owns the event listeners.
export const IMAGE_VIEWER_MIN_SCALE = 1;
export const IMAGE_VIEWER_MAX_SCALE = 5;

// Keep zoom between the natural fit and the supported maximum.
export function clampImageViewerScale(value) {
  return Math.min(IMAGE_VIEWER_MAX_SCALE, Math.max(IMAGE_VIEWER_MIN_SCALE, Number(value) || 1));
}

// Own pinch, pan, wheel and double-click gestures for one image surface.
export function bindImageViewer(stage, image, scope) {
  const pointers = new Map();
  let scale = 1;
  let x = 0;
  let y = 0;
  let priorDistance = 0;
  let priorCentre = null;
  // Clamp panning to the zoomed image's visible bounds before publishing its transform.
  const render = () => {
    const stageWidth = Number(stage.clientWidth) || 0;
    const stageHeight = Number(stage.clientHeight) || 0;
    const imageWidth = Number(image.clientWidth) || 0;
    const imageHeight = Number(image.clientHeight) || 0;
    if (stageWidth && imageWidth) x = clamp(x, Math.max(0, (imageWidth * scale - stageWidth) / 2));
    if (stageHeight && imageHeight) y = clamp(y, Math.max(0, (imageHeight * scale - stageHeight) / 2));
    image.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) scale(${scale.toFixed(3)})`;
    stage.dataset.scale = scale.toFixed(2);
  };
  // Return to the initial fit and forget pinch history from the previous gesture.
  const reset = () => { scale = 1; x = 0; y = 0; priorDistance = 0; priorCentre = null; render(); };
  // Apply a bounded relative zoom and recenter when returning to the initial fit.
  const zoomBy = (factor) => {
    scale = clampImageViewerScale(scale * factor);
    if (scale === 1) { x = 0; y = 0; }
    render();
  };
  // Reset the pinch baseline whenever the set of active fingers changes.
  const syncGesture = () => {
    const values = Array.from(pointers.values());
    priorDistance = values.length > 1 ? spacing(values[0], values[1]) : 0;
    priorCentre = values.length > 1 ? midpoint(values[0], values[1]) : null;
  };
  // Track the pressed pointer and capture it so a drag can continue beyond the stage edge.
  const handlePointerDown = (event) => {
    pointers.set(event.pointerId, point(event));
    stage.setPointerCapture?.(event.pointerId);
    syncGesture();
  };
  // Use two fingers for pinch/translation, or one finger for panning an already-zoomed image.
  const handlePointerMove = (event) => {
    const before = pointers.get(event.pointerId);
    if (!before) return;
    pointers.set(event.pointerId, point(event));
    const values = Array.from(pointers.values());
    if (values.length > 1) {
      const distance = spacing(values[0], values[1]);
      const centre = midpoint(values[0], values[1]);
      if (priorDistance > 0) scale = clampImageViewerScale(scale * distance / priorDistance);
      if (priorCentre && scale > 1) { x += centre.x - priorCentre.x; y += centre.y - priorCentre.y; }
      priorDistance = distance;
      priorCentre = centre;
    } else if (scale > 1) {
      x += event.clientX - before.x;
      y += event.clientY - before.y;
    }
    if (scale === 1) { x = 0; y = 0; }
    render();
  };
  // Forget a released/cancelled pointer and rebase any fingers still touching the stage.
  const handlePointerEnd = (event) => { pointers.delete(event.pointerId); syncGesture(); };
  scope.listen(stage, "pointerdown", handlePointerDown);
  scope.listen(stage, "pointermove", handlePointerMove);
  scope.listen(stage, "pointerup", handlePointerEnd);
  scope.listen(stage, "pointercancel", handlePointerEnd);
  scope.listen(stage, "lostpointercapture", handlePointerEnd);
  scope.listen(stage, "dblclick", () => scale > 1 ? reset() : zoomBy(2));
  scope.listen(stage, "wheel", (event) => { event.preventDefault(); zoomBy(event.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
  render();
  return Object.freeze({ reset, zoomBy, get scale() { return scale; } });
}

// Convert a pointer event to the client coordinates used throughout this controller.
function point(event) { return { x: Number(event.clientX), y: Number(event.clientY) }; }
// Measure the distance between two fingers for the pinch scale ratio.
function spacing(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
// Find the pinch centre so the zoomed image can follow both fingers together.
function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
// Limit movement symmetrically around the centred image.
function clamp(value, limit) { return Math.min(limit, Math.max(-limit, value)); }

import { icon, node } from "./dom.mjs";
import { bindImageViewer } from "./image-viewer-controller.mjs";

/** Shared VE artwork viewer for Journal pages and Character portraits. */
export function renderImageViewer(imageRecord, onClose, scope, { localize = (_key, fallback) => fallback } = {}) {
  if (!imageRecord?.src) return null;
  const name = String(imageRecord.name || localize("VEMOBILE.ImageViewer.Image", "Image"));
  const image = node("img", { attrs: { src: imageRecord.src, alt: name, draggable: "false" } });
  const stage = node("div", { className: "ve-image-viewer-stage ve-journal-image-stage", children: [image] });
  const controller = bindImageViewer(stage, image, scope);
  const layer = node("div", {
    className: "ve-image-viewer ve-journal-image-viewer",
    attrs: { role: "dialog", "aria-modal": "true", "aria-label": name },
    children: [
      node("header", { children: [node("strong", { text: name }), node("button", { attrs: { type: "button", "aria-label": localize("VEMOBILE.ImageViewer.Close", "Close image viewer") }, on: { click: onClose }, children: [icon("fa-xmark")] }, scope)] }),
      stage,
      node("nav", { attrs: { "aria-label": localize("VEMOBILE.ImageViewer.ZoomControls", "Image zoom controls") }, children: [
        node("button", { attrs: { type: "button", "aria-label": localize("VEMOBILE.ImageViewer.ZoomOut", "Zoom out") }, on: { click: () => controller.zoomBy(1 / 1.35) }, children: [icon("fa-minus")] }, scope),
        node("button", { attrs: { type: "button" }, on: { click: controller.reset }, children: [icon("fa-expand"), node("span", { text: localize("VEMOBILE.ImageViewer.Fit", "Fit") })] }, scope),
        node("button", { attrs: { type: "button", "aria-label": localize("VEMOBILE.ImageViewer.ZoomIn", "Zoom in") }, on: { click: () => controller.zoomBy(1.35) }, children: [icon("fa-plus")] }, scope)
      ] })
    ]
  });
  scope.listen(layer, "keydown", (event) => { if (event.key === "Escape") onClose(); });
  queueMicrotask(() => layer.querySelector?.("header button")?.focus?.());
  return layer;
}

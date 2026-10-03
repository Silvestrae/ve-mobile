export function node(tag, options = {}, scope) {
  const element = document.createElement(tag);
  if (String(tag).toLowerCase() === "img" && options.attrs?.draggable === undefined) {
    element.setAttribute("draggable", "false");
  }
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = String(options.text);
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      if (value !== undefined && value !== null && value !== false) element.setAttribute(name, value === true ? "" : String(value));
    }
  }
  if (options.dataset) Object.assign(element.dataset, options.dataset);
  if (options.on) {
    for (const [type, listener] of Object.entries(options.on)) scope.listen(element, type, listener);
  }
  append(element, options.children);
  return element;
}

export function append(parent, children) {
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === undefined || child === null || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function icon(name, style = "solid") {
  const styleClass = style === "solid" ? "fa-solid" : `fa-${style}`;
  return node("i", { className: `${styleClass} ${name}`, attrs: { "aria-hidden": "true" } });
}

export function vectorIcon(viewBox, shapes, className = "") {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  if (className) svg.setAttribute("class", className);
  for (const shape of shapes) {
    const element = document.createElementNS(namespace, shape.tag);
    for (const [name, value] of Object.entries(shape.attrs ?? {})) element.setAttribute(name, String(value));
    svg.append(element);
  }
  return svg;
}

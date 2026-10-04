/** The shared shell has one scrollable pane. Header progress is shared, while
 * scrollTop belongs to the current pane. Restoring a tab resets the delta
 * baseline without changing progress; only subsequent user scrolling morphs
 * the header. There is no outer/nested scrollbar or persistent storage. */
export function bindCharacterHeaderScroll({ scroller, screen, scope }) {
  if (scope.disposed) return null;
  const heading = screen.querySelector(".ve-character-heading");
  const root = screen.closest(".ve-mobile-app");
  if (!heading || !(root?.dataset.formFactor === "phone" || root?.dataset.splitScreen === "true")) return null;
  const view = heading.ownerDocument.defaultView;
  const reducedMotion = view.matchMedia("(prefers-reduced-motion: reduce)");
  let expanded = 0, collapsedClientHeight = scroller.clientHeight, range = 0, offset = 0, baseline = scroller.scrollTop, width = -1, height = -1, observedHeadingHeight = heading.getBoundingClientRect().height;
  let xp = null;
  let spacer = null, ownedSpacer = null, contentObserver = null, observedContent = null;
  let expansionAllowed = false, gesture = null, lastWheelAt = -Infinity, touchY = null;
  const update = () => { baseline = scroller.scrollTop; expansionAllowed = false; gesture = null; };
  const beginGesture = kind => { gesture = kind; expansionAllowed = scroller.scrollTop <= 1; };
  const expandAtBoundary = delta => {
    if (reducedMotion.matches || !expansionAllowed || scroller.scrollTop > 1 || delta >= 0 || offset <= 0) return false;
    offset = Math.max(0, offset + delta);
    paint();
    baseline = scroller.scrollTop;
    return true;
  };
  const paint = () => {
    if (scope.disposed || !heading.isConnected) return;
    heading.style.setProperty("--ve-header-progress", String(range ? offset / range : 0));
    // CSS first reserves the portrait column, then raises HP into that band.
    // Let the shared heading follow this intrinsic geometry without a layout read.
    if (xp) xp.inert = offset > range * 0.05;
  };
  const ensureFiller = () => {
    if (scope.disposed || !scroller.isConnected) return;
    const previousScrollTop = scroller.scrollTop;
    spacer = scroller.querySelector(".ve-character-scroll-spacer");
    if (!spacer) {
      spacer = view.document.createElement("div");
      spacer.className = "ve-character-scroll-spacer";
      spacer.setAttribute("aria-hidden", "true");
      scroller.append(spacer);
      ownedSpacer = spacer;
    }
    if (range <= 0) {
      spacer.style.height = "0px";
      const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = Math.min(previousScrollTop, maximum);
      baseline = scroller.scrollTop;
      return;
    }
    // Measure the content range without our old tail, then add only the range
    // still needed to expose the complete compact state.
    spacer.style.height = "0px";
    const requiredContentHeight = collapsedClientHeight + range;
    const probe = Math.ceil(requiredContentHeight + 1);
    spacer.style.height = `${probe}px`;
    const contentExtent = Math.max(0, scroller.scrollHeight - probe);
    spacer.style.height = "0px";
    const missing = Math.max(0, requiredContentHeight - contentExtent);
    spacer.style.height = `${Math.ceil(missing)}px`;
    const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    scroller.scrollTop = Math.min(previousScrollTop, maximum);
    baseline = scroller.scrollTop;
  };
  const observeContent = () => {
    const content = spacer?.previousElementSibling ?? scroller.firstElementChild;
    if (content === observedContent) return;
    contentObserver?.disconnect();
    observedContent = content;
    if (content) contentObserver?.observe(content);
  };
  const measure = () => {
    if (scope.disposed || !heading.isConnected) return;
    const band = heading.querySelector(".ve-character-identity-band");
    if (!band) return;
    const header = band.closest(".ve-sheet-identity");
    header.style.removeProperty("--ve-header-compact-band");
    header.style.removeProperty("--ve-header-compact-metrics");
    const progress = range ? offset / range : 0;
    xp = heading.querySelector(".ve-character-header-xp");
    delete heading.dataset.collapse;
    heading.dataset.measure = "true";
    heading.style.height = "";
    heading.style.setProperty("--ve-header-progress", "0");
    if (reducedMotion.matches) {
      delete heading.dataset.measure;
      offset = range = 0;
      collapsedClientHeight = scroller.clientHeight;
      if (xp) xp.inert = false;
      ensureFiller();
      height = scroller.clientHeight;
      observedHeadingHeight = heading.getBoundingClientRect().height;
      update();
      return;
    }
    heading.style.setProperty("--ve-header-full-band", `${band.getBoundingClientRect().height}px`);
    heading.style.setProperty("--ve-header-full-portrait", `${band.querySelector(".ve-sheet-portrait-frame").getBoundingClientRect().width}px`);
    heading.style.setProperty("--ve-header-full-controls", `${band.querySelector(".ve-character-identity-controls").getBoundingClientRect().width}px`);
    heading.style.setProperty("--ve-header-full-xp", `${xp?.getBoundingClientRect().height ?? 0}px`);
    expanded = heading.getBoundingClientRect().height;
    heading.dataset.collapse = "true";
    delete heading.dataset.measure;
    heading.style.setProperty("--ve-header-progress", "1");
    // Measure the actual compact text and HP row once per geometry invalidation.
    // Long NPC metadata and downed controls must not be clipped by a fixed band.
    const metricsHeight = header.querySelector(".ve-character-vitals-group").getBoundingClientRect().height;
    const summary = band.querySelector(".ve-character-compact-summary");
    const deathRowHeight = band.querySelector(".ve-death-saves")?.getBoundingClientRect().height ?? 0;
    const compactBand = Math.max(104,
      27 + summary.getBoundingClientRect().height + metricsHeight + 4) + (deathRowHeight ? deathRowHeight + 6 : 0);
    header.style.setProperty("--ve-header-compact-metrics", `${metricsHeight}px`);
    header.style.setProperty("--ve-header-compact-band", `${compactBand}px`);
    range = Math.max(0, expanded - heading.getBoundingClientRect().height);
    collapsedClientHeight = scroller.clientHeight;
    offset = progress * range;
    paint();
    ensureFiller();
    observeContent();
    height = scroller.clientHeight;
    observedHeadingHeight = heading.getBoundingClientRect().height;
    update();
  };
  scope.listen(scroller, "scroll", () => {
    if (scope.disposed || reducedMotion.matches) return;
    const next = scroller.scrollTop;
    const delta = next - baseline;
    if (delta >= 0 || (expansionAllowed && scroller.scrollTop <= 1)) offset = Math.max(0, Math.min(range, offset + delta));
    baseline = next;
    paint();
  }, { passive: true });
  const ownsGesture = event => {
    for (const element of event.composedPath()) {
      if (element === scroller) return true;
      if (element?.nodeType === 1 && element.scrollHeight > element.clientHeight
        && /^(auto|scroll)$/.test(view.getComputedStyle(element).overflowY)) return false;
    }
    return false;
  };
  scope.listen(scroller, "wheel", event => {
    if (event.defaultPrevented || event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || !ownsGesture(event)) return;
    const now = view.performance.now();
    if (gesture !== "wheel" || now - lastWheelAt > 250) beginGesture("wheel");
    lastWheelAt = now;
    const unit = event.deltaMode === 2 ? scroller.clientHeight : event.deltaMode === 1 ? 16 : 1;
    if (expandAtBoundary(event.deltaY * unit) && event.cancelable) event.preventDefault();
  }, { passive: false });
  scope.listen(scroller, "touchstart", event => {
    touchY = null;
    if (event.touches.length !== 1 || !ownsGesture(event)) return;
    beginGesture("touch");
    touchY = event.touches[0].clientY;
  }, { passive: true });
  scope.listen(scroller, "touchmove", event => {
    if (event.defaultPrevented || touchY === null || event.touches.length !== 1) return;
    expandAtBoundary(touchY - event.touches[0].clientY);
    touchY = event.touches[0].clientY;
  }, { passive: true });
  scope.listen(scroller, "touchend", () => { touchY = null; }, { passive: true });
  scope.listen(scroller, "touchcancel", () => { touchY = null; }, { passive: true });
  scope.listen(scroller, "keydown", event => {
    if (event.defaultPrevented || !ownsGesture(event) || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName) || event.target?.isContentEditable) return;
    if (!event.repeat || gesture !== "key") beginGesture("key");
    const delta = event.key === "Home" ? -range : event.key === "ArrowUp" ? -40 : event.key === "PageUp" || (event.key === " " && event.shiftKey) ? -scroller.clientHeight : 0;
    if (expandAtBoundary(delta) && event.cancelable) event.preventDefault();
  });
  const observer = new view.ResizeObserver(() => {
    const nextWidth = scroller.clientWidth;
    const nextHeight = scroller.clientHeight;
    const widthChanged = nextWidth !== width;
    const heightChanged = nextHeight !== height;
    if (!widthChanged && !heightChanged) return;
    width = nextWidth;
    if (widthChanged) {
      measure();
      return;
    }
    const nextHeadingHeight = heading.getBoundingClientRect().height;
    // The rendered heading contracts nonlinearly between its measured ends.
    // Its current rendered height plus the pane height is the stable available
    // vertical space; comparing against scroll offset misclassifies that CSS
    // interpolation as a viewport resize and resets the gesture baseline.
    const availableBefore = height + observedHeadingHeight;
    const availableNow = nextHeight + nextHeadingHeight;
    const externalHeightChange = Math.abs(availableNow - availableBefore) > 2;
    height = nextHeight;
    observedHeadingHeight = nextHeadingHeight;
    if (externalHeightChange) {
      // A height change beyond the amount explained by header contraction is
      // a viewport/layout resize. Add the remaining collapse distance to that
      // pane height without remeasuring the header's internal geometry.
      collapsedClientHeight = Math.max(0, availableNow - (expanded - range));
      ensureFiller();
    }
  });
  contentObserver = new view.ResizeObserver(() => {
    if (scope.disposed) return;
    ensureFiller();
  });
  const mutationObserver = new view.MutationObserver(() => {
    if (scope.disposed) return;
    ensureFiller();
    observeContent();
  });
  scope.own(() => {
    observer.disconnect();
    contentObserver.disconnect();
    mutationObserver.disconnect();
    ownedSpacer?.remove();
    delete heading.dataset.collapse;
    delete heading.dataset.measure;
    heading.removeAttribute("style");
    const header = heading.querySelector(".ve-sheet-identity");
    header?.style.removeProperty("--ve-header-compact-band");
    header?.style.removeProperty("--ve-header-compact-metrics");
    if (xp) xp.inert = false;
  });
  mutationObserver.observe(scroller, { childList: true, characterData: true, subtree: true });
  observer.observe(scroller);
  observeContent();
  scope.listen(reducedMotion, "change", measure);
  view.document.fonts?.ready.then(() => { if (!scope.disposed) measure(); });
  measure();
  let selector = heading.firstElementChild;
  let tabs = heading.querySelector(".ve-sheet-tabs");
  return {
    update,
    prepareScrollRestore: update,
    refresh() {
      if (selector === heading.firstElementChild && tabs === heading.querySelector(".ve-sheet-tabs")) return;
      selector = heading.firstElementChild;
      tabs = heading.querySelector(".ve-sheet-tabs");
      measure();
    },
    get scrollTop() { return scroller.scrollTop; },
    get collapseDistance() { return range; },
    get compactClientHeight() { return collapsedClientHeight; },
    toNativeScrollTop: value => value
  };
}

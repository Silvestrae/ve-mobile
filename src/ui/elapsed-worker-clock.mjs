/** Keep the visible elapsed clock moving while Foundry blocks the DOM thread. */
export function createElapsedWorkerClock(textElement, {
  createCanvas = () => textElement.ownerDocument.createElement("canvas"),
  createWorker = () => new Worker(new URL("./elapsed-timer-worker.mjs", import.meta.url), { type: "module" }),
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  elapsedLabel = "Elapsed",
  locale = "en"
} = {}) {
  let worker = null;
  let canvas = null;
  let startedAt = null;

  const stop = () => {
    worker?.terminate();
    worker = null;
    canvas?.remove();
    canvas = null;
    startedAt = null;
    textElement.classList?.remove("ve-elapsed-worker-text");
  };
  const start = (value) => {
    const startTime = Number(value);
    if (!Number.isFinite(startTime) || value === null || value === undefined) return;
    if (worker && startedAt === startTime) return;
    const elapsedMs = Math.max(0, now() - startTime);
    if (worker) {
      startedAt = startTime;
      worker.postMessage({ type: "reset", elapsedMs });
      return;
    }
    if (typeof globalThis.Worker !== "function") return;
    try {
      const nextCanvas = createCanvas();
      if (typeof nextCanvas.transferControlToOffscreen !== "function") return;
      const style = globalThis.getComputedStyle?.(textElement);
      const dpr = Math.min(4, Math.max(1, Number(globalThis.devicePixelRatio) || 1));
      nextCanvas.width = Math.round(160 * dpr);
      nextCanvas.height = Math.round(20 * dpr);
      nextCanvas.className = "ve-elapsed-worker-clock";
      nextCanvas.setAttribute("aria-hidden", "true");
      const surface = nextCanvas.transferControlToOffscreen();
      const nextWorker = createWorker();
      canvas = nextCanvas;
      worker = nextWorker;
      nextWorker.onerror = () => { if (worker === nextWorker) stop(); };
      nextWorker.postMessage({
        type: "start", canvas: surface, elapsedMs, dpr, elapsedLabel, locale,
        color: style?.color ?? "#ccc",
        font: `${style?.fontWeight ?? "600"} ${style?.fontSize ?? "12px"} ${style?.fontFamily ?? "sans-serif"}`
      }, [surface]);
      textElement.parentNode?.append(nextCanvas);
      textElement.classList?.add("ve-elapsed-worker-text");
      startedAt = startTime;
    } catch {
      stop(); // The DOM clock remains a functioning fallback.
    }
  };
  const setElapsedLabel = value => {
    elapsedLabel = String(value || "Elapsed");
    worker?.postMessage({ type: "label", elapsedLabel });
  };
  const setLocale = value => { locale = value || "en"; worker?.postMessage({ type: "locale", locale }); };
  return Object.freeze({ start, stop, setElapsedLabel, setLocale });
}

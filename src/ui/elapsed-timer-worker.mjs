import { localizedNumber } from "./localized-text.mjs";
let context = null;
let clock = null;
let interval = null;

function draw() {
  if (!context || !clock) return;
  const elapsed = Math.max(0, clock.elapsedMs + performance.now() - clock.startedAt);
  const value = elapsed < 1000 ? `${localizedNumber(Math.round(elapsed), clock.locale)} ms` : `${localizedNumber(elapsed / 1000, clock.locale, 1)} s`;
  context.clearRect(0, 0, 160, 20);
  context.fillStyle = clock.color;
  context.font = clock.font;
  context.textBaseline = "middle";
  context.fillText(`${clock.elapsedLabel} · ${value}`, 0, 10, 160);
}

self.onmessage = ({ data }) => {
  if (data.type === "start") {
    context = data.canvas.getContext("2d");
    if (!context) throw new Error("Offscreen elapsed timer is unavailable.");
    context.setTransform(data.dpr, 0, 0, data.dpr, 0, 0);
    clock = { elapsedMs: data.elapsedMs, startedAt: performance.now(), color: data.color, font: data.font, elapsedLabel: data.elapsedLabel || "Elapsed", locale: data.locale || "en" };
    draw();
    clearInterval(interval);
    interval = setInterval(draw, 100);
  } else if (data.type === "reset" && clock) {
    clock.elapsedMs = data.elapsedMs;
    clock.startedAt = performance.now();
    draw();
  } else if (data.type === "locale" && clock) {
    clock.locale = data.locale || "en";
    draw();
  } else if (data.type === "label" && clock) {
    clock.elapsedLabel = data.elapsedLabel || "Elapsed";
    draw();
  }
};

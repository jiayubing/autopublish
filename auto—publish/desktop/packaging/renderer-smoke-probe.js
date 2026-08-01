"use strict";

function probeRendererReadiness(timeoutMs, intervalMs) {
  return new Promise(function (resolve) {
    const deadline = Date.now() + timeoutMs;

    function inspect() {
      const preload =
        typeof window === "object" &&
        window !== null &&
        typeof window.desktopConsole === "object" &&
        window.desktopConsole !== null;
      const root =
        typeof document === "object" && document !== null
          ? document.getElementById("root")
          : null;
      const renderer = Boolean(root && root.childElementCount > 0);
      if ((preload && renderer) || Date.now() >= deadline) {
        resolve({ preload, renderer });
        return;
      }
      setTimeout(inspect, intervalMs);
    }

    inspect();
  });
}

function positiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function createRendererSmokeProbeSource(options) {
  const opts = options || {};
  const timeoutMs = positiveInteger(opts.timeoutMs, 10000);
  const intervalMs = positiveInteger(opts.intervalMs, 50);
  return `(${probeRendererReadiness.toString()})(${timeoutMs}, ${intervalMs})`;
}

module.exports = { createRendererSmokeProbeSource };

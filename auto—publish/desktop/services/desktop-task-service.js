"use strict";

// Read-only activity projection; execution state stays with each orchestrator.
function createDesktopTaskService(options) {
  const readStates = options && options.getActivityStates;
  if (typeof readStates !== "function") throw new Error("Task activity reader is required");
  return Object.freeze({
    getState() {
      const states = readStates();
      const running = states.some((state) => state.isRunning);
      const stopping = states.some((state) => state.isStopping);
      return {
        phase: stopping ? "stopping" : running ? "running" : "idle",
        isPlatformRunning: running,
        isBatchRunning: running,
        isStopPending: stopping,
      };
    },
  });
}

module.exports = { createDesktopTaskService };

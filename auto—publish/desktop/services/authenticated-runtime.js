function createAuthenticatedRuntime(options) {
  const opts = options || {};
  if (typeof opts.start !== "function" || typeof opts.dispose !== "function")
    throw new Error("Authenticated runtime dependencies are required");
  let phase = "idle";
  let bootstrapState = null;
  let startPromise = null;
  let startGeneration = 0;
  let disposePromise = null;
  let lifecycleGeneration = 0;

  async function start(nextBootstrapState) {
    if (phase === "running") return getState();
    if (disposePromise) {
      const pendingDispose = disposePromise;
      await pendingDispose;
      return start(nextBootstrapState);
    }
    if (startPromise && startGeneration === lifecycleGeneration)
      return startPromise;

    const generation = ++lifecycleGeneration;
    startGeneration = generation;
    let currentStartPromise = null;
    currentStartPromise = (async function () {
      phase = "starting";
      try {
        await opts.start(nextBootstrapState);
        if (generation === lifecycleGeneration) {
          bootstrapState = nextBootstrapState || null;
          phase = "running";
        }
        return getState();
      } catch (error) {
        if (generation === lifecycleGeneration) phase = "failed";
        throw error;
      } finally {
        if (startPromise === currentStartPromise) {
          startPromise = null;
          startGeneration = 0;
        }
      }
    })();
    startPromise = currentStartPromise;
    return currentStartPromise;
  }

  async function dispose() {
    if (disposePromise) return disposePromise;
    if (phase === "idle" || phase === "stopped") return getState();

    ++lifecycleGeneration;
    disposePromise = (async function () {
      phase = "disposing";
      try {
        await opts.dispose();
      } finally {
        phase = "stopped";
        bootstrapState = null;
        disposePromise = null;
      }
      return getState();
    })();
    return disposePromise;
  }

  function getState() {
    return {
      phase: phase,
      workspacePath: (bootstrapState && bootstrapState.workspacePath) || null,
    };
  }

  return { start, dispose, getState };
}

module.exports = { createAuthenticatedRuntime };

function createAuthenticatedRuntime(options) {
  const opts = options || {};
  if (typeof opts.start !== "function" || typeof opts.dispose !== "function")
    throw new Error("Authenticated runtime dependencies are required");
  let phase = "idle";
  let bootstrapState = null;
  let startPromise = null;
  let disposePromise = null;

  async function start(nextBootstrapState) {
    if (phase === "running") return getState();
    if (startPromise) return startPromise;
    startPromise = (async function () {
      phase = "starting";
      try {
        await opts.start(nextBootstrapState);
        bootstrapState = nextBootstrapState || null;
        phase = "running";
        return getState();
      } catch (error) {
        phase = "failed";
        throw error;
      } finally {
        startPromise = null;
      }
    })();
    return startPromise;
  }

  async function dispose() {
    if (disposePromise) return disposePromise;
    if (phase === "idle" || phase === "stopped") return getState();
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

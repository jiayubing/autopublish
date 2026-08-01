const { HEALTH_CODES } = require("./health-diagnostic-mapper");

class LivenessProbe {
  constructor(options) {
    const opts = options || {};
    this.checkProcess = typeof opts.checkProcess === "function" ? opts.checkProcess : () => true;
  }

  check() {
    try {
      if (this.checkProcess() === false) return { ok: false, errorCode: HEALTH_CODES.PROCESS_UNAVAILABLE };
      return { ok: true, code: HEALTH_CODES.LIVENESS_OK, metadata: { probe: "process-http" } };
    } catch (error) {
      return { ok: false, error };
    }
  }
}

function createLivenessProbe(options) { return new LivenessProbe(options); }

module.exports = { LivenessProbe, createLivenessProbe };

const { HEALTH_CODES } = require("./health-diagnostic-mapper");

class RepositoryProbe {
  constructor(options) {
    const opts = options || {};
    this.repository = opts.repository;
  }

  async check() {
    try {
      if (!this.repository || typeof this.repository.probeReadiness !== "function") return { ok: false, errorCode: HEALTH_CODES.DATABASE_UNAVAILABLE };
      const result = await Promise.resolve(this.repository.probeReadiness());
      if (result && result.ok === false) return result;
      const metadata = { probe: "lightweight" };
      if (result && typeof result.schemaVersion === "number" && Number.isFinite(result.schemaVersion)) metadata.schemaVersion = result.schemaVersion;
      if (result && typeof result.connection === "string") metadata.connection = result.connection;
      return { ok: true, code: HEALTH_CODES.READINESS_OK, metadata };
    } catch (error) {
      return { ok: false, error };
    }
  }
}

function createRepositoryProbe(options) { return new RepositoryProbe(options); }

module.exports = { RepositoryProbe, createRepositoryProbe };

// auto—publish/src/platforms/media/submission-order-store.js
// Submission record store backed by a JSONL file.
// CommonJS port from root src/core/submission-store.js.

const { appendFile, mkdir } = require('node:fs/promises');
const { dirname } = require('node:path');
const { resolveStorePath } = require('./store-paths');

/**
 * Submission order store backed by a JSONL file.
 *
 * Each line is a JSON object with:
 *   - ts:          ISO 8601 timestamp
 *   - command:     "submit" | "order"
 *   - dryRun:      boolean (true if no real API call was made)
 *   - params:      submitted parameters (api_key is masked)
 *   - result:      { success: boolean, data?, error? }
 */
class SubmissionOrderStore {
  /**
   * @param {object} opts
   * @param {string} [opts.storePath] - Path to the JSONL file
   */
  constructor(opts) {
    opts = opts || {};
    this.storePath = resolveStorePath(opts, 'submission-orders.jsonl');
  }

  /**
   * Record a submission attempt.
   *
   * @param {object} record
   * @param {string} record.command - "submit" | "order"
   * @param {boolean} record.dryRun
   * @param {object} record.params
   * @param {object} record.result - { success, data?, error? }
   * @returns {Promise<void>}
   */
  async record(entry) {
    const record = {
      ts: new Date().toISOString(),
      command: entry.command,
      dryRun: entry.dryRun,
      ...(entry.publicationId ? { publicationId: String(entry.publicationId) } : {}),
      ...(entry.attemptId ? { attemptId: String(entry.attemptId) } : {}),
      ...(entry.orderNid ? { orderNid: String(entry.orderNid) } : {}),
      params: sanitizeParams(entry.params),
      result: Object.assign(
        { success: entry.result && entry.result.success !== undefined ? entry.result.success : false },
        entry.result && entry.result.data ? { data: entry.result.data } : {},
        entry.result && entry.result.error ? { error: entry.result.error } : {}
      )
    };

    const dir = dirname(this.storePath);
    await mkdir(dir, { recursive: true });

    await appendFile(this.storePath, JSON.stringify(record) + '\n', 'utf-8');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Remove or mask sensitive fields from params before logging.
 */
function sanitizeParams(params) {
  if (!params) return {};
  const safe = Object.assign({}, params);
  // Never log the full API key
  if (safe.api_key) {
    safe.api_key = maskParamKey(safe.api_key);
  }
  if (safe.apiKey) {
    safe.apiKey = maskParamKey(safe.apiKey);
  }
  return safe;
}

function maskParamKey(key) {
  if (typeof key !== 'string' || key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

module.exports = { SubmissionOrderStore };

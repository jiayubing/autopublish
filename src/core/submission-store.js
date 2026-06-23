import { appendFile, stat, mkdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const DEFAULT_STORE_PATH = join(projectRoot, "submission-records.jsonl");

/**
 * Submission record store backed by a JSONL file.
 *
 * Each line is a JSON object with:
 *   - ts:          ISO 8601 timestamp
 *   - command:     "submit" | "order"
 *   - dryRun:      boolean (true if no real API call was made)
 *   - params:      submitted parameters (api_key is masked)
 *   - result:      { success: boolean, data?, error? }
 */
export class SubmissionStore {
  /**
   * @param {object} opts
   * @param {string} [opts.storePath] - Path to the JSONL file
   */
  constructor({ storePath = DEFAULT_STORE_PATH } = {}) {
    this.storePath = storePath;
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
  async record({ command, dryRun, params, result }) {
    const entry = {
      ts: new Date().toISOString(),
      command,
      dryRun,
      params: sanitizeParams(params),
      result: {
        success: result.success ?? false,
        ...(result.data ? { data: result.data } : {}),
        ...(result.error ? { error: result.error } : {}),
      },
    };

    const dir = dirname(this.storePath);
    await mkdir(dir, { recursive: true });

    await appendFile(this.storePath, JSON.stringify(entry) + "\n", "utf-8");
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
  const safe = { ...params };
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
  if (typeof key !== "string" || key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

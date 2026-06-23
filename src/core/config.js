import { config as dotenvConfig } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");

dotenvConfig({ path: resolve(projectRoot, ".env") });

/**
 * Resolve the API key with the following priority:
 *  1. CLI argument (--api-key)
 *  2. Environment variable XQW_API_KEY
 *  3. .env file variable XQW_API_KEY
 *
 * @param {string|null} cliKey - API key passed via command line argument
 * @returns {string} The resolved API key
 * @throws {Error} If no API key could be resolved
 */
export function resolveApiKey(cliKey) {
  if (cliKey && cliKey.length > 0) {
    return cliKey;
  }

  const envKey = process.env.XQW_API_KEY;
  if (envKey && envKey.length > 0) {
    return envKey;
  }

  throw new Error(
    "缺少 API Key。请通过以下任一方式提供：\n" +
      "  1. 命令行参数: --api-key <key>\n" +
      "  2. 环境变量: XQW_API_KEY\n" +
      "  3. .env 文件: XQW_API_KEY=<key>"
  );
}

/**
 * Mask an API key for safe logging (show only first 4 and last 4 characters).
 *
 * @param {string} key - The API key to mask
 * @returns {string} Masked key string
 */
export function maskApiKey(key) {
  if (!key || key.length <= 8) {
    return "****";
  }
  return key.slice(0, 4) + "****" + key.slice(-4);
}

/**
 * Get the project root directory path.
 *
 * @returns {string} Absolute path to project root
 */
export function getProjectRoot() {
  return projectRoot;
}

// auto—publish/src/platforms/media/config.js
// API key resolution and masking for the media submission platform.
// CommonJS port from root src/core/config.js.

const path = require('path');

const dotenv = require('dotenv');

const projectRoot = path.resolve(__dirname, '..', '..', '..');

dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });

/**
 * Resolve the API key with the following priority:
 *  1. CLI / explicit argument
 *  2. Environment variable XQW_API_KEY
 *  3. .env file variable XQW_API_KEY
 */
function resolveApiKey(cliKey) {
  if (cliKey && cliKey.length > 0) {
    return cliKey;
  }

  const envKey = process.env.XQW_API_KEY;
  if (envKey && envKey.length > 0) {
    return envKey;
  }

  throw new Error(
    '缺少 API Key。请通过以下任一方式提供：\n' +
      '  1. 命令行参数: --api-key <key>\n' +
      '  2. 环境变量: XQW_API_KEY\n' +
      '  3. .env 文件: XQW_API_KEY=<key>'
  );
}

/**
 * Mask an API key for safe logging (show only first 4 and last 4 characters).
 */
function maskApiKey(key) {
  if (!key || key.length <= 8) {
    return '****';
  }
  return key.slice(0, 4) + '****' + key.slice(-4);
}

module.exports = { resolveApiKey, maskApiKey };

// auto—publish/src/platforms/media/config.js
// API key resolution and masking for the media submission platform.

/**
 * Resolve the API key with the following priority:
 *  1. CLI / explicit argument
 *  2. Environment variable XQW_API_KEY
 *  3. Workspace .env variable XQW_API_KEY loaded at runtime startup
 *
 * Returns empty string if no key is found (does not throw).
 */
function resolveApiKey(cliKey) {
  if (cliKey && cliKey.length > 0) {
    return cliKey;
  }

  const envKey = process.env.XQW_API_KEY;
  if (envKey && envKey.length > 0) {
    return envKey;
  }

  return '';
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

const safeAiErrors = new WeakSet();

function aiError(code, message) {
  const error = new Error(message);
  error.code = code;
  safeAiErrors.add(error);
  return error;
}

function valueOrEnvironment(config, key, envKey) {
  return config[key] == null ? process.env[envKey] : config[key];
}

function validateConfig(config) {
  const input = config || {};
  const apiKey = valueOrEnvironment(input, "apiKey", "AI_API_KEY");
  const baseUrl = valueOrEnvironment(input, "baseUrl", "AI_BASE_URL");
  const model = valueOrEnvironment(input, "model", "AI_MODEL");
  const timeoutValue = valueOrEnvironment(input, "timeoutMs", "AI_TIMEOUT_MS");
  const timeoutMs = timeoutValue == null || timeoutValue === "" ? 60000 : Number(timeoutValue);

  if (typeof apiKey !== "string" || !apiKey.trim() || typeof baseUrl !== "string" || !baseUrl.trim() ||
      typeof model !== "string" || !model.trim() || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw aiError("AI_CONFIG_INVALID", "AI client configuration is invalid");
  }

  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch (error) {
    throw aiError("AI_CONFIG_INVALID", "AI client configuration is invalid");
  }
  const isLoopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
  if ((parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback)) ||
      !/^\/v1\/?$/.test(parsed.pathname) || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw aiError("AI_CONFIG_INVALID", "AI client configuration is invalid");
  }

  return {
    apiKey: apiKey.trim(),
    baseUrl: parsed.origin + "/v1",
    model: model.trim(),
    timeoutMs: timeoutMs,
    fetch: input.fetch || global.fetch
  };
}

function createAiClient(config) {
  const settings = validateConfig(config);
  if (typeof settings.fetch !== "function") {
    throw aiError("AI_CONFIG_INVALID", "AI client configuration is invalid");
  }

  async function complete(messages) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(function() {
      timedOut = true;
      controller.abort();
    }, settings.timeoutMs);

    try {
      const response = await settings.fetch(settings.baseUrl + "/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + settings.apiKey
        },
        body: JSON.stringify({ model: settings.model, messages: messages }),
        signal: controller.signal
      });

      if (timedOut) throw aiError("AI_TIMEOUT", "AI request timed out");
      if (response.status === 401) throw aiError("AI_UNAUTHORIZED", "AI request was unauthorized");
      if (response.status === 429) throw aiError("AI_RATE_LIMITED", "AI request was rate limited");
      if (!response.ok) throw aiError("AI_REQUEST_FAILED", "AI request failed");

      let payload;
      try {
        const responseText = await response.text();
        if (timedOut) throw aiError("AI_TIMEOUT", "AI request timed out");
        payload = JSON.parse(responseText);
      } catch (error) {
        if (timedOut) {
          throw aiError("AI_TIMEOUT", "AI request timed out");
        }
        throw aiError("AI_REQUEST_FAILED", "AI response was invalid");
      }
      const content = payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
      if (typeof content !== "string" || !content.trim()) {
        throw aiError("AI_EMPTY_RESPONSE", "AI response was empty");
      }
      return content;
    } catch (error) {
      if (error && safeAiErrors.has(error)) throw error;
      if (timedOut) {
        throw aiError("AI_TIMEOUT", "AI request timed out");
      }
      throw aiError("AI_REQUEST_FAILED", "AI response was invalid");
    } finally {
      clearTimeout(timeout);
    }
  }

  return { complete: complete };
}

module.exports = { createAiClient };

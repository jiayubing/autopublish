"use strict";

const { geoError, safeUrl } = require("./geo-knowledge-schema");
const { normalizeGeoBaseUrl } = require("./doubao-geo-endpoint");

function createDoubaoGeoClient(options) {
  const transport = options.fetch || globalThis.fetch;
  async function request({ prompt, search = false, jsonSchema, signal, allowUncitedSearchResponse = false, maxOutputTokens, timeoutMs = 120000 }) {
    const config = await options.getConfig();
    if (!config?.apiKey || !config?.model) throw geoError("GEO_CONFIG_REQUIRED");
    if (maxOutputTokens !== undefined && (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 128000)) throw geoError("GEO_REQUEST_INVALID");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) throw geoError("GEO_REQUEST_INVALID");
    const endpoint = normalizeGeoBaseUrl(config.baseUrl) + "/responses";
    if (search && config.webSearch === false) throw geoError("GEO_SEARCH_DISABLED");
    const timeout = AbortSignal.timeout(timeoutMs);
    let response;
    let data;
    try {
      response = await transport(endpoint, {
        method: "POST", redirect: "error",
        headers: { Authorization: "Bearer " + config.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.model, store: false, input: [{ role: "user", content: prompt }], ...(search ? { tools: [{ type: "web_search", max_keyword: 2 }] } : {}), ...(jsonSchema ? { text: { format: { type: "json_schema", name: "customer_research", schema: jsonSchema, strict: true } } } : {}), ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}) }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) throw geoError(response.status === 401 ? "GEO_AUTH_REJECTED" : response.status === 403 ? "GEO_PERMISSION_DENIED" : [400, 404, 422].includes(response.status) ? "GEO_CAPABILITY_REJECTED" : "GEO_REQUEST_FAILED");
      data = await response.json();
    } catch (error) {
      if (signal?.aborted) throw geoError("GEO_CANCELLED");
      if (error?.code?.startsWith("GEO_")) throw error;
      if (timeout.aborted) throw geoError("GEO_REQUEST_TIMEOUT");
      throw geoError("GEO_REQUEST_UNCERTAIN");
    }
    if (data.status && data.status !== "completed") {
      const error = geoError("GEO_RESPONSE_INCOMPLETE");
      const reason = data.incomplete_details?.reason;
      error.incompleteReason = ["max_output_tokens", "content_filter"].includes(reason) ? reason : reason == null ? "not_provided" : "unknown";
      throw error;
    }
    const output = [];
    const citations = [];
    for (const message of data.output || []) {
      if (message.type !== "message") continue;
      for (const part of message.content || []) {
        if (part.type !== "output_text") continue;
        if (typeof part.text === "string") output.push(part.text);
        for (const annotation of part.annotations || []) {
          if (annotation.type === "url_citation" && safeUrl(annotation.url) && typeof annotation.title === "string" && annotation.title.trim()) {
            citations.push({ title: annotation.title, url: annotation.url, ...(typeof annotation.summary === "string" ? { summary: annotation.summary } : {}) });
          }
        }
      }
    }
    if (!output.length) throw geoError("GEO_RESPONSE_INVALID");
    if (search && !citations.length && !allowUncitedSearchResponse) throw geoError("GEO_SEARCH_UNCONFIRMED");
    return { text: output.join("\n"), citations: [...new Map(citations.map(c => [c.url + "\0" + (c.summary || ""), c])).values()] };
  }
  return { request };
}
module.exports = { createDoubaoGeoClient };

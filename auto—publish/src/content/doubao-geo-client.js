"use strict";

const { geoError, safeUrl } = require("./geo-knowledge-schema");
const { normalizeGeoBaseUrl } = require("./doubao-geo-endpoint");

function createDoubaoGeoClient(options) {
  const transport = options.fetch || globalThis.fetch;
  async function request({ prompt, search = false, signal }) {
    const config = await options.getConfig();
    if (!config?.apiKey || !config?.model) throw geoError("GEO_CONFIG_REQUIRED");
    const endpoint = normalizeGeoBaseUrl(config.baseUrl) + "/responses";
    if (search && config.webSearch === false) throw geoError("GEO_SEARCH_DISABLED");
    const timeout = AbortSignal.timeout(120000);
    let response;
    let data;
    try {
      response = await transport(endpoint, {
        method: "POST", redirect: "error",
        headers: { Authorization: "Bearer " + config.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.model, store: false, input: [{ role: "user", content: prompt }], ...(search ? { tools: [{ type: "web_search", max_keyword: 2 }] } : {}) }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) throw geoError(response.status === 401 || response.status === 403 ? "GEO_CONFIG_REJECTED" : [400, 404, 422].includes(response.status) ? "GEO_CAPABILITY_REJECTED" : "GEO_REQUEST_FAILED");
      data = await response.json();
    } catch (error) {
      if (signal?.aborted) throw geoError("GEO_CANCELLED");
      if (error?.code?.startsWith("GEO_")) throw error;
      throw geoError("GEO_REQUEST_UNCERTAIN");
    }
    if (data.status && data.status !== "completed") throw geoError("GEO_RESPONSE_INCOMPLETE");
    const output = [];
    const citations = [];
    for (const message of data.output || []) {
      if (message.type !== "message") continue;
      for (const part of message.content || []) {
        if (part.type !== "output_text") continue;
        if (typeof part.text === "string") output.push(part.text);
        for (const annotation of part.annotations || []) {
          if (annotation.type === "url_citation" && safeUrl(annotation.url) && typeof annotation.title === "string" && annotation.title.trim()) {
            citations.push({ title: annotation.title, url: annotation.url });
          }
        }
      }
    }
    if (!output.length) throw geoError("GEO_RESPONSE_INVALID");
    if (search && !citations.length) throw geoError("GEO_SEARCH_UNCONFIRMED");
    return { text: output.join("\n"), citations: [...new Map(citations.map(c => [c.url, c])).values()] };
  }
  return { request };
}
module.exports = { createDoubaoGeoClient };

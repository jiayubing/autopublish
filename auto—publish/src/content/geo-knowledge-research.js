"use strict";
const { geoError } = require("./geo-knowledge-schema");
const DEFAULT_RESEARCH_PROMPT =
  "优先研究客户实体本身及其公开可核验信息；行业背景只作少量补充。保持客观，不编造，不把营销自述写成独立结论。";

function createRequestBudget(
  request,
  { hardLimit = 18, synthesisReserve = 2 } = {},
) {
  let count = 0;
  async function budgetedRequest(input, { useReserve = false } = {}) {
    const limit = useReserve ? hardLimit : hardLimit - synthesisReserve;
    if (count >= limit) throw geoError("GEO_REQUEST_BUDGET_EXHAUSTED");
    count++;
    return request(input);
  }
  return {
    request: budgetedRequest,
    snapshot: () => ({
      count,
      hardLimit,
      synthesisReserve,
      optionalRemaining: Math.max(0, hardLimit - synthesisReserve - count),
    }),
  };
}

function parseJsonObject(value) {
  if (typeof value !== "string" || !value.trim())
    throw geoError("GEO_SCHEMA_INVALID");
  const trimmed = repairObjectKeys(value.trim());
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  const candidates = fenced ? [fenced[1]] : [trimmed];
  if (!fenced) {
    let start = -1;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < trimmed.length; index++) {
      const character = trimmed[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === "{") {
        if (depth === 0) start = index;
        depth++;
      } else if (character === "}" && depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) {
          candidates.push(trimmed.slice(start, index + 1));
          start = -1;
        }
      }
    }
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return parsed;
    } catch (_) {
      // Try the next complete object; never invent missing values or closing braces.
    }
  }
  throw geoError("GEO_SCHEMA_INVALID");
}

// Repair unquoted property names (including a missing opening quote) only
// outside strings. Text, references and values are preserved verbatim.
function repairObjectKeys(value) {
  let result = "";
  let quoted = false;
  let escaped = false;
  let previous = "";
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (quoted) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if ((previous === "{" || previous === ",") && /[A-Za-z_]/u.test(character)) {
      const key = value.slice(index).match(/^([A-Za-z_][A-Za-z0-9_]*)"?(\s*:)/u);
      if (key) {
        result += JSON.stringify(key[1]) + key[2];
        index += key[0].length - 1;
        previous = ":";
        continue;
      }
    }
    result += character;
    if (character === '"') quoted = true;
    if (!/\s/u.test(character)) previous = character;
  }
  return result;
}

module.exports = {
  DEFAULT_RESEARCH_PROMPT,
  createRequestBudget,
  parseJsonObject,
};

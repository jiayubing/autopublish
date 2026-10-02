"use strict";

function isUncertain(error) {
  if (!error) return false;
  if (["GENERATION_RESULT_UNCERTAIN", "AI_TIMEOUT", "AI_NETWORK_ERROR", "AI_SERVER_ERROR", "AI_REQUEST_FAILED", "ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "ETIMEDOUT", "EAI_AGAIN"].includes(error.code)) return true;
  return Number.isInteger(error.status) && error.status >= 500 && error.status <= 599;
}

module.exports = { isUncertain };

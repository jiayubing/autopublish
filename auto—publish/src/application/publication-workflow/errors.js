"use strict";

function uncertainError() {
  return {
    code: "PUBLISHER_RESULT_UNCERTAIN",
    category: "transport",
    retryability: "manual-check",
    userMessage: "无法确认远端投稿结果，请人工核对",
  };
}

function accountInspectionError() {
  const error = new Error("Current platform account could not be verified");
  error.code = "ACCOUNT_PROFILE_INSPECTION_UNVERIFIED";
  return error;
}

module.exports = { uncertainError, accountInspectionError };

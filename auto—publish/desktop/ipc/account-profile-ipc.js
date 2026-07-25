"use strict";

const { wrap } = require("../services/ipc-response");

function accountProfileInput(input) {
  const value = input || {};
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !["platformId", "displayName", "confirmed"].includes(key)) ||
      typeof value.platformId !== "string" || !value.platformId.trim() ||
      typeof value.displayName !== "string" || !value.displayName.trim() ||
      value.confirmed !== true) {
    const error = new Error("Platform account confirmation is required");
    error.code = "ACCOUNT_PROFILE_CONFIRMATION_REQUIRED";
    throw error;
  }
  return { platformId: value.platformId, displayName: value.displayName };
}

function registerAccountProfileIpc(deps) {
  const value = deps || {};
  const store = value.operationalStore;
  if (!store || typeof store.createAccountProfile !== "function") {
    const error = new Error("Operational account profile store is required");
    error.code = "OPERATIONAL_STORE_REQUIRED";
    throw error;
  }
  value.ipcMain.handle("platforms:confirm-account-profile", function(event, input) {
    return wrap(function() { return store.createAccountProfile(accountProfileInput(input)); });
  });
  return { create: function(input) { return store.createAccountProfile(accountProfileInput(input)); } };
}

module.exports = { registerAccountProfileIpc, accountProfileInput };

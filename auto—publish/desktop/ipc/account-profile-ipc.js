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
  if (!store || typeof store.createAccountProfile !== "function" || typeof store.listAccountProfiles !== "function") {
    const error = new Error("Operational account profile store is required");
    error.code = "OPERATIONAL_STORE_REQUIRED";
    throw error;
  }
  value.ipcMain.handle("platforms:list-account-profiles", function(event, input) {
    return wrap(function() {
      if (input !== undefined) {
        const error = new Error("Account profile query does not accept input");
        error.code = "ACCOUNT_PROFILE_QUERY_INVALID";
        throw error;
      }
      return store.listAccountProfiles();
    });
  });
  value.ipcMain.handle("platforms:confirm-account-profile", function(event, input) {
    return wrap(function() { return store.createAccountProfile(accountProfileInput(input)); });
  });
  return {
    list: function() { return store.listAccountProfiles(); },
    create: function(input) { return store.createAccountProfile(accountProfileInput(input)); }
  };
}

module.exports = { registerAccountProfileIpc, accountProfileInput };

"use strict";

const { wrap } = require("../services/ipc-response");

function accountProfileInput(input) {
  const value = input || {};
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !["platformId", "displayName", "confirmed"].includes(key),
    ) ||
    typeof value.platformId !== "string" ||
    !value.platformId.trim() ||
    typeof value.displayName !== "string" ||
    !value.displayName.trim() ||
    value.confirmed !== true
  ) {
    const error = new Error("Platform account confirmation is required");
    error.code = "ACCOUNT_PROFILE_CONFIRMATION_REQUIRED";
    throw error;
  }
  return {
    platformId: value.platformId.trim(),
    displayName: value.displayName.trim(),
  };
}

function existingProfileInput(input, errorCode) {
  const value = input || {};
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !["accountProfileId", "confirmed"].includes(key),
    ) ||
    typeof value.accountProfileId !== "string" ||
    !value.accountProfileId.trim() ||
    value.confirmed !== true
  ) {
    const error = new Error(errorCode);
    error.code = errorCode;
    throw error;
  }
  return { accountProfileId: value.accountProfileId.trim() };
}

function registerAccountProfileIpc(deps) {
  const value = deps || {};
  const store = value.operationalStore;
  const unavailable = function () {
    const error = new Error("Platform account profile service is required");
    error.code = "PLATFORM_ACCOUNT_PROFILE_SERVICE_REQUIRED";
    throw error;
  };
  const service = value.platformAccountProfileService ||
    (store && typeof store.listAccountProfiles === "function"
      ? Object.freeze({
          list: function () {
            return store.listAccountProfiles().map(function (profile) {
              return Object.freeze({ ...profile, bindingStatus: "unbound" });
            });
          },
          createAndBind: unavailable,
          bindExisting: unavailable,
          delete: unavailable,
        })
      : null);
  if (
    !service ||
    typeof service.list !== "function" ||
    typeof service.createAndBind !== "function" ||
    typeof service.bindExisting !== "function" ||
    typeof service.delete !== "function"
  )
    unavailable();
  value.ipcMain.handle("platforms:list-account-profiles", function (event, input) {
    return wrap(function () {
      if (input !== undefined) {
        const error = new Error("Account profile query does not accept input");
        error.code = "ACCOUNT_PROFILE_QUERY_INVALID";
        throw error;
      }
      return { profiles: service.list() };
    });
  });
  value.ipcMain.handle("platforms:confirm-account-profile", function (event, input) {
    return wrap(async function () {
      return { profile: await service.createAndBind(accountProfileInput(input)) };
    });
  });
  value.ipcMain.handle("platforms:bind-account-profile", function (event, input) {
    return wrap(async function () {
      return {
        profile: await service.bindExisting(
          existingProfileInput(input, "ACCOUNT_PROFILE_BIND_CONFIRMATION_REQUIRED"),
        ),
      };
    });
  });
  value.ipcMain.handle("platforms:delete-account-profile", function (event, input) {
    return wrap(function () {
      const profile = service.delete(
        existingProfileInput(input, "ACCOUNT_PROFILE_DELETE_CONFIRMATION_REQUIRED"),
      );
      return { accountProfileId: profile.accountProfileId };
    });
  });
  return Object.freeze({
    list: function () {
      return service.list();
    },
    create: function (input) {
      return service.createAndBind(accountProfileInput(input));
    },
    bind: function (input) {
      return service.bindExisting(
        existingProfileInput(input, "ACCOUNT_PROFILE_BIND_CONFIRMATION_REQUIRED"),
      );
    },
    delete: function (input) {
      return service.delete(
        existingProfileInput(input, "ACCOUNT_PROFILE_DELETE_CONFIRMATION_REQUIRED"),
      );
    },
  });
}

module.exports = {
  registerAccountProfileIpc,
  accountProfileInput,
  existingProfileInput,
};

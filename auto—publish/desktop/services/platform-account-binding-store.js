"use strict";

const fs = require("node:fs");
const path = require("node:path");

function valid(value, pattern) {
  return typeof value === "string" && pattern.test(value);
}

function createPlatformAccountBindingStore(options) {
  const value = options || {};
  const io = value.fs || fs;
  const pathApi = value.path || path;
  const root =
    typeof value.localStateRoot === "string" && value.localStateRoot
      ? pathApi.resolve(value.localStateRoot)
      : "";
  const filename = root && pathApi.join(root, "platform-account-bindings.json");
  if (!filename)
    throw new Error("Platform account binding storage requires local state");

  function read() {
    let stat;
    try {
      stat = io.lstatSync(filename);
    } catch (error) {
      if (error && error.code === "ENOENT") return {};
      throw new Error("Platform account binding storage is unreadable");
    }
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("Platform account binding storage is unsafe");
    let parsed;
    try {
      parsed = JSON.parse(io.readFileSync(filename, "utf8"));
    } catch (_) {
      throw new Error("Platform account binding storage is invalid");
    }
    if (
      !parsed ||
      parsed.version !== 1 ||
      !parsed.bindings ||
      typeof parsed.bindings !== "object" ||
      Array.isArray(parsed.bindings)
    ) {
      throw new Error("Platform account binding storage is invalid");
    }
    return parsed.bindings;
  }
  function assertDestinationSafe() {
    try {
      const stat = io.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error("Platform account binding storage is unsafe");
    } catch (error) {
      if (error && error.code === "ENOENT") return;
      if (
        error &&
        error.message === "Platform account binding storage is unsafe"
      )
        throw error;
      throw new Error("Platform account binding storage is unreadable");
    }
  }
  function write(bindings) {
    io.mkdirSync(root, { recursive: true });
    const temporary = `${filename}.tmp-${process.pid}`;
    let renamed = false;
    try {
      io.writeFileSync(
        temporary,
        JSON.stringify({ version: 1, bindings }, null, 2),
        { encoding: "utf8", mode: 0o600 },
      );
      assertDestinationSafe();
      io.renameSync(temporary, filename);
      renamed = true;
    } finally {
      if (!renamed) {
        try {
          io.unlinkSync(temporary);
        } catch (_) {}
      }
    }
  }
  return Object.freeze({
    get: function (accountProfileId) {
      let entry;
      try {
        entry = read()[accountProfileId];
      } catch (_) {
        return null;
      }
      return entry &&
        valid(entry.platformId, /^[a-z][a-z0-9-]{0,63}$/) &&
        valid(entry.remoteFingerprint, /^[a-f0-9]{64}$/)
        ? Object.freeze({
            platformId: entry.platformId,
            remoteFingerprint: entry.remoteFingerprint,
          })
        : null;
    },
    bind: function (input) {
      const item = input || {};
      if (
        !valid(item.accountProfileId, /^account-[a-z0-9-]{1,128}$/) ||
        !valid(item.platformId, /^[a-z][a-z0-9-]{0,63}$/) ||
        !valid(item.remoteFingerprint, /^[a-f0-9]{64}$/)
      )
        throw new Error("Platform account binding is invalid");
      const bindings = read();
      bindings[item.accountProfileId] = {
        platformId: item.platformId,
        remoteFingerprint: item.remoteFingerprint,
      };
      write(bindings);
      return Object.freeze({
        platformId: item.platformId,
        remoteFingerprint: item.remoteFingerprint,
      });
    },
  });
}

module.exports = { createPlatformAccountBindingStore };

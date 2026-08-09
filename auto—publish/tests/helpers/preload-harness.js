"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const {
  productionIpcRegistry,
} = require("../../desktop/ipc/contracts/production-registry");

function loadPreloadHarness(options = {}) {
  const exposed = {};
  const transportCalls = [];
  const transportListeners = new Map();
  const invoke =
    options.invoke ||
    ((channel) => {
      const contract = productionIpcRegistry.byChannel(channel);
      if (!contract || contract.kind === "event") return undefined;
      return productionIpcRegistry.failure(contract, { code: "IPC_INTERNAL" });
    });

  const contextBridge = {
    exposeInMainWorld(name, value) {
      exposed[name] = value;
    },
  };
  const ipcRenderer = {
    invoke(channel, input) {
      transportCalls.push([channel, input]);
      return Promise.resolve().then(() => invoke(channel, input));
    },
    on(channel, listener) {
      let listeners = transportListeners.get(channel);
      if (!listeners) {
        listeners = new Set();
        transportListeners.set(channel, listeners);
      }
      listeners.add(listener);
      return undefined;
    },
    removeListener(channel, listener) {
      const listeners = transportListeners.get(channel);
      if (!listeners) return undefined;
      listeners.delete(listener);
      if (listeners.size === 0) transportListeners.delete(channel);
      return undefined;
    },
  };

  const source = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "desktop", "preload.js"),
    "utf8",
  );
  const filename = path.resolve(__dirname, "..", "..", "desktop", "preload.js");
  const load = new vm.Script(`(function(require) {\n${source}\n})`, {
    filename,
  }).runInThisContext();
  load(function require(name) {
    if (name === "electron") return { contextBridge, ipcRenderer };
    if (name === "./ipc/contracts/production-registry")
      return { productionIpcRegistry };
    throw new Error(`Unexpected preload dependency: ${name}`);
  });

  return {
    api: exposed.desktopConsole,
    exposed,
    transportCalls,
    transportListeners,
    emit(channel, payload) {
      for (const listener of transportListeners.get(channel) || [])
        listener(undefined, payload);
    },
  };
}

module.exports = { loadPreloadHarness };

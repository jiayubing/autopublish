function registerIpc(deps) {
  require("./batch-ipc").registerBatchIpc(deps);
  require("./media-ipc").registerMediaIpc(deps);
  require("./platform-ipc").registerPlatformIpc(deps);
}

module.exports = { registerIpc };

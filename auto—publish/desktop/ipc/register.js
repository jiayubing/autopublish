function registerIpc(deps) {
  require("./batch-ipc").registerBatchIpc(deps);
  require("./media-ipc").registerMediaIpc(deps);
  require("./platform-ipc").registerPlatformIpc(deps);
  require("./ai-content-ipc").registerAiContentIpc(deps);
}

module.exports = { registerIpc };

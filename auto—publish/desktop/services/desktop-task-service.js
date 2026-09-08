const path = require("node:path");
const { createPlatformTaskStateStore } = require("./platform-task-state-store");

// The desktop bootstrap only needs the durable task snapshot. Platform
// submission execution now belongs to the regular queue application.
function createDesktopTaskService(options) {
  const values = options || {};
  const paths = values.paths || {};
  const store = createPlatformTaskStateStore({
    persistedSnapshotPath: paths.localState
      ? path.join(paths.localState, "platform-task-snapshot.json")
      : null,
  });

  return Object.freeze({
    getState: store.getSnapshot,
    dispose: function () {},
  });
}

module.exports = { createDesktopTaskService };

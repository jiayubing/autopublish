const { it } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const childProcess = require("node:child_process");
const path = require("node:path");

const { createDesktopTaskService } = require("../desktop/services/desktop-task-service");

it("passes complete storage paths to desktop workers and keeps worker config portable", async function() {
  const paths = {
    contentLibrary: "C:\\portable-content",
    localState: "C:\\local-state",
    input: "C:\\portable-content\\.autopublish\\input",
    data: "C:\\portable-content\\.autopublish\\data",
    published: "C:\\portable-content\\.autopublish\\published",
    failed: "C:\\portable-content\\.autopublish\\failed",
    tmp: "C:\\local-state\\tmp",
    logs: "C:\\local-state\\logs",
    browser: "C:\\local-state\\browser",
    doubaoBrowser: "C:\\local-state\\browser\\doubao"
  };
  const calls = [];
  function fakeFork(script, args, forkOptions) {
    calls.push({ script, args, options: forkOptions });
    const child = new EventEmitter();
    child.send = function() {};
    process.nextTick(function() {
      child.emit("message", { type: "result", payload: { ok: true, data: {} } });
      child.emit("exit", 0);
    });
    return child;
  }

  const service = createDesktopTaskService({ cwd: paths.contentLibrary, paths: paths, fork: fakeFork });
  await service.startBatch({ interactive: false });

  const first = calls[0];
  assert.equal(first.options.env.AUTO_PUBLISH_WORKSPACE, paths.contentLibrary);
  assert.equal(first.options.env.AUTO_PUBLISH_INPUT_DIR, paths.input);
  assert.equal(first.options.env.AUTO_PUBLISH_LOGS_DIR, paths.logs);
  assert.equal(first.options.env.AUTO_PUBLISH_PLAYWRIGHT_HOME, paths.browser);
  assert.equal(first.options.env.AUTO_PUBLISH_PLAYWRIGHT_PROFILE_DIR, paths.doubaoBrowser);
  assert.deepEqual(JSON.parse(first.args[1]).paths, paths);
});

it("derives worker directories from explicit environment paths", function() {
  const project = path.resolve(__dirname, "..");
  const result = childProcess.spawnSync(process.execPath, ["-e", [
    "const c=require('./scripts/config');",
    "process.stdout.write(JSON.stringify({input:c.DIRS.inputDir,logs:c.DIRS.logsDir,home:c.PW.home,profile:c.PW.profileDir}));"
  ].join("")], {
    cwd: project,
    env: Object.assign({}, process.env, {
      AUTO_PUBLISH_WORKSPACE: "C:\\portable-content",
      AUTO_PUBLISH_INPUT_DIR: "C:\\portable-content\\.autopublish\\input",
      AUTO_PUBLISH_LOGS_DIR: "C:\\local-state\\logs",
      AUTO_PUBLISH_PLAYWRIGHT_HOME: "C:\\local-state\\browser",
      AUTO_PUBLISH_PLAYWRIGHT_PROFILE_DIR: "C:\\local-state\\browser\\doubao"
    }),
    encoding: "utf8"
  });

  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    input: "C:\\portable-content\\.autopublish\\input",
    logs: "C:\\local-state\\logs",
    home: "C:\\local-state\\browser",
    profile: "C:\\local-state\\browser\\doubao"
  });
});

const { it } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const childProcess = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

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

it("closes every platform session with the resolved bundled Node and CLI", async function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autopublish-task-runtime-"));
  const node = path.join(root, "tools", "node.exe");
  const cli = path.join(root, "playwright-cli.js");
  fs.mkdirSync(path.dirname(node), { recursive: true });
  fs.writeFileSync(node, "node", "utf8");
  fs.writeFileSync(cli, "cli", "utf8");
  const paths = {
    installation: root,
    contentLibrary: path.join(root, "content"),
    localState: path.join(root, "local"),
    browser: path.join(root, "local", "browser"),
    playwrightNodeExecPath: node,
    playwrightCliJs: cli,
    browserChannel: "msedge"
  };
  const calls = [];
  let worker;
  function fakeFork() {
    worker = new EventEmitter();
    worker.send = function() {};
    worker.kill = function() {};
    return worker;
  }
  function fakeExecFile(file, args, options, callback) {
    calls.push({ file, args, options });
    callback(null, "", "");
  }
  try {
    const service = createDesktopTaskService({ cwd: paths.contentLibrary, paths, fork: fakeFork, execFile: fakeExecFile });
    const pending = service.startPlatformSubmit({ tasks: [{ id: "task-1" }] });
    await new Promise((resolve) => setImmediate(resolve));
    service.pausePlatformSubmit();
    await pending;
    assert.equal(calls.length, 3);
    calls.forEach(function(call) {
      assert.equal(call.file, node);
      assert.deepEqual(call.args.slice(0, 2), [cli, "-s=" + call.args[1].slice(3)]);
      assert.equal(call.args[2], "close");
      assert.match(call.options.env.PLAYWRIGHT_DAEMON_SESSION_DIR, /sessions[\\/]((lieju|toutiao|hepan))$/);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");

const { createHepanAdapter, cleanupExpiredHepanPayloads } = require("../src/platforms/hepan/adapter");

function tempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-hepan-contract-"));
}

function configuredRuntime(root) {
  const cookiePath = path.join(root, "cookie.txt");
  fs.writeFileSync(cookiePath, "fixture-cookie", "utf8");
  return { pythonPath: "fixture-python", cookiePath, categoryId: 121, vendorDir: "" };
}

function createDeferredChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killCalls = 0;
  child.kill = () => {
    child.killCalls += 1;
    return true;
  };
  child.close = (status) => child.emit("close", status);
  return child;
}

describe("Hepan publish payload contract", () => {
  it("projects a verified account identity from the read-only login check", async () => {
    const root = tempDirectory();
    try {
      const runtime = configuredRuntime(root);
      const calls = [];
      const adapter = createHepanAdapter({
        runtime,
        runCommand: (command, args) => {
          calls.push({ command, args: args.slice() });
          return {
            status: 0,
            stdout: JSON.stringify({
              ok: true,
              authenticated: true,
              account: { displayName: "fixture-user", uid: "2093208" },
            }),
            stderr: "",
          };
        },
      });

      assert.deepEqual(await adapter.inspectAccount(), {
        verified: true,
        remoteAccountId: "2093208",
        displayName: "fixture-user",
      });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].command, runtime.pythonPath);
      assert.equal(calls[0].args.includes("--check-login"), true);
      assert.equal(
        calls[0].args[calls[0].args.indexOf("--cookie-path") + 1],
        runtime.cookiePath,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reclaims only expired owned payloads after an interrupted worker", () => {
    const root = tempDirectory();
    try {
      const tempDir = path.join(root, "tmp");
      fs.mkdirSync(tempDir);
      const expired = path.join(tempDir, ".hepan-payload-11111111-1111-1111-1111-111111111111.json");
      const fresh = path.join(tempDir, ".hepan-payload-22222222-2222-2222-2222-222222222222.json");
      const unknown = path.join(tempDir, ".hepan-payload-not-owned.json");
      fs.writeFileSync(expired, "{}", { mode: 0o600 });
      fs.writeFileSync(fresh, "{}", { mode: 0o600 });
      fs.writeFileSync(unknown, "preserve");
      const now = Date.now();
      fs.utimesSync(expired, new Date(now - 172800000), new Date(now - 172800000));
      const result = cleanupExpiredHepanPayloads({ tempDir, now: () => now, maxAgeMs: 86400000 });
      assert.deepEqual(result.removed, [path.basename(expired)]);
      assert.equal(fs.existsSync(expired), false);
      assert.equal(fs.existsSync(fresh), true);
      assert.equal(fs.existsSync(unknown), true);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("passes Markdown/TXT through a random temporary JSON payload and always removes it", async () => {
    const root = tempDirectory();
    const calls = [];
    try {
      const inputDir = path.join(root, "input");
      const tempDir = path.join(root, "tmp");
      fs.mkdirSync(inputDir, { recursive: true });
      const sourceFile = path.join(inputDir, "river.md");
      fs.writeFileSync(sourceFile, "# 河畔标题\n\n正文", "utf8");
      const bundledVendorDir = path.resolve(__dirname, "..", "resources", "hepan", "vendor-pure");
      const adapter = createHepanAdapter({
        inputDir,
        imageDir: path.join(root, "images"),
        tempDir,
        runtime: configuredRuntime(root),
        runCommand: (command, args, options) => {
          calls.push({ command, args: args.slice() });
          assert.equal(options.env.PYTHONPATH, bundledVendorDir);
          assert.equal(args[args.indexOf("--vendor-dir") + 1], bundledVendorDir);
          const payloadPath = args[args.indexOf("--payload-path") + 1];
          assert.equal(path.dirname(payloadPath), tempDir);
          assert.equal(fs.lstatSync(payloadPath).isFile(), true);
          const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
          assert.deepEqual(payload, { title: "河畔标题", contentHtml: "<p>正文</p>", sourceStem: "river" });
          return { status: 0, stdout: JSON.stringify({ ok: true, title: payload.title, url: "https://example.test/article/1" }) + "\n", stderr: "" };
        }
      });

      const article = (await adapter.parseArticleFiles([{ file: sourceFile, filename: "river.md", fileBaseName: "river" }]))[0];
      const result = await adapter.publishArticle(article);

      assert.equal(result.status, "accepted");
      assert.equal(calls.length, 1);
      assert.equal(calls[0].args.includes("--article"), false);
      assert.equal(fs.existsSync(tempDir) ? fs.readdirSync(tempDir).length : 0, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps DOCX on the --article path and does not create a JSON payload", async () => {
    const root = tempDirectory();
    try {
      const inputDir = path.join(root, "input");
      const tempDir = path.join(root, "tmp");
      fs.mkdirSync(inputDir, { recursive: true });
      const sourceFile = path.join(inputDir, "legacy.docx");
      fs.writeFileSync(sourceFile, "fixture docx", "utf8");
      const calls = [];
      const adapter = createHepanAdapter({
        inputDir,
        imageDir: path.join(root, "images"),
        tempDir,
        runtime: configuredRuntime(root),
        runCommand: (command, args) => {
          calls.push(args.slice());
          assert.equal(args[args.indexOf("--article") + 1], sourceFile);
          assert.equal(args.includes("--payload-path"), false);
          return { status: 0, stdout: '{"ok":true,"title":"Legacy","url":"https://example.test/article/2"}\n', stderr: "" };
        }
      });
      const article = { title: "Legacy", sourceFile, filename: "legacy.docx", sourceFormat: "docx", sourceStem: "legacy" };

      const result = await adapter.publishArticle(article);

      assert.equal(result.status, "accepted");
      assert.equal(calls.length, 1);
      assert.equal(fs.existsSync(tempDir), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("maps payload validation failures to stable safe outcomes and cleans after runner errors", async () => {
    const root = tempDirectory();
    try {
      const inputDir = path.join(root, "input");
      fs.mkdirSync(inputDir, { recursive: true });
      const sourceFile = path.join(inputDir, "bad.md");
      fs.writeFileSync(sourceFile, "# title\n\nbody", "utf8");
      const adapter = createHepanAdapter({
        inputDir,
        tempDir: path.join(root, "tmp"),
        runtime: configuredRuntime(root),
        runCommand: () => ({ status: 1, stdout: JSON.stringify({ ok: false, errorCode: "HEPAN_PAYLOAD_JSON_INVALID", error: "Hepan payload JSON is invalid" }), stderr: "secret body should not be logged" })
      });
      const article = (await adapter.parseArticleFiles([{ file: sourceFile, filename: "bad.md", fileBaseName: "bad" }]))[0];

      const result = await adapter.publishArticle(article);

      assert.deepEqual(result, { status: "group_blocked", errorCode: "HEPAN_PAYLOAD_JSON_INVALID" });
      assert.equal(fs.existsSync(path.join(root, "tmp")), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps local payload runtime, remote rejection, and uncertain outcomes distinct", async () => {
    const scenarios = [
      {
        response: { status: 1, stdout: JSON.stringify({ ok: false, errorCode: "HEPAN_PAYLOAD_RUNTIME_FAILED", error: "Hepan payload runtime failed" }) },
        expected: { status: "group_blocked", errorCode: "HEPAN_PAYLOAD_RUNTIME_FAILED" }
      },
      {
        response: { status: 1, stdout: JSON.stringify({ ok: false, errorCode: "HEPAN_REMOTE_REQUEST_FAILED", error: "Hepan remote request failed" }) },
        expected: { status: "uncertain", errorCode: "HEPAN_REMOTE_REQUEST_FAILED" }
      },
      {
        response: new Error("transport did not return a result"),
        expected: { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" }
      }
    ];

    for (const scenario of scenarios) {
      const root = tempDirectory();
      try {
        const inputDir = path.join(root, "input");
        const sourceFile = path.join(inputDir, "river.md");
        const cookiePath = path.join(root, "cookie.txt");
        fs.mkdirSync(inputDir, { recursive: true });
        fs.writeFileSync(sourceFile, "# 标题\n\n正文", "utf8");
        fs.writeFileSync(cookiePath, "fixture-cookie", "utf8");
        const adapter = createHepanAdapter({
          inputDir,
          tempDir: path.join(root, "tmp"),
          runtime: { pythonPath: "fixture-python", cookiePath, categoryId: 121, vendorDir: "" },
          runCommand: () => {
            if (scenario.response instanceof Error) throw scenario.response;
            return scenario.response;
          }
        });
        const article = (await adapter.parseArticleFiles([{ file: sourceFile, filename: "river.md", fileBaseName: "river" }]))[0];

        assert.deepEqual(await adapter.publishArticle(article), scenario.expected);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it("default runner keeps the payload until an aborted child closes, then cleans up exactly once", async () => {
    const root = tempDirectory();
    const originalClearTimeout = global.clearTimeout;
    const originalUnlinkSync = fs.unlinkSync;
    try {
      const inputDir = path.join(root, "input");
      const tempDir = path.join(root, "tmp");
      fs.mkdirSync(inputDir, { recursive: true });
      const sourceFile = path.join(inputDir, "river.md");
      fs.writeFileSync(sourceFile, "# 标题\n\n正文", "utf8");
      const controller = new AbortController();
      const child = createDeferredChild();
      let clearTimerCalls = 0;
      let addAbortListenerCalls = 0;
      let removeAbortListenerCalls = 0;
      let payloadCleanupCalls = 0;
      const addEventListener = controller.signal.addEventListener.bind(controller.signal);
      const removeEventListener = controller.signal.removeEventListener.bind(controller.signal);
      global.clearTimeout = (timer) => {
        clearTimerCalls += 1;
        return originalClearTimeout(timer);
      };
      controller.signal.addEventListener = (type, listener, options) => {
        if (type === "abort") addAbortListenerCalls += 1;
        return addEventListener(type, listener, options);
      };
      controller.signal.removeEventListener = (type, listener, options) => {
        if (type === "abort") removeAbortListenerCalls += 1;
        return removeEventListener(type, listener, options);
      };
      fs.unlinkSync = (filename, options) => {
        if (path.dirname(filename) === tempDir) payloadCleanupCalls += 1;
        return originalUnlinkSync(filename, options);
      };
      const adapter = createHepanAdapter({
        inputDir,
        tempDir,
        runtime: configuredRuntime(root),
        spawnProcess: () => child,
      });
      const article = (await adapter.parseArticleFiles([{ file: sourceFile, filename: "river.md", fileBaseName: "river" }]))[0];
      let settled = false;
      const pending = adapter.publishArticle(article, { signal: controller.signal }).then((result) => {
        settled = true;
        return result;
      });
      controller.abort("operator");
      await Promise.resolve();
      assert.equal(settled, false);
      assert.equal(fs.readdirSync(tempDir).length, 1);
      assert.equal(child.killCalls, 1);

      child.close(1);

      assert.deepEqual(await pending, { status: "uncertain", errorCode: "HEPAN_PROCESS_ABORTED" });
      assert.equal(fs.existsSync(tempDir) ? fs.readdirSync(tempDir).length : 0, 0);
      assert.equal(clearTimerCalls, 1);
      assert.equal(addAbortListenerCalls, 1);
      assert.equal(removeAbortListenerCalls, 1);
      assert.equal(payloadCleanupCalls, 1);
    } finally {
      global.clearTimeout = originalClearTimeout;
      fs.unlinkSync = originalUnlinkSync;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("default runner waits for a timed-out child to close before uncertain outcome and payload cleanup", async () => {
    const root = tempDirectory();
    const originalSetTimeout = global.setTimeout;
    try {
      const inputDir = path.join(root, "input");
      fs.mkdirSync(inputDir, { recursive: true });
      const sourceFile = path.join(inputDir, "river.md");
      fs.writeFileSync(sourceFile, "# 标题\n\n正文", "utf8");
      const child = createDeferredChild();
      let timerCalls = 0;
      global.setTimeout = (callback, ms) => {
        if (ms === 240000 && timerCalls++ === 0) return originalSetTimeout(callback, 10);
        return originalSetTimeout(callback, ms);
      };
      const tempDir = path.join(root, "tmp");
      const adapter = createHepanAdapter({ inputDir, tempDir, runtime: configuredRuntime(root), spawnProcess: () => child });
      const article = (await adapter.parseArticleFiles([{ file: sourceFile, filename: "river.md", fileBaseName: "river" }]))[0];
      let settled = false;
      const pending = adapter.publishArticle(article).then((value) => { settled = true; return value; });
      await new Promise((resolve) => originalSetTimeout(resolve, 30));
      assert.equal(settled, false);
      assert.equal(fs.readdirSync(tempDir).length, 1);
      assert.equal(child.killCalls, 1);
      child.close(1);
      assert.deepEqual(await pending, { status: "uncertain", errorCode: "HEPAN_PROCESS_TIMEOUT" });
      assert.equal(fs.existsSync(tempDir) ? fs.readdirSync(tempDir).length : 0, 0);
    } finally { global.setTimeout = originalSetTimeout; fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("default runner abort terminates a real Windows Node child and removes the payload", async () => {
    const root = tempDirectory();
    try {
      const inputDir = path.join(root, "input");
      fs.mkdirSync(inputDir, { recursive: true });
      const sourceFile = path.join(inputDir, "river.md");
      const childScript = path.join(root, "slow-abort-child.js");
      fs.writeFileSync(sourceFile, "# 标题\n\n正文", "utf8");
      fs.writeFileSync(childScript, "setInterval(() => {}, 1000);", "utf8");
      const tempDir = path.join(root, "tmp");
      const controller = new AbortController();
      const adapter = createHepanAdapter({ inputDir, tempDir, scriptPath: childScript, runtime: { pythonPath: process.execPath, cookiePath: configuredRuntime(root).cookiePath, categoryId: 121, vendorDir: "" } });
      const article = (await adapter.parseArticleFiles([{ file: sourceFile, filename: "river.md", fileBaseName: "river" }]))[0];
      const pending = adapter.publishArticle(article, { signal: controller.signal });
      await new Promise((resolve) => setTimeout(resolve, 200));
      controller.abort();
      assert.deepEqual(await pending, { status: "uncertain", errorCode: "HEPAN_PROCESS_ABORTED" });
      assert.equal(fs.existsSync(tempDir) ? fs.readdirSync(tempDir).length : 0, 0);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createDoubaoBrowserAdapter, inspectPageScript } = require("../src/content/doubao-browser-adapter");

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "doubao", name), "utf8"));
}

const completeFixture = loadFixture("complete-answer.json");
const currentMessageFixture = loadFixture("current-message-structure.json");
const currentMessageWithoutReferences = JSON.parse(JSON.stringify(currentMessageFixture));
currentMessageWithoutReferences.messageCandidates[1].references = [];
const loginFixture = loadFixture("login-required.json");
const challengeFixture = loadFixture("challenge.json");
const pageErrorFixture = { inputAvailable: true, errorText: "page load failed", messages: [] };
const streamingFixture = loadFixture("streaming-answer.json");
const fixtureQuestion = completeFixture.messages.find(function(message) { return message.role === "user"; }).text;

function fakeRuntime(snapshot, calls) {
  return {
    open: async function(input) { calls.push(["open", input]); },
    evaluate: async function(input) {
      calls.push(["evaluate", input]);
      if (input.action === "send-question") return { ok: true };
      return snapshot;
    },
    close: async function(input) { calls.push(["close", input]); }
  };
}

function domNode(options) {
  const opts = options || {};
  const attributes = Object.assign({}, opts.attributes || {});
  const node = {
    tagName: opts.tagName || "DIV",
    className: opts.className || "",
    innerText: opts.text || "",
    textContent: opts.text || "",
    parentElement: null,
    getAttribute: function(name) { return attributes[name] || null; },
    querySelectorAll: function(selector) { return selector === "a[href]" ? (opts.links || []) : []; },
    getBoundingClientRect: function() { return opts.rect || { width: 100, height: 20 }; }
  };
  let parent = node;
  (opts.ancestorClassNames || []).forEach(function(className) {
    const ancestor = {
      className: className,
      parentElement: null,
      getAttribute: function(name) { return name === "class" ? className : null; }
    };
    parent.parentElement = ancestor;
    parent = ancestor;
  });
  return node;
}

async function evaluateInspectScript(options) {
  const opts = options || {};
  const document = {
    body: { innerText: opts.bodyText || "" },
    querySelector: function() { return null; },
    querySelectorAll: function(selector) {
      if (selector === "[data-message-id]") return opts.messageNodes || [];
      if (selector.indexOf(", a") !== -1) return opts.controls || [];
      if (selector.indexOf("[aria-label]") !== -1) return opts.controls || [];
      if (selector.indexOf("button") !== -1) {
        return (opts.controls || []).filter(function(node) {
          return node.tagName === "BUTTON" || node.getAttribute("role") === "button";
        });
      }
      return [];
    }
  };
  const window = {
    getComputedStyle: function(node) {
      return node.computedStyle || { display: "block", visibility: "visible", opacity: "1" };
    }
  };
  const page = { evaluate: async function(callback) { return callback(); } };
  const run = new Function("page", "document", "location", "window", "return (async function() {" + inspectPageScript() + "})();");
  return run(page, document, { href: "https://www.doubao.com/chat/current" }, window);
}

const temporaryDirectories = [];

function makeTemporaryDirectory(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(function() {
  while (temporaryDirectories.length) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe("Doubao browser adapter", { concurrency: false }, function() {
  it("exposes the visible mode, rejects hidden mode, and does not claim background support", async function() {
    const visible = createDoubaoBrowserAdapter({ runtime: fakeRuntime(completeFixture, []), mode: "visible" });
    assert.equal(visible.mode, "visible");
    assert.throws(function() {
      createDoubaoBrowserAdapter({ runtime: fakeRuntime(completeFixture, []), mode: "hidden" });
    }, function(error) { return error.code === "DOUBAO_BROWSER_MODE_INVALID"; });

    const background = createDoubaoBrowserAdapter({ runtime: fakeRuntime(completeFixture, []), mode: "background" });
    assert.equal(background.mode, "background");
    await assert.rejects(background.collect(fixtureQuestion), function(error) {
      return error.code === "DOUBAO_BACKGROUND_UNAVAILABLE";
    });
  });

  it("derives generating only from a visible stop control and scopes references to each message", async function() {
    const link = { href: "https://example.com/scoped", innerText: "公开资料", textContent: "公开资料" };
    const message = domNode({
      attributes: { "data-message-id": "message-001", "data-role": "assistant" },
      className: "message-content",
      ancestorClassNames: ["level-" + 1, "level-" + 2, "level-" + 3, "level-" + 4, "level-" + 5, "level-" + 6, "level-" + 7, "level-" + 8, "level-9"],
      text: "回答正文",
      links: [link]
    });
    const hiddenStop = domNode({ text: "停止生成" });
    hiddenStop.tagName = "BUTTON";
    hiddenStop.computedStyle = { display: "none", visibility: "hidden", opacity: "0" };
    const visibleStop = domNode({ tagName: "BUTTON", text: "停止生成" });
    const ariaOnlyStop = domNode({ attributes: { "aria-label": "停止生成" }, text: "停止生成" });
    const ariaHiddenAncestor = domNode({ attributes: { "aria-hidden": "true" } });
    const ariaHiddenStop = domNode({ tagName: "BUTTON", text: "停止生成" });
    ariaHiddenStop.parentElement = ariaHiddenAncestor;
    const cssHiddenAncestor = domNode({});
    cssHiddenAncestor.computedStyle = { display: "none", visibility: "hidden", opacity: "0" };
    const cssHiddenStop = domNode({ tagName: "BUTTON", text: "停止生成" });
    cssHiddenStop.parentElement = cssHiddenAncestor;

    const hiddenSnapshot = await evaluateInspectScript({
      bodyText: "回答正文中提到停止生成，但不是控件",
      messageNodes: [message],
      controls: [hiddenStop]
    });
    assert.equal(hiddenSnapshot.generating, false);

    const ariaOnlySnapshot = await evaluateInspectScript({
      bodyText: "回答正文中提到停止生成，但不是控件",
      messageNodes: [message],
      controls: [ariaOnlyStop]
    });
    assert.equal(ariaOnlySnapshot.generating, false);

    const ariaHiddenSnapshot = await evaluateInspectScript({
      messageNodes: [message],
      controls: [ariaHiddenStop]
    });
    assert.equal(ariaHiddenSnapshot.generating, false);

    const cssHiddenSnapshot = await evaluateInspectScript({
      messageNodes: [message],
      controls: [cssHiddenStop]
    });
    assert.equal(cssHiddenSnapshot.generating, false);

    const visibleSnapshot = await evaluateInspectScript({
      bodyText: "回答正文中提到停止生成，但不是控件",
      messageNodes: [message],
      controls: [visibleStop]
    });
    assert.equal(visibleSnapshot.generating, true);
    assert.equal(visibleSnapshot.messageCandidates.length, 1);
    assert.equal(visibleSnapshot.messageCandidates[0].ancestorClassNames.length, 8);
    assert.deepEqual(visibleSnapshot.messageCandidates[0].references, [
      { title: "公开资料", url: "https://example.com/scoped", snippet: "" }
    ]);
  });

  it("extracts references from an associated panel beside the message row only", async function() {
    const panelLink = { href: "https://example.com/panel", innerText: "关联资料", textContent: "关联资料" };
    const unrelatedLink = { href: "https://example.com/unrelated", innerText: "无关链接", textContent: "无关链接" };
    const row = domNode({ className: "v_list_row" });
    const panel = domNode({
      className: "reference-panel",
      attributes: { "data-reference-for": "message-assistant-002" },
      links: [panelLink],
      text: "参考资料"
    });
    const unrelated = domNode({ className: "reference-panel", links: [unrelatedLink] });
    const message = domNode({
      attributes: { "data-message-id": "message-assistant-002", "data-role": "assistant" },
      className: "assistant-content",
      text: "回答正文",
      links: []
    });
    message.parentElement = row;
    row.nextElementSibling = panel;
    panel.previousElementSibling = row;
    panel.nextElementSibling = unrelated;
    unrelated.previousElementSibling = panel;

    const snapshot = await evaluateInspectScript({ messageNodes: [message] });

    assert.deepEqual(snapshot.messageCandidates[0].references, [
      { title: "关联资料", url: "https://example.com/panel", snippet: "" }
    ]);
  });

  it("inspects only data-message-id nodes and exposes scoped diagnostic fields", async function() {
    const calls = [];
    const adapter = createDoubaoBrowserAdapter({
      runtime: fakeRuntime(currentMessageFixture, calls),
      sleep: async function() {}
    });

    await adapter.getLoginState();
    const script = calls.find(function(call) {
      return call[0] === "evaluate" && call[1].action === "inspect-page";
    })[1].script;

    assert.match(script, /data-message-id/);
    assert.match(script, /messageId/);
    assert.match(script, /className/);
    assert.match(script, /ancestorClassNames/);
    assert.match(script, /querySelectorAll\(['"]a\[href\]['"]\)/);
    assert.doesNotMatch(script, /outerHTML|document\.documentElement/);
    assert.doesNotMatch(script, /generating:\s*[^\n]*bodyText/);
  });

  it("normalizes the current raw snapshot and waits for two stable answers", async function() {
    const calls = [];
    let inspectCount = 0;
    let elapsed = 0;
    const currentMessageBeforeAnswer = JSON.parse(JSON.stringify(currentMessageWithoutReferences));
    currentMessageBeforeAnswer.messageCandidates = currentMessageBeforeAnswer.messageCandidates.filter(function(candidate) {
      return candidate.messageId === "message-user-001";
    });
    const adapter = createDoubaoBrowserAdapter({
      runtime: {
        open: async function(input) { calls.push(["open", input]); },
        evaluate: async function(input) {
          calls.push(["evaluate", input]);
          if (input.action === "send-question") return { ok: true };
          inspectCount += 1;
          return inspectCount === 1 ? currentMessageBeforeAnswer : currentMessageWithoutReferences;
        },
      },
      timeoutMs: 100,
      intervalMs: 1,
      sleep: async function(milliseconds) { elapsed += milliseconds; },
      clock: function() { return elapsed; },
      now: function() { return "2026-07-12T00:00:00.000Z"; }
    });

    const result = await adapter.collect("当前问题");

    assert.equal(inspectCount, 3);
    assert.equal(result.answerText, "当前回答正文足够长，可以保存。");
    assert.deepEqual(result.references, []);
  });

  it("does not reuse a previous assistant answer before a new repeated-question message appears", async function() {
    const calls = [];
    let inspectCount = 0;
    let elapsed = 0;
    const oldSnapshot = {
      inputAvailable: true,
      generating: false,
      challenge: false,
      errorText: "",
      messageCandidates: [
        { messageId: "user-old", className: "justify-end", text: "重复问题" },
        { messageId: "assistant-old", className: "assistant", text: "旧回答正文至少十个字符。" }
      ]
    };
    const newSnapshot = {
      inputAvailable: true,
      generating: false,
      challenge: false,
      errorText: "",
      messageCandidates: oldSnapshot.messageCandidates.concat([
        { messageId: "user-new", className: "justify-end", text: "重复问题" },
        { messageId: "assistant-new", className: "assistant", text: "新回答正文至少十个字符。" }
      ])
    };
    const adapter = createDoubaoBrowserAdapter({
      runtime: {
        open: async function(input) { calls.push(["open", input]); },
        evaluate: async function(input) {
          calls.push(["evaluate", input]);
          if (input.action === "send-question") return { ok: true };
          inspectCount += 1;
          return inspectCount <= 4 ? oldSnapshot : newSnapshot;
        },
      },
      timeoutMs: 100,
      intervalMs: 1,
      sleep: async function(milliseconds) { elapsed += milliseconds; },
      clock: function() { return elapsed; },
      now: function() { return "2026-07-14T00:00:00.000Z"; }
    });

    const result = await adapter.collect("重复问题");

    assert.equal(result.answerText, "新回答正文至少十个字符。");
    assert.ok(inspectCount >= 6);
  });

  it("uses the dedicated doubao session and returns a scoped complete answer", async function() {
    const calls = [];
    const session = { session: "doubao", profileDir: "profile", daemonDir: "daemon", stateFile: "state" };
    const adapter = createDoubaoBrowserAdapter({
      session: session,
      runtime: fakeRuntime(completeFixture, calls),
      sleep: async function() {},
      now: function() { return "2026-07-12T00:00:00.000Z"; }
    });

    const result = await adapter.collect(fixtureQuestion);

    assert.equal(calls[0][1].url, "https://www.doubao.com/chat/");
    assert.deepEqual(calls[0][1].session, session);
    assert.equal(calls[0][1].profileDir, session.profileDir);
    assert.equal(calls[0][1].daemonDir, session.daemonDir);
    assert.equal(calls[0][1].stateFile, session.stateFile);
    assert.deepEqual(calls.slice(0, 4).map(function(call) {
      return call[0] === "open" ? "open" : call[1].action;
    }), ["open", "inspect-page", "send-question", "inspect-page"]);
    assert.ok(result.answerText);
    assert.equal(result.collectionMethod, "automatic");
  });

  it("detects when the current Doubao page requires login", async function() {
    const calls = [];
    const adapter = createDoubaoBrowserAdapter({ runtime: fakeRuntime(loginFixture, calls), sleep: async function() {} });
    const state = await adapter.getLoginState();
    assert.equal(state.status, "login_required");
    assert.equal(calls[0][0], "evaluate");
    assert.equal(calls[0][1].action, "inspect-page");
  });

  it("checks login state without opening a visible page", async function() {
    const calls = [];
    const adapter = createDoubaoBrowserAdapter({ runtime: fakeRuntime(completeFixture, calls), sleep: async function() {} });

    const state = await adapter.getLoginState();

    assert.equal(state.status, "authenticated");
    assert.equal(calls.filter(function(call) { return call[0] === "open"; }).length, 0);
    assert.equal(calls.filter(function(call) { return call[0] === "evaluate"; }).length, 1);
  });

  it("serializes concurrent session startup across login APIs", async function() {
    const calls = [];
    let releaseOpen;
    const openGate = new Promise(function(resolve) { releaseOpen = resolve; });
    const runtime = {
      open: async function(input) {
        calls.push(["open", input]);
        await openGate;
      },
      evaluate: async function(input) {
        calls.push(["evaluate", input]);
        return completeFixture;
      },
      close: async function(input) { calls.push(["close", input]); }
    };
    const adapter = createDoubaoBrowserAdapter({ runtime: runtime, sleep: async function() {} });

    const loginState = adapter.getLoginState();
    const openLoginState = adapter.openLogin();
    assert.equal(calls.filter(function(call) { return call[0] === "open"; }).length, 1);

    releaseOpen();
    await Promise.all([loginState, openLoginState]);
    assert.equal(calls.filter(function(call) { return call[0] === "open"; }).length, 1);
  });

  it("invalidates an in-flight opening when close races with a new open", async function() {
    const calls = [];
    let releaseFirstOpen;
    const firstOpenGate = new Promise(function(resolve) { releaseFirstOpen = resolve; });
    let openCount = 0;
    const runtime = {
      open: async function(input) {
        openCount += 1;
        calls.push(["open", input]);
        if (openCount === 1) await firstOpenGate;
      },
      evaluate: async function(input) {
        calls.push(["evaluate", input]);
        return loginFixture;
      },
      close: async function(input) { calls.push(["close", input]); }
    };
    const adapter = createDoubaoBrowserAdapter({ runtime: runtime, sleep: async function() {} });

    const firstLoginState = adapter.openLogin();
    await Promise.resolve();
    await adapter.close();
    const secondLoginState = adapter.openLogin();

    assert.equal(openCount, 2);
    releaseFirstOpen();
    await Promise.all([firstLoginState, secondLoginState]);
    assert.equal(openCount, 2);
  });

  it("reuses a ready session for collection and reopens after close", async function() {
    const calls = [];
    const adapter = createDoubaoBrowserAdapter({
      runtime: fakeRuntime(completeFixture, calls),
      sleep: async function() {},
      now: function() { return "2026-07-12T00:00:00.000Z"; }
    });

    await adapter.openLogin();
    await adapter.collect(fixtureQuestion);
    assert.equal(calls.filter(function(call) { return call[0] === "open"; }).length, 1);

    await adapter.close();
    await adapter.openLogin();
    assert.equal(calls.filter(function(call) { return call[0] === "open"; }).length, 2);
  });

  it("does not reopen a visible page when passive inspection reports a closed session", async function() {
    const calls = [];
    let inspectionCount = 0;
    const runtime = {
      open: async function(input) { calls.push(["open", input]); },
      evaluate: async function(input) {
        calls.push(["evaluate", input]);
        if (input.action === "inspect-page" && inspectionCount++ === 0) {
          throw Object.assign(new Error("session closed"), { code: "PLAYWRIGHT_SESSION_NOT_OPEN" });
        }
        return loginFixture;
      },
    };
    const adapter = createDoubaoBrowserAdapter({ runtime: runtime, sleep: async function() {} });

    await assert.rejects(adapter.getLoginState(), function(error) {
      return error.code === "PLAYWRIGHT_SESSION_NOT_OPEN";
    });

    assert.equal(calls.filter(function(call) { return call[0] === "open"; }).length, 0);
    assert.equal(calls.filter(function(call) { return call[0] === "evaluate"; }).length, 1);
  });

  it("throws the second session-not-open inspection failure without looping", async function() {
    const calls = [];
    const runtime = {
      open: async function(input) { calls.push(["open", input]); },
      evaluate: async function(input) {
        calls.push(["evaluate", input]);
        throw Object.assign(new Error("session closed"), { code: "PLAYWRIGHT_SESSION_NOT_OPEN" });
      },
    };
    const adapter = createDoubaoBrowserAdapter({ runtime: runtime, sleep: async function() {} });

    await assert.rejects(adapter.getLoginState(), function(error) {
      assert.equal(error.code, "PLAYWRIGHT_SESSION_NOT_OPEN");
      return true;
    });
    assert.equal(calls.filter(function(call) { return call[0] === "open"; }).length, 0);
    assert.equal(calls.filter(function(call) { return call[0] === "evaluate"; }).length, 1);
  });

  it("checks the page after opening and does not send a question when login is required", async function() {
    const calls = [];
    const adapter = createDoubaoBrowserAdapter({
      runtime: fakeRuntime(loginFixture, calls),
      diagnosticsDir: makeTemporaryDirectory("doubao-login-")
    });

    await assert.rejects(adapter.collect("test question"), function(error) {
      return error.code === "DOUBAO_LOGIN_REQUIRED";
    });

    const evaluateActions = calls
      .filter(function(call) { return call[0] === "evaluate"; })
      .map(function(call) { return call[1].action; });
    assert.deepEqual(evaluateActions, ["inspect-page"]);
  });

  it("detects login wording even when the page exposes an input", async function() {
    const calls = [];
    const adapter = createDoubaoBrowserAdapter({
      runtime: fakeRuntime({ inputAvailable: true, loginRequired: true }, calls),
      sleep: async function() {}
    });
    const state = await adapter.getLoginState();
    assert.equal(state.status, "login_required");
  });

  it("returns an explicit login marker from the inspect-page script", function() {
    assert.equal(typeof inspectPageScript, "function");
    const script = inspectPageScript();
    assert.match(script, /loginRequired/);
    assert.match(script, /登录|登錄|login/i);
  });

  it("uses the remaining absolute deadline for every evaluate and sleep", async function() {
    const calls = [];
    const sleepCalls = [];
    let elapsed = 0;
    const adapter = createDoubaoBrowserAdapter({
      runtime: {
        open: async function() {},
        evaluate: async function(input) {
          calls.push(input);
          elapsed += 10;
          if (input.action === "send-question") return { ok: true };
          return streamingFixture;
        },
      },
      timeoutMs: 100,
      intervalMs: 50,
      clock: function() { return elapsed; },
      now: function() { return new Date(elapsed).toISOString(); },
      sleep: async function(milliseconds) { sleepCalls.push(milliseconds); elapsed += milliseconds; },
      diagnosticsDir: makeTemporaryDirectory("doubao-deadline-")
    });

    await assert.rejects(adapter.collect(fixtureQuestion), function(error) { return error.code === "DOUBAO_TIMEOUT"; });
    assert.deepEqual(calls.map(function(input) { return input.timeoutMs; }), [100, 90, 80, 20]);
    assert.deepEqual(sleepCalls, [50, 10]);
  });

  it("caps an oversized collection timeout at 120 seconds for the runtime", async function() {
    const calls = [];
    const adapter = createDoubaoBrowserAdapter({
      runtime: fakeRuntime(completeFixture, calls),
      timeoutMs: 180000,
      clock: function() { return 0; },
      now: function() { return "2026-07-12T00:00:00.000Z"; },
      sleep: async function() {}
    });

    await adapter.collect(fixtureQuestion);

    const runtimeCalls = calls.filter(function(call) { return call[0] === "open" || call[0] === "evaluate"; });
    assert.ok(runtimeCalls.length > 0);
    assert.ok(runtimeCalls.every(function(call) { return call[1].timeoutMs <= 120000; }));
  });

  it("writes a structured JSON diagnostic summary", async function() {
    const calls = [];
    const diagnosticsDir = makeTemporaryDirectory("doubao-json-timeout-");
    fs.writeFileSync(path.join(diagnosticsDir, "legacy-screenshot.png"), "png");
    const runtime = fakeRuntime(challengeFixture, calls);
    const adapter = createDoubaoBrowserAdapter({ runtime: runtime, diagnosticsDir: diagnosticsDir, diagnosticTimeoutMs: 5, sleep: async function() {} });

    await assert.rejects(adapter.collect("test question"), function(error) { return error.code === "DOUBAO_CHALLENGE"; });
    const summaries = fs.readdirSync(diagnosticsDir).filter(function(name) { return name.endsWith(".json"); });
    assert.equal(summaries.length, 1);
    const summary = fs.readFileSync(path.join(diagnosticsDir, summaries[0]), "utf8");
    assert.match(summary, /DOUBAO_CHALLENGE/);
    assert.equal(fs.readdirSync(diagnosticsDir).some(function(name) { return name.endsWith(".png"); }), false);
  });

  it("times out after 120 seconds when an answer never becomes complete", async function() {
    const calls = [];
    let elapsed = 0;
    const adapter = createDoubaoBrowserAdapter({
      runtime: fakeRuntime(streamingFixture, calls),
      timeoutMs: 120000,
      sleep: async function(milliseconds) { elapsed += milliseconds; },
      now: function() { return new Date(elapsed).toISOString(); },
      clock: function() { return elapsed; },
      diagnosticsDir: makeTemporaryDirectory("doubao-timeout-")
    });

    await assert.rejects(adapter.collect(fixtureQuestion), function(error) { return error.code === "DOUBAO_TIMEOUT"; });
    assert.ok(elapsed >= 120000);
  });

  it("does not accept an answer that cannot be scoped to the requested question", async function() {
    const calls = [];
    let elapsed = 0;
    const answerWithoutQuestion = { inputAvailable: true, generating: false, challenge: false, errorText: "", messages: [{ role: "assistant", text: "unscoped answer" }] };
    const adapter = createDoubaoBrowserAdapter({
      runtime: fakeRuntime(answerWithoutQuestion, calls),
      timeoutMs: 6000,
      sleep: async function(milliseconds) { elapsed += milliseconds; },
      now: function() { return new Date(elapsed).toISOString(); },
      clock: function() { return elapsed; },
      diagnosticsDir: makeTemporaryDirectory("doubao-unscoped-")
    });
    await assert.rejects(adapter.collect(fixtureQuestion), function(error) { return error.code === "DOUBAO_TIMEOUT"; });
  });

  it("stops on a challenge page and captures a structured diagnostic", async function() {
    const calls = [];
    const diagnosticsDir = makeTemporaryDirectory("doubao-challenge-");
    const adapter = createDoubaoBrowserAdapter({ runtime: fakeRuntime(challengeFixture, calls), diagnosticsDir: diagnosticsDir, sleep: async function() {} });
    await assert.rejects(adapter.collect("test question"), function(error) { return error.code === "DOUBAO_CHALLENGE"; });
    const files = fs.readdirSync(diagnosticsDir);
    assert.equal(files.filter(function(name) { return name.endsWith(".png"); }).length, 0);
    assert.equal(files.filter(function(name) { return name.endsWith(".json"); }).length, 1);
    const summary = JSON.parse(fs.readFileSync(path.join(diagnosticsDir, files.find(function(name) { return name.endsWith(".json"); })), "utf8"));
    assert.equal(summary.code, "DOUBAO_CHALLENGE");
    assert.equal(summary.status, "challenge");
    assert.equal(Object.hasOwn(summary, "url"), false);
    assert.equal(calls.some(function(call) {
      return call[0] === "evaluate" && call[1].action === "send-question";
    }), false);
  });

  it("passes the explicit default profileId to the Playwright session", async function() {
    const calls = [];
    const adapter = createDoubaoBrowserAdapter({
      profileId: "default",
      runtime: {
        open: async function(input) { calls.push(input); return {}; },
        evaluate: async function() { return loginFixture; },
        close: async function() {}
      }
    });

    await assert.rejects(adapter.collect("test question"));
    assert.equal(calls[0].profileId, "default");
  });

  it("uses an injected profile directory when creating the Doubao session", async function() {
    const calls = [];
    const adapter = createDoubaoBrowserAdapter({
      profileDir: "C:\\local-state\\browser\\doubao",
      runtime: {
        open: async function(input) { calls.push(input); return {}; },
        evaluate: async function() { return loginFixture; },
        close: async function() {}
      }
    });

    await assert.rejects(adapter.collect("test question"));
    assert.equal(calls[0].profileDir, "C:\\local-state\\browser\\doubao");
  });

  it("stops on a page error and does not send a question", async function() {
    const calls = [];
    const diagnosticsDir = makeTemporaryDirectory("doubao-page-error-");
    const adapter = createDoubaoBrowserAdapter({
      runtime: fakeRuntime(pageErrorFixture, calls),
      diagnosticsDir: diagnosticsDir,
      sleep: async function() {}
    });

    await assert.rejects(adapter.collect("test question"), function(error) { return error.code === "DOUBAO_PAGE_ERROR"; });
    const summaryName = fs.readdirSync(diagnosticsDir).find(function(name) { return name.endsWith(".json"); });
    const summary = fs.readFileSync(path.join(diagnosticsDir, summaryName), "utf8");
    assert.doesNotMatch(summary, /page load failed|test question|errorText/);
    assert.equal(calls.some(function(call) {
      return call[0] === "evaluate" && call[1].action === "send-question";
    }), false);
  });

  it("keeps at most 20 diagnostic file groups", async function() {
    const calls = [];
    const diagnosticsDir = makeTemporaryDirectory("doubao-diagnostics-");
    let count = 0;
    const adapter = createDoubaoBrowserAdapter({
      runtime: fakeRuntime(challengeFixture, calls),
      diagnosticsDir: diagnosticsDir,
      sleep: async function() {},
      now: function() { count += 1; return new Date(count * 1000).toISOString(); }
    });
    for (let index = 0; index < 25; index += 1) {
      await assert.rejects(adapter.collect("test question"), function(error) { return error.code === "DOUBAO_CHALLENGE"; });
    }
    assert.equal(fs.readdirSync(diagnosticsDir).filter(function(name) { return name.endsWith(".png"); }).length, 0);
    assert.equal(fs.readdirSync(diagnosticsDir).filter(function(name) { return name.endsWith(".json"); }).length, 20);
  });

  it("JSON-encodes a question in the send action script", async function() {
    const calls = [];
    let elapsed = 0;
    const question = '"); throw new Error("injected"); //';
    const adapter = createDoubaoBrowserAdapter({
      runtime: fakeRuntime(completeFixture, calls),
      timeoutMs: 6000,
      sleep: async function(milliseconds) { elapsed += milliseconds; },
      clock: function() { return elapsed; },
      now: function() { return new Date(elapsed).toISOString(); },
      diagnosticsDir: makeTemporaryDirectory("doubao-json-")
    });
    await adapter.collect(question).catch(function() {});
    const sendCall = calls.find(function(call) { return call[0] === "evaluate" && call[1].action === "send-question"; });
    assert.equal(sendCall[1].questionJson, JSON.stringify(question));
    assert.ok(sendCall[1].script.includes(JSON.stringify(question)));
    assert.equal(sendCall[1].script.includes("var question = " + question), false);
  });
});

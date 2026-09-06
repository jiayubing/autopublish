const assert = require("node:assert/strict");
const { it } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createDoubaoBrowserAdapter, inspectPageScript } = require("../src/content/doubao-browser-adapter");
const { createDoubaoCollectionQueue } = require("../src/content/doubao-collection-queue");
const { selectAnswerForQuestion } = require("../src/content/doubao-page-parser");

const QUESTION = "Synthetic question";
const ANSWER = "Synthetic answer with sufficient content.";
const SESSION = { session: "doubao", profileDir: "synthetic-profile", daemonDir: "synthetic-daemon", stateFile: "synthetic-state" };
const complete = (id = "new") => ({ inputAvailable: true, generating: false, messages: [
  { messageId: `user-${id}`, role: "user", text: QUESTION },
  { messageId: `answer-${id}`, role: "assistant", text: ANSWER, references: [] }
] });
function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "doubao-recovery-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function node(text, attributes = {}, parentElement = null) {
  return { innerText: text, textContent: text, parentElement,
    getAttribute: (name) => attributes[name] || null,
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
    querySelectorAll: () => [],
  };
}
async function inspectDom({ bodyText = "", controls = [], regions = [] } = {}) {
  const document = {
    body: { innerText: bodyText },
    querySelector: () => node(""),
    querySelectorAll: (selector) => {
      if (selector.includes('[role="dialog"]')) return regions;
      if (selector.includes("button")) return controls;
      return [];
    }
  };
  const window = { getComputedStyle: (element) => ({ display: element.hidden ? "none" : "block", visibility: "visible", opacity: "1" }) };
  const page = { evaluate: (callback) => callback() };
  return new Function("page", "document", "window", "location", `return (async () => {${inspectPageScript()}})();`)(page, document, window, { href: "https://www.doubao.com/chat/synthetic" });
}

it("ordinary answer words and hidden or in-message controls are not page failures", async () => {
  const answer = node("登录 验证码 网络错误 challenge", { "data-message-id": "answer-old" });
  const quotedLink = node("登录", {}, answer);
  const hiddenLogin = node("登录"); hiddenLogin.hidden = true;
  const snapshot = await inspectDom({ bodyText: answer.innerText, controls: [quotedLink, hiddenLogin] });
  assert.equal(snapshot.loginRequired, false);
  assert.equal(snapshot.challenge, false);
  assert.equal(snapshot.errorText, "");
});

it("visible login, verification and error UI still stop collection", async () => {
  assert.equal((await inspectDom({ controls: [node("登录")] })).loginRequired, true);
  assert.equal((await inspectDom({ regions: [node("请完成人机验证")] })).challenge, true);
  assert.match((await inspectDom({ regions: [node("网络错误，请重试")] })).errorText, /网络错误/);
});

it("waits for the previous answer to end before sending the next question", async (t) => {
  let elapsed = 0; let generating = true; let sent = false;
  const adapter = createDoubaoBrowserAdapter({
    session: SESSION, diagnosticsDir: temporary(t), timeoutMs: 100, intervalMs: 1,
    clock: () => elapsed, sleep: async (ms) => { elapsed += ms; generating = false; },
    runtime: { open: async () => {}, evaluate: async (input) => {
      if (input.action === "send-question") {
        assert.equal(generating, false, "must not press Enter during the previous answer");
        sent = true; return { ok: true, questionMessageId: "user-new" };
      }
      return sent ? complete() : { inputAvailable: true, generating, messages: [] };
    } }
  });
  assert.equal((await adapter.collect(QUESTION)).answerText, ANSWER);
  assert.equal(sent, true);
});

it("busy-page timeout sends nothing and records a safe readiness-stage diagnostic", async (t) => {
  const root = temporary(t); let elapsed = 0; let sends = 0;
  const adapter = createDoubaoBrowserAdapter({
    session: SESSION, diagnosticsDir: root, timeoutMs: 20, intervalMs: 5,
    clock: () => elapsed, sleep: async (ms) => { elapsed += ms; },
    runtime: { open: async () => {}, evaluate: async (input) => {
      if (input.action === "send-question") { sends += 1; return { ok: true }; }
      return { inputAvailable: true, generating: true, messages: [] };
    } }
  });
  await assert.rejects(adapter.collect(QUESTION), { code: "DOUBAO_TIMEOUT" });
  assert.equal(sends, 0);
  const summary = JSON.parse(fs.readFileSync(path.join(root, fs.readdirSync(root)[0]), "utf8"));
  assert.equal(summary.phase, "ready");
  assert.equal(summary.elapsedMs, 20);
  assert.equal(summary.sendConfirmed, false);
  assert.equal(summary.generating, true);
  assert.equal(JSON.stringify(summary).includes(QUESTION), false);
});

it("a send timeout is diagnosed before polling and never causes an automatic resend", async (t) => {
  const root = temporary(t); let sends = 0;
  const adapter = createDoubaoBrowserAdapter({
    session: SESSION, diagnosticsDir: root,
    runtime: { open: async () => {}, evaluate: async (input) => {
      if (input.action === "send-question") { sends += 1; throw Object.assign(new Error("synthetic"), { code: "PLAYWRIGHT_TIMEOUT" }); }
      return { inputAvailable: true, generating: false, messages: [] };
    } }
  });
  await assert.rejects(adapter.collect(QUESTION), { code: "DOUBAO_TIMEOUT" });
  assert.equal(sends, 1);
  const files = fs.readdirSync(root);
  assert.equal(files.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, files[0]), "utf8")).phase, "send");
});

it("a lost session after sending is not reopened onto an unrelated conversation", async (t) => {
  let sent = false; let opens = 0;
  const adapter = createDoubaoBrowserAdapter({
    session: SESSION, diagnosticsDir: temporary(t),
    runtime: { open: async () => { opens += 1; }, evaluate: async (input) => {
      if (input.action === "send-question") { sent = true; return { ok: true }; }
      if (sent) throw Object.assign(new Error("synthetic"), { code: "PLAYWRIGHT_SESSION_NOT_OPEN" });
      return { inputAvailable: true, generating: false, messages: [] };
    } }
  });
  await assert.rejects(adapter.collect(QUESTION), { code: "PLAYWRIGHT_SESSION_NOT_OPEN" });
  assert.equal(opens, 1);
});

it("answer matching binds the acknowledged message and only normalizes whitespace", () => {
  const snapshot = complete("expected");
  snapshot.messages.push({ messageId: "user-other", role: "user", text: QUESTION });
  snapshot.messages.push({ messageId: "answer-other", role: "assistant", text: "Unrelated later answer" });
  assert.equal(selectAnswerForQuestion(snapshot, " Synthetic\nquestion ", "user-expected").answerText, ANSWER);
  assert.throws(() => selectAnswerForQuestion(snapshot, QUESTION, "user-missing"), { code: "DOUBAO_QUESTION_NOT_FOUND" });
});

for (const code of ["DOUBAO_TIMEOUT", "DOUBAO_PAGE_ERROR", "DOUBAO_SEND_FAILED", "PLAYWRIGHT_SESSION_NOT_OPEN"]) {
  it(`${code} pauses remaining tasks; resume does not replay the failed question`, async (t) => {
    const calls = []; let fail = true; let observedFailure;
    const failed = new Promise((resolve) => { observedFailure = resolve; });
    const queue = createDoubaoCollectionQueue({ sleep: async () => {}, collectOne: async (input) => {
      calls.push(input.questionId);
      if (fail && input.questionId === "q1") throw Object.assign(new Error("synthetic"), { code });
      return { answerText: ANSWER, references: [] };
    } });
    t.after(() => queue.dispose());
    queue.subscribe((event) => { if (event.type === "task_failed") observedFailure(); });
    const run = queue.start(["q1", "q2", "q3"].map((questionId) => ({ clientId: "client-a", questionId })));
    await failed;
    assert.equal(queue.getState().status, "paused");
    assert.deepEqual(queue.getState().tasks.map((task) => task.status), ["failed", "pending", "pending"]);
    assert.deepEqual(calls, ["q1"]);
    queue.resume();
    const result = await run;
    assert.equal(result.completed, 3);
    assert.deepEqual(calls, ["q1", "q2", "q3"]);
    fail = false;
    const retried = await queue.retryFailed();
    assert.deepEqual(calls, ["q1", "q2", "q3", "q1"]);
    assert.equal(retried.tasks.every((task) => task.status === "succeeded"), true);
  });
}

it("a last-task timeout completes, and stopping a failure-paused queue cancels only pending work", async () => {
  const queue = createDoubaoCollectionQueue({ collectOne: async () => { throw Object.assign(new Error("synthetic"), { code: "DOUBAO_TIMEOUT" }); } });
  const single = await queue.start([{ clientId: "client-a", questionId: "q1" }]);
  assert.equal(single.status, "completed");
  assert.equal(single.tasks[0].status, "failed");
  let observed;
  const failed = new Promise((resolve) => { observed = resolve; });
  queue.subscribe((event) => { if (event.type === "task_failed") observed(); });
  const run = queue.start(["q1", "q2"].map((questionId) => ({ clientId: "client-a", questionId })));
  await failed;
  await queue.stop();
  const stopped = await run;
  assert.deepEqual(stopped.tasks.map((task) => task.status), ["failed", "cancelled"]);
  assert.equal(stopped.completed, 2);
  await queue.dispose();
});

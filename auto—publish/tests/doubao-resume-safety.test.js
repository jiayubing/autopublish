const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createDoubaoBrowserAdapter } = require("../src/content/doubao-browser-adapter");
const { createDoubaoCollectionQueue } = require("../src/content/doubao-collection-queue");
const A = "https://www.doubao.com/chat/100";
const B = "https://www.doubao.com/chat/200";
const QUESTION = "Synthetic question";
const ANSWER = "Synthetic answer with sufficient content.";
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "doubao-resume-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const state = { url: A, sends: [], messages: [], challenge: false, loginRequired: false, afterSend: null, beforeInspect: null, opens: 0 };
  const runtime = {
    async open() { state.opens += 1; },
    async close() {},
    async evaluate(input) {
      if (input.action === "new-conversation") {
        state.url = A;
        state.messages = [];
        return { url: A };
      }
      if (input.action === "switch-conversation") {
        state.url = A;
        return { url: A };
      }
      if (input.action === "send-question") {
        const question = JSON.parse(input.questionJson);
        const id = `user-${state.sends.length}`;
        state.sends.push({ question, url: state.url });
        state.messages = [{ messageId: id, role: "user", text: question }, { messageId: "answer-" + id, role: "assistant", text: ANSWER, references: [] }];
        const result = { ok: true, questionMessageId: id, url: state.url };
        if (state.afterSend) state.afterSend(result);
        return result;
      }
      if (state.beforeInspect) state.beforeInspect();
      return { url: state.url, inputAvailable: true, generating: false, challenge: state.challenge, loginRequired: state.loginRequired, messages: state.messages };
    },
  };
  const adapter = createDoubaoBrowserAdapter({
    session: { session: "fixture", profileId: "fixture" }, diagnosticsDir: directory,
    intervalMs: 1, sleep: async () => {}, runtime,
  });
  return { state, runtime, adapter };
}
for (const interruption of ["challenge", "loginRequired"]) {
  test(`resume ${interruption} after acknowledged send waits for the original answer without resending`, async t => {
    const f = fixture(t);
    f.state.afterSend = () => { f.state[interruption] = true; };
    const queue = createDoubaoCollectionQueue({ collectOne: () => f.adapter.collect({ clientId: "client-a", question: QUESTION }), sleep: async () => {} });
    t.after(() => queue.dispose());
    let pauses = 0;
    queue.subscribe(event => {
      if (!["waiting_human", "waiting_login"].includes(event.type)) return;
      pauses += 1;
      f.state[interruption] = false;
      f.state.url = B;
      queue.resume();
    });
    const result = await queue.start([{ clientId: "client-a", questionId: "q1" }]);
    assert.equal(pauses, 1);
    assert.equal(result.tasks[0].status, "succeeded");
    assert.equal(f.state.sends.length, 1);
    assert.equal(f.state.url, A);
  });
}
test("a pre-send challenge can resume normally and sends once", async t => {
  const f = fixture(t);
  f.state.challenge = true;
  await assert.rejects(f.adapter.collect({ clientId: "client-a", question: QUESTION }), { code: "DOUBAO_CHALLENGE" });
  assert.equal(f.state.sends.length, 0);
  f.state.challenge = false;
  assert.equal((await f.adapter.collect({ clientId: "client-a", question: QUESTION })).answerText, ANSWER);
  assert.equal(f.state.sends.length, 1);
});
test("manual navigation between questions routes back without overwriting the client mapping", async t => {
  const f = fixture(t);
  await f.adapter.collect({ clientId: "client-a", question: QUESTION });
  f.state.url = B;
  await f.adapter.collect({ clientId: "client-a", question: "Next question" });
  assert.deepEqual(f.state.sends.map(send => send.url), [A, A]);
  assert.equal(f.state.url, A);
});
test("navigation during answer collection fails closed and does not adopt the unrelated conversation", async t => {
  const f = fixture(t);
  f.state.afterSend = () => { f.state.url = B; };
  await assert.rejects(f.adapter.collect({ clientId: "client-a", question: QUESTION }), { code: "DOUBAO_CONVERSATION_CHANGED" });
  assert.equal(f.state.sends.length, 1);
  f.state.afterSend = null;
  await f.adapter.collect({ clientId: "client-a", question: "Next question" });
  assert.equal(f.state.sends[1].url, A);
});
test("editing a paused question cannot turn answer recovery into a new send", async t => {
  const f = fixture(t);
  f.state.afterSend = () => { f.state.challenge = true; };
  await assert.rejects(f.adapter.collect({ clientId: "client-a", question: QUESTION }), { code: "DOUBAO_CHALLENGE" });
  f.state.challenge = false;
  await assert.rejects(f.adapter.collect({ clientId: "client-a", question: "Changed question" }), { code: "DOUBAO_RESUME_MISMATCH" });
  assert.equal(f.state.sends.length, 1);
});
test("missing acknowledgement identity is uncertain and never enters automatic human-resume", async t => {
  const f = fixture(t);
  f.state.afterSend = result => { delete result.questionMessageId; f.state.challenge = true; };
  await assert.rejects(f.adapter.collect({ clientId: "client-a", question: QUESTION }), { code: "DOUBAO_SEND_UNCERTAIN" });
  assert.equal(f.state.sends.length, 1);
});
test("runtime timeout waits for session closure; failed closure prevents reopening", async t => {
  const f = fixture(t);
  const evaluate = f.runtime.evaluate;
  f.runtime.evaluate = async input => {
    if (input.action === "send-question") throw Object.assign(new Error("synthetic timeout"), { code: "PLAYWRIGHT_TIMEOUT" });
    return evaluate(input);
  };
  let release;
  let closeStarted;
  const closing = new Promise(resolve => { closeStarted = resolve; });
  f.runtime.close = () => { closeStarted(); return new Promise(resolve => { release = resolve; }); };
  let settled = false;
  const attempt = f.adapter.collect({ clientId: "client-a", question: QUESTION }).finally(() => { settled = true; });
  const rejection = assert.rejects(attempt, { code: "DOUBAO_TIMEOUT" });
  await closing;
  assert.equal(settled, false);
  release();
  await rejection;
  f.runtime.close = async () => { throw Object.assign(new Error("synthetic close failure"), { code: "PLAYWRIGHT_EXEC_FAILED" }); };
  await assert.rejects(f.adapter.collect({ clientId: "client-a", question: QUESTION }), { code: "DOUBAO_TIMEOUT" });
  const opens = f.state.opens;
  await assert.rejects(f.adapter.collect({ clientId: "client-a", question: QUESTION }), { code: "PLAYWRIGHT_EXEC_FAILED" });
  await assert.rejects(f.adapter.openLogin(), { code: "PLAYWRIGHT_EXEC_FAILED" });
  assert.equal(f.state.opens, opens);
  f.runtime.close = async () => {};
  f.runtime.evaluate = evaluate;
  assert.equal((await f.adapter.collect({ clientId: "client-a", question: QUESTION })).answerText, ANSWER);
});


test("a delayed new conversation URL is bound only by the acknowledged message", async t => {
  const f = fixture(t);
  const evaluate = f.runtime.evaluate;
  f.runtime.evaluate = async input => {
    if (input.action === "new-conversation") {
      f.state.url = "https://www.doubao.com/chat/";
      return { url: f.state.url };
    }
    return evaluate(input);
  };
  f.state.afterSend = () => { f.state.url = A; };
  assert.equal((await f.adapter.collect({ clientId: "client-a", question: QUESTION })).answerText, ANSWER);
  assert.equal(f.state.url, A);
  assert.equal(f.state.sends.length, 1);
});

test("an unrelated conversation cannot supply the URL for a newly acknowledged message", async t => {
  const f = fixture(t);
  const evaluate = f.runtime.evaluate;
  f.runtime.evaluate = async input => {
    if (input.action === "new-conversation") {
      f.state.url = "https://www.doubao.com/chat/";
      return { url: f.state.url };
    }
    return evaluate(input);
  };
  f.state.afterSend = () => { f.state.url = B; f.state.messages = []; };
  await assert.rejects(f.adapter.collect({ clientId: "client-a", question: QUESTION }), { code: "DOUBAO_CONVERSATION_CHANGED" });
  assert.equal(f.state.sends.length, 1);
});

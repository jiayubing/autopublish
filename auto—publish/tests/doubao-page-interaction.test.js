const assert = require("node:assert/strict");
const { it } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { chromium } = require("playwright");
const { createDoubaoBrowserAdapter } = require("../src/content/doubao-browser-adapter");

it("real DOM collection confirms a new user message and binds its answer in a long conversation", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "doubao-dom-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: "<main></main>" }));
  await page.goto("https://www.doubao.com/chat/100");
  await page.setContent('<main id="messages"></main><button style="display:none">登录</button><textarea></textarea>');
  await page.evaluate(() => {
    const messages = document.getElementById("messages");
    for (let i = 0; i < 100; i += 1) {
      const old = document.createElement("div");
      old.dataset.messageId = `history-${i}`; old.dataset.role = "assistant";
      old.textContent = "历史回答讨论登录、验证码和网络错误，不是页面故障。";
      messages.append(old);
    }
    document.querySelector("textarea").addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const question = document.querySelector("textarea").value;
      for (const [id, role, text] of [["sent-question", "user", question], ["sent-answer", "assistant", "这是本题明确对应且完整的合成回答。"]]) {
        const message = document.createElement("div");
        message.dataset.messageId = id; message.dataset.role = role; message.textContent = text;
        messages.append(message);
      }
      document.querySelector("textarea").value = "";
    });
  });
  let acknowledgedId;
  const adapter = createDoubaoBrowserAdapter({
    diagnosticsDir: root, session: { session: "doubao", profileId: "synthetic" },
    sleep: async () => {}, runtime: {
      open: async () => {},
      evaluate: async (input) => {
        if (input.action === "new-conversation") return { url: page.url() };
        // Match the CLI sandbox: browser globals exist only inside page.evaluate.
        const result = await vm.runInNewContext(`(async () => {${input.script}})()`, { page });
        if (input.action === "send-question") {
          acknowledgedId = result.questionMessageId;
          // A later identical manual question must not change this task's identity.
          await page.evaluate(() => {
            for (const [id, role, text] of [["later-question", "user", "测试问题"], ["later-answer", "assistant", "这是后来的另一轮回答，不应保存给本题。"]]) {
              const node = document.createElement("div");
              node.dataset.messageId = id; node.dataset.role = role; node.textContent = text;
              document.getElementById("messages").append(node);
            }
          });
        }
        return result;
      }
    }
  });
  assert.equal((await adapter.collect({ clientId: "synthetic", question: "测试问题" })).answerText, "这是本题明确对应且完整的合成回答。");
  assert.equal(acknowledgedId, "sent-question");
  assert.equal(await page.locator('[data-role="user"]').count(), 2);
  await page.setContent('<textarea></textarea><div role="dialog">请完成人机验证</div>');
  assert.equal((await adapter.getLoginState()).status, "challenge");
  await page.setContent('<textarea></textarea><button>登录/注册</button>');
  assert.equal((await adapter.getLoginState()).status, "login_required");
});

it("Enter without a new message does not count as a confirmed send", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "doubao-send-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route("**/*", (route) => route.abort());
  await page.setContent('<textarea></textarea><div data-message-id="old-user" data-role="user">测试问题</div>');
  // A deterministic short acknowledgement deadline on the test transport only.
  const testPage = {
    locator: (selector) => page.locator(selector),
    evaluate: (callback) => page.evaluate(callback),
    waitForFunction: (callback, input, options) => page.waitForFunction(callback, input, { ...options, timeout: 50 }),
  };
  let sends = 0;
  const adapter = createDoubaoBrowserAdapter({
    session: { session: "doubao", profileId: "synthetic" }, diagnosticsDir: root,
    timeoutMs: 2000, intervalMs: 1,
    runtime: { open: async () => {}, evaluate: async (input) => {
      if (input.action === "send-question") sends += 1;
      try { return await new Function("page", `return (async () => {${input.script}})();`)(testPage); }
      catch (error) {
        // The CLI maps inner action failure (not a killed process) to EXEC_FAILED.
        if (error.name === "TimeoutError") error.code = "PLAYWRIGHT_EXEC_FAILED";
        throw error;
      }
    } }
  });
  await assert.rejects(adapter.collect("测试问题"), { code: "PLAYWRIGHT_EXEC_FAILED" });
  assert.equal(sends, 1);
  const diagnostic = JSON.parse(fs.readFileSync(path.join(root, fs.readdirSync(root)[0]), "utf8"));
  assert.equal(diagnostic.phase, "send");
  assert.equal(diagnostic.sendConfirmed, false);
  assert.equal(await page.locator('[data-message-id]').count(), 1);
});

for (const boundary of ["navigation", "deadline"]) {
it(`the send command refuses ${boundary} changes between readiness and Enter`, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "doubao-send-fence-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<textarea></textarea>" }));
  await page.goto("https://www.doubao.com/chat/100");
  let fills = 0;
  const wrappedPage = {
    url: () => page.url(),
    evaluate: (...args) => page.evaluate(...args),
    locator: selector => ({ first: () => ({
      waitFor: async options => {
        await page.locator(selector).first().waitFor(options);
        if (boundary === "navigation") await page.goto("https://www.doubao.com/chat/200");
        else await new Promise(resolve => setTimeout(resolve, 30));
      },
      fill: async () => { fills += 1; },
      press: async () => assert.fail("must not submit in the changed conversation"),
    }) }),
  };
  const adapter = createDoubaoBrowserAdapter({
    session: { session: "synthetic" }, diagnosticsDir: root,
    timeoutMs: boundary === "deadline" ? 20 : 2000, clock: () => 0,
    runtime: { open: async () => {}, evaluate: input => input.action === "new-conversation"
      ? { url: page.url() }
      : new Function("page", `return (async () => {${input.script}})();`)(input.action === "send-question" ? wrappedPage : page) },
  });
  await assert.rejects(adapter.collect({ clientId: "client-a", question: "Synthetic private question" }), boundary === "navigation" ? /DOUBAO_CONVERSATION_CHANGED/ : /DOUBAO_SEND_DEADLINE_EXPIRED/);
  assert.equal(fills, 0);
});

}

const assert = require("node:assert/strict");
const { it } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { createDoubaoBrowserAdapter, inspectPageScript } = require("../src/content/doubao-browser-adapter");
const { classifyPage } = require("../src/content/doubao-page-parser");

const QUESTION = "Synthetic readiness question";
const ANSWER = "Synthetic answer for the acknowledged question.";
const SESSION = { session: "doubao", profileDir: "fixture-profile", daemonDir: "fixture-daemon", stateFile: "fixture-state" };
const loading = () => ({ inputAvailable: false, loginRequired: false, generating: false, messages: [] });
const ready = () => ({ ...loading(), inputAvailable: true });
const answered = () => ({ ...ready(), messages: [
  { messageId: "user-current", role: "user", text: QUESTION },
  { messageId: "answer-current", role: "assistant", text: ANSWER, references: [] }
] });
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "doubao-readiness-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

it("missing composer is unknown, not proof of logout or authentication", () => {
  for (const snapshot of [loading(), {}, null, { inputAvailable: "true" }])
    assert.equal(classifyPage(snapshot).status, "unknown");
  assert.equal(classifyPage(ready()).status, "authenticated");
  assert.equal(classifyPage({ ...ready(), loginRequired: true }).status, "login_required");
});

it("new and saved client conversations wait for their composer without manual resume", async (t) => {
  let elapsed = 0; let polls = 0; let sent = false;
  let currentUrl = "https://www.doubao.com/chat/"; let nextId = 100; let savedUrl;
  const actions = []; const urls = new Map();
  const adapter = createDoubaoBrowserAdapter({
    session: SESSION, diagnosticsDir: temporary(t), timeoutMs: 100, intervalMs: 1,
    clock: () => elapsed, sleep: async (ms) => { elapsed += ms; },
    conversationStore: { get: (clientId) => (savedUrl = urls.get(clientId)), set: (clientId, url) => urls.set(clientId, url) },
    runtime: { open: async () => {}, evaluate: async (input) => {
      if (["new-conversation", "switch-conversation"].includes(input.action)) {
        currentUrl = input.action === "switch-conversation" ? savedUrl : "https://www.doubao.com/chat/";
        actions.push(input.action); polls = 0; sent = false; return { url: currentUrl };
      }
      if (input.action === "send-question") {
        assert.ok(polls >= 3, "must wait for the current page, not reuse cached login state");
        actions.push("send"); sent = true;
        if (currentUrl.endsWith("/chat/")) currentUrl += nextId++;
        return { ok: true, questionMessageId: "user-current", url: currentUrl };
      }
      polls += 1;
      return { ...(sent ? answered() : polls < 3 ? loading() : ready()), url: currentUrl };
    } }
  });
  for (const clientId of ["client-a", "client-b", "client-a"])
    assert.equal((await adapter.collect({ clientId, question: QUESTION })).answerText, ANSWER);
  assert.deepEqual(actions, ["new-conversation", "send", "new-conversation", "send", "switch-conversation", "send"]);
});

it("passive inspection reports unknown until the input is ready without opening a session", async (t) => {
  let hydrated = false; let opens = 0;
  const adapter = createDoubaoBrowserAdapter({ session: SESSION, diagnosticsDir: temporary(t), runtime: {
    open: async () => { opens += 1; }, evaluate: async () => hydrated ? ready() : loading()
  } });
  assert.equal((await adapter.getLoginState()).status, "unknown");
  hydrated = true;
  assert.equal((await adapter.getLoginState()).status, "authenticated");
  assert.equal(opens, 0);
});

it("a composer that never loads expires under the existing deadline without sending or reporting logout", async (t) => {
  let elapsed = 0; let sends = 0;
  const directory = temporary(t);
  const adapter = createDoubaoBrowserAdapter({
    session: SESSION, diagnosticsDir: directory, timeoutMs: 20, intervalMs: 5,
    clock: () => elapsed, sleep: async (ms) => { elapsed += ms; },
    runtime: { open: async () => {}, evaluate: async (input) => {
      if (input.action === "send-question") sends += 1;
      return loading();
    } }
  });
  await assert.rejects(adapter.collect(QUESTION), { code: "DOUBAO_TIMEOUT" });
  assert.equal(sends, 0);
  assert.equal(elapsed, 20);
  const summary = JSON.parse(fs.readFileSync(path.join(directory, fs.readdirSync(directory)[0]), "utf8"));
  assert.equal(summary.status, "unknown");
  assert.equal(summary.phase, "ready");
  assert.equal(summary.sendConfirmed, false);
});

for (const [marker, code] of [
  [{ loginRequired: true }, "DOUBAO_LOGIN_REQUIRED"],
  [{ challenge: true }, "DOUBAO_CHALLENGE"],
  [{ errorText: "Synthetic page error" }, "DOUBAO_PAGE_ERROR"]
]) {
  it(`real ${code} appearing after a loading page still stops before sending`, async (t) => {
    let elapsed = 0; let reads = 0; let sends = 0;
    const adapter = createDoubaoBrowserAdapter({
      session: SESSION, diagnosticsDir: temporary(t), timeoutMs: 20, intervalMs: 1,
      clock: () => elapsed, sleep: async (ms) => { elapsed += ms; },
      runtime: { open: async () => {}, evaluate: async (input) => {
        if (input.action === "send-question") sends += 1;
        return { ...loading(), ...(reads++ === 0 ? {} : marker) };
      } }
    });
    await assert.rejects(adapter.collect(QUESTION), { code });
    assert.equal(reads, 2);
    assert.equal(sends, 0);
  });
}

it("Chromium: DOMContentLoaded before composer hydration does not require login or a second start", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  // Navigation is supplied by an inert document; all external requests are blocked.
  await page.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body><main>Loading conversation</main></body></html>" }));
  const runScript = (script) => new Function("page", `return (async () => {${script}})();`)(page);
  let elapsed = 0; let polls = 0; let sends = 0; let hydrated = false;
  const adapter = createDoubaoBrowserAdapter({
    session: SESSION, diagnosticsDir: temporary(t), timeoutMs: 2000, intervalMs: 1,
    clock: () => elapsed,
    sleep: async (ms) => {
      elapsed += ms;
      if (!hydrated) {
        hydrated = true;
        await page.evaluate(({ answer }) => {
          const input = document.createElement("textarea");
          input.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            history.replaceState(null, "", "/chat/1000");
            for (const [id, role, text] of [["user-current", "user", input.value], ["answer-current", "assistant", answer]]) {
              const node = document.createElement("div");
              node.setAttribute("data-message-id", id);
              node.setAttribute("data-role", role);
              node.textContent = text;
              document.body.appendChild(node);
            }
          });
          document.body.appendChild(input);
        }, { answer: ANSWER });
      }
    },
    runtime: {
      open: async () => {},
      evaluate: async (input) => {
        if (input.action === "new-conversation") {
          await page.goto("https://www.doubao.com/chat/", { waitUntil: "domcontentloaded" });
          return {};
        }
        if (input.action === "send-question") { sends += 1; assert.equal(hydrated, true); }
        const result = await runScript(input.script);
        if (input.action === "inspect-page" && polls++ === 0) {
          assert.equal(result.inputAvailable, false);
          assert.equal(result.loginRequired, false);
        }
        return result;
      }
    }
  });
  assert.equal((await adapter.collect({ clientId: "client-a", question: QUESTION })).answerText, ANSWER);
  assert.equal(sends, 1);
  assert.ok(polls >= 4);
});

it("Chromium: hidden inputs do not establish readiness; a later visible composer does", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route("**/*", (route) => route.abort());
  await page.setContent('<textarea style="display:none"></textarea>');
  const inspect = () => new Function("page", `return (async () => {${inspectPageScript()}})();`)(page);
  assert.equal(classifyPage(await inspect()).status, "unknown");
  await page.evaluate(() => document.body.appendChild(document.createElement("textarea")));
  assert.equal(classifyPage(await inspect()).status, "authenticated");
  await page.evaluate(() => { const login = document.createElement("button"); login.textContent = "登录"; document.body.appendChild(login); });
  assert.equal(classifyPage(await inspect()).status, "login_required");
});

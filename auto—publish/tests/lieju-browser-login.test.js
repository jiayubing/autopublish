"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { test, mock } = require("node:test");
const playwright = require("../src/core/playwright");
const operator = require("../src/core/operator-flow");
const { LIEJU } = require("../scripts/config");

const evaluator = `
  const { load } = require('cheerio');
  const { code, fixture } = JSON.parse(process.argv[1]);
  const $ = load(fixture.html || '');
  global.window = { location: { href: fixture.url } };
  global.document = { querySelectorAll: selector => $(selector).toArray().map(node => ({
    getAttribute: name => $(node).attr(name), textContent: $(node).text()
  })) };
  const page = {
    url: () => fixture.url,
    locator: selector => ({
      count: async () => $(selector).length,
      nth: index => ({ isVisible: async () => { const el = $(selector).eq(index); return el.length > 0 && !el.is('[hidden]') && !el.parents('[hidden]').length; } })
    }),
    evaluate: async fn => fn()
  };
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  new AsyncFunction('page', code)(page).then(value => process.stdout.write(JSON.stringify(value))).catch(error => { console.error(error); process.exitCode = 1; });
`;

let fixtures;
let current;
let navigations;
mock.method(playwright, "pwInvokeSync", (args) => {
  assert.equal(args[0], "goto");
  navigations.push(args[1]);
  current = fixtures[args[1]] || { url: args[1], html: "" };
  if (current.navigationError) throw new Error("fixture navigation unavailable");
});
mock.method(playwright, "runCode", (code) => {
  if (current.evaluationError) throw new Error("fixture page detached");
  return JSON.parse(execFileSync(process.execPath, ["-e", evaluator, JSON.stringify({ code, fixture: current })], { encoding: "utf8", cwd: path.resolve(__dirname, "..") }));
});
mock.method(operator, "waitForCondition", (check) => check());
const { createPlatformAdapter } = require("../src/platforms/lieju/adapter");

function check(account, home) {
  fixtures = { [LIEJU.accountUrl]: account, [LIEJU.base]: home || { url: LIEJU.base, html: "" } };
  navigations = [];
  return createPlatformAdapter().checkLogin();
}

test("accepts a visible logout link or an account-page profile link", () => {
  assert.equal(check({ url: LIEJU.accountUrl, html: '<a href="?action=quit">退出</a>' }), true);
  assert.deepEqual(navigations, [LIEJU.accountUrl]);
  assert.equal(check({ url: LIEJU.accountUrl, html: '<a href="/u12345">合成账号</a>' }), true);
  assert.equal(check({ url: LIEJU.base, html: '<a hidden href="?action=quit">退出</a><a href="?action=quit">退出</a>' }), true);
});

test("does not accept a foreign page or hidden logout markup", () => {
  assert.equal(check({ url: "https://example.test/member/upage.php", html: '<a href="?action=quit">退出</a>' }), false);
  assert.equal(check({ url: LIEJU.accountUrl, html: '<a hidden href="?action=quit">退出</a>' }), false);
});

test("does not treat public user links or external profile links as account evidence", () => {
  assert.equal(check({ url: LIEJU.base, html: '<a href="/u12345">公开用户</a>' }), false);
  assert.equal(check({ url: LIEJU.accountUrl, html: '<a href="https://example.test/u12345">外部用户</a>' }), false);
});

test("falls back to home when the account page cannot be opened", () => {
  assert.equal(check({ navigationError: true }, { url: LIEJU.base, html: '<a href="?action=quit">退出</a>' }), true);
  assert.deepEqual(navigations, [LIEJU.accountUrl, LIEJU.base]);
});

test("returns unauthenticated when both pages or their evidence are unavailable", () => {
  assert.equal(check({ navigationError: true }, { navigationError: true }), false);
  assert.equal(check({ evaluationError: true }, { evaluationError: true }), false);
});

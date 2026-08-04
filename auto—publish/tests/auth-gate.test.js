const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { closeRenderer, startRenderer } = require("./helpers/renderer-harness");

describe("renderer auth gate", { concurrency: false }, function() {
  let browser;
  let rendererUrl;

  before(async function() {
    ({ browser, url: rendererUrl } = await startRenderer({ port: 4178 }));
  });

  after(closeRenderer);

  it("does not mount the workspace before authentication", async function() {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      const state = { authenticated: false, user: null, entitlements: [], errorCode: null };
      const response = (data) => Promise.resolve({ ok: true, data });
      window.desktopConsole = { auth: {
        getState: () => response(state),
        login: () => response(state),
        changePassword: () => response(state),
        refresh: () => response(state),
        logout: () => response(state),
        onStateChanged: () => () => {}
      } };
    });
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("textbox", { name: "登录名" }).waitFor();
    assert.equal(await page.locator("#nav-item-content").count(), 0);
    assert.equal(await page.getByText("登录后才能使用工作区和投稿功能").count(), 1);
    await page.close();
  });

  it("keeps the workspace mounted and shows recovery state for a temporary auth outage", async function() {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      const state = { authenticated: true, user: { loginName: "admin" }, entitlements: [], errorCode: "AUTH_SERVICE_UNAVAILABLE", sessionStatus: "recovering" };
      const response = (data) => Promise.resolve({ ok: true, data });
      window.desktopConsole = {
        auth: {
          getState: () => response(state),
          login: () => response(state),
          changePassword: () => response(state),
          refresh: () => response(state),
          logout: () => response({ authenticated: false, user: null, entitlements: [], errorCode: null, sessionStatus: "signed_out" }),
          onStateChanged: () => () => {},
        },
        workspace: { getBootstrapState: () => response({ state: "selection_required", workspacePath: null, envOverride: false }) },
        workspaceData: { getRuntimeIdentity: () => response({ workspaceRuntimeId: "auth-recovery-runtime", revision: 1 }), onInvalidated: () => () => {} },
      };
    });
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("status").waitFor();
    assert.equal(await page.getByText("授权连接恢复中", { exact: false }).count(), 1);
    assert.equal(await page.getByRole("textbox", { name: "登录名" }).count(), 0);
    await page.close();
  });

  it("renders the safe login command error instead of the rejected raw message", async function() {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      const state = { authenticated: false, user: null, entitlements: [], errorCode: null, sessionStatus: "signed_out" };
      const response = (data) => Promise.resolve({ ok: true, data });
      window.desktopConsole = { auth: {
        getState: () => response(state),
        login: () => Promise.resolve({ ok: false, error: { code: "AUTH_INVALID_CREDENTIALS", message: "RAW_SECRET" } }),
        changePassword: () => response(state),
        refresh: () => response(state),
        logout: () => response(state),
        onStateChanged: () => () => {},
      } };
    });
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
    await page.getByLabel("登录名").fill("admin");
    await page.getByLabel("密码").fill("wrong");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    const alert = page.getByRole("alert");
    await alert.waitFor();
    assert.equal(await alert.innerText(), "登录名或密码错误");
    assert.doesNotMatch(await alert.innerText(), /RAW_SECRET/);
    await page.close();
  });

  it("consumes the logout command snapshot and returns to the login gate", async function() {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      let state = { authenticated: true, user: { loginName: "admin" }, entitlements: [], errorCode: null, sessionStatus: "authenticated" };
      let resolveLogout = null;
      const response = (data) => Promise.resolve({ ok: true, data });
      window.__authGateFlow = { resolveLogout: () => resolveLogout?.() };
      window.desktopConsole = {
        auth: {
          getState: () => response(state),
          login: () => response(state),
          changePassword: () => response(state),
          refresh: () => response(state),
          logout: () => new Promise((resolve) => {
            resolveLogout = () => {
              state = { authenticated: false, user: null, entitlements: [], errorCode: null, sessionStatus: "signed_out" };
              resolve(response(state));
            };
          }),
          onStateChanged: () => () => {},
        },
        workspace: { getBootstrapState: () => response({ state: "selection_required", workspacePath: null, envOverride: false }) },
        workspaceData: { getRuntimeIdentity: () => response({ workspaceRuntimeId: "auth-logout-runtime", revision: 1 }), onInvalidated: () => () => {} },
      };
    });
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
    const logout = page.getByRole("button", { name: "退出登录", exact: true });
    await logout.waitFor();
    await logout.click();
    const pendingLogout = page.getByRole("button", { name: "退出中…", exact: true });
    await pendingLogout.waitFor();
    assert.equal(await pendingLogout.isDisabled(), true);
    await page.evaluate(() => window.__authGateFlow.resolveLogout());
    await page.getByRole("textbox", { name: "登录名" }).waitFor();
    await page.close();
  });
});

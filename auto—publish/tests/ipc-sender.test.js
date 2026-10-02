const test = require("node:test");
const assert = require("node:assert/strict");
const { createWindowIpcMain } = require("../desktop/security/ipc-sender");

test("IPC accepts only the current window main frame before invoking any handler", () => {
  let handler;
  let calls = 0;
  const webContents = { mainFrame: {}, isDestroyed: () => false };
  let window = { webContents, isDestroyed: () => false };
  const ipc = createWindowIpcMain({ handle: (_, fn) => { handler = fn; }, removeHandler() {} }, () => window);
  ipc.handle("auth:login", () => { calls++; return "accepted"; });
  for (const event of [{}, { sender: {}, senderFrame: webContents.mainFrame }, { sender: webContents, senderFrame: {} }]) {
    assert.throws(() => handler(event), { code: "IPC_SENDER_INVALID" });
  }
  assert.equal(calls, 0);
  assert.equal(handler({ sender: webContents, senderFrame: webContents.mainFrame }), "accepted");
  window = null;
  assert.throws(() => handler({ sender: webContents, senderFrame: webContents.mainFrame }), { code: "IPC_SENDER_INVALID" });
  assert.equal(calls, 1);
});

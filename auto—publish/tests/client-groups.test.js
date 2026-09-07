const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createClientGroupStore } = require("../src/content/client-group-store");
const { createAiContentService } = require("../desktop/services/ai-content-service");
const { createAuthenticatedIpcMain } = require("../desktop/ipc/register");
const { registerAiContentIpc } = require("../desktop/ipc/ai-content-ipc");
const { skipUnavailable } = require("./helpers/link-capability");

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "client-groups-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const id of ["client-a", "client-b", "client-c"]) {
    const directory = path.join(root, "clients", id);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "client.json"), JSON.stringify({ id, name: id, publicationProfiles: { lieju: { city: "合成城市" } } }));
    fs.writeFileSync(path.join(directory, "brand.txt"), "合成客户资料，不应由分组修改");
  }
  return root;
}
const allClients = ["client-a", "client-b", "client-c"];
const filename = (root) => path.join(root, ".autopublish", "client-groups.json");
function change(store, input) { return store.update({ revision: store.read().revision, ...input }, allClients); }

function contents(directory) {
  return Object.fromEntries(fs.readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile()).map((entry) => {
      const file = path.join(entry.parentPath, entry.name);
      return [path.relative(directory, file), fs.readFileSync(file, "utf8")];
    }));
}

test("groups reopen, move clients exclusively and delete without changing customer content", (t) => {
  const root = workspace(t);
  const original = contents(path.join(root, "clients"));
  const store = createClientGroupStore(root);
  assert.deepEqual(store.read(), { revision: 0, groups: [], memberships: [] });
  assert.equal(fs.existsSync(filename(root)), false);
  const first = change(store, { action: "create", name: "  重点推进  " }).groups[0];
  const second = change(store, { action: "create", name: "低频维护" }).groups[1];
  change(store, { action: "assign", groupId: first.id, clientIds: ["client-a", "client-b"] });
  change(store, { action: "assign", groupId: second.id, clientIds: ["client-b", "client-c"] });
  change(store, { action: "rename", groupId: first.id, name: "每周处理" });
  assert.deepEqual(createClientGroupStore(root).read(), store.read());
  assert.deepEqual(store.read().memberships, [
    { clientId: "client-a", groupId: first.id },
    { clientId: "client-b", groupId: second.id },
    { clientId: "client-c", groupId: second.id },
  ]);
  change(store, { action: "assign", groupId: null, clientIds: ["client-c"] });
  change(store, { action: "delete", groupId: first.id });
  assert.deepEqual(store.read().memberships, [{ clientId: "client-b", groupId: second.id }]);
  assert.deepEqual(contents(path.join(root, "clients")), original);
  const otherRoot = workspace(t);
  assert.deepEqual(createClientGroupStore(otherRoot).read(), { revision: 0, groups: [], memberships: [] });
});

test("stale or invalid changes cannot overwrite the persisted grouping", (t) => {
  const root = workspace(t);
  const store = createClientGroupStore(root);
  const staleStore = createClientGroupStore(root);
  const oldRevision = staleStore.read().revision;
  const group = change(store, { action: "create", name: "重点推进" }).groups[0];
  const original = fs.readFileSync(filename(root), "utf8");
  assert.throws(() => staleStore.update({ action: "create", revision: oldRevision, name: "过时操作" }), { code: "CLIENT_GROUP_CONFLICT" });
  for (const input of [
    { action: "create", name: "" }, { action: "create", name: "未分组" },
    { action: "create", name: "全部客户" }, { action: "create", name: "a".repeat(41) },
    { action: "create", name: "控制\n字符" }, { action: "create", name: "重点推进" },
    { action: "rename", groupId: "missing", name: "另一组" },
    { action: "assign", groupId: group.id, clientIds: ["client-a", "missing"] },
    { action: "assign", groupId: group.id, clientIds: ["client-a", "client-a"] },
    { action: "assign", groupId: group.id, clientIds: [] },
    { action: "assign", groupId: group.id, clientIds: ["../client-a"] },
    { action: "create", name: "新组", clientIds: ["client-a"] },
    { action: "constructor", name: "新组" },
  ]) {
    assert.throws(() => change(store, input), /CLIENT_GROUP_/);
    assert.equal(fs.readFileSync(filename(root), "utf8"), original);
  }
});

test("corrupt groups are never replaced by an empty catalog or a new write", (t) => {
  const root = workspace(t);
  const store = createClientGroupStore(root);
  change(store, { action: "create", name: "合成分组" });
  for (const value of ["{broken", JSON.stringify({ version: 2, revision: 1, groups: [], memberships: [] }), JSON.stringify({ version: 1, revision: 1, groups: [], memberships: [{ clientId: "client-a", groupId: "missing" }] })]) {
    fs.writeFileSync(filename(root), value);
    assert.throws(() => store.read(), { code: "CLIENT_GROUP_DATA_INVALID" });
    assert.throws(() => store.update({ action: "create", name: "不能覆盖", revision: 0 }), { code: "CLIENT_GROUP_DATA_INVALID" });
    assert.equal(fs.readFileSync(filename(root), "utf8"), value);
  }
});

test("failed atomic replacement preserves the previous catalog and permits a clean retry", (t) => {
  const root = workspace(t);
  const good = createClientGroupStore(root);
  change(good, { action: "create", name: "原分组" });
  const original = fs.readFileSync(filename(root), "utf8");
  const failing = createClientGroupStore(root, { fs: Object.assign(Object.create(fs), {
    renameSync() { throw Object.assign(new Error("synthetic write failure"), { code: "EIO" }); },
  }) });
  assert.throws(() => change(failing, { action: "create", name: "保存失败" }), { code: "CLIENT_GROUP_STORAGE_FAILED" });
  assert.equal(fs.readFileSync(filename(root), "utf8"), original);
  assert.deepEqual(fs.readdirSync(path.dirname(filename(root))), ["client-groups.json"]);
  assert.equal(change(good, { action: "create", name: "重试成功" }).groups.length, 2);
});

test("linked group storage cannot read or write outside the content workspace", (t) => {
  if (!skipUnavailable(t)) return;
  const root = workspace(t);
  const outside = workspace(t);
  fs.symlinkSync(outside, path.join(root, ".autopublish"), process.platform === "win32" ? "junction" : "dir");
  const store = createClientGroupStore(root);
  assert.throws(() => store.read(), { code: "CLIENT_GROUP_STORAGE_FAILED" });
  assert.throws(() => change(store, { action: "create", name: "不能写入" }), { code: "CLIENT_GROUP_STORAGE_FAILED" });
  assert.equal(fs.existsSync(path.join(outside, "client-groups.json")), false);
});

test("real group service crosses authenticated typed IPC with safe failures and restart persistence", async (t) => {
  const root = workspace(t);
  const service = createAiContentService({ workspaceRoot: root });
  t.after(() => service.dispose());
  let authenticated = false;
  const handlers = new Map();
  const ipcMain = createAuthenticatedIpcMain({ handle(channel, handler) { handlers.set(channel, handler); } }, async () => { if (!authenticated) throw new Error("private auth detail"); });
  registerAiContentIpc({ ipcMain, aiContentService: service });
  const invoke = (channel, payload) => handlers.get(channel)(null, { schemaVersion: 1, payload: channel === "content:update-client-groups" ? { change: payload } : payload });
  const request = { action: "create", revision: 0, name: "重点推进" };
  assert.equal((await invoke("content:update-client-groups", request)).error.code, "AUTH_REQUIRED");
  assert.equal(fs.existsSync(filename(root)), false);
  authenticated = true;
  assert.equal((await invoke("content:update-client-groups", { ...request, clientIds: allClients })).error.code, "IPC_REQUEST_INVALID");
  const created = await invoke("content:update-client-groups", request);
  assert.equal(created.ok, true);
  const groupId = created.data.groups[0].id;
  const assigned = await invoke("content:update-client-groups", { action: "assign", revision: 1, groupId, clientIds: allClients });
  assert.equal(assigned.ok, true);
  assert.equal(assigned.data.memberships.length, 3);
  const stale = await invoke("content:update-client-groups", { action: "delete", revision: 1, groupId });
  assert.equal(stale.error.code, "CLIENT_GROUP_CONFLICT");
  assert.doesNotMatch(JSON.stringify(stale), /client-groups-|private|tmp\//);
  assert.deepEqual((await invoke("content:get-client-groups", {})).data, assigned.data);
  const { loadPreloadHarness } = require("./helpers/preload-harness");
  const preload = loadPreloadHarness({ invoke: (channel, input) => handlers.get(channel)(null, input) });
  assert.deepEqual((await preload.api.content.getClientGroups()).data, assigned.data);
  const renamed = await preload.api.content.updateClientGroups({ action: "rename", revision: 2, groupId, name: "每周处理" });
  assert.equal(renamed.ok, true);
  assert.equal(renamed.data.groups[0].name, "每周处理");
  const reopened = createAiContentService({ workspaceRoot: root });
  t.after(() => reopened.dispose());
  assert.deepEqual(reopened.getClientGroups(), renamed.data);
  service.dispose();
  assert.equal((await invoke("content:update-client-groups", { action: "delete", revision: 3, groupId })).error.code, "CLIENT_GROUP_UNAVAILABLE");
  assert.deepEqual(reopened.getClientGroups(), renamed.data);
});

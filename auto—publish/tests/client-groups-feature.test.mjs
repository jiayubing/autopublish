import assert from "node:assert/strict";
import test from "node:test";
import { createContentSourcesFeature } from "../media-workbench/src/features/content/content-sources-feature.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const catalog = (revision) => ({ revision, groups: [{ id: `group-${revision}`, name: `分组 ${revision}` }], memberships: [] });
function setup(t, adapters) {
  const feature = createContentSourcesFeature({
    listClients: async () => [{ id: "client-a", name: "客户 A" }, { id: "client-b", name: "客户 B" }],
    listTemplateCatalog: async () => ({ revision: "1", platforms: [], templates: [], diagnostics: [] }),
    listQuestions: async () => [], listResearch: async () => [],
    ...adapters,
  });
  t.after(() => feature.dispose());
  feature.setScope({ workspaceRuntimeId: "workspace-a" });
  return feature;
}

test("late group reads cannot replace newer results or cross a workspace switch", async (t) => {
  const pending = deferred();
  let result = pending.promise;
  const feature = setup(t, { getClientGroups: () => result });
  const first = feature.refreshClientGroups("initial");
  result = catalog(2);
  await feature.refreshClientGroups("manual");
  pending.resolve(catalog(1));
  assert.equal(await first, false);
  assert.deepEqual(feature.getSnapshot().clientGroups, catalog(2));
  const oldWorkspace = deferred();
  result = oldWorkspace.promise;
  const oldRead = feature.refreshClientGroups();
  feature.setScope({ workspaceRuntimeId: "workspace-b" });
  assert.deepEqual(feature.getSnapshot().clientGroups, { revision: 0, groups: [], memberships: [] });
  oldWorkspace.resolve(catalog(3));
  assert.equal(await oldRead, false);
  assert.equal(feature.getSnapshot().clientGroups.revision, 0);
});

test("group command owns workspace scope and beats a previously started group query", async (t) => {
  const read = deferred();
  const write = deferred();
  const feature = setup(t, { getClientGroups: () => read.promise, updateClientGroups: () => write.promise });
  await feature.refresh("initial");
  const query = feature.refreshClientGroups();
  const command = feature.commands.updateClientGroups({ action: "create", revision: 0, name: "新组" });
  await feature.selectClient("client-b");
  assert.equal(feature.getSnapshot().commands.updateClientGroups.busy, true);
  write.resolve(catalog(2));
  assert.deepEqual(await command, catalog(2));
  read.resolve(catalog(1));
  assert.equal(await query, false);
  assert.deepEqual(feature.getSnapshot().clientGroups, catalog(2));
  assert.equal(feature.getSnapshot().selectedClientId, "client-b");
  assert.equal(feature.getSnapshot().clientGroupsQuery.loading, false);
});

test("stale group commands do not modify the new workspace; conflicts refresh without blocking content", async (t) => {
  const write = deferred();
  let writeResult = write.promise;
  const feature = setup(t, { getClientGroups: async () => catalog(4), updateClientGroups: () => writeResult });
  await feature.refresh("initial");
  const oldWrite = feature.commands.updateClientGroups({ action: "create", revision: 0, name: "旧内容库" });
  feature.setScope({ workspaceRuntimeId: "workspace-b" });
  await feature.refreshClientGroups();
  write.resolve(catalog(5));
  assert.equal((await oldWrite).stale, true);
  assert.deepEqual(feature.getSnapshot().clientGroups, catalog(4));
  writeResult = Promise.reject(Object.assign(new Error("conflict"), { code: "CLIENT_GROUP_CONFLICT", userMessage: "分组已被更新，请重新操作。" }));
  await assert.rejects(feature.commands.updateClientGroups({ action: "create", revision: 3, name: "过期修改" }), { code: "CLIENT_GROUP_CONFLICT" });
  assert.equal(feature.getSnapshot().clientGroups.revision, 4);
  assert.equal(feature.getSnapshot().commands.updateClientGroups.busy, false);
  await feature.refresh("manual");
  assert.equal(feature.getSnapshot().clients.length, 2);
  assert.equal(feature.getSnapshot().query.error, null);
});

test("group read errors are isolated and a successful retry clears only that error", async (t) => {
  let fail = true;
  const feature = setup(t, { getClientGroups: async () => {
    if (fail) throw Object.assign(new Error("private path"), { code: "CLIENT_GROUP_DATA_INVALID", userMessage: "客户分组暂不可用。" });
    return catalog(1);
  } });
  await feature.refresh("initial");
  assert.equal(await feature.refreshClientGroups(), false);
  assert.equal(feature.getSnapshot().clientGroupsQuery.error.code, "CLIENT_GROUP_DATA_INVALID");
  assert.equal(feature.getSnapshot().query.error, null);
  assert.equal(feature.getSnapshot().clients.length, 2);
  fail = false;
  await feature.refreshClientGroups();
  assert.equal(feature.getSnapshot().clientGroupsQuery.error, null);
  assert.equal(feature.getSnapshot().clientGroups.revision, 1);
});

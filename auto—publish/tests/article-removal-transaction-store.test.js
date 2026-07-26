const { it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createArticleRemovalTransactionStore } = require("../src/content/article-removal-transaction-store");

it("reclaims a stale compare-and-update lock left by a killed process", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "removal-lock-"));
  const store = createArticleRemovalTransactionStore({ workspaceRoot: root, lockTtlMs: 1000 });
  store.save({ id: "tx", revision: 0, createdAt: "2026-07-25T00:00:00.000Z", updatedAt: "2026-07-25T00:00:00.000Z" });
  const lock = path.join(store.directory, "removal-tx.json.lock"); fs.writeFileSync(lock, JSON.stringify({ version: 1, token: "dead", owner: "dead", pid: 2147483647 }));
  const old = new Date(Date.now() - 2000); fs.utimesSync(lock, old, old);
  const updated = store.compareAndUpdate("tx", 0, (value) => Object.assign(value, { phase: "intent" }));
  assert.equal(updated.phase, "intent"); assert.equal(updated.revision, 1); assert.equal(fs.existsSync(lock), false);
});

it("does not reclaim an aged lock whose recorded owner is still alive", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "removal-live-lock-"));
  const store = createArticleRemovalTransactionStore({ workspaceRoot: root, lockTtlMs: 1000 });
  store.save({ id: "tx", revision: 0, createdAt: "2026-07-25T00:00:00.000Z", updatedAt: "2026-07-25T00:00:00.000Z" });
  const lock = path.join(store.directory, "removal-tx.json.lock"); fs.writeFileSync(lock, JSON.stringify({ token: "live", owner: String(process.pid), pid: process.pid }));
  const old = new Date(Date.now() - 2000); fs.utimesSync(lock, old, old);
  assert.equal(store.compareAndUpdate("tx", 0, (value) => value), null); assert.equal(fs.existsSync(lock), true);
  fs.unlinkSync(lock);
});

it("fails closed for aged locks with unknown owner metadata", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "removal-unknown-lock-"));
  const store = createArticleRemovalTransactionStore({ workspaceRoot: root, lockTtlMs: 1000 });
  store.save({ id: "tx", revision: 0, createdAt: "2026-07-25T00:00:00.000Z", updatedAt: "2026-07-25T00:00:00.000Z" });
  const lock = path.join(store.directory, "removal-tx.json.lock");
  fs.writeFileSync(lock, JSON.stringify({ version: 99, token: "unknown", owner: "unknown", pid: process.pid }));
  const old = new Date(Date.now() - 2000); fs.utimesSync(lock, old, old);
  assert.equal(store.compareAndUpdate("tx", 0, (value) => value), null);
  assert.equal(fs.existsSync(lock), true);
  fs.unlinkSync(lock);
});

it("fails closed for an aged corrupt lock", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "removal-corrupt-lock-"));
  const store = createArticleRemovalTransactionStore({ workspaceRoot: root, lockTtlMs: 1000 });
  store.save({ id: "tx", revision: 0, createdAt: "2026-07-25T00:00:00.000Z", updatedAt: "2026-07-25T00:00:00.000Z" });
  const lock = path.join(store.directory, "removal-tx.json.lock");
  fs.writeFileSync(lock, "{not-json");
  const old = new Date(Date.now() - 2000); fs.utimesSync(lock, old, old);
  assert.equal(store.compareAndUpdate("tx", 0, (value) => value), null);
  assert.equal(fs.existsSync(lock), true);
  fs.unlinkSync(lock);
});

it("does not unlink a replacement lock during stale-lock ABA recovery", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "removal-aba-lock-"));
  const store = createArticleRemovalTransactionStore({ workspaceRoot: root, lockTtlMs: 1000 });
  store.save({ id: "tx", revision: 0, createdAt: "2026-07-25T00:00:00.000Z", updatedAt: "2026-07-25T00:00:00.000Z" });
  const lock = path.join(store.directory, "removal-tx.json.lock");
  fs.writeFileSync(lock, JSON.stringify({ version: 1, token: "dead", owner: "dead", pid: 2147483647 }));
  const old = new Date(Date.now() - 2000); fs.utimesSync(lock, old, old);
  const rename = fs.renameSync;
  fs.renameSync = function(from, to) {
    rename(from, to);
    if (from === lock && to.startsWith(lock + ".reclaim-")) {
      fs.writeFileSync(lock, JSON.stringify({ version: 1, token: "replacement", owner: "replacement", pid: process.pid }));
    }
  };
  try { assert.equal(store.compareAndUpdate("tx", 0, (value) => value), null); }
  finally { fs.renameSync = rename; }
  assert.equal(JSON.parse(fs.readFileSync(lock, "utf8")).token, "replacement");
  fs.unlinkSync(lock);
});

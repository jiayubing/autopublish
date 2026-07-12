const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { listClients, getClient, loadClientKnowledge, readSearchQuery } = require("../src/content/client-knowledge");

describe("client knowledge", function() {
  let root;
  let clientDirectory;

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "content-knowledge-"));
    clientDirectory = path.join(root, "clients", "travel-client");
    fs.mkdirSync(path.join(clientDirectory, "articles"), { recursive: true });
    fs.writeFileSync(path.join(clientDirectory, "client.json"), JSON.stringify({ id: "client-1", name: "Travel Client" }));
    fs.writeFileSync(path.join(clientDirectory, "search_query.txt"), "Shanghai hotels\nfamily travel \n");
    fs.writeFileSync(path.join(clientDirectory, "brand.md"), "# Brand");
    fs.writeFileSync(path.join(clientDirectory, "service.txt"), "service");
    fs.writeFileSync(path.join(clientDirectory, "facts.json"), "{\"city\":\"Shanghai\"}");
    fs.writeFileSync(path.join(clientDirectory, "ignored.png"), "not knowledge");
    fs.writeFileSync(path.join(clientDirectory, "articles", "old.md"), "old");
  });

  afterEach(function() { fs.rmSync(root, { recursive: true, force: true }); });

  it("lists clients with metadata and first-level knowledge files", function() {
    const clients = listClients(root);
    assert.equal(clients.length, 1);
    assert.equal(clients[0].id, "client-1");
    assert.equal(clients[0].searchQuery, "Shanghai hotels\nfamily travel ");
    assert.deepStrictEqual(clients[0].knowledgeFiles.map(function(file) { return file.name; }), ["brand.md", "facts.json", "service.txt"]);
    assert.deepStrictEqual(getClient(root, "client-1"), clients[0]);
  });

  it("reads query and knowledge with explicit workspace context", function() {
    assert.equal(readSearchQuery(clientDirectory, root), "Shanghai hotels\nfamily travel ");
    assert.deepStrictEqual(loadClientKnowledge(clientDirectory, root).map(function(file) { return file.name; }), ["brand.md", "facts.json", "service.txt"]);
  });

  it("requires context instead of trusting a clients basename", function() {
    const fakeClient = path.join(root, "other", "clients", "fake-client");
    fs.mkdirSync(fakeClient, { recursive: true });
    fs.writeFileSync(path.join(fakeClient, "search_query.txt"), "fake");
    assert.throws(function() { readSearchQuery(fakeClient); }, function(error) { return error.code === "CLIENT_PATH_CONTEXT_REQUIRED"; });
    assert.throws(function() { loadClientKnowledge(fakeClient); }, function(error) { return error.code === "CLIENT_PATH_CONTEXT_REQUIRED"; });
  });

  it("rejects a client symlink resolving outside workspace.clients", { skip: process.platform === "win32" }, function() {
    const outside = path.join(root, "outside-client");
    const linked = path.join(root, "clients", "linked-client");
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, "search_query.txt"), "outside");
    fs.symlinkSync(outside, linked, "junction");
    assert.throws(function() { readSearchQuery(linked, root); }, function(error) { return error.code === "CLIENT_PATH_OUT_OF_BOUNDS"; });
    assert.throws(function() { loadClientKnowledge(linked, root); }, function(error) { return error.code === "CLIENT_PATH_OUT_OF_BOUNDS"; });
  });

  it("rejects missing and empty queries", function() {
    fs.unlinkSync(path.join(clientDirectory, "search_query.txt"));
    assert.throws(function() { readSearchQuery(clientDirectory, root); }, function(error) { return error.code === "SEARCH_QUERY_MISSING"; });
    fs.writeFileSync(path.join(clientDirectory, "search_query.txt"), " \n\t");
    assert.throws(function() { readSearchQuery(clientDirectory, root); }, function(error) { return error.code === "SEARCH_QUERY_MISSING"; });
  });

  it("rejects directories outside workspace.clients", function() {
    const outside = path.join(root, "outside-client");
    fs.mkdirSync(outside, { recursive: true });
    assert.throws(function() { readSearchQuery(outside, root); }, function(error) { return error.code === "CLIENT_PATH_OUT_OF_BOUNDS"; });
    assert.throws(function() { loadClientKnowledge(outside, root); }, function(error) { return error.code === "CLIENT_PATH_OUT_OF_BOUNDS"; });
  });
});

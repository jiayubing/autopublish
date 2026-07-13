const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { listClients, getClient, loadClientKnowledge, readSearchQuery } = require("../src/content/client-knowledge");

const LINK_UNAVAILABLE_CODES = new Set(["EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP", "EINVAL", "ENOSYS"]);

function createLinkOrSkip(t, target, link, type) {
  try {
    fs.symlinkSync(target, link, type);
    return true;
  } catch (error) {
    if (LINK_UNAVAILABLE_CODES.has(error.code)) {
      t.skip("links are unavailable: " + error.code);
      return false;
    }
    throw error;
  }
}

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
    fs.writeFileSync(path.join(clientDirectory, "questions.json"), JSON.stringify({ version: 1, questions: [] }));
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

  it("rejects null and non-string workspace roots with a boundary error", function() {
    [null, 42, {}, []].forEach(function(workspaceRoot) {
      assert.throws(function() { listClients(workspaceRoot); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
      assert.throws(function() { getClient(workspaceRoot, "client-1"); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
    });
  });

  it("treats a workspace named clients as a workspace root", function() {
    const workspaceRoot = path.join(root, "clients");
    const clientsRoot = path.join(workspaceRoot, "clients");
    const nestedClientDirectory = path.join(clientsRoot, "client-1");
    fs.mkdirSync(nestedClientDirectory, { recursive: true });
    fs.writeFileSync(path.join(nestedClientDirectory, "client.json"), JSON.stringify({ id: "client-1", name: "Nested Client" }));
    fs.writeFileSync(path.join(nestedClientDirectory, "search_query.txt"), "nested query");
    fs.writeFileSync(path.join(nestedClientDirectory, "brand.md"), "# Nested Brand");

    const clients = listClients(workspaceRoot);
    assert.equal(clients.length, 1);
    assert.equal(clients[0].id, "client-1");
    assert.equal(clients[0].searchQuery, "nested query");
    assert.deepStrictEqual(clients[0].knowledgeFiles.map(function(file) { return file.name; }), ["brand.md"]);
    const boundary = { workspaceRoot: workspaceRoot, clientsRoot: clientsRoot };
    assert.equal(readSearchQuery(nestedClientDirectory, boundary), "nested query");
    assert.deepStrictEqual(loadClientKnowledge(nestedClientDirectory, boundary).map(function(file) { return file.name; }), ["brand.md"]);
  });

  it("reads query and knowledge with explicit workspace context", function() {
    assert.equal(readSearchQuery(clientDirectory, root), "Shanghai hotels\nfamily travel ");
    assert.deepStrictEqual(loadClientKnowledge(clientDirectory, root).map(function(file) { return file.name; }), ["brand.md", "facts.json", "service.txt"]);
  });

  it("rejects an explicit boundary whose clients root is not workspace.clients", function() {
    const otherClientDirectory = path.join(root, "other", "client");
    fs.mkdirSync(otherClientDirectory, { recursive: true });
    fs.writeFileSync(path.join(otherClientDirectory, "search_query.txt"), "other query");
    const forgedBoundary = { workspaceRoot: root, clientsRoot: path.join(root, "other") };

    assert.throws(function() {
      readSearchQuery(otherClientDirectory, forgedBoundary);
    }, function(error) { return error.code === "CLIENT_PATH_OUT_OF_BOUNDS"; });
    assert.throws(function() {
      loadClientKnowledge(otherClientDirectory, forgedBoundary);
    }, function(error) { return error.code === "CLIENT_PATH_OUT_OF_BOUNDS"; });
  });

  it("uses directory defaults when client metadata is missing", function() {
    fs.unlinkSync(path.join(clientDirectory, "client.json"));
    const client = listClients(root)[0];
    assert.equal(client.id, "travel-client");
    assert.equal(client.name, "travel-client");
  });

  it("normalizes unexpected clients root realpath errors", function() {
    const originalRealpathSync = fs.realpathSync;
    const realpathError = new Error("simulated realpath failure");
    realpathError.code = "EIO";
    fs.realpathSync = function() { throw realpathError; };

    try {
      assert.throws(function() { listClients(root); }, function(error) {
        assert.equal(error.code, "CLIENT_PATH_OUT_OF_BOUNDS");
        assert.notEqual(error, realpathError);
        return true;
      });
    } finally {
      fs.realpathSync = originalRealpathSync;
    }
  });

  it("normalizes unexpected client directory realpath errors", function() {
    const originalRealpathSync = fs.realpathSync;
    const realpathError = new Error("simulated client realpath failure");
    realpathError.code = "EIO";
    fs.realpathSync = function(candidate) {
      if (path.resolve(candidate) === path.resolve(clientDirectory)) throw realpathError;
      return originalRealpathSync.apply(this, arguments);
    };

    try {
      assert.throws(function() { readSearchQuery(clientDirectory, root); }, function(error) {
        assert.equal(error.code, "CLIENT_PATH_OUT_OF_BOUNDS");
        assert.notEqual(error, realpathError);
        return true;
      });
    } finally {
      fs.realpathSync = originalRealpathSync;
    }
  });

  it("keeps missing workspace and clients roots as an empty client list", function() {
    const missingWorkspace = path.join(root, "missing-workspace");
    const missingClients = path.join(root, "missing-clients");
    assert.deepStrictEqual(listClients(missingWorkspace), []);
    fs.mkdirSync(missingClients);
    assert.deepStrictEqual(listClients(missingClients), []);
  });

  it("does not use the workspace as clients root when clients is missing", function() {
    const outsideClient = path.join(root, "outside-client");
    fs.rmSync(path.join(root, "clients"), { recursive: true, force: true });
    fs.mkdirSync(outsideClient, { recursive: true });
    fs.writeFileSync(path.join(outsideClient, "search_query.txt"), "outside");

    assert.throws(function() {
      readSearchQuery(outsideClient, root);
    }, function(error) { return error.code === "CLIENT_PATH_OUT_OF_BOUNDS"; });
  });

  it("rejects a clients root that is a regular file", function() {
    const clientsRoot = path.join(root, "clients");
    fs.rmSync(clientsRoot, { recursive: true, force: true });
    fs.writeFileSync(clientsRoot, "not a directory");
    assert.throws(function() { listClients(root); }, function(error) {
      return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
    });
  });

  it("rejects client metadata that is not a regular file", function() {
    const metadataPath = path.join(clientDirectory, "client.json");
    fs.unlinkSync(metadataPath);
    fs.mkdirSync(metadataPath);
    assert.throws(function() { listClients(root); }, function(error) {
      return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
    });
  });

  it("rejects client metadata symlinks resolving outside the client directory", function(t) {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "content-metadata-outside-"));
    const external = path.join(outside, "client.json");
    const linked = path.join(clientDirectory, "client.json");
    fs.writeFileSync(external, JSON.stringify({ id: "outside", name: "Outside" }));
    fs.unlinkSync(linked);
    try {
      if (!createLinkOrSkip(t, external, linked, "file")) return;
      assert.throws(function() { listClients(root); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("requires context instead of trusting a clients basename", function() {
    const fakeClient = path.join(root, "other", "clients", "fake-client");
    fs.mkdirSync(fakeClient, { recursive: true });
    fs.writeFileSync(path.join(fakeClient, "search_query.txt"), "fake");
    assert.throws(function() { readSearchQuery(fakeClient); }, function(error) { return error.code === "CLIENT_PATH_CONTEXT_REQUIRED"; });
    assert.throws(function() { loadClientKnowledge(fakeClient); }, function(error) { return error.code === "CLIENT_PATH_CONTEXT_REQUIRED"; });
  });

  it("rejects a client symlink resolving outside workspace.clients", function(t) {
    const outside = path.join(root, "outside-client");
    const linked = path.join(root, "clients", "linked-client");
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, "search_query.txt"), "outside");
    if (!createLinkOrSkip(t, outside, linked, process.platform === "win32" ? "junction" : "dir")) return;
    assert.throws(function() { readSearchQuery(linked, root); }, function(error) { return error.code === "CLIENT_PATH_OUT_OF_BOUNDS"; });
    assert.throws(function() { loadClientKnowledge(linked, root); }, function(error) { return error.code === "CLIENT_PATH_OUT_OF_BOUNDS"; });
  });

  it("rejects a clients root symlink resolving outside the workspace", function(t) {
    const originalClients = path.join(root, "clients");
    const outsideClients = fs.mkdtempSync(path.join(os.tmpdir(), "content-clients-outside-"));
    const externalClient = path.join(outsideClients, "travel-client");
    fs.rmSync(originalClients, { recursive: true, force: true });
    try {
      if (!createLinkOrSkip(t, outsideClients, originalClients, process.platform === "win32" ? "junction" : "dir")) return;
      assert.throws(function() {
        listClients(root);
      }, function(error) { return error.code === "CLIENT_PATH_OUT_OF_BOUNDS"; });
      assert.throws(function() {
        getClient(root, "client-1");
      }, function(error) { return error.code === "CLIENT_PATH_OUT_OF_BOUNDS"; });
      fs.mkdirSync(externalClient, { recursive: true });
      fs.writeFileSync(path.join(externalClient, "search_query.txt"), "outside");
      assert.throws(function() {
        readSearchQuery(path.join(originalClients, "travel-client"), root);
      }, function(error) { return error.code === "CLIENT_PATH_OUT_OF_BOUNDS"; });
    } finally {
      fs.rmSync(originalClients, { recursive: true, force: true });
      fs.rmSync(outsideClients, { recursive: true, force: true });
    }
  });

  it("rejects a search query file link resolving outside the client directory", function(t) {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "content-query-outside-"));
    const external = path.join(outside, "search_query.txt");
    const linked = path.join(clientDirectory, "search_query.txt");
    fs.writeFileSync(external, "outside");
    fs.unlinkSync(linked);
    try {
      if (!createLinkOrSkip(t, external, linked, "file")) return;
      assert.throws(function() { readSearchQuery(clientDirectory, root); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a search query entry that is not a regular file", function() {
    const queryPath = path.join(clientDirectory, "search_query.txt");
    fs.unlinkSync(queryPath);
    fs.mkdirSync(queryPath);
    assert.throws(function() { readSearchQuery(clientDirectory, root); }, function(error) {
      return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
    });
  });

  it("rejects missing and empty queries", function() {
    fs.unlinkSync(path.join(clientDirectory, "search_query.txt"));
    assert.throws(function() { readSearchQuery(clientDirectory, root); }, function(error) { return error.code === "SEARCH_QUERY_MISSING"; });
    fs.writeFileSync(path.join(clientDirectory, "search_query.txt"), " \n\t");
    assert.throws(function() { readSearchQuery(clientDirectory, root); }, function(error) { return error.code === "SEARCH_QUERY_MISSING"; });
  });

  it("reports a missing client before checking its search query", function() {
    const missingClientDirectory = path.join(root, "clients", "missing-client");
    assert.throws(function() { readSearchQuery(missingClientDirectory, root); }, function(error) {
      return error.code === "CLIENT_NOT_FOUND";
    });
  });

  it("rejects directories outside workspace.clients", function() {
    const outside = path.join(root, "outside-client");
    fs.mkdirSync(outside, { recursive: true });
    assert.throws(function() { readSearchQuery(outside, root); }, function(error) { return error.code === "CLIENT_PATH_OUT_OF_BOUNDS"; });
    assert.throws(function() { loadClientKnowledge(outside, root); }, function(error) { return error.code === "CLIENT_PATH_OUT_OF_BOUNDS"; });
  });
});

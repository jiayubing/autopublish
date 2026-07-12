const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createQuestionStore } = require("../src/content/question-store");

describe("question store", function() {
  let root;
  let store;
  let timestamps;

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "question-store-"));
    fs.mkdirSync(path.join(root, "clients", "client-1"), { recursive: true });
    timestamps = ["2026-07-12T00:00:00.000Z", "2026-07-12T00:01:00.000Z", "2026-07-12T00:02:00.000Z"];
    store = createQuestionStore(root, {
      createId: function() { return "question-1"; },
      now: function() { return timestamps.shift() || "2026-07-12T00:03:00.000Z"; }
    });
  });

  afterEach(function() { fs.rmSync(root, { recursive: true, force: true }); });

  it("creates, updates, lists, toggles, and deletes a stable question", function() {
    const created = store.createQuestion("client-1", { text: " 上海  周边推荐 ", extra: "ignored" });
    assert.equal(created.id, "question-1");
    assert.equal(created.text, "上海  周边推荐");
    assert.equal(created.enabled, true);
    assert.equal(created.createdAt, "2026-07-12T00:00:00.000Z");
    assert.equal(created.updatedAt, "2026-07-12T00:00:00.000Z");
    assert.equal(created.extra, undefined);
    const updated = store.updateQuestion("client-1", "question-1", { text: "上海酒店推荐", enabled: false, extra: "ignored" });
    assert.equal(updated.id, "question-1");
    assert.equal(updated.createdAt, created.createdAt);
    assert.equal(updated.updatedAt, "2026-07-12T00:01:00.000Z");
    assert.equal(updated.extra, undefined);
    assert.equal(store.listQuestions("client-1")[0].enabled, false);
    const saved = JSON.parse(fs.readFileSync(path.join(root, "clients", "client-1", "questions.json"), "utf8"));
    assert.deepStrictEqual(Object.keys(saved.questions[0]).sort(), ["createdAt", "enabled", "id", "text", "updatedAt"]);
    assert.deepStrictEqual(fs.readdirSync(path.join(root, "clients", "client-1")).filter(function(name) {
      return name.includes(".tmp-") || name.includes(".bak-");
    }), []);
    store.deleteQuestion("client-1", "question-1");
    assert.deepStrictEqual(store.listQuestions("client-1"), []);
  });

  it("imports search_query.txt once and rejects normalized duplicates", function() {
    fs.writeFileSync(path.join(root, "clients", "client-1", "search_query.txt"), "上海  酒店推荐\r\n", "utf8");
    assert.equal(store.listQuestions("client-1")[0].text, "上海  酒店推荐");
    assert.equal(store.listQuestions("client-1").length, 1);
    assert.throws(function() { store.createQuestion("client-1", { text: "上海 酒店推荐" }); }, function(error) {
      return error.code === "QUESTION_DUPLICATE";
    });
  });

  it("keeps the old questions file readable when the atomic rename fails", function() {
    const created = store.createQuestion("client-1", { text: "original question" });
    const filename = path.join(root, "clients", "client-1", "questions.json");
    const originalRenameSync = fs.renameSync;
    const renameCalls = [];
    fs.renameSync = function(source, destination) {
      renameCalls.push({ source: source, destination: destination });
      if (source.startsWith(filename + ".tmp-") && destination === filename) {
        const error = new Error("simulated rename failure");
        error.code = "EACCES";
        throw error;
      }
      return originalRenameSync.apply(this, arguments);
    };

    try {
      assert.throws(function() {
        store.updateQuestion("client-1", created.id, { text: "failed update" });
      }, function(error) {
        return error.code === "EACCES";
      });
    } finally {
      fs.renameSync = originalRenameSync;
    }

    assert.equal(renameCalls.length, 1);
    assert.equal(renameCalls[0].destination, filename);
    assert.deepStrictEqual(store.listQuestions("client-1"), [created]);
    assert.deepStrictEqual(fs.readdirSync(path.dirname(filename)).filter(function(name) {
      return name.includes(".tmp-") || name.includes(".bak-");
    }), []);
  });

  it("preserves the atomic operation error when temporary cleanup fails", function() {
    const created = store.createQuestion("client-1", { text: "original question" });
    const filename = path.join(root, "clients", "client-1", "questions.json");
    const originalExistsSync = fs.existsSync;
    const originalRenameSync = fs.renameSync;
    const originalUnlinkSync = fs.unlinkSync;
    const operationError = new Error("simulated rename failure");
    operationError.code = "EACCES";
    const cleanupError = new Error("simulated cleanup failure");
    cleanupError.code = "EPERM";

    fs.renameSync = function(source, destination) {
      if (source.startsWith(filename + ".tmp-") && destination === filename) throw operationError;
      return originalRenameSync.apply(this, arguments);
    };
    fs.existsSync = function(candidate) {
      if (candidate.startsWith(filename + ".tmp-")) return true;
      return originalExistsSync.apply(this, arguments);
    };
    fs.unlinkSync = function(candidate) {
      if (candidate.startsWith(filename + ".tmp-")) throw cleanupError;
      return originalUnlinkSync.apply(this, arguments);
    };

    try {
      assert.throws(function() {
        store.updateQuestion("client-1", created.id, { text: "failed update" });
      }, function(error) {
        assert.equal(error, operationError);
        return true;
      });
    } finally {
      fs.existsSync = originalExistsSync;
      fs.renameSync = originalRenameSync;
      fs.unlinkSync = originalUnlinkSync;
    }
  });

  it("throws a temporary cleanup error when the atomic operation succeeds", function() {
    store.createQuestion("client-1", { text: "original question" });
    const filename = path.join(root, "clients", "client-1", "questions.json");
    const originalExistsSync = fs.existsSync;
    const originalUnlinkSync = fs.unlinkSync;
    const cleanupError = new Error("simulated cleanup failure");
    cleanupError.code = "EPERM";

    fs.existsSync = function(candidate) {
      if (candidate.startsWith(filename + ".tmp-")) return true;
      return originalExistsSync.apply(this, arguments);
    };
    fs.unlinkSync = function(candidate) {
      if (candidate.startsWith(filename + ".tmp-")) throw cleanupError;
      return originalUnlinkSync.apply(this, arguments);
    };

    try {
      assert.throws(function() {
        store.updateQuestion("client-1", "question-1", { text: "updated question" });
      }, function(error) {
        assert.equal(error, cleanupError);
        return true;
      });
    } finally {
      fs.existsSync = originalExistsSync;
      fs.unlinkSync = originalUnlinkSync;
    }
  });

  it("returns stable errors for invalid paths and question data", function() {
    assert.throws(function() { store.listQuestions("../client-1"); }, function(error) {
      return error.code === "CLIENT_ID_INVALID";
    });
    assert.throws(function() { store.listQuestions(path.resolve(root, "clients", "client-1")); }, function(error) {
      return error.code === "CLIENT_ID_INVALID";
    });
    assert.throws(function() { store.getQuestion("client-1", "../question-1"); }, function(error) {
      return error.code === "QUESTION_ID_INVALID";
    });
    assert.throws(function() { store.updateQuestion("client-1", path.resolve(root, "question-1"), { enabled: false }); }, function(error) {
      return error.code === "QUESTION_ID_INVALID";
    });
    assert.throws(function() { store.deleteQuestion("client-1", "question/1"); }, function(error) {
      return error.code === "QUESTION_ID_INVALID";
    });
    const invalidSegments = [
      " ",
      "\t",
      "client ",
      "client.",
      "foo:bar",
      "foo\u0001bar",
      "CON",
      "prn.txt",
      "Aux.backup",
      "COM1.log",
      "LPT9.data"
    ];
    invalidSegments.forEach(function(clientId) {
      assert.throws(function() { store.listQuestions(clientId); }, function(error) {
        return error.code === "CLIENT_ID_INVALID";
      });
    });
    invalidSegments.forEach(function(questionId) {
      assert.throws(function() { store.getQuestion("client-1", questionId); }, function(error) {
        return error.code === "QUESTION_ID_INVALID";
      });
    });
    invalidSegments.forEach(function(id) {
      const invalidIdStore = createQuestionStore(root, { createId: function() { return id; } });
      assert.throws(function() {
        invalidIdStore.createQuestion("client-1", { text: "question for " + id });
      }, function(error) {
        return error.code === "QUESTION_ID_INVALID";
      });
    });
    assert.throws(function() { store.createQuestion("client-1", { text: " " }); }, function(error) {
      return error.code === "QUESTION_TEXT_INVALID";
    });
    assert.throws(function() { store.createQuestion("client-1", { text: "x".repeat(2001) }); }, function(error) {
      return error.code === "QUESTION_TEXT_INVALID";
    });
  });

  it("rejects malformed questions.json with a stable error", function() {
    const filename = path.join(root, "clients", "client-1", "questions.json");
    fs.writeFileSync(filename, JSON.stringify({ version: 2, questions: [] }), "utf8");
    assert.throws(function() { store.listQuestions("client-1"); }, function(error) {
      return error.code === "QUESTION_INVALID_JSON";
    });
    fs.writeFileSync(filename, "{", "utf8");
    assert.throws(function() { store.listQuestions("client-1"); }, function(error) {
      return error.code === "QUESTION_INVALID_JSON";
    });
    fs.writeFileSync(filename, JSON.stringify({ version: 1, questions: [{
      id: "question-1",
      text: "缺少更新时间",
      enabled: true,
      createdAt: "2026-07-12T00:00:00.000Z"
    }] }), "utf8");
    assert.throws(function() { store.listQuestions("client-1"); }, function(error) {
      return error.code === "QUESTION_INVALID_JSON";
    });
  });

  it("rejects a questions.json file symlink escaping workspace", function(t) {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "question-store-file-outside-"));
    const external = path.join(outside, "questions.json");
    const linked = path.join(root, "clients", "client-1", "questions.json");
    fs.writeFileSync(external, JSON.stringify({ version: 1, questions: [{
      id: "outside-question",
      text: "外部文件内容",
      enabled: true,
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z"
    }] }), "utf8");
    try {
      try {
        fs.symlinkSync(external, linked, "file");
      } catch (error) {
        t.skip("file links are unavailable: " + error.code);
        return;
      }
      assert.throws(function() { store.listQuestions("client-1"); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
      assert.throws(function() { store.getQuestion("client-1", "outside-question"); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
      assert.throws(function() { store.createQuestion("client-1", { text: "new outside question" }); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
      assert.throws(function() { store.updateQuestion("client-1", "outside-question", { enabled: false }); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
      assert.throws(function() { store.deleteQuestion("client-1", "outside-question"); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a search_query.txt file symlink escaping workspace", function(t) {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "question-store-query-outside-"));
    const external = path.join(outside, "search_query.txt");
    const linked = path.join(root, "clients", "client-1", "search_query.txt");
    fs.writeFileSync(external, "外部旧查询", "utf8");
    try {
      try {
        fs.symlinkSync(external, linked, "file");
      } catch (error) {
        t.skip("file links are unavailable: " + error.code);
        return;
      }
      assert.throws(function() { store.listQuestions("client-1"); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
      assert.throws(function() { store.getQuestion("client-1", "missing-question"); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
      assert.throws(function() { store.createQuestion("client-1", { text: "new outside query" }); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
      assert.throws(function() { store.updateQuestion("client-1", "missing-question", { enabled: false }); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
      assert.throws(function() { store.deleteQuestion("client-1", "missing-question"); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a customer directory symlink escaping workspace.clients", function(t) {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "question-store-outside-"));
    const linked = path.join(root, "clients", "linked-client");
    try {
      try {
        fs.symlinkSync(outside, linked, process.platform === "win32" ? "junction" : "dir");
      } catch (error) {
        t.skip("directory links are unavailable: " + error.code);
        return;
      }
      assert.throws(function() { store.listQuestions("linked-client"); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
      assert.throws(function() { store.createQuestion("linked-client", { text: "outside" }); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
      assert.throws(function() { store.getQuestion("linked-client", "question-1"); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
      assert.throws(function() { store.updateQuestion("linked-client", "question-1", { enabled: false }); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
      assert.throws(function() { store.deleteQuestion("linked-client", "question-1"); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a clients root symlink escaping workspace", function(t) {
    const originalClients = path.join(root, "clients");
    const outsideClients = fs.mkdtempSync(path.join(os.tmpdir(), "question-store-clients-outside-"));
    fs.rmSync(originalClients, { recursive: true, force: true });
    try {
      try {
        fs.symlinkSync(outsideClients, originalClients, process.platform === "win32" ? "junction" : "dir");
      } catch (error) {
        t.skip("directory links are unavailable: " + error.code);
        return;
      }
      assert.throws(function() { store.listQuestions("client-1"); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
    } finally {
      fs.rmSync(originalClients, { recursive: true, force: true });
      fs.rmSync(outsideClients, { recursive: true, force: true });
    }
  });
});

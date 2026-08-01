const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const http = require("node:http");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const { IntegrityRunner } = require("../src/health/integrity-runner");
const { diagnoseMaintenance } = require("../src/health/maintenance-diagnostics");
const { mapHealthError } = require("../src/health/health-diagnostic-mapper");
const { PassThrough } = require("node:stream");
const integrityCli = require("../scripts/integrity-check");
const { createAuthServer } = require("../src/server");
const { SqliteAuthRepository } = require("../src/repositories/sqlite-auth-repository");
const { temporaryDb } = require("./helpers");

function request(base, route) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}${route}`, { method: "GET" }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(text), text }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function start(app) {
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${app.server.address().port}`;
}

async function stop(app) {
  if (app.server.listening) await new Promise((resolve) => app.server.close(resolve));
  if (app.repository && typeof app.repository.close === "function") app.repository.close();
}

describe("auth health semantics", () => {
  it("keeps liveness independent from a broken repository", async () => {
    let readinessCalls = 0;
    const repository = {
      probeReadiness() {
        readinessCalls += 1;
        throw Object.assign(new Error("SELECT * FROM users at C:\\private\\auth.db"), { code: "AUTH_DB_UNAVAILABLE" });
      },
      close() {},
    };
    const app = createAuthServer({ repository, domain: {}, administration: {} });
    const base = await start(app);
    try {
      const live = await request(base, "/healthz/live");
      assert.equal(live.status, 200);
      assert.equal(live.data.ok, true);
      assert.equal(live.data.code, "AUTH_LIVE");
      assert.equal(readinessCalls, 0);
      const ready = await request(base, "/healthz/ready");
      assert.equal(ready.status, 503);
      assert.equal(ready.data.code, "AUTH_HEALTH_DATABASE_UNAVAILABLE");
      assert.equal(ready.text.includes("SELECT"), false);
      assert.equal(ready.text.includes("private"), false);
      assert.equal(ready.text.includes("auth.db"), false);
    } finally {
      await stop(app);
    }
  });

  it("uses only the repository readiness seam and never invokes full integrity", async () => {
    let readinessCalls = 0;
    let integrityCalls = 0;
    const repository = {
      filePath: "C:\\synthetic\\auth.db",
      probeReadiness() {
        readinessCalls += 1;
        return { ok: true, schemaVersion: 2, connection: "open" };
      },
      integrityCheck() {
        integrityCalls += 1;
        throw new Error("full scan must not run from readiness");
      },
      close() {},
    };
    const app = createAuthServer({ repository, domain: {}, administration: {} });
    const base = await start(app);
    try {
      const responses = await Promise.all([
        request(base, "/healthz/ready"),
        request(base, "/healthz/ready"),
        request(base, "/readyz"),
      ]);
      assert.deepEqual(responses.map((item) => item.status), [200, 200, 200]);
      assert.equal(readinessCalls, 3);
      assert.equal(integrityCalls, 0);
      assert.equal(responses[0].data.metadata.probe, "lightweight");
      assert.equal(responses[0].text.includes("synthetic"), false);
    } finally {
      await stop(app);
    }
  });

  it("maps lock failures to stable safe health fields", async () => {
    const repository = {
      filePath: "C:\\synthetic\\auth.db",
      probeReadiness() {
        throw Object.assign(new Error("SQLITE_BUSY: SELECT * FROM audit_events at C:\\secret\\auth.db"), { code: "SQLITE_BUSY" });
      },
      close() {},
    };
    const app = createAuthServer({ repository, domain: {}, administration: {} });
    const base = await start(app);
    try {
      const result = await request(base, "/healthz/ready");
      assert.equal(result.status, 503);
      assert.equal(result.data.code, "AUTH_HEALTH_LOCK_TIMEOUT");
      assert.equal(result.data.category, "lock");
      assert.equal(result.data.retryable, true);
      assert.equal(result.data.metadata.probe, undefined);
      assert.equal(result.text.includes("SQLITE_BUSY"), false);
      assert.equal(result.text.includes("audit_events"), false);
      assert.equal(result.text.includes("secret"), false);
    } finally {
      await stop(app);
    }
  });

  it("keeps liveness alive while preserving schema and corruption classifications", async () => {
    const unknown = temporaryDb();
    const unknownDb = new DatabaseSync(unknown.filePath);
    unknownDb.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (99, 'future', '2026-08-01T00:00:00.000Z');");
    unknownDb.close();
    const unknownApp = createAuthServer({ filePath: unknown.filePath });
    const unknownBase = await start(unknownApp);
    try {
      assert.equal((await request(unknownBase, "/healthz/live")).status, 200);
      const result = await request(unknownBase, "/healthz/ready");
      assert.equal(result.status, 503);
      assert.equal(result.data.code, "AUTH_HEALTH_SCHEMA_UNKNOWN");
      assert.equal(result.text.includes("future"), false);
      assert.equal(result.text.includes(unknown.filePath), false);
    } finally {
      await stop(unknownApp);
      unknown.cleanup();
    }

    const corrupt = temporaryDb();
    fs.writeFileSync(corrupt.filePath, "not a sqlite database", "utf8");
    const corruptApp = createAuthServer({ filePath: corrupt.filePath });
    const corruptBase = await start(corruptApp);
    try {
      assert.equal((await request(corruptBase, "/healthz/live")).status, 200);
      const result = await request(corruptBase, "/healthz/ready");
      assert.equal(result.status, 503);
      assert.equal(result.data.code, "AUTH_HEALTH_DATABASE_CORRUPT");
      assert.equal(result.text.includes("not a sqlite"), false);
      assert.equal(result.text.includes(corrupt.filePath), false);
    } finally {
      await stop(corruptApp);
      corrupt.cleanup();
    }
  });

  it("runs complete integrity in a separate worker with safe maintenance metadata", async () => {
    const temp = temporaryDb();
    const repository = new SqliteAuthRepository({ filePath: temp.filePath });
    repository.close();
    const runner = new IntegrityRunner({ databasePath: temp.filePath, defaultTimeoutMs: 5000 });
    const result = await runner.run();
    assert.equal(result.ok, true);
    assert.equal(result.status, "ok");
    assert.equal(result.code, "AUTH_INTEGRITY_OK");
    assert.equal(result.metadata.probe, "integrity");
    assert.equal(result.metadata.capacityState, "normal");
    assert.equal(Object.prototype.hasOwnProperty.call(result.metadata, "filePath"), false);
    temp.cleanup();
  });

  it("returns distinct timeout and cancellation outcomes", async () => {
    const execute = ({ signal }) => new Promise((resolve) => {
      signal.addEventListener("abort", () => resolve({ ok: true, code: "AUTH_INTEGRITY_OK" }), { once: true });
    });
    const timeout = await new IntegrityRunner({ execute, defaultTimeoutMs: 10 }).run();
    assert.equal(timeout.ok, false);
    assert.equal(timeout.code, "AUTH_HEALTH_INTEGRITY_TIMEOUT");
    const controller = new AbortController();
    const cancelled = new IntegrityRunner({ execute, defaultTimeoutMs: 1000 }).run({ signal: controller.signal });
    controller.abort();
    const result = await cancelled;
    assert.equal(result.ok, false);
    assert.equal(result.code, "AUTH_HEALTH_INTEGRITY_CANCELLED");
  });

  it("reports audit retention, rotation and capacity attention without database content", () => {
    const result = diagnoseMaintenance({
      nowMs: Date.parse("2026-08-01T00:00:00.000Z"),
      oldestAuditAt: "2026-07-01T00:00:00.000Z",
      databaseBytes: 90,
      policy: { auditRetentionDays: 7, auditRotationBytes: 50, databaseWarnBytes: 80, databaseMaxBytes: 100 },
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, "attention");
    assert.equal(result.code, "AUTH_HEALTH_AUDIT_RETENTION_DUE");
    assert.deepEqual(result.metadata.attentionCodes, [
      "AUTH_HEALTH_AUDIT_RETENTION_DUE",
      "AUTH_HEALTH_AUDIT_ROTATION_DUE",
      "AUTH_HEALTH_CAPACITY_WARNING",
    ]);
    assert.equal(Object.prototype.hasOwnProperty.call(result.metadata, "oldestAuditAt"), false);
  });

  it("maps schema, corruption, lock, capacity and audit failures to stable safe codes", () => {
    const cases = [
      ["AUTH_DB_UNKNOWN_SCHEMA", "AUTH_HEALTH_SCHEMA_UNKNOWN", "schema"],
      ["AUTH_DB_CORRUPT", "AUTH_HEALTH_DATABASE_CORRUPT", "integrity"],
      ["SQLITE_BUSY", "AUTH_HEALTH_LOCK_TIMEOUT", "lock"],
      ["SQLITE_FULL", "AUTH_HEALTH_CAPACITY_EXCEEDED", "capacity"],
      ["AUTH_HEALTH_AUDIT_ERROR", "AUTH_HEALTH_AUDIT_MAINTENANCE_FAILED", "audit"],
    ];
    for (const [input, code, category] of cases) {
      const mapped = mapHealthError(Object.assign(new Error(`SELECT * FROM users at C:\\private\\auth.db: ${input}`), { code: input }));
      assert.equal(mapped.code, code);
      assert.equal(mapped.category, category);
      assert.equal(JSON.stringify(mapped).includes("SELECT"), false);
      assert.equal(JSON.stringify(mapped).includes("private"), false);
    }
    const exceeded = diagnoseMaintenance({
      databaseBytes: 101,
      nowMs: Date.parse("2026-08-01T00:00:00.000Z"),
      policy: { databaseWarnBytes: 80, databaseMaxBytes: 100 },
    });
    assert.equal(exceeded.ok, false);
    assert.equal(exceeded.code, "AUTH_HEALTH_CAPACITY_EXCEEDED");
  });

  it("exposes complete checks only through the controlled command seam", async () => {
    const output = new PassThrough();
    let text = "";
    output.on("data", (chunk) => { text += String(chunk); });
    const outcome = await integrityCli.main(["C:\\private\\auth.db", "--timeout-ms", "25"], {
      output,
      runner: { run: async (options) => ({ ok: false, status: "failed", code: "AUTH_HEALTH_INTEGRITY_TIMEOUT", category: "timeout", retryable: true, time: "2026-08-01T00:00:00.000Z", metadata: { timeoutMs: options.timeoutMs } }) },
    });
    assert.equal(outcome.code, "AUTH_HEALTH_INTEGRITY_TIMEOUT");
    assert.equal(text.includes("C:\\\\private"), false);
    const parsed = JSON.parse(text);
    assert.equal(parsed.code, "AUTH_HEALTH_INTEGRITY_TIMEOUT");
    assert.equal(parsed.metadata.timeoutMs, 25);
  });
});

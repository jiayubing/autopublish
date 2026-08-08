"use strict";
// Explicit legacy importer.  It is never loaded by the application runtime.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  createOperationalStore,
  verifyOperationalDatabase,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  isRecoveryGuardBusy,
  withRecoveryGuard,
} = require("../src/infrastructure/operational-store/internal/operational-store-recovery-guard");
const VERSION = 1;

function fail(code, report) {
  const error = new Error(code);
  error.code = code;
  if (report) error.migrationReport = report;
  return error;
}
function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}
function readLease(filename) {
  try {
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    const value = JSON.parse(fs.readFileSync(filename, "utf8"));
    return value && Number.isInteger(value.pid) ? value : null;
  } catch (_) {
    return null;
  }
}
function sameFile(left, right) {
  return Boolean(
    left && right && left.dev === right.dev && left.ino === right.ino,
  );
}
function removeIncompleteLease(filename, token, identity) {
  try {
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || !sameFile(stat, identity))
      return;
    const lease = readLease(filename);
    if (lease && lease.token !== token) return;
    fs.unlinkSync(filename);
  } catch (_) {}
}
function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function relative(root, filename) {
  return path.relative(root, filename).replace(/\\/g, "/");
}
function regular(filename) {
  try {
    const s = fs.lstatSync(filename);
    return s.isFile() && !s.isSymbolicLink();
  } catch (_) {
    return false;
  }
}
function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}
function safeId(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  );
}
function safeUrl(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol)
      ? url.origin + url.pathname
      : null;
  } catch (_) {
    return null;
  }
}
function id(kind, seed, existing) {
  return typeof existing === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(existing)
    ? existing
    : `${kind}-${digest(seed).slice(0, 32)}`;
}
function targetFor(platformId, resourceId) {
  if (resourceId && safeId(String(resourceId)))
    return { kind: "media", mediaResourceId: String(resourceId) };
  if (!platformId || !safeId(String(platformId))) return null;
  return {
    kind: "legacy-unknown-account",
    platformId: String(platformId),
    autoExecutable: false,
  };
}
function targetKey(target) {
  return target.kind === "media"
    ? `media-resource:${target.mediaResourceId}`
    : `platform:${target.platformId}:legacy-unknown-account`;
}
function newReport() {
  return {
    version: VERSION,
    inputs: {
      publication: { files: 0, records: 0 },
      batch: { files: 0, records: 0 },
      sidecar: { files: 0, records: 0 },
      order: { files: 0, records: 0 },
    },
    counts: {
      mapped: 0,
      duplicates: 0,
      conflicts: 0,
      corrupt: 0,
      unknownAccounts: 0,
      remoteIdMissing: 0,
      targets: 0,
      attempts: 0,
      batches: 0,
      items: 0,
      orders: 0,
      manualItems: 0,
    },
    diagnostics: [],
  };
}
function diagnostic(report, source, kind, code, manual) {
  report.diagnostics.push({
    source,
    kind,
    code,
    ...(manual ? { manual: true } : {}),
  });
  if (/INVALID|CORRUPT|MISMATCH|UNSAFE|JSON/.test(code))
    report.counts.corrupt += 1;
  else if (/DUPLICATE/.test(code)) report.counts.duplicates += 1;
  else report.counts.conflicts += 1;
  if (manual) report.counts.manualItems += 1;
}
function walk(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  (function visit(dir) {
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile()) out.push(filename);
    }
  })(root);
  return out;
}
function contentHash(filename) {
  return digest(fs.readFileSync(filename));
}
function addCandidate(plan, report, candidate, source, kind) {
  const key = `${candidate.articleId}\0${targetKey(candidate.target)}`;
  if (plan.candidates.has(key)) {
    diagnostic(report, source, kind, "LEGACY_DUPLICATE_TARGET", true);
    return null;
  }
  plan.candidates.set(key, candidate);
  return candidate;
}
function scanPublications(root, plan, report, fault) {
  const dir = path.join(
    root,
    ".autopublish",
    "submission-records",
    "publications",
  );
  for (const filename of walk(dir)) {
    if (!/^publication-[a-f0-9]{64}\.json$/i.test(path.basename(filename)))
      continue;
    const source = relative(root, filename);
    report.inputs.publication.files += 1;
    try {
      const record = readJson(filename);
      report.inputs.publication.records += 1;
      const last = Array.isArray(record.attempts)
        ? record.attempts.at(-1)
        : null;
      const target = targetFor(record.platformId, record.mediaResourceId);
      if (
        !safeId(record.articleId) ||
        !target ||
        !last ||
        !safeId(last.attemptId) ||
        !["queued", "published", "submitted", "failed", "uncertain"].includes(
          String(record.status),
        )
      )
        throw fail("LEGACY_PUBLICATION_INVALID");
      const status = String(record.status);
      if (["published", "submitted"].includes(status) && !last.remoteId) {
        report.counts.remoteIdMissing += 1;
        diagnostic(report, source, "publication", "REMOTE_ID_MISSING", true);
        continue;
      }
      const candidate = addCandidate(
        plan,
        report,
        {
          articleId: String(record.articleId),
          publicationId: id("legacy-publication", source, record.publicationId),
          attemptId: id("legacy-attempt", source, last.attemptId),
          target,
          status,
          remoteId: last.remoteId || null,
          remoteUrl: safeUrl(last.remoteUrl),
          source,
          order: null,
        },
        source,
        "publication",
      );
      if (candidate && target.kind === "legacy-unknown-account")
        report.counts.unknownAccounts += 1;
    } catch (_) {
      diagnostic(
        report,
        source,
        "publication",
        "LEGACY_PUBLICATION_INVALID",
        true,
      );
    }
    fault("scan_publication", report);
  }
}
function batchFiles(root) {
  return [
    path.join(root, ".autopublish", "submission-batches"),
    path.join(root, ".autopublish", "batches"),
    path.join(root, ".autopublish", "submission-records"),
  ]
    .flatMap(walk)
    .filter((f) => /^batch-[A-Za-z0-9_-]+\.json$/i.test(path.basename(f)));
}
function scanBatches(root, plan, report, fault) {
  const seen = new Set();
  for (const filename of batchFiles(root).sort()) {
    if (seen.has(filename.toLowerCase())) continue;
    seen.add(filename.toLowerCase());
    const source = relative(root, filename);
    report.inputs.batch.files += 1;
    try {
      const batch = readJson(filename);
      report.inputs.batch.records += 1;
      if (!safeId(batch.id) || !Array.isArray(batch.items))
        throw fail("BATCH_JSON_INVALID");
      const items = [];
      batch.items.forEach((item, index) => {
        const articleId = String(
          item.articleId || item.generatedArticleId || "",
        );
        const target = targetFor(
          item.targetPlatformId || item.targetPlatform || item.platformId,
          item.mediaResourceId || item.resourceId,
        );
        if (!safeId(articleId) || !target) {
          diagnostic(
            report,
            `${source}#item:${index + 1}`,
            "batch",
            "BATCH_ITEM_INVALID",
            true,
          );
          return;
        }
        items.push({
          articleId,
          target,
          status: String(item.status || "queued"),
        });
      });
      plan.batches.set(String(batch.id), {
        batchId: id("legacy-batch", source, String(batch.id)),
        source,
        items,
      });
    } catch (_) {
      diagnostic(report, source, "batch", "BATCH_JSON_INVALID", true);
    }
    fault("scan_batch", report);
  }
}
function scanSidecars(root, plan, report, fault) {
  for (const filename of walk(path.join(root, ".autopublish", "input"))) {
    if (!filename.endsWith(".submission.json")) continue;
    const source = relative(root, filename);
    report.inputs.sidecar.files += 1;
    try {
      const sidecar = readJson(filename),
        content = filename.slice(0, -".submission.json".length);
      report.inputs.sidecar.records += 1;
      if (
        !regular(content) ||
        !safeId(sidecar.clientId) ||
        !safeId(sidecar.generatedArticleId || sidecar.articleId) ||
        !sidecar.contentHash ||
        contentHash(content) !== sidecar.contentHash
      )
        throw fail("QUEUE_SIDECAR_MISMATCH");
      const resourceId =
        sidecar.mediaResourceId || sidecar.resourceId || sidecar.resource_id;
      const target = targetFor(
        sidecar.targetPlatformId ||
          sidecar.targetPlatform ||
          sidecar.platformId,
        resourceId,
      );
      if (!target) throw fail("QUEUE_TARGET_INVALID");
      const batch =
        sidecar.submissionBatchId &&
        plan.batches.get(String(sidecar.submissionBatchId));
      if (sidecar.submissionBatchId && !batch)
        throw fail("QUEUE_BATCH_MISMATCH");
      const candidate = addCandidate(
        plan,
        report,
        {
          articleId: String(sidecar.generatedArticleId || sidecar.articleId),
          publicationId: id(
            "legacy-publication",
            source,
            sidecar.publicationId,
          ),
          attemptId: id("legacy-attempt", source, sidecar.attemptId),
          target,
          status: "queued",
          remoteId: null,
          remoteUrl: null,
          source,
          batch: batch && batch.batchId,
          order: null,
        },
        source,
        "sidecar",
      );
      if (candidate && target.kind === "legacy-unknown-account")
        report.counts.unknownAccounts += 1;
    } catch (_) {
      diagnostic(report, source, "sidecar", "QUEUE_SIDECAR_MISMATCH", true);
    }
    fault("scan_sidecar", report);
  }
}
function orderShape(record) {
  const result = (record && record.result) || {},
    data = result.data || {},
    sync =
      result.syncRaw && Array.isArray(result.syncRaw.data)
        ? result.syncRaw.data[0] || {}
        : {};
  const params = (record && record.params) || {};
  const resourceId =
    params.resource_id ||
    params.resourceId ||
    data.resourceId ||
    data.resource_id ||
    sync.resource_id;
  const remoteId =
    params.order_nid ||
    params.orderNid ||
    record.orderNid ||
    data.order_nid ||
    data.orderNid ||
    sync.order_nid;
  const articleId =
    params.generatedArticleId ||
    params.articleId ||
    data.generatedArticleId ||
    data.articleId ||
    (data.article && data.article.articleId);
  const published =
    result.published === true ||
    result.syncStatus === "2" ||
    sync.status === 2 ||
    sync.status === "2";
  if (
    !record ||
    record.dryRun === true ||
    typeof result.success !== "boolean" ||
    !resourceId ||
    !safeId(articleId)
  )
    return null;
  return {
    articleId: String(articleId),
    target: targetFor("media", resourceId),
    status: result.success ? (published ? "published" : "submitted") : "failed",
    remoteId: remoteId ? String(remoteId) : null,
    remoteUrl: safeUrl(sync.order_url),
  };
}
function scanOrders(root, plan, report, fault) {
  const filenames = [
    path.join(root, ".autopublish", "data", "submission-orders.jsonl"),
    path.join(root, "data", "submission-orders.jsonl"),
    path.join(root, "submission-orders.jsonl"),
  ].filter(regular);
  for (const filename of filenames.sort()) {
    const source = relative(root, filename);
    report.inputs.order.files += 1;
    const lines = fs.readFileSync(filename, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!line.trim()) return;
      const marker = `${source}#line:${index + 1}`;
      report.inputs.order.records += 1;
      try {
        const shape = orderShape(JSON.parse(line));
        if (!shape) throw fail("ORDER_UNMAPPABLE");
        if (
          ["published", "submitted"].includes(shape.status) &&
          !shape.remoteId
        ) {
          report.counts.remoteIdMissing += 1;
          diagnostic(report, marker, "order", "REMOTE_ID_MISSING", true);
          return;
        }
        const candidate = addCandidate(
          plan,
          report,
          {
            ...shape,
            publicationId: id("legacy-publication", marker),
            attemptId: id("legacy-attempt", marker),
            source: marker,
            batch: null,
            order: shape.remoteId
              ? {
                  orderId: id("legacy-order", marker, shape.remoteId),
                  remoteId: shape.remoteId,
                }
              : null,
          },
          marker,
          "order",
        );
        if (candidate) report.counts.orders += candidate.order ? 1 : 0;
      } catch (_) {
        diagnostic(report, marker, "order", "ORDER_UNMAPPABLE", true);
      }
      fault("scan_order", report);
    });
  }
}
function buildPlan(root, fault) {
  const report = newReport(),
    plan = { candidates: new Map(), batches: new Map() };
  scanPublications(root, plan, report, fault);
  scanBatches(root, plan, report, fault);
  scanSidecars(root, plan, report, fault);
  scanOrders(root, plan, report, fault);
  const candidates = [...plan.candidates.values()].sort((a, b) =>
    `${a.articleId}\0${targetKey(a.target)}`.localeCompare(
      `${b.articleId}\0${targetKey(b.target)}`,
    ),
  );
  const batches = [...plan.batches.values()].sort((a, b) =>
    a.batchId.localeCompare(b.batchId),
  );
  report.counts.mapped = candidates.length;
  report.counts.targets = candidates.length;
  report.counts.attempts = candidates.length;
  report.counts.batches = batches.length;
  for (const batch of batches) report.counts.items += batch.items.length;
  return { report, candidates, batches };
}
function createMigration(options) {
  const o = options || {},
    root = path.resolve(o.workspaceRoot || "");
  if (!root || !path.isAbsolute(root))
    throw fail("MIGRATION_WORKSPACE_REQUIRED");
  const operations = path.join(root, ".autopublish", "operations"),
    target = path.join(operations, "operations.db"),
    lock = path.join(operations, "migration.lock"),
    runtimeLock = path.join(operations, "runtime.lock");
  const fault = (point, report) => {
    if (typeof o.fault === "function") o.fault(point, report);
  };
  const rename =
    typeof o.internalRename === "function" ? o.internalRename : fs.renameSync;
  function plan() {
    return buildPlan(root, fault);
  }
  function dryRun() {
    const p = plan();
    return { mode: "dry-run", report: p.report };
  }
  function execute() {
    const p = plan();
    let fd;
    let leaseToken = null;
    let temp = null;
    let installed = false;
    try {
      fault("before_start", p.report);
      fs.mkdirSync(operations, { recursive: true });
      if (fs.existsSync(runtimeLock))
        throw fail("MIGRATION_RUNTIME_OWNER_ACTIVE", p.report);
      if (fs.existsSync(target))
        throw fail("MIGRATION_TARGET_EXISTS", p.report);
      if (p.candidates.length > 0 || p.batches.length > 0)
        throw fail("MIGRATION_WORKSPACE_GATE_REQUIRED", p.report);
      try {
        withRecoveryGuard(target, () => {
          if (fs.existsSync(runtimeLock))
            throw fail("MIGRATION_RUNTIME_OWNER_ACTIVE", p.report);
          if (fs.existsSync(target))
            throw fail("MIGRATION_TARGET_EXISTS", p.report);
          for (;;) {
            const token = crypto.randomUUID();
            try {
              fd = fs.openSync(lock, "wx");
            } catch (error) {
              if (!error || error.code !== "EEXIST") throw error;
              const lease = readLease(lock);
              if (!lease || processAlive(lease.pid))
                throw fail("MIGRATION_LEASE_ACTIVE", p.report);
              const currentLease = readLease(lock);
              if (!currentLease || currentLease.token !== lease.token)
                throw fail("MIGRATION_LEASE_ACTIVE", p.report);
              try {
                fs.unlinkSync(lock);
              } catch (_) {
                throw fail("MIGRATION_LEASE_ACTIVE", p.report);
              }
              continue;
            }
            leaseToken = token;
            const leaseIdentity = fs.fstatSync(fd);
            try {
              fs.writeFileSync(
                fd,
                JSON.stringify({
                  version: VERSION,
                  pid: process.pid,
                  token,
                }),
              );
            } catch (error) {
              try {
                fs.closeSync(fd);
              } catch (_) {}
              fd = undefined;
              removeIncompleteLease(lock, token, leaseIdentity);
              leaseToken = null;
              throw error;
            }
            fault("after_lease", p.report);
            if (fs.existsSync(runtimeLock))
              throw fail("MIGRATION_RUNTIME_OWNER_ACTIVE", p.report);
            break;
          }
        });
      } catch (error) {
        if (isRecoveryGuardBusy(error)) {
          if (fs.existsSync(runtimeLock))
            throw fail("MIGRATION_RUNTIME_OWNER_ACTIVE", p.report);
          throw fail("MIGRATION_LEASE_ACTIVE", p.report);
        }
        if (error && error.code === "OPERATIONAL_RECOVERY_GUARD_UNAVAILABLE")
          throw fail("MIGRATION_EXECUTE_FAILED", p.report);
        throw error;
      }
      temp = path.join(
        operations,
        `operations.migration-${crypto.randomUUID()}.db`,
      );
      const store = createOperationalStore({
        workspaceRoot: root,
        filename: temp,
        migrationTemporary: true,
        internalBeforeCommit: () => fault("before_sqlite_commit", p.report),
      });
      try {
        store.verify();
        store.close();
        verifyOperationalDatabase(temp);
        fault("verify", p.report);
        fault("before_rename", p.report);
        rename(temp, target);
        installed = true;
        fault("after_rename", p.report);
        return { mode: "execute", databasePath: target, report: p.report };
      } catch (error) {
        try {
          store.close();
        } catch (_) {}
        throw error;
      }
    } catch (error) {
      if (error && !error.migrationReport) error.migrationReport = p.report;
      throw error.code ? error : fail("MIGRATION_EXECUTE_FAILED", p.report);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (leaseToken) {
        try {
          withRecoveryGuard(
            target,
            () => {
              const lease = readLease(lock);
              if (lease && lease.token === leaseToken)
                try {
                  fs.unlinkSync(lock);
                } catch (_) {}
            },
            5000,
          );
        } catch (_) {}
      }
      if (temp && !installed)
        for (const suffix of ["", "-wal", "-shm"])
          try {
            fs.unlinkSync(temp + suffix);
          } catch (_) {}
    }
  }
  return { plan, dryRun, execute };
}
function main(argv) {
  const a = argv || process.argv.slice(2),
    i = a.indexOf("--workspace");
  if (i < 0 || !a[i + 1]) throw fail("MIGRATION_WORKSPACE_REQUIRED");
  const migration = createMigration({ workspaceRoot: a[i + 1] });
  return a.includes("--execute") ? migration.execute() : migration.dryRun();
}
if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(main()) + "\n");
  } catch (error) {
    process.stderr.write((error.code || "MIGRATION_FAILED") + "\n");
    process.exitCode = 1;
  }
}
module.exports = { VERSION, createMigration, main };

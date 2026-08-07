"use strict";

const fs = require("node:fs");
const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");

function articleMarkdown(article) {
  return "# " + String(article.title || "") + "\n\n" + String(article.content || "").trim() + "\n";
}

function writePairAtomic(filePath, markdown, sidecarPath, sidecar) {
  const token = process.pid + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  const markdownTemp = filePath + ".tmp-" + token;
  const sidecarTemp = sidecarPath + ".tmp-" + token;
  let markdownMoved = false;
  let sidecarMoved = false;
  try {
    fs.writeFileSync(markdownTemp, markdown, "utf8");
    fs.writeFileSync(sidecarTemp, sidecar, "utf8");
    fs.renameSync(markdownTemp, filePath); markdownMoved = true;
    fs.renameSync(sidecarTemp, sidecarPath); sidecarMoved = true;
  } catch (error) {
    if (sidecarMoved) {
      try {
        fs.unlinkSync(sidecarPath);
      } catch (_) {
        reportDiagnostic({
          code: "SUBMISSION_PAIR_ROLLBACK_FAILED",
          module: "submission-file-persistence",
          category: "storage",
          metadata: { operation: "write_pair_atomic", phase: "rollback", action: "unlink", failureKind: "sidecar" },
        });
      }
    }
    if (markdownMoved) {
      try {
        fs.unlinkSync(filePath);
      } catch (_) {
        reportDiagnostic({
          code: "SUBMISSION_PAIR_ROLLBACK_FAILED",
          module: "submission-file-persistence",
          category: "storage",
          metadata: { operation: "write_pair_atomic", phase: "rollback", action: "unlink", failureKind: "markdown" },
        });
      }
    }
    throw error;
  } finally {
    for (const [temporary, failureKind] of [[markdownTemp, "markdown"], [sidecarTemp, "sidecar"]]) {
      try {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      } catch (_) {
        reportDiagnostic({
          code: "SUBMISSION_PAIR_TEMP_CLEANUP_FAILED",
          module: "submission-file-persistence",
          category: "storage",
          metadata: { operation: "write_pair_atomic", phase: "cleanup", action: "unlink", failureKind },
        });
      }
    }
  }
}

module.exports = { articleMarkdown, writePairAtomic };

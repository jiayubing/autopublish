const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { reportDiagnostic } = require("../diagnostics/diagnostic-producer");

function transactionError(code, message, cause) {
  const error = new Error(message || code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function createArticleFileTransaction(options) {
  const opts = options || {};
  const fsApi = opts.fs || fs;
  const fault = typeof opts.fault === "function" ? opts.fault : function () {};
  const makeError =
    typeof opts.error === "function" ? opts.error : transactionError;

  function fail(code, message, cause) {
    throw makeError(code, message, cause);
  }

  function exists(filename) {
    try {
      fsApi.lstatSync(filename);
      return true;
    } catch (error) {
      if (error && error.code === "ENOENT") return false;
      throw error;
    }
  }

  function assertRegularFile(filename) {
    let stats;
    try {
      stats = fsApi.lstatSync(filename);
    } catch (error) {
      fail("ARTICLE_PATH_OUT_OF_BOUNDS", "Article file is unsafe", error);
    }
    if (!stats.isFile() || stats.isSymbolicLink())
      fail("ARTICLE_PATH_OUT_OF_BOUNDS", "Article file is unsafe");
    return true;
  }

  function removeRegularFile(filename) {
    if (!exists(filename)) return;
    assertRegularFile(filename);
    fsApi.unlinkSync(filename);
  }

  function reportCleanup(operation, error) {
    reportDiagnostic({
      code: "ARTICLE_FILE_CLEANUP_FAILED",
      module: "article-file-transaction",
      category: "storage",
      operationId: "article-file-transaction",
      metadata: {
        operation: operation,
        phase: "cleanup",
        outcome: "best-effort-failed",
        errorCode: error && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code || "")
          ? error.code
          : "ARTICLE_FILE_CLEANUP_FAILED",
      },
    });
  }

  function tryRemove(filename, operation) {
    try {
      removeRegularFile(filename);
      return true;
    } catch (error) {
      reportCleanup(operation, error);
      return false;
    }
  }

  function writeTemporary(filename, contents, suffix) {
    const temporary =
      filename +
      ".tmp-" +
      process.pid +
      "-" +
      Date.now() +
      "-" +
      (suffix || crypto.randomUUID());
    let operationError = null;
    try {
      fsApi.writeFileSync(temporary, contents, {
        encoding: "utf8",
        flag: "wx",
      });
      const descriptor = fsApi.openSync(temporary, "r");
      try {
        try {
          fsApi.fsyncSync(descriptor);
        } catch (error) {
          if (error.code !== "EPERM" && error.code !== "EINVAL")
            operationError = error;
        }
      } finally {
        try {
          fsApi.closeSync(descriptor);
        } catch (error) {
          if (operationError) reportCleanup("temporary-close", error);
          else operationError = error;
        }
      }
      if (operationError) throw operationError;
      assertRegularFile(temporary);
      return temporary;
    } catch (error) {
      try {
        if (exists(temporary)) fsApi.unlinkSync(temporary);
      } catch (cleanupError) {
        reportCleanup("temporary-write", cleanupError);
      }
      throw error;
    }
  }

  function validTemporaryName(name, target) {
    return (
      typeof name === "string" &&
      path.basename(name) === name &&
      name.startsWith(path.basename(target) + ".tmp-")
    );
  }

  function articleJsonTransactionFiles(files) {
    const stem = path.basename(files.json, ".json");
    return {
      journal: path.join(files.directory, stem + ".journal"),
      backup: files.json + ".backup",
    };
  }

  function transactionJournal(files) {
    return (
      files.journal ||
      path.join(
        files.directory,
        path.basename(files.json, ".json") + ".trash.journal",
      )
    );
  }

  function writeJournal(filename, value) {
    const temporary = writeTemporary(
      filename,
      JSON.stringify(value) + "\n",
      "journal",
    );
    let operationError = null;
    try {
      fsApi.renameSync(temporary, filename);
    } catch (error) {
      operationError = error;
      throw error;
    } finally {
      if (!tryRemove(temporary, "journal-temp") && !operationError)
        fail(
          "ARTICLE_FILE_TRANSACTION_INCOMPLETE",
          "Article journal cleanup needs recovery",
        );
    }
  }

  function clearJournal(filename) {
    removeRegularFile(filename);
  }

  function readJournal(filename, message) {
    assertRegularFile(filename);
    try {
      return JSON.parse(fsApi.readFileSync(filename, "utf8"));
    } catch (error) {
      fail("ARTICLE_INVALID", message, error);
    }
  }

  function rollbackMoves(moves) {
    let rollbackError = null;
    for (let index = moves.length - 1; index >= 0; index -= 1) {
      const move = moves[index];
      if (!exists(move.to) || exists(move.from)) continue;
      try {
        fsApi.renameSync(move.to, move.from);
      } catch (error) {
        rollbackError = rollbackError || error;
      }
    }
    return rollbackError;
  }

  function recoverArticleJson(files) {
    // Consume pre-atomic-replace residues only; current saves never write them.
    const transaction = articleJsonTransactionFiles(files);
    if (!exists(transaction.journal)) {
      if (exists(files.json)) {
        assertRegularFile(files.json);
        if (exists(transaction.backup)) removeRegularFile(transaction.backup);
      } else if (exists(transaction.backup)) {
        assertRegularFile(transaction.backup);
        fsApi.renameSync(transaction.backup, files.json);
      }
      return;
    }

    const journal = readJournal(
      transaction.journal,
      "Article transaction journal is invalid",
    );
    const currentJournal =
      journal &&
      journal.version === 2 &&
      journal.kind === "article-json-replace";
    const legacyJournal =
      journal &&
      journal.version === 1 &&
      validTemporaryName(journal.temporaryJson, files.json);
    if (!currentJournal && !legacyJournal)
      fail("ARTICLE_INVALID", "Article transaction journal is invalid");

    if (
      currentJournal &&
      (journal.backup !== path.basename(transaction.backup) ||
        !validTemporaryName(journal.temporaryJson, files.json))
    )
      fail("ARTICLE_INVALID", "Article transaction journal is invalid");

    const temporary = path.join(files.directory, journal.temporaryJson);
    const hasJson = exists(files.json);
    const hasTemporary = exists(temporary);
    const hasBackup = exists(transaction.backup);

    if (hasJson) {
      assertRegularFile(files.json);
      if (hasTemporary) removeRegularFile(temporary);
      if (hasBackup) removeRegularFile(transaction.backup);
    } else if (hasBackup) {
      assertRegularFile(transaction.backup);
      if (hasTemporary) removeRegularFile(temporary);
      fsApi.renameSync(transaction.backup, files.json);
    } else if (hasTemporary) {
      assertRegularFile(temporary);
      fsApi.renameSync(temporary, files.json);
    } else {
      fail("ARTICLE_INVALID", "Article transaction is incomplete");
    }
    clearJournal(transaction.journal);
  }

  function replaceArticleJson(files, jsonContents) {
    let temporary = null;
    try {
      fault("before-article-json-temp", { files });
      temporary = writeTemporary(files.json, jsonContents);
      fault("after-article-json-temp", { files: files, temporary: temporary });
      if (exists(files.json)) assertRegularFile(files.json);
      fault("before-article-json-replace", { files });
      // Same-directory replacement never removes the previous valid JSON first.
      fsApi.renameSync(temporary, files.json);
      fault("after-article-json-install", { files: files });
    } finally {
      if (temporary) tryRemove(temporary, "article-json-temp");
    }
  }

  function moveToTrash(input) {
    const value = input || {};
    const source = value.source;
    const destination = value.destination;
    const journal = transactionJournal(destination);
    const temporaryTombstone = writeTemporary(
      destination.tombstone,
      value.tombstoneContents,
    );
    const moves = [];
    try {
      writeJournal(journal, {
        version: 1,
        kind: "move-to-trash",
        operationId: value.operationId || null,
        json: {
          from: path.basename(source.json),
          to: path.basename(destination.json),
        },
        tombstone: path.basename(destination.tombstone),
        temporaryTombstone: path.basename(temporaryTombstone),
      });
    } catch (error) {
      tryRemove(temporaryTombstone, "trash-tombstone-temp");
      throw error;
    }

    try {
      fsApi.renameSync(source.json, destination.json);
      moves.push({ from: source.json, to: destination.json });
      fault("after-trash-json", { source: source, destination: destination });
      fsApi.renameSync(temporaryTombstone, destination.tombstone);
      moves.push({ from: temporaryTombstone, to: destination.tombstone });
      fault("after-trash-tombstone", {
        source: source,
        destination: destination,
      });
      clearJournal(journal);
    } catch (error) {
      const rollbackError = rollbackMoves(moves);
      tryRemove(destination.tombstone, "trash-tombstone");
      tryRemove(temporaryTombstone, "trash-tombstone-temp");
      if (!rollbackError) tryRemove(journal, "trash-journal");
      if (rollbackError)
        fail(
          "ARTICLE_FILE_TRANSACTION_INCOMPLETE",
          "Article trash transaction needs recovery",
          rollbackError,
        );
      throw error;
    }
  }

  function recoverTrashMove(source, destination) {
    const journal = transactionJournal(destination);
    if (!exists(journal)) return;
    const record = readJournal(journal, "Article trash journal is invalid");
    if (!record || record.version !== 1 || typeof record.kind !== "string")
      fail("ARTICLE_INVALID", "Article trash journal is invalid");

    if (record.kind === "restore-from-trash")
      return recoverRestore(destination, source, journal, record);
    if (record.kind === "permanent-delete")
      return recoverPermanentDelete(destination, journal, record);
    if (
      record.kind !== "move-to-trash" ||
      !record.json ||
      record.json.from !== path.basename(source.json) ||
      record.json.to !== path.basename(destination.json) ||
      record.tombstone !== path.basename(destination.tombstone) ||
      !validTemporaryName(record.temporaryTombstone, destination.tombstone)
    )
      fail("ARTICLE_INVALID", "Article trash journal is invalid");

    const temporary = path.join(
      destination.directory,
      record.temporaryTombstone,
    );
    const sourceJson = exists(source.json);
    const destinationJson = exists(destination.json);
    const destinationTombstone = exists(destination.tombstone);

    if (!sourceJson && destinationJson && destinationTombstone) {
      removeRegularFile(temporary);
      clearJournal(journal);
      return;
    }
    if (sourceJson && !destinationJson && !destinationTombstone) {
      removeRegularFile(temporary);
      clearJournal(journal);
      return;
    }
    if (!sourceJson && destinationJson && !destinationTombstone) {
      assertRegularFile(destination.json);
      fsApi.renameSync(destination.json, source.json);
      removeRegularFile(temporary);
      clearJournal(journal);
      return;
    }
    if (sourceJson && !destinationJson && destinationTombstone) {
      removeRegularFile(destination.tombstone);
      removeRegularFile(temporary);
      clearJournal(journal);
      return;
    }
    if (sourceJson && destinationJson)
      fail(
        "ARTICLE_TRASH_CONFLICT",
        "Article trash transaction has conflicting files",
      );
    fail(
      "ARTICLE_TRASH_CONFLICT",
      "Article trash transaction has unknown state",
    );
  }

  function recoverRestore(trash, generated, journal, record) {
    if (
      !record.json ||
      record.json.from !== path.basename(trash.json) ||
      record.json.to !== path.basename(generated.json) ||
      record.tombstone !== path.basename(trash.tombstone)
    )
      fail("ARTICLE_INVALID", "Article restore journal is invalid");

    const trashJson = exists(trash.json);
    const trashTombstone = exists(trash.tombstone);
    const generatedJson = exists(generated.json);
    if (trashJson && trashTombstone && !generatedJson) {
      clearJournal(journal);
      return;
    }
    if (!trashJson && generatedJson && !trashTombstone) {
      clearJournal(journal);
      return;
    }
    if (!trashJson && generatedJson && trashTombstone) {
      assertRegularFile(generated.json);
      fsApi.renameSync(generated.json, trash.json);
      clearJournal(journal);
      return;
    }
    if (trashJson && generatedJson)
      fail(
        "ARTICLE_RESTORE_CONFLICT",
        "Article restore transaction has conflicting files",
      );
    fail(
      "ARTICLE_RESTORE_CONFLICT",
      "Article restore transaction has unknown state",
    );
  }

  function restoreFromTrash(source, destination) {
    const journal = transactionJournal(source);
    const moves = [];
    writeJournal(journal, {
      version: 1,
      kind: "restore-from-trash",
      json: {
        from: path.basename(source.json),
        to: path.basename(destination.json),
      },
      tombstone: path.basename(source.tombstone),
    });
    try {
      fsApi.renameSync(source.json, destination.json);
      moves.push({ from: source.json, to: destination.json });
      fault("after-restore-json", { source: source, destination: destination });
      removeRegularFile(source.tombstone);
      fault("after-restore-tombstone", {
        source: source,
        destination: destination,
      });
      clearJournal(journal);
    } catch (error) {
      if (!exists(source.tombstone) && exists(destination.json) && !exists(source.json)) {
        tryRemove(journal, "restore-journal");
        throw error;
      }
      const rollbackError = rollbackMoves(moves);
      if (!rollbackError) tryRemove(journal, "restore-journal");
      if (rollbackError)
        fail(
          "ARTICLE_FILE_TRANSACTION_INCOMPLETE",
          "Article restore transaction needs recovery",
          rollbackError,
        );
      throw error;
    }
  }

  function assertStagingDirectory(staging, files) {
    if (!exists(staging)) return false;
    let stats;
    try {
      stats = fsApi.lstatSync(staging);
    } catch (error) {
      fail("ARTICLE_PATH_OUT_OF_BOUNDS", "Permanent deletion staging is unsafe", error);
    }
    if (!stats.isDirectory() || stats.isSymbolicLink())
      fail("ARTICLE_PATH_OUT_OF_BOUNDS", "Permanent deletion staging is unsafe");
    const entries = fsApi.readdirSync(staging, { withFileTypes: true });
    entries.forEach(function (entry) {
      if (
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        entry.name !== path.basename(files.json)
      )
        fail("ARTICLE_INVALID", "Permanent deletion staging is invalid");
      assertRegularFile(path.join(staging, entry.name));
    });
    return true;
  }

  function removeStaging(staging, files) {
    if (!assertStagingDirectory(staging, files)) return;
    fsApi.rmSync(staging, { recursive: true, force: true });
  }

  function recoverPermanentDelete(files, journal, record) {
    // Older versions staged JSON before installing the terminal tombstone.
    if (
      !record.staging ||
      path.basename(record.staging) !== record.staging ||
      !record.staging.startsWith(
        path.basename(files.json, ".json") + ".deleting-",
      ) ||
      record.json !== path.basename(files.json) ||
      record.tombstone !== path.basename(files.tombstone)
    )
      fail("ARTICLE_INVALID", "Permanent deletion journal is invalid");

    const staging = path.join(files.directory, record.staging);
    const stagingExists = assertStagingDirectory(staging, files);
    const stagedJson = path.join(staging, path.basename(files.json));
    const stagedState = stagingExists && exists(stagedJson);
    const originalState = exists(files.json);
    let terminal = false;
    if (exists(files.tombstone)) {
      assertRegularFile(files.tombstone);
      try {
        terminal = JSON.parse(fsApi.readFileSync(files.tombstone, "utf8"))
          .permanentlyDeleted === true;
      } catch (error) {
        fail("ARTICLE_INVALID", "Article tombstone is invalid", error);
      }
    }

    if (terminal) {
      if (originalState)
        fail(
          "ARTICLE_TRASH_CONFLICT",
          "Permanent deletion transaction has conflicting files",
        );
      removeStaging(staging, files);
      clearJournal(journal);
      return;
    }
    if (stagedState && originalState)
      fail(
        "ARTICLE_TRASH_CONFLICT",
        "Permanent deletion transaction has conflicting files",
      );
    if (stagedState && !originalState) {
      assertRegularFile(stagedJson);
      fsApi.renameSync(stagedJson, files.json);
      removeStaging(staging, files);
      clearJournal(journal);
      return;
    }
    if (!stagedState && originalState) {
      removeStaging(staging, files);
      clearJournal(journal);
      return;
    }
    fail(
      "ARTICLE_TRASH_CONFLICT",
      "Permanent deletion transaction has conflicting files",
    );
  }

  function writeTerminalTombstone(files, contents) {
    const temporary = writeTemporary(files.tombstone, contents);
    try {
      assertRegularFile(files.tombstone);
      fault("before-terminal-replace", { files });
      fsApi.renameSync(temporary, files.tombstone);
      fault("after-terminal-install", { files: files });
    } finally {
      tryRemove(temporary, "terminal-tombstone-temp");
    }
  }

  function permanentlyDelete(files, terminalContents) {
    // The retained terminal tombstone is the commit point and recovery fact.
    writeTerminalTombstone(files, terminalContents);
    removeRegularFile(files.json);
    fault("after-permanent-delete-json", { files });
  }

  return {
    assertRegularFile,
    removeRegularFile,
    writeTemporary,
    recoverArticleJson,
    replaceArticleJson,
    moveToTrash,
    recoverTrashMove,
    restoreFromTrash,
    permanentlyDelete,
  };
}

module.exports = { createArticleFileTransaction };

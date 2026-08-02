const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

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

  function writeTemporary(filename, contents, suffix) {
    const temporary =
      filename +
      ".tmp-" +
      process.pid +
      "-" +
      Date.now() +
      "-" +
      (suffix || crypto.randomUUID());
    fsApi.writeFileSync(temporary, contents, "utf8");
    const descriptor = fsApi.openSync(temporary, "r");
    try {
      try {
        fsApi.fsyncSync(descriptor);
      } catch (error) {
        if (error.code !== "EPERM" && error.code !== "EINVAL") throw error;
      }
    } finally {
      fsApi.closeSync(descriptor);
    }
    assertRegularFile(temporary);
    return temporary;
  }

  function transactionFiles(files) {
    return {
      journal: path.join(
        files.directory,
        path.basename(files.json, ".json") + ".journal",
      ),
      jsonBackup: files.json + ".backup",
      markdownBackup: files.markdown + ".backup",
    };
  }

  function validTemporaryName(name, target) {
    return (
      typeof name === "string" &&
      path.basename(name) === name &&
      name.startsWith(path.basename(target) + ".tmp-")
    );
  }

  function recoverArticlePair(files) {
    const transaction = transactionFiles(files);
    if (!exists(transaction.journal)) return;
    assertRegularFile(transaction.journal);
    let journal;
    try {
      journal = JSON.parse(fsApi.readFileSync(transaction.journal, "utf8"));
    } catch (error) {
      fail("ARTICLE_INVALID", "Article transaction journal is invalid", error);
    }
    if (
      !journal ||
      journal.version !== 1 ||
      !validTemporaryName(journal.temporaryJson, files.json) ||
      !validTemporaryName(journal.temporaryMarkdown, files.markdown)
    ) {
      fail("ARTICLE_INVALID", "Article transaction journal is invalid");
    }
    const hasBackups =
      exists(transaction.jsonBackup) && exists(transaction.markdownBackup);
    if (hasBackups) {
      assertRegularFile(transaction.jsonBackup);
      assertRegularFile(transaction.markdownBackup);
      removeRegularFile(files.json);
      removeRegularFile(files.markdown);
      fsApi.renameSync(transaction.jsonBackup, files.json);
      fsApi.renameSync(transaction.markdownBackup, files.markdown);
    } else if (!exists(files.json) || !exists(files.markdown)) {
      const temporaryJson = path.join(files.directory, journal.temporaryJson);
      const temporaryMarkdown = path.join(
        files.directory,
        journal.temporaryMarkdown,
      );
      if (
        (!exists(temporaryJson) && !exists(files.json)) ||
        (!exists(temporaryMarkdown) && !exists(files.markdown))
      ) {
        fail("ARTICLE_INVALID", "Article files are incomplete");
      }
      if (exists(temporaryJson)) {
        assertRegularFile(temporaryJson);
        removeRegularFile(files.json);
        fsApi.renameSync(temporaryJson, files.json);
      }
      if (exists(temporaryMarkdown)) {
        assertRegularFile(temporaryMarkdown);
        removeRegularFile(files.markdown);
        fsApi.renameSync(temporaryMarkdown, files.markdown);
      }
    }
    removeRegularFile(path.join(files.directory, journal.temporaryJson));
    removeRegularFile(path.join(files.directory, journal.temporaryMarkdown));
    removeRegularFile(transaction.jsonBackup);
    removeRegularFile(transaction.markdownBackup);
    removeRegularFile(transaction.journal);
  }

  function replaceArticlePair(files, jsonContents, markdownContents) {
    const temporaryMarkdown = writeTemporary(files.markdown, markdownContents);
    const temporaryJson = writeTemporary(files.json, jsonContents);
    const transaction = transactionFiles(files);
    try {
      fsApi.writeFileSync(
        transaction.journal,
        JSON.stringify({
          version: 1,
          temporaryJson: path.basename(temporaryJson),
          temporaryMarkdown: path.basename(temporaryMarkdown),
        }) + "\n",
        "utf8",
      );
      assertRegularFile(transaction.journal);
      fault("after-article-journal", { files: files });
      if (exists(files.markdown)) {
        assertRegularFile(files.markdown);
        fsApi.renameSync(files.markdown, transaction.markdownBackup);
      }
      fault("after-article-markdown-backup", { files: files });
      if (exists(files.json)) {
        assertRegularFile(files.json);
        fsApi.renameSync(files.json, transaction.jsonBackup);
      }
      fault("after-article-json-backup", { files: files });
      fsApi.renameSync(temporaryMarkdown, files.markdown);
      fault("after-article-markdown-install", { files: files });
      fsApi.renameSync(temporaryJson, files.json);
      fault("after-article-json-install", { files: files });
      removeRegularFile(transaction.markdownBackup);
      removeRegularFile(transaction.jsonBackup);
      removeRegularFile(transaction.journal);
    } finally {
      if (!exists(transaction.journal)) {
        removeRegularFile(temporaryMarkdown);
        removeRegularFile(temporaryJson);
      }
    }
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
    try {
      fsApi.renameSync(temporary, filename);
    } finally {
      removeRegularFile(temporary);
    }
  }

  function clearJournal(filename) {
    removeRegularFile(filename);
  }

  function readJournal(filename) {
    assertRegularFile(filename);
    try {
      return JSON.parse(fsApi.readFileSync(filename, "utf8"));
    } catch (error) {
      fail("ARTICLE_INVALID", "Article trash journal is invalid", error);
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
    writeJournal(journal, {
      version: 1,
      kind: "move-to-trash",
      operationId: value.operationId || null,
      json: {
        from: path.basename(source.json),
        to: path.basename(destination.json),
      },
      markdown: {
        from: path.basename(source.markdown),
        to: path.basename(destination.markdown),
      },
      tombstone: path.basename(destination.tombstone),
      temporaryTombstone: path.basename(temporaryTombstone),
    });
    try {
      fsApi.renameSync(source.json, destination.json);
      moves.push({ from: source.json, to: destination.json });
      fault("after-trash-json", { source: source, destination: destination });
      fsApi.renameSync(source.markdown, destination.markdown);
      moves.push({ from: source.markdown, to: destination.markdown });
      fault("after-trash-markdown", {
        source: source,
        destination: destination,
      });
      fsApi.renameSync(temporaryTombstone, destination.tombstone);
      fault("after-trash-tombstone", {
        source: source,
        destination: destination,
      });
      clearJournal(journal);
      return;
    } catch (error) {
      removeRegularFile(temporaryTombstone);
      removeRegularFile(destination.tombstone);
      const rollbackError = rollbackMoves(moves);
      if (!rollbackError) clearJournal(journal);
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
    const record = readJournal(journal);
    if (!record || record.version !== 1 || typeof record.kind !== "string")
      fail("ARTICLE_INVALID", "Article trash journal is invalid");
    if (record.kind === "restore-from-trash")
      return recoverRestore(destination, source, journal, record);
    if (record.kind === "permanent-delete")
      return recoverPermanentDelete(destination, journal, record);
    if (
      record.kind !== "move-to-trash" ||
      !validTemporaryName(record.temporaryTombstone, destination.tombstone)
    )
      fail("ARTICLE_INVALID", "Article trash journal is invalid");
    const temporary = path.join(
      destination.directory,
      record.temporaryTombstone,
    );
    const sourceState = [source.json, source.markdown].map(exists);
    const destinationState = [
      destination.json,
      destination.markdown,
      destination.tombstone,
    ].map(exists);
    if (!sourceState.some(Boolean) && destinationState.every(Boolean)) {
      removeRegularFile(temporary);
      clearJournal(journal);
      return;
    }
    if (sourceState.every(Boolean) && !destinationState.some(Boolean)) {
      removeRegularFile(temporary);
      clearJournal(journal);
      return;
    }
    if (
      sourceState.some(function (present, index) {
        return present && destinationState[index];
      }) ||
      (destinationState[2] && sourceState.some(Boolean))
    )
      fail(
        "ARTICLE_TRASH_CONFLICT",
        "Article trash transaction has conflicting files",
      );
    if (destinationState.some(Boolean)) {
      const rollbackError = rollbackMoves([
        { from: source.markdown, to: destination.markdown },
        { from: source.json, to: destination.json },
      ]);
      if (rollbackError)
        fail(
          "ARTICLE_FILE_TRANSACTION_INCOMPLETE",
          "Article trash transaction needs recovery",
          rollbackError,
        );
      removeRegularFile(destination.tombstone);
      removeRegularFile(temporary);
      clearJournal(journal);
      return;
    }
    fail(
      "ARTICLE_TRASH_CONFLICT",
      "Article trash transaction has unknown state",
    );
  }

  function recoverRestore(trash, generated, journal, record) {
    if (
      !record.json ||
      !record.markdown ||
      record.tombstone !== path.basename(trash.tombstone)
    )
      fail("ARTICLE_INVALID", "Article restore journal is invalid");
    const trashState = [trash.json, trash.markdown, trash.tombstone].map(
      exists,
    );
    const generatedState = [generated.json, generated.markdown].map(exists);
    if (!generatedState.some(Boolean) && trashState.every(Boolean)) {
      clearJournal(journal);
      return;
    }
    if (generatedState.every(Boolean) && !trashState[0] && !trashState[1]) {
      removeRegularFile(trash.tombstone);
      clearJournal(journal);
      return;
    }
    if (generatedState.some(Boolean) && trashState.some(Boolean)) {
      const rollbackError = rollbackMoves([
        { from: trash.markdown, to: generated.markdown },
        { from: trash.json, to: generated.json },
      ]);
      if (rollbackError)
        fail(
          "ARTICLE_FILE_TRANSACTION_INCOMPLETE",
          "Article restore transaction needs recovery",
          rollbackError,
        );
      clearJournal(journal);
      return;
    }
    fail(
      "ARTICLE_RESTORE_CONFLICT",
      "Article restore transaction has conflicting files",
    );
  }

  function recoverPermanentDelete(files, journal, record) {
    if (
      !record.staging ||
      path.basename(record.staging) !== record.staging ||
      !record.staging.startsWith(
        path.basename(files.json, ".json") + ".deleting-",
      )
    )
      fail("ARTICLE_INVALID", "Permanent deletion journal is invalid");
    const staging = path.join(files.directory, record.staging);
    const stagingExists = exists(staging);
    if (stagingExists) {
      let stats;
      try {
        stats = fsApi.lstatSync(staging);
      } catch (error) {
        fail("ARTICLE_INVALID", "Permanent deletion staging is invalid", error);
      }
      if (!stats.isDirectory() || stats.isSymbolicLink())
        fail(
          "ARTICLE_PATH_OUT_OF_BOUNDS",
          "Permanent deletion staging is unsafe",
        );
    }
    const terminal =
      exists(files.tombstone) &&
      (() => {
        try {
          return (
            JSON.parse(fsApi.readFileSync(files.tombstone, "utf8"))
              .permanentlyDeleted === true
          );
        } catch (error) {
          fail("ARTICLE_INVALID", "Article tombstone is invalid", error);
        }
      })();
    if (terminal) {
      if (stagingExists) {
        const entries = fsApi.readdirSync(staging, { withFileTypes: true });
        entries.forEach(function (entry) {
          if (
            !entry.isFile() ||
            entry.isSymbolicLink() ||
            ![
              path.basename(files.json),
              path.basename(files.markdown),
            ].includes(entry.name)
          )
            fail("ARTICLE_INVALID", "Permanent deletion staging is invalid");
          assertRegularFile(path.join(staging, entry.name));
        });
        fsApi.rmSync(staging, { recursive: true, force: true });
      }
      clearJournal(journal);
      return;
    }
    const stagedJson = path.join(staging, path.basename(files.json));
    const stagedMarkdown = path.join(staging, path.basename(files.markdown));
    const stagedState = [stagedJson, stagedMarkdown].map(exists);
    const originalState = [files.json, files.markdown].map(exists);
    if (
      stagedState.some(function (present, index) {
        return present && originalState[index];
      })
    )
      fail(
        "ARTICLE_TRASH_CONFLICT",
        "Permanent deletion transaction has conflicting files",
      );
    if (stagedState.some(Boolean)) {
      const rollbackError = rollbackMoves([
        { from: files.markdown, to: stagedMarkdown },
        { from: files.json, to: stagedJson },
      ]);
      if (rollbackError)
        fail(
          "ARTICLE_FILE_TRANSACTION_INCOMPLETE",
          "Permanent deletion transaction needs recovery",
          rollbackError,
        );
      if (stagingExists)
        fsApi.rmSync(staging, { recursive: true, force: true });
      clearJournal(journal);
      return;
    }
    if (originalState.every(Boolean) && stagingExists)
      fsApi.rmSync(staging, { recursive: true, force: true });
    if (originalState.every(Boolean)) {
      clearJournal(journal);
      return;
    }
    fail(
      "ARTICLE_TRASH_CONFLICT",
      "Permanent deletion transaction has conflicting files",
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
      markdown: {
        from: path.basename(source.markdown),
        to: path.basename(destination.markdown),
      },
      tombstone: path.basename(source.tombstone),
    });
    try {
      fsApi.renameSync(source.json, destination.json);
      moves.push({ from: source.json, to: destination.json });
      fault("after-restore-json", { source: source, destination: destination });
      fsApi.renameSync(source.markdown, destination.markdown);
      moves.push({ from: source.markdown, to: destination.markdown });
      fault("after-restore-markdown", {
        source: source,
        destination: destination,
      });
      removeRegularFile(source.tombstone);
      clearJournal(journal);
    } catch (error) {
      const rollbackError = rollbackMoves(moves);
      if (!rollbackError) clearJournal(journal);
      if (rollbackError)
        fail(
          "ARTICLE_FILE_TRANSACTION_INCOMPLETE",
          "Article restore transaction needs recovery",
          rollbackError,
        );
      throw error;
    }
  }

  function writeTerminalTombstone(files, contents) {
    const temporary = writeTemporary(files.tombstone, contents);
    const backup =
      files.tombstone + ".backup-" + process.pid + "-" + Date.now();
    let backedUp = false;
    let installed = false;
    try {
      assertRegularFile(files.tombstone);
      fsApi.renameSync(files.tombstone, backup);
      backedUp = true;
      fault("after-terminal-backup", { files: files });
      fsApi.renameSync(temporary, files.tombstone);
      installed = true;
      fault("after-terminal-install", { files: files });
      removeRegularFile(backup);
    } catch (error) {
      if (installed && exists(files.tombstone))
        removeRegularFile(files.tombstone);
      if (backedUp && exists(backup) && !exists(files.tombstone))
        fsApi.renameSync(backup, files.tombstone);
      removeRegularFile(temporary);
      throw error;
    }
  }

  function permanentlyDelete(files, terminalContents) {
    const journal = transactionJournal(files);
    const staging = path.join(
      files.directory,
      path.basename(files.json, ".json") +
        ".deleting-" +
        process.pid +
        "-" +
        Date.now() +
        "-" +
        crypto.randomUUID(),
    );
    fsApi.mkdirSync(staging);
    const staged = [];
    let terminalWritten = false;
    writeJournal(journal, {
      version: 1,
      kind: "permanent-delete",
      staging: path.basename(staging),
      json: path.basename(files.json),
      markdown: path.basename(files.markdown),
      tombstone: path.basename(files.tombstone),
    });
    try {
      [files.json, files.markdown].forEach(function (filename) {
        const target = path.join(staging, path.basename(filename));
        fsApi.renameSync(filename, target);
        staged.push({ from: filename, to: target });
        fault(
          "after-permanent-stage-" +
            path.basename(filename, path.extname(filename)),
          { files: files },
        );
      });
      writeTerminalTombstone(files, terminalContents);
      terminalWritten = true;
      fsApi.rmSync(staging, { recursive: true, force: true });
      clearJournal(journal);
    } catch (error) {
      if (!terminalWritten) {
        const rollbackError = rollbackMoves(
          staged.map(function (move) {
            return { from: move.from, to: move.to };
          }),
        );
        if (!rollbackError) {
          try {
            fsApi.rmSync(staging, { recursive: true, force: true });
          } catch (_) {}
          clearJournal(journal);
        }
        if (rollbackError)
          fail(
            "ARTICLE_FILE_TRANSACTION_INCOMPLETE",
            "Permanent deletion transaction needs recovery",
            rollbackError,
          );
      }
      throw error;
    }
  }

  return {
    assertRegularFile,
    removeRegularFile,
    writeTemporary,
    recoverArticlePair,
    replaceArticlePair,
    moveToTrash,
    recoverTrashMove,
    restoreFromTrash,
    permanentlyDelete,
  };
}

module.exports = { createArticleFileTransaction };

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const { DIRS } = require("../../../scripts/config");
const { reportDiagnostic } = require("../../diagnostics/diagnostic-producer");
const domain = require("../../domain");
const {
  parseArticle,
  scanArticles: scanArticleSources,
} = require("./article-source");
const {
  HEPAN_SITE_ORIGIN,
  resolveHepanScriptPath,
  resolveHepanVendorDir,
  withHepanVendorEnvironment,
  normalizeHepanCookie,
} = require("./runtime-paths");

const HEPAN_PAYLOAD_FILE = /^\.hepan-payload-[0-9a-f-]{36}\.json$/i;
const HEPAN_PAYLOAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function diagnoseHepanRuntime(code, action) {
  reportDiagnostic({
    code,
    module: "platform-hepan",
    category: "storage",
    operationId: "platform-hepan",
    metadata: { platformId: "hepan", action },
  });
}

function cleanupExpiredHepanPayloads(options) {
  const values = options || {};
  const io = values.fs || fs;
  const pathApi = values.path || path;
  const directory = pathApi.resolve(
    values.tempDir || pathApi.join(DIRS.tmpDir, "hepan"),
  );
  const now = typeof values.now === "function" ? values.now : () => Date.now();
  const maxAgeMs =
    Number.isSafeInteger(values.maxAgeMs) && values.maxAgeMs >= 0
      ? values.maxAgeMs
      : HEPAN_PAYLOAD_MAX_AGE_MS;
  const removed = [];
  let names;
  try {
    names = io.readdirSync(directory);
  } catch (error) {
    if (error && error.code === "ENOENT") return { removed, skipped: 0 };
    diagnoseHepanRuntime("HEPAN_PAYLOAD_SCAN_FAILED", "payload-scan");
    return { removed, skipped: 0 };
  }
  let skipped = 0;
  names.forEach((name) => {
    if (!HEPAN_PAYLOAD_FILE.test(name)) {
      skipped += 1;
      return;
    }
    const candidate = pathApi.resolve(directory, name);
    if (pathApi.dirname(candidate) !== directory) {
      skipped += 1;
      return;
    }
    let stat;
    try {
      stat = io.lstatSync(candidate);
    } catch (error) {
      if (!error || error.code !== "ENOENT")
        diagnoseHepanRuntime("HEPAN_PAYLOAD_STAT_FAILED", "payload-stat");
      return;
    }
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      now() - stat.mtimeMs < maxAgeMs
    ) {
      skipped += 1;
      return;
    }
    try {
      io.unlinkSync(candidate);
      removed.push(name);
    } catch (error) {
      diagnoseHepanRuntime("HEPAN_PAYLOAD_DELETE_FAILED", "payload-delete");
      skipped += 1;
    }
  });
  return { removed, skipped };
}

function resolveHepanRuntime(workspaceRoot, environment) {
  const root = workspaceRoot || DIRS.rootDir;
  const env = environment || process.env;
  let configured = {};
  try {
    configured = JSON.parse(
      fs.readFileSync(path.join(root, "config", "hepan.json"), "utf8"),
    );
  } catch (error) {
    if (!error || error.code !== "ENOENT")
      diagnoseHepanRuntime("HEPAN_RUNTIME_CONFIG_READ_FAILED", "runtime-config");
  }
  return {
    cookiePath:
      configured.cookiePath ||
      env.HEPAN_COOKIE_PATH ||
      path.join(root, "config", "hepan-cookie.txt"),
    pythonPath: configured.pythonPath || env.HEPAN_PYTHON || "python",
  };
}

function currentRuntime() {
  const resolved = resolveHepanRuntime(DIRS.rootDir, process.env);
  return {
    cookiePath: resolved.cookiePath,
    pythonPath: resolved.pythonPath,
    categoryId: Number(process.env.HEPAN_CATEGORY_ID || 121),
    vendorDir: process.env.HEPAN_VENDOR_DIR || "",
    siteOrigin: HEPAN_SITE_ORIGIN,
  };
}

function scriptPath() {
  return resolveHepanScriptPath({ path });
}

function parseJsonOutput(output) {
  const lines = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch (_) {}
  }
  throw new Error("Hepan script did not return JSON");
}

function createHepanAdapter(options) {
  const values = options || {};
  const io = values.fs || fs;
  const pathApi = values.path || path;
  const cryptoApi = values.crypto || crypto;
  const inputDirectory =
    values.inputDir || pathApi.join(DIRS.inputDir, "hepan");
  const imagesDirectory =
    values.imageDir || pathApi.join(inputDirectory, "images");
  const payloadDirectory = values.tempDir || pathApi.join(DIRS.tmpDir, "hepan");
  let runtimeValue = values.runtime ? Object.assign({}, values.runtime) : null;
  const getRuntime =
    typeof values.getRuntime === "function"
      ? values.getRuntime
      : function () {
          return runtimeValue
            ? Object.assign({}, runtimeValue)
            : currentRuntime();
        };
  function setRuntimeConfig(runtime) {
    runtimeValue = runtime && typeof runtime === "object"
      ? {
          cookiePath: runtime.cookiePath || "",
          pythonPath: runtime.pythonPath || "",
          categoryId: Number(runtime.categoryId || 121),
          vendorDir: runtime.vendorDir || "",
          siteOrigin: HEPAN_SITE_ORIGIN,
        }
      : null;
  }
  const spawnProcess =
    typeof values.spawnProcess === "function" ? values.spawnProcess : spawn;
  const commandRunner =
    values.runCommand ||
    function (command, args, commandOptions) {
      const settings = Object.assign(
        { timeout: 240000, windowsHide: true },
        commandOptions || {},
      );
      const signal = settings.signal;
      delete settings.signal;
      return new Promise(function (resolve) {
        let stdout = "";
        let stderr = "";
        let settled = false;
        const finish = function (value) {
          if (!settled) {
            settled = true;
            resolve(value);
          }
        };
        let child;
        try {
          child = spawnProcess(command, args, settings);
        } catch (error) {
          finish({ error: error, stdout: stdout, stderr: stderr });
          return;
        }
        child.stdout &&
          child.stdout.on("data", function (chunk) {
            stdout += String(chunk);
          });
        child.stderr &&
          child.stderr.on("data", function (chunk) {
            stderr += String(chunk);
          });
        let terminalResult = null;
        let timer;
        let cleanedUp = false;
        const cleanup = function () {
          if (cleanedUp) return;
          cleanedUp = true;
          clearTimeout(timer);
          if (signal) signal.removeEventListener("abort", abort);
        };
        const onClose = function (status) {
          cleanup();
          finish(
            terminalResult || {
              status: status,
              stdout: stdout,
              stderr: stderr,
            },
          );
        };
        child.once("error", function (error) {
          if (!terminalResult) {
            cleanup();
            finish({ error: error, stdout: stdout, stderr: stderr });
          }
        });
        child.once("close", onClose);
        const terminate = function (result) {
          if (terminalResult) return;
          terminalResult = result;
          try {
            child.kill();
          } catch (_) {
            diagnose("HEPAN_PROCESS_TERMINATION_FAILED", "process-terminate");
          }
        };
        const abort = function () {
          terminate({
            error: Object.assign(new Error("HEPAN_PROCESS_ABORTED"), {
              code: "HEPAN_PROCESS_ABORTED",
            }),
            stdout: stdout,
            stderr: stderr,
          });
        };
        timer = setTimeout(function () {
          terminate({
            error: Object.assign(new Error("HEPAN_PROCESS_TIMEOUT"), {
              code: "HEPAN_PROCESS_TIMEOUT",
            }),
            stdout: stdout,
            stderr: stderr,
          });
        }, settings.timeout);
        if (signal) {
          if (signal.aborted) abort();
          else signal.addEventListener("abort", abort, { once: true });
        }
      });
    };
  const script = values.scriptPath || scriptPath();
  const bundledVendorDir = resolveHepanVendorDir({
    fs: io,
    path: pathApi,
    scriptPath: script,
    explicit: values.bundledVendorDir,
  });

  function diagnose(code, category, action) {
    reportDiagnostic({
      code,
      module: "platform-hepan",
      category,
      operationId: "platform-hepan",
      metadata: { platformId: "hepan", action: action },
    });
  }

  function runtime() {
    const value = getRuntime() || {};
    return {
      cookiePath: value.cookiePath || "",
      pythonPath: value.pythonPath || "",
      categoryId: Number(value.categoryId || 121),
      vendorDir: value.vendorDir || bundledVendorDir,
      siteOrigin: HEPAN_SITE_ORIGIN,
    };
  }

  function ensureSession() {
    if (!io.existsSync(imagesDirectory))
      io.mkdirSync(imagesDirectory, { recursive: true });
  }

  function runHepan(args, signal, timeoutMs) {
    const config = runtime();
    if (!config.pythonPath || !config.cookiePath) {
      const error = new Error("Hepan publishing is not configured");
      error.code = "HEPAN_CONFIG_NOT_SET";
      throw error;
    }
    const requestedTimeout = Number(timeoutMs);
    const processTimeout =
      Number.isFinite(requestedTimeout) && requestedTimeout > 0
        ? Math.max(1000, Math.ceil(requestedTimeout))
        : 240000;
    return Promise.resolve(
      commandRunner(config.pythonPath, [script].concat(args), {
        cwd: DIRS.rootDir,
        encoding: "utf8",
        timeout: processTimeout,
        signal,
        ...withHepanVendorEnvironment(
          {
            env: Object.assign({}, process.env, { PYTHONIOENCODING: "utf-8" }),
          },
          config.vendorDir,
        ),
      }),
    ).then(function (result) {
      if (result && result.error) throw result.error;
      const payload = parseJsonOutput(result && result.stdout);
      if (result && result.status !== 0 && payload && !payload.error)
        payload.error = "Hepan script failed";
      return payload;
    });
  }

  function createTemporaryPayload(article) {
    const existed = io.existsSync(payloadDirectory);
    if (!existed) io.mkdirSync(payloadDirectory, { recursive: true });
    const name = ".hepan-payload-" + cryptoApi.randomUUID() + ".json";
    const filename = pathApi.join(payloadDirectory, name);
    try {
      io.writeFileSync(
        filename,
        JSON.stringify({
          title: article.title,
          contentHtml: article.contentHtml,
          sourceStem: article.sourceStem,
        }),
        { encoding: "utf8", mode: 0o600 },
      );
    } catch (error) {
      try {
        if (io.existsSync(filename)) io.unlinkSync(filename);
      } catch (_) {
        diagnose("HEPAN_PAYLOAD_DELETE_FAILED", "payload-delete");
      }
      if (!existed) {
        try {
          if (
            io.existsSync(payloadDirectory) &&
            io.readdirSync(payloadDirectory).length === 0
          )
            io.rmdirSync(payloadDirectory);
        } catch (_) {
          diagnose("HEPAN_PAYLOAD_DIRECTORY_CLEANUP_FAILED", "payload-directory");
        }
      }
      throw error;
    }
    return {
      filename,
      cleanup: function () {
        try {
          if (io.existsSync(filename)) io.unlinkSync(filename);
        } catch (_) {
          diagnose("HEPAN_PAYLOAD_DELETE_FAILED", "payload-delete");
        }
        if (!existed) {
          try {
            if (
              io.existsSync(payloadDirectory) &&
              io.readdirSync(payloadDirectory).length === 0
            )
              io.rmdirSync(payloadDirectory);
          } catch (_) {
            diagnose("HEPAN_PAYLOAD_DIRECTORY_CLEANUP_FAILED", "payload-directory");
          }
        }
      },
    };
  }

  async function ensureLoggedIn() {
    const config = runtime();
    if (
      !config.pythonPath ||
      !config.cookiePath ||
      !io.existsSync(config.cookiePath)
    ) {
      diagnose(
        "HEPAN_COOKIE_CONFIGURATION_UNAVAILABLE",
        "authentication",
        "cookie-check",
      );
      return;
    }
    try {
      normalizeHepanCookie(io.readFileSync(config.cookiePath, "utf8"));
    } catch (_) {
      diagnose(
        "HEPAN_COOKIE_CONFIGURATION_EMPTY",
        "authentication",
        "cookie-check",
      );
      return;
    }
    diagnose(
      "HEPAN_COOKIE_CONFIGURATION_READY",
      "authentication",
      "cookie-check",
    );
  }

  async function inspectAccount() {
    const config = runtime();
    if (
      !config.pythonPath ||
      !config.cookiePath ||
      !io.existsSync(config.cookiePath)
    )
      return { verified: false };
    try {
      normalizeHepanCookie(io.readFileSync(config.cookiePath, "utf8"));
      const args = [
        "--cookie-path",
        config.cookiePath,
        "--check-login",
        "--category-id",
        String(config.categoryId),
      ];
      if (config.vendorDir) args.push("--vendor-dir", config.vendorDir);
      const payload = await runHepan(args);
      const account = payload && payload.account;
      const remoteAccountId =
        account &&
        (typeof account.uid === "string" || typeof account.uid === "number")
          ? String(account.uid).trim()
          : "";
      const displayName = String(
        account && typeof account.displayName === "string"
          ? account.displayName
          : "",
      )
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim();
      if (
        !payload ||
        payload.ok !== true ||
        payload.authenticated !== true ||
        !/^\d{1,20}$/.test(remoteAccountId) ||
        !displayName ||
        displayName.length > 128
      )
        return { verified: false };
      return {
        verified: true,
        remoteAccountId,
        displayName,
      };
    } catch (_) {
      return { verified: false };
    }
  }

  async function validatePayload(article) {
    const config = runtime();
    if (!config.pythonPath)
      return { ok: false, errorCode: "HEPAN_CONFIG_NOT_SET" };
    const sourceFile =
      article && (article.sourceFile || article.file || article.filePath);
    let temporaryPayload = null;
    try {
      const parsed =
        article && article.contentHtml
          ? article
          : parseArticle(sourceFile, { fs: io, path: pathApi });
      temporaryPayload = createTemporaryPayload(parsed);
      const result = await commandRunner(
        config.pythonPath,
        [script, "--validate-payload", temporaryPayload.filename],
        {
          cwd: DIRS.rootDir,
          encoding: "utf8",
          timeout: 120000,
          ...withHepanVendorEnvironment(
            {
              env: Object.assign({}, process.env, {
                PYTHONIOENCODING: "utf-8",
              }),
            },
            config.vendorDir,
          ),
        },
      );
      if (result && result.error) throw result.error;
      let payload;
      try {
        payload = parseJsonOutput(result && result.stdout);
      } catch (_) {
        payload = null;
      }
      const validLengths =
        payload &&
        Number.isInteger(payload.titleLength) &&
        Number.isInteger(payload.contentHtmlLength);
      if (
        !payload ||
        (result && result.status !== 0) ||
        !payload.ok ||
        !validLengths
      ) {
        return {
          ok: false,
          errorCode:
            (payload && payload.errorCode) || "HEPAN_PAYLOAD_RUNTIME_FAILED",
        };
      }
      return {
        ok: true,
        titleLength: payload.titleLength,
        contentHtmlLength: payload.contentHtmlLength,
      };
    } catch (error) {
      if (error && /^HEPAN_/.test(error.code || ""))
        return { ok: false, errorCode: error.code };
      return { ok: false, errorCode: "HEPAN_PAYLOAD_RUNTIME_FAILED" };
    } finally {
      if (temporaryPayload) temporaryPayload.cleanup();
    }
  }

  function parseArticleFiles(articles) {
    return (articles || []).map(function (article) {
      try {
        const parsed = parseArticle(article.file, { fs: io, path: pathApi });
        return Object.assign({}, parsed, {
          body: parsed.contentHtml,
          sourceFile: article.file,
          file: article.file,
          filePath: article.file,
          filename: article.filename || pathApi.basename(article.file),
          normalizedFilename:
            article.filename || pathApi.basename(article.file),
        });
      } catch (error) {
        diagnose("HEPAN_ARTICLE_PARSE_FAILED", "validation", "article-parse");
        throw error;
      }
    });
  }

  async function publishArticle(article, options) {
    const signal = options && options.signal;
    const config = runtime();
    diagnose("HEPAN_SUBMIT_STARTED", "remote", "submit");
    if (!config.pythonPath || !config.cookiePath)
      return { status: "group_blocked", errorCode: "HEPAN_CONFIG_NOT_SET" };

    const sourceFile =
      article && (article.sourceFile || article.file || article.filePath);
    const sourceFormat =
      (article && article.sourceFormat) ||
      pathApi.extname(sourceFile || "").toLowerCase();
    let temporaryPayload = null;
    let remoteCallStarted = false;
    try {
      const args = [
        "--image-dir",
        imagesDirectory,
        "--cookie-path",
        config.cookiePath,
        "--category-id",
        String(config.categoryId),
        ...(config.vendorDir ? ["--vendor-dir", config.vendorDir] : []),
      ];
      if (
        sourceFormat === "markdown" ||
        sourceFormat === "txt" ||
        sourceFormat === ".md" ||
        sourceFormat === ".markdown" ||
        sourceFormat === ".txt"
      ) {
        const parsed =
          article && article.contentHtml
            ? article
            : parseArticle(sourceFile, { fs: io, path: pathApi });
        temporaryPayload = createTemporaryPayload(parsed);
        args.push("--payload-path", temporaryPayload.filename);
      } else {
        args.push("--article", sourceFile);
      }
      remoteCallStarted = true;
      const payload = await runHepan(
        args,
        signal,
        options && options.timeoutMs,
      );
      if (payload.errorCode && /^HEPAN_/.test(payload.errorCode)) {
        if (
          [
            "HEPAN_REMOTE_REQUEST_FAILED",
            "HEPAN_PROCESS_TIMEOUT",
            "HEPAN_PROTOCOL_ERROR",
          ].includes(payload.errorCode) ||
          payload.requestMayHaveBeenSent
        ) {
          return { status: "uncertain", errorCode: payload.errorCode };
        }
        return { status: "group_blocked", errorCode: payload.errorCode };
      }
      if (payload.needsLogin) {
        diagnose(
          "HEPAN_COOKIE_REAUTH_REQUIRED",
          "authentication",
          "cookie-refresh",
        );
        return { status: "group_blocked", errorCode: "LOGIN_REQUIRED" };
      }
      if (!payload.ok)
        return { status: "article_rejected", errorCode: "REMOTE_REJECTED" };
      article.title = payload.title || article.title;
      article.publishUrl = payload.url;
      const remoteUrl = typeof payload.url === "string" ? payload.url : "";
      const remoteIdMatch =
        remoteUrl.match(/[?&]aid=([A-Za-z0-9_-]+)/i) ||
        remoteUrl.match(/\/(?:article|aid)\/([A-Za-z0-9_-]+)(?:$|[?#])/i);
      const remoteId = remoteIdMatch && remoteIdMatch[1];
      if (!remoteId)
        return { status: "uncertain", errorCode: "HEPAN_REMOTE_ID_MISSING" };
      diagnose("HEPAN_SUBMIT_COMPLETED", "remote", "submit");
      return {
        status: "accepted",
        remoteId: remoteId,
        remoteUrl: remoteUrl || undefined,
      };
    } catch (error) {
      if (
        remoteCallStarted &&
        error &&
        [
          "HEPAN_PROCESS_TIMEOUT",
          "HEPAN_PROCESS_ABORTED",
          "HEPAN_PROTOCOL_ERROR",
        ].includes(error.code)
      ) {
        return { status: "uncertain", errorCode: error.code };
      }
      if (error && /^HEPAN_/.test(error.code || ""))
        return { status: "group_blocked", errorCode: error.code };
      if (remoteCallStarted)
        return { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" };
      return { status: "group_blocked", errorCode: "ADAPTER_FAILED" };
    } finally {
      if (temporaryPayload) temporaryPayload.cleanup();
    }
  }

  async function preparePlatformSubmission(claim, imagePlan) {
    const evidence = domain.createTextOnlyPreparedSubmissionEvidenceV1(claim);
    const config = runtime();
    if (!config.pythonPath) {
      const error = new Error("Hepan publishing is not configured");
      error.code = "HEPAN_CONFIG_NOT_SET";
      throw error;
    }
    const preparedArticle = {
      title: evidence.title,
      contentHtml: evidence.body,
      sourceStem: evidence.articleIdentityV1.articleId,
    };
    const temporaryPayload = createTemporaryPayload(preparedArticle);
    let consumed = false;
    let remoteCallStarted = false;
    try {
      return domain.createPreparedSubmission({
        preparedSubmissionEvidenceV1: evidence,
        submitPreparedPublication: async function () {
          if (consumed)
            return { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" };
          consumed = true;
          try {
            const submissionConfig = runtime();
            if (
              !submissionConfig.cookiePath ||
              !io.existsSync(submissionConfig.cookiePath)
            ) {
              const error = new Error("Hepan publishing is not configured");
              error.code = "HEPAN_CONFIG_NOT_SET";
              throw error;
            }
            const args = [
              "--image-dir",
              imagesDirectory,
              "--cookie-path",
              submissionConfig.cookiePath,
              "--category-id",
              String(config.categoryId),
              ...(config.vendorDir ? ["--vendor-dir", config.vendorDir] : []),
              "--payload-path",
              temporaryPayload.filename,
            ];
            remoteCallStarted = true;
            const payload = await runHepan(args);
            if (payload.errorCode && /^HEPAN_/.test(payload.errorCode)) {
              return {
                status: "uncertain",
                errorCode: payload.errorCode,
              };
            }
            if (payload.needsLogin)
              return {
                status: "group_blocked",
                errorCode: "LOGIN_REQUIRED",
                articleRecoverable: true,
              };
            if (!payload.ok)
              return {
                status: "article_rejected",
                errorCode: "REMOTE_REJECTED",
              };
            const remoteUrl =
              typeof payload.url === "string" ? payload.url : "";
            const remoteIdMatch =
              remoteUrl.match(/[?&]aid=([A-Za-z0-9_-]+)/i) ||
              remoteUrl.match(/\/(?:article|aid)\/([A-Za-z0-9_-]+)(?:$|[?#])/i);
            const remoteId = remoteIdMatch && remoteIdMatch[1];
            if (!remoteId)
              return {
                status: "uncertain",
                errorCode: "HEPAN_REMOTE_ID_MISSING",
              };
            return {
              status: "accepted",
              remoteId,
              remoteUrl: remoteUrl || undefined,
            };
          } catch (error) {
            if (!remoteCallStarted && error && /^HEPAN_/.test(error.code || ""))
              return {
                status: "group_blocked",
                errorCode: error.code,
              };
            return {
              status: "uncertain",
              errorCode:
                error && /^HEPAN_/.test(error.code || "")
                  ? error.code
                  : "REMOTE_RESULT_UNKNOWN",
            };
          } finally {
            temporaryPayload.cleanup();
          }
        },
      });
    } catch (error) {
      temporaryPayload.cleanup();
      throw error;
    }
  }

  return {
    id: "hepan",
    publicationTarget: { kind: "platform", granularity: "platform" },
    contentQueueImport: true,
    scanDir: "hepan",
    ensureSession,
    ensureLoggedIn,
    inspectAccount,
    validatePayload,
    publishArticle,
    preparePlatformSubmission,
    closeSession: function () {},
    scanArticles: function () {
      return scanArticleSources(inputDirectory, { fs: io, path: pathApi });
    },
    parseArticleFiles,
    resolveHepanRuntime,
    setRuntimeConfig,
    clearRuntimeConfig: function () {
      runtimeValue = null;
    },
  };
}

function createPlatformAdapter(runtimeContext) {
  const context = runtimeContext || {};
  const workspacePaths = context.workspacePaths || {};
  const scanDir =
    typeof context.scanDir === "string" &&
    /^[a-z][a-z0-9-]{0,63}$/.test(context.scanDir)
      ? context.scanDir
      : null;
  return createHepanAdapter({
    inputDir: workspacePaths.input && scanDir
      ? path.join(workspacePaths.input, scanDir)
      : undefined,
    tempDir: workspacePaths.tmp
      ? path.join(workspacePaths.tmp, "hepan")
      : undefined,
  });
}

module.exports = {
  createPlatformAdapter,
  createHepanAdapter,
  resolveHepanRuntime,
  cleanupExpiredHepanPayloads,
};

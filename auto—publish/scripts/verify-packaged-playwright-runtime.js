const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REQUIRED_FILES = [
  "tools/node/node.exe",
  "tools/node/LICENSE",
  "tools/node/runtime-tools-manifest.json",
  "node_modules/@playwright/cli/playwright-cli.js",
  "node_modules/@playwright/cli/LICENSE",
  "node_modules/playwright/LICENSE",
  "node_modules/playwright-core/LICENSE",
];

const FORBIDDEN_NAMES = new Set([
  ".env",
  "runtime-config.json",
  "ai-provider.json",
  "workspace-location.json",
  ".autopublish-workspace.json",
  "cookie",
  "cookies",
]);
const FORBIDDEN_SEGMENTS = new Set([
  "input",
  "published",
  "data",
  "logs",
  "profile",
  "profiles",
  "state",
  "browser-profile",
  ".playwright-cli",
  "client-material-cache",
  "content-generation-batches",
]);

function verificationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function relative(appDir, filename) {
  return path.relative(appDir, filename).split(path.sep).join("/");
}

function regularFile(filename) {
  try {
    const stat = fs.lstatSync(filename);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (_) {
    return false;
  }
}

function staticEntries(appDir) {
  const failures = [];
  function visit(current) {
    fs.readdirSync(current, { withFileTypes: true }).forEach(function (entry) {
      const filename = path.join(current, entry.name);
      const rel = relative(appDir, filename);
      const parts = rel.split("/");
      const lowerParts = parts.map(function (value) {
        return value.toLowerCase();
      });
      const lowerName = entry.name.toLowerCase();
      let stat;
      try {
        stat = fs.lstatSync(filename);
      } catch (_) {
        failures.push("UNREADABLE:" + rel);
        return;
      }
      if (stat.isSymbolicLink()) failures.push("SYMLINK:" + rel);
      if (
        FORBIDDEN_NAMES.has(lowerName) ||
        lowerParts.some(function (value) {
          return FORBIDDEN_SEGMENTS.has(value);
        })
      )
        failures.push("PRIVATE:" + rel);
      if (entry.isDirectory()) {
        // Dependencies are trusted production inputs; they are checked for
        // licenses and absolute references below but cannot introduce app
        // workspace state by their directory names.
        if (lowerName !== "node_modules") visit(filename);
        return;
      }
      if (lowerParts.includes("node_modules")) return;
      // This verifier intentionally contains the forbidden-reference patterns
      // that it searches for; do not mistake its own source code for packaged
      // machine state.
      if (rel === "scripts/verify-packaged-playwright-runtime.js") return;
      let content = "";
      try {
        content = fs.readFileSync(filename).toString("utf8");
      } catch (_) {
        failures.push("UNREADABLE:" + rel);
        return;
      }
      const absoluteTokens = [
        /C:\\Users\\violet/i,
        /C:\/Users\/violet/i,
        /\.codex/i,
        /AppData[\\/]Roaming[\\/]npm/i,
        /node_modules[\\/]@playwright[\\/]cli[\\/]playwright-cli\.ps1/i,
      ];
      if (
        absoluteTokens.some(function (token) {
          return token.test(content);
        })
      )
        failures.push("ABSOLUTE_REFERENCE:" + rel);
    });
  }
  visit(appDir);
  return failures;
}

function readPackagedManifest(appDir) {
  const filename = path.join(
    appDir,
    "tools",
    "node",
    "runtime-tools-manifest.json",
  );
  if (!regularFile(filename))
    throw verificationError(
      "PACKAGED_NODE_MANIFEST_MISSING",
      "Packaged Node manifest is missing",
    );
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (_) {
    throw verificationError(
      "PACKAGED_NODE_MANIFEST_INVALID",
      "Packaged Node manifest is invalid",
    );
  }
  if (
    !manifest ||
    manifest.tool !== "node" ||
    !/^v\d+\.\d+\.\d+$/.test(manifest.nodeVersion || "")
  )
    throw verificationError(
      "PACKAGED_NODE_MANIFEST_INVALID",
      "Packaged Node manifest is invalid",
    );
  return manifest;
}

function verifyStaticPackage(appDir, options) {
  const root = path.resolve(appDir || "");
  if (!root || !fs.existsSync(root))
    throw verificationError(
      "PACKAGED_APP_MISSING",
      "Packaged app directory is missing",
    );
  const externalNode = options && options.node;
  const required = externalNode
    ? REQUIRED_FILES.filter(function (filename) {
        return !filename.startsWith("tools/node/");
      })
    : REQUIRED_FILES;
  const missing = required.filter(function (filename) {
    return !regularFile(path.join(root, filename));
  });
  if (externalNode && !regularFile(externalNode))
    missing.push("external node.exe");
  if (missing.length)
    throw verificationError(
      "PACKAGED_RUNTIME_FILES_MISSING",
      "Packaged Playwright runtime files are missing",
    );
  const packageJson = path.join(
    root,
    "node_modules",
    "@playwright",
    "cli",
    "package.json",
  );
  let cliPackage;
  try {
    cliPackage = JSON.parse(fs.readFileSync(packageJson, "utf8"));
  } catch (_) {
    throw verificationError(
      "PACKAGED_CLI_INVALID",
      "Packaged Playwright CLI metadata is invalid",
    );
  }
  if (cliPackage.version !== "0.1.14")
    throw verificationError(
      "PACKAGED_CLI_VERSION_INVALID",
      "Packaged Playwright CLI version is not approved",
    );
  const manifest = externalNode
    ? JSON.parse(
        fs.readFileSync(
          path.join(path.dirname(externalNode), "runtime-tools-manifest.json"),
          "utf8",
        ),
      )
    : readPackagedManifest(root);
  const privateEntries = staticEntries(root);
  if (privateEntries.length)
    throw verificationError(
      "PACKAGED_PRIVATE_DATA",
      "Packaged app contains private data or an unsafe reference",
    );
  return {
    appDir: root,
    node: externalNode || path.join(root, "tools", "node", "node.exe"),
    cli: path.join(
      root,
      "node_modules",
      "@playwright",
      "cli",
      "playwright-cli.js",
    ),
    manifest: manifest,
  };
}

function isolatedEnvironment(tempRoot) {
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const pathEntries = [path.join(systemRoot, "System32"), systemRoot];
  const env = Object.assign({}, process.env, {
    PATH: pathEntries.join(path.delimiter),
    PLAYWRIGHT_DAEMON_SESSION_DIR: path.join(tempRoot, "daemon"),
    AUTO_PUBLISH_PACKAGED: "1",
  });
  [
    "PLAYWRIGHT_CLI_JS",
    "AUTO_PUBLISH_NODE_EXEC_PATH",
    "HEPAN_PYTHON",
    "BROWSER_CHANNEL",
  ].forEach(function (key) {
    delete env[key];
  });
  return env;
}

function runCli(runtime, args, env, timeout) {
  try {
    return execFileSync(runtime.node, [runtime.cli].concat(args), {
      cwd: runtime.appDir,
      env: env,
      encoding: "utf8",
      timeout: timeout || 30000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw verificationError(
      "PACKAGED_PLAYWRIGHT_COMMAND_FAILED",
      "Packaged Playwright command failed",
    );
  }
}

function verifyIsolatedRuntime(runtime, options) {
  const opts = options || {};
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "autopublish-packaged-playwright-"),
  );
  const env = isolatedEnvironment(tempRoot);
  let opened = false;
  let result = null;
  let primaryError = null;
  try {
    const version = execFileSync(runtime.node, ["--version"], {
      cwd: runtime.appDir,
      env: env,
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
    }).trim();
    if (version !== runtime.manifest.nodeVersion)
      throw verificationError(
        "PACKAGED_NODE_VERSION_MISMATCH",
        "Packaged Node version does not match its manifest",
      );
    runCli(runtime, ["--help"], env, 30000);
    runCli(runtime, ["-s=packaged-verify", "list"], env, 30000);
    if (opts.browserSmoke) {
      const profile = path.join(tempRoot, "profile");
      const browser = opts.browserChannel || "msedge";
      runCli(
        runtime,
        [
          "-s=packaged-verify",
          "open",
          "about:blank",
          "--browser=" + browser,
          "--headed",
          "--persistent",
          "--profile=" + profile,
        ],
        env,
        60000,
      );
      opened = true;
      runCli(runtime, ["-s=packaged-verify", "list"], env, 30000);
      runCli(runtime, ["-s=packaged-verify", "close"], env, 30000);
      opened = false;
    }
    result = {
      ok: true,
      nodeVersion: version,
      browserSmoke: Boolean(opts.browserSmoke),
    };
  } catch (error) {
    primaryError = error;
  }
  if (opened) {
    try {
      runCli(runtime, ["-s=packaged-verify", "close"], env, 10000);
      opened = false;
    } catch (_) {
      if (primaryError)
        primaryError.cleanupCode = "PACKAGED_PLAYWRIGHT_CLOSE_FAILED";
      else
        primaryError = verificationError(
          "PACKAGED_PLAYWRIGHT_CLOSE_FAILED",
          "Packaged Playwright browser cleanup failed",
        );
    }
  }
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch (_) {
    if (primaryError)
      primaryError.cleanupCode = "PACKAGED_PLAYWRIGHT_TEMP_CLEANUP_FAILED";
    else
      primaryError = verificationError(
        "PACKAGED_PLAYWRIGHT_TEMP_CLEANUP_FAILED",
        "Packaged Playwright temporary cleanup failed",
      );
  }
  if (primaryError) throw primaryError;
  return result;
}

function verifyPackagedRuntime(appDir, options) {
  const runtime = verifyStaticPackage(appDir, options);
  const result = { static: runtime };
  if (!(options && options.staticOnly))
    result.execution = verifyIsolatedRuntime(runtime, options);
  return result;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const appDir = args.shift();
  const options = {
    browserSmoke: args.includes("--browser-smoke"),
    staticOnly: args.includes("--static-only"),
  };
  try {
    const result = verifyPackagedRuntime(appDir, options);
    process.stdout.write(
      JSON.stringify({
        ok: true,
        nodeVersion: result.static.manifest.nodeVersion,
        browserSmoke: Boolean(options.browserSmoke),
      }) + "\n",
    );
  } catch (error) {
    const code =
      error &&
      typeof error.code === "string" &&
      /^PACKAGED_[A-Z0-9_]{1,72}$/.test(error.code)
        ? error.code
        : "PACKAGED_RUNTIME_VERIFY_FAILED";
    process.stderr.write(code + "\n");
    process.exitCode = 1;
  }
}

module.exports = {
  verifyStaticPackage,
  verifyIsolatedRuntime,
  verifyPackagedRuntime,
  staticEntries,
};

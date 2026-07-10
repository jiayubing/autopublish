const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { DIRS, PW, PLAYWRIGHT_CLI_JS } = require("../../scripts/config");
const { log } = require("./logger");
const { quoteArg } = require("./files");

function nodeExecPath() {
  if (process.env.AUTO_PUBLISH_NODE_EXEC_PATH && process.env.AUTO_PUBLISH_NODE_EXEC_PATH.trim()) { return process.env.AUTO_PUBLISH_NODE_EXEC_PATH.trim(); } try { var r = require("child_process").execSync("where node 2>nul",{encoding:"utf8",timeout:5000}); var ls = String(r).trim().split(/\r?\n/).filter(Boolean); for (var i=0;i<ls.length;i++) { var c=ls[i].trim(); if (c&&require("fs").existsSync(c)&&c.toLowerCase().indexOf("electron")===-1) return c; } } catch(_){} return process.execPath;
}

// Each Platform Adapter owns its own Platform Session: an isolated daemon
// session name, browser profile directory, daemon directory, and state file.
// Adapters pass a session name (e.g. "lieju", "toutiao") to pwSessionConfig
// and pass the returned context to pwCmd/pwRun/runCode via opts.session.
// Omitting the session context falls back to the shared PW session, so legacy
// callers (e.g. scripts/explore-lieju.js) keep working unchanged.
function pwSessionConfig(name) {
  var session = name || PW.session;
  return {
    session: session,
    profileDir: path.join(PW.home, "profiles", session),
    daemonDir: path.join(PW.home, "sessions", session),
    stateFile: path.join(DIRS.stateDir, session + ".json")
  };
}

function pwEnv(sessionCtx) {
  var env = {};
  Object.keys(process.env).forEach(function(key) {
    env[key] = process.env[key];
  });
  var ctx = sessionCtx || pwSessionConfig();
  env.PLAYWRIGHT_DAEMON_SESSION_DIR = ctx.daemonDir;
  return env;
}

function pwCmd(args, sessionCtx) {
  var ctx = sessionCtx || pwSessionConfig();
  return `chcp 65001 > nul && set PLAYWRIGHT_DAEMON_SESSION_DIR=${ctx.daemonDir} && "${nodeExecPath()}" "${PLAYWRIGHT_CLI_JS}" -s=${ctx.session} ${args}`;
}

function pwRun(args, opts) {
  var options = opts || {};
  var timeout = options.timeout || 30000;
  var sessionCtx = options.session || null;
  log("PW: " + args.substring(0, 120), "DEBUG");
  return execSync(pwCmd(args, sessionCtx), {
    encoding: "utf-8",
    timeout: timeout,
    env: pwEnv(sessionCtx)
  }).toString();
}

function extractResult(raw) {
  var text = String(raw || "");
  var marker = "### Result";
  var start = text.indexOf(marker);
  if (start === -1) return text.trim();
  var rest = text.slice(start + marker.length);
  var nextIdx = rest.indexOf("###");
  var block = nextIdx === -1 ? rest : rest.slice(0, nextIdx);
  var line = block.split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean)[0] || "";
  if (!line) return text.trim();
  try { return JSON.parse(line); } catch (e) { return line; }
}

function runCode(jsCode, opts) {
  var options = opts || {};
  if (typeof options === "number") {
    // legacy signature: runCode(jsCode, timeout)
    options = { timeout: options };
  }
  var sessionCtx = options.session || null;
  var filePath = path.join(DIRS.tmpDir, "run-" + Date.now() + ".js");
  var wrapped = "async page => {\n" + jsCode + "\n}";
  fs.writeFileSync(filePath, wrapped, "utf-8");
  try {
    return extractResult(pwRun("run-code --filename=" + quoteArg(filePath), { timeout: options.timeout || 60000, session: sessionCtx }));
  } finally {
    try { fs.unlinkSync(filePath); } catch (e) {}
  }
}

module.exports = { pwSessionConfig, pwEnv, pwCmd, pwRun, runCode };

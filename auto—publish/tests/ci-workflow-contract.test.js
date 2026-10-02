"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { collectTestFiles, parseArguments } = require("../scripts/run-tests");
const {
  REQUIRED_CHECKS,
} = require("../scripts/create-release-evidence-manifest");

const applicationRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(applicationRoot, "..");
const workflowPath = path.join(
  repositoryRoot,
  ".github",
  "workflows",
  "ci.yml",
);
const installerWorkflowPath = path.join(
  repositoryRoot,
  ".github",
  "workflows",
  "windows-installer.yml",
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(applicationRoot, "package.json"), "utf8"),
);

function job(source, name) {
  const lines = source.split(/\r?\n/);
  const start = lines.indexOf("  " + name + ":");
  assert.ok(start >= 0, "missing " + name + " job");
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z][A-Za-z0-9_-]*:$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function readWorkflow(filename) {
  return require("js-yaml").load(fs.readFileSync(filename, "utf8"));
}
function commands(workflow) {
  return Object.values(workflow.jobs).flatMap((owner) =>
    (owner.steps || [])
      .filter((step) => step.run)
      .map((step) => ({
        ...step,
        condition: [owner.if, step.if].filter(Boolean).join(" && "),
      })),
  );
}

test("ordinary CI keeps safety regressions and packaging requires an explicit release candidate", () => {
  const workflow = readWorkflow(workflowPath);
  assert.ok(Object.hasOwn(workflow.on, "push"));
  assert.ok(Object.hasOwn(workflow.on, "pull_request"));
  assert.equal(workflow.on.workflow_dispatch.inputs.release.default, false);
  const runs = commands(workflow);
  for (const command of [
    "npm run test:desktop-regression",
    "npm run test:media-transport",
    "npm run test:diagnostics",
    "npm run test:production-ipc-matrix",
    "npm run test:packaging",
    "npm run build:renderer",
    "npm run build:preload",
  ]) {
    assert.ok(
      runs.some((step) => !step.condition && step.run.includes(command)),
      command,
    );
  }
  for (const step of runs.filter((step) =>
    /npm run (?:pack:|dist:)|docker build|create-release-evidence-manifest/.test(
      step.run,
    ),
  )) {
    assert.ok(
      step.condition.includes(
        "github.event_name == 'workflow_dispatch' && inputs.release",
      ),
      step.run,
    );
  }
  const evidence = runs.find((step) =>
    step.run.includes("create-release-evidence-manifest"),
  );
  for (const check of REQUIRED_CHECKS)
    assert.ok(evidence.run.includes("--check " + check + "=PASSED"), check);
  assert.equal(
    runs.some((step) => step.run.includes("npm run typecheck:renderer")),
    false,
  );
  assert.match(
    packageJson.scripts["build:renderer"],
    /run lint && .*run build/,
  );
});

test("candidate CI assigns every root test to exactly one execution owner", () => {
  const runs = commands(readWorkflow(workflowPath));
  const ownership = new Map();
  const { selectTestSuite } = require("../scripts/run-tests");
  for (const step of runs.filter(
    (step) => step["working-directory"] === "auto—publish",
  )) {
    const files = Array.from(
      step.run.matchAll(/--test\s+(tests\/\S+\.test\.(?:js|mjs))/g),
      (match) => match[1],
    );
    for (const match of step.run.matchAll(/npm run (test:[\w-]+)/g)) {
      const script = packageJson.scripts[match[1]];
      assert.ok(script, match[1]);
      const args = script.split(/\s+/);
      if (args[1] === "scripts/run-tests.js") {
        const options = parseArguments(args.slice(2));
        if (options.list) continue;
        files.push(
          ...selectTestSuite(collectTestFiles(), options.suite).filter(
            (file) => !options.excludedFiles.includes(file),
          ),
        );
      } else
        files.push(
          ...args.filter((arg) => /^tests\/.*\.test\.(js|mjs)$/.test(arg)),
        );
    }
    for (const file of files) {
      assert.equal(ownership.has(file), false, file + " runs twice");
      ownership.set(file, step.name || step.run);
    }
  }
  assert.deepEqual([...ownership.keys()].sort(), collectTestFiles().sort());
  assert.ok(ownership.has("tests/operational-storage-safety.test.js"));
  const auth = runs.filter(
    (step) => step["working-directory"] === "auto—publish/auth-server",
  );
  assert.equal(auth.filter((step) => step.run === "npm test").length, 1);
  assert.equal(
    auth.some((step) => /npm run test:(health|rate-limit)/.test(step.run)),
    false,
  );
  const authPackage = JSON.parse(
    fs.readFileSync(path.join(applicationRoot, "auth-server/package.json")),
  );
  assert.equal(authPackage.scripts.test, "node --test tests/*.test.js");
  for (const file of [
    "health-semantics.test.js",
    "auth-proxy-rate-limit.test.js",
  ])
    assert.ok(
      fs.existsSync(path.join(applicationRoot, "auth-server/tests", file)),
    );
  const links = runs.find((step) =>
    step.run.includes("verify-link-capability.js"),
  );
  assert.ok(links.run.includes("--strict"));
  const linkFiles =
    packageJson.scripts["test:links"].match(/tests\/\S+\.test\.js/g);
  for (const file of linkFiles) assert.ok(ownership.has(file), file);
});

test("Windows installer is manually selected and verifies the exact candidate before building", () => {
  const workflow = readWorkflow(installerWorkflowPath);
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.equal(workflow.on.workflow_dispatch.inputs.ref.required, true);
  const steps = Object.values(workflow.jobs).flatMap((owner) => owner.steps);
  const checkout = steps.find((step) =>
    step.uses?.startsWith("actions/checkout@"),
  );
  assert.equal(checkout.with.ref, "$" + "{{ inputs.ref }}");
  const runs = steps.filter((step) => step.run);
  const identity = runs.find((step) => step.run.includes("git rev-parse HEAD"));
  assert.equal(identity.env.CANDIDATE_SHA, "$" + "{{ inputs.ref }}");
  assert.ok(identity.run.includes("$actual -ne $env:CANDIDATE_SHA"));
  const regression = runs.find((step) =>
    step.run.includes("npm run test:desktop-regression"),
  );
  const build = runs.find((step) =>
    step.run.includes("npm run dist:alpha:dirty"),
  );
  assert.ok(regression && build && identity);
  assert.ok(runs.indexOf(identity) < runs.indexOf(regression));
  assert.ok(runs.indexOf(regression) < runs.indexOf(build));
});

test("Auth compose clean-machine storage and health are readiness-safe", () => {
  const compose = fs.readFileSync(
    path.join(applicationRoot, "auth-server", "docker-compose.yml"),
    "utf8",
  );
  const dockerfile = fs.readFileSync(
    path.join(applicationRoot, "auth-server", "Dockerfile"),
    "utf8",
  );
  assert.match(compose, /autopublish-auth-data:\/data/);
  assert.doesNotMatch(compose, /\.\/data:\/data/);
  assert.match(compose, /\nvolumes:\s*\n\s+autopublish-auth-data:/);
  assert.match(dockerfile, /\/healthz\/ready/);
});

test(
  "Windows toolchain stops on a native failure and completes a successful chain",
  { skip: process.platform !== "win32" },
  (t) => {
    const workflow = fs.readFileSync(workflowPath, "utf8");
    const section = job(workflow, "desktop")
      .split("- name: required/toolchain")[1]
      .split("- name:")[0];
    const script = section.match(/run: \|\n((?: {10}.*\n?)*)/)[1];
    const commands = script
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("npm run "));
    assert.ok(commands.length > 1);
    const directory = fs.mkdtempSync(
      path.join(require("node:os").tmpdir(), "ci-native-exit-"),
    );
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const trace = path.join(directory, "calls.txt");
    const scriptPath = path.join(directory, "toolchain.ps1");
    fs.writeFileSync(scriptPath, script);
    fs.writeFileSync(
      path.join(directory, "npm.cmd"),
      '@echo %*>>"%AUDIT_NATIVE_TRACE%"\r\n@exit /b %AUDIT_NATIVE_EXIT%\r\n',
    );
    for (const code of [7, 0]) {
      const env = {
        ...process.env,
        AUDIT_NATIVE_TRACE: trace,
        AUDIT_NATIVE_EXIT: String(code),
      };
      const pathKey = Object.keys(env).find(
        (key) => key.toLowerCase() === "path",
      );
      env[pathKey] = directory + path.delimiter + env[pathKey];
      const result = require("node:child_process").spawnSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-File", scriptPath],
        { env, encoding: "utf8", timeout: 15000 },
      );
      assert.equal(result.status, code, result.stderr);
      const calls = fs.readFileSync(trace, "utf8").trim().split(/\r?\n/);
      assert.deepEqual(
        calls,
        (code ? commands.slice(0, 1) : commands).map((command) =>
          command.slice(4),
        ),
      );
      fs.unlinkSync(trace);
    }
  },
);

test("omitted browser and Electron regressions have explicit CI owners", () => {
  const workflow = fs.readFileSync(workflowPath, "utf8");
  const desktop = job(workflow, "desktop");
  const options = parseArguments(
    packageJson.scripts["test:desktop-regression"].split(/\s+/).slice(2),
  );
  assert.ok(
    collectTestFiles(options.excludedFiles).includes(
      "tests/renderer-batch-generation-client-hydration.test.js",
    ),
  );
  const focus = desktop
    .split("- name: required/electron-focus")[1]
    .split("- name:")[0];
  assert.match(focus, /RUN_ELECTRON_FOCUS_TESTS: "1"/);
  assert.match(
    focus,
    /--test tests\/renderer-settings-window-focus\.electron\.test\.js/,
  );
  assert.doesNotMatch(focus, /if:/);
  const packaged = desktop
    .split("- name: release/packaged-navigation")[1]
    .split("- name:")[0];
  assert.match(
    packaged,
    /if: github.event_name == 'workflow_dispatch' && inputs.release/,
  );
  assert.match(packaged, /RUN_UNPACKED_NAVIGATION_SMOKE: "1"/);
  assert.match(
    packaged,
    /AUTO_PUBLISH_UNPACKED_EXECUTABLE: release-production-smoke\/win-unpacked\/ETO—001\.exe/,
  );
  assert.match(
    packaged,
    /--test tests\/renderer-cold-start-navigation-convergence\.electron\.test\.js/,
  );
  const audit = job(workflow, "dependency-audit");
  const renderer = audit
    .split("- name: Renderer dependency audit")[1]
    .split("- name:")[0];
  assert.match(renderer, /npm audit --audit-level=high/);
  assert.match(renderer, /working-directory: auto—publish\/media-workbench/);
  assert.doesNotMatch(renderer, /continue-on-error/);
});

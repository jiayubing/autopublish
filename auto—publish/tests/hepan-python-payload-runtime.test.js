const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { createHepanAdapter } = require("../src/platforms/hepan/adapter");

const rootDir = path.resolve(__dirname, "..");
const scriptPath = path.join(rootDir, "src", "platforms", "hepan", "hepan_publish.py");

function tempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-hepan-python-runtime-"));
}

function pythonCommand() {
  const command = process.env.HEPAN_TEST_PYTHON || "python";
  const result = spawnSync(command, ["--version"], { encoding: "utf8", windowsHide: true });
  assert.equal(result.error, undefined, `Python is required for Hepan payload regression tests: ${result.error && result.error.message}`);
  assert.equal(result.status, 0, `Python is required for Hepan payload regression tests: ${result.stderr || result.stdout}`);
  const version = `${result.stdout || ""}${result.stderr || ""}`.trim();
  const match = version.match(/Python\s+(\d+)\.(\d+)/);
  assert.ok(match, `Python version could not be detected: ${version}`);
  const major = Number(match[1]);
  const minor = Number(match[2]);
  assert.equal(major, 3, `Hepan Python requires Python 3.10-3.13, got ${version}`);
  assert.ok(minor >= 10 && minor <= 13, `Hepan Python requires Python 3.10-3.13, got ${version}`);
  return command;
}

function runPython(python, args) {
  return spawnSync(python, args, {
    cwd: rootDir,
    encoding: "utf8",
    windowsHide: true,
    env: Object.assign({}, process.env, { PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" })
  });
}

function parseJsonOutput(result) {
  const lines = String(result.stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  assert.ok(lines.length > 0, `Hepan Python did not return JSON: ${result.stderr || "no stderr"}`);
  return JSON.parse(lines[lines.length - 1]);
}

function runPayloadValidation(python, payloadPath) {
  const result = runPython(python, [scriptPath, "--validate-payload", payloadPath]);
  return { process: result, payload: parseJsonOutput(result) };
}

function createSymlinkFixture(root, target) {
  const linkPath = path.join(root, "payload-link.json");
  try {
    fs.symlinkSync(target, linkPath, "file");
    return linkPath;
  } catch (error) {
    assert.equal(process.platform, "win32");
    assert.equal(error.code, "EPERM");
    const targetDirectory = path.join(root, "payload-link-target");
    fs.mkdirSync(targetDirectory);
    fs.symlinkSync(targetDirectory, linkPath, "junction");
    return linkPath;
  }
}

describe("Hepan Python payload runtime", () => {
  it("runs the payload validator on the supported Python 3.10-3.13 runtime", () => {
    const python = pythonCommand();
    const result = runPython(python, ["-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^3\.(1[0-3])\s*$/m);
  });

  it("validates the real Node-generated Markdown and TXT payloads without cookie, image, or network access", async () => {
    const python = pythonCommand();
    const root = tempDirectory();
    try {
      const inputDir = path.join(root, "input");
      const tempDir = path.join(root, "tmp");
      const cookiePath = path.join(root, "cookie.txt");
      fs.mkdirSync(inputDir, { recursive: true });
      fs.writeFileSync(cookiePath, "fixture-cookie", "utf8");
      const sourceFiles = [
        ["river.md", "# 河畔标题\n\n正文 **加粗**"],
        ["plain.txt", "纯文本标题\n\n纯文本正文"]
      ].map(([filename, content]) => {
        const sourceFile = path.join(inputDir, filename);
        fs.writeFileSync(sourceFile, content, "utf8");
        return sourceFile;
      });

      const adapter = createHepanAdapter({
        inputDir,
        tempDir,
        runtime: { pythonPath: python, cookiePath, categoryId: 121, vendorDir: "" }
      });

      for (const sourceFile of sourceFiles) {
        const filename = path.basename(sourceFile);
        const article = (await adapter.parseArticleFiles([{ file: sourceFile, filename, fileBaseName: path.parse(filename).name }]))[0];
        const result = await adapter.validatePayload(article);
        assert.equal(result.ok, true);
        assert.equal(Number.isInteger(result.titleLength), true);
        assert.equal(Number.isInteger(result.contentHtmlLength), true);
      }

      assert.equal(fs.existsSync(tempDir) ? fs.readdirSync(tempDir).length : 0, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a directory, symlink, missing file, and invalid JSON with safe payload codes", () => {
    const python = pythonCommand();
    const root = tempDirectory();
    try {
      const validPayload = JSON.stringify({ title: "河畔标题", contentHtml: "<p>正文</p>", sourceStem: "river" });
      const validPath = path.join(root, "valid.json");
      fs.writeFileSync(validPath, validPayload, "utf8");
      const validResult = runPayloadValidation(python, validPath);
      assert.equal(validResult.process.status, 0);
      assert.deepEqual(validResult.payload, { ok: true, titleLength: 4, contentHtmlLength: 9 });
      const directoryPath = path.join(root, "directory.json");
      fs.mkdirSync(directoryPath);
      const symlinkPath = createSymlinkFixture(root, validPath);
      const cases = [
        [directoryPath, "HEPAN_PAYLOAD_NOT_FILE", "Hepan payload file is invalid"],
        [symlinkPath, "HEPAN_PAYLOAD_NOT_FILE", "Hepan payload file is invalid"],
        [path.join(root, "missing.json"), "HEPAN_PAYLOAD_NOT_FILE", "Hepan payload file is invalid"]
      ];
      const invalidPath = path.join(root, "invalid.json");
      fs.writeFileSync(invalidPath, "{not-json", "utf8");
      cases.push([invalidPath, "HEPAN_PAYLOAD_JSON_INVALID", "Hepan payload JSON is invalid"]);

      for (const [payloadPath, errorCode, errorMessage] of cases) {
        const result = runPayloadValidation(python, payloadPath);
        assert.equal(result.process.status, 1, payloadPath);
        assert.deepEqual(result.payload, { ok: false, errorCode, error: errorMessage });
        assert.doesNotMatch(result.payload.error, /河畔标题|正文|cookie|[A-Z]:\\/i);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

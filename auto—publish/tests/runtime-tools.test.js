const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { it } = require("node:test");

const { prepareRuntimeTools } = require("../scripts/prepare-runtime-tools");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function makeManifest(root, archiveBody) {
  return {
    version: 1,
    tool: "node",
    platform: "win-x64",
    nodeVersion: "v24.18.0",
    archive: {
      fileName: "node-v24.18.0-win-x64.zip",
      url: "https://example.test/node.zip",
      sha256: sha256(archiveBody),
      rootDirectory: root,
      licenseFile: "LICENSE"
    }
  };
}

it("prepares only regular node.exe and LICENSE files from a verified archive", async function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autopublish-runtime-tools-"));
  const cache = path.join(root, "cache");
  const output = path.join(root, "output");
  const archiveBody = "verified archive";
  const manifestPath = path.join(root, "manifest.json");
  const manifest = makeManifest("node-v24.18.0-win-x64", archiveBody);
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, manifest.archive.fileName), archiveBody);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  try {
    const result = await prepareRuntimeTools({
      manifest: manifestPath,
      cache,
      output,
      runner: function(_command, _args, options) {
        const extracted = path.join(options.env.AUTOPUBLISH_RUNTIME_EXTRACT, manifest.archive.rootDirectory);
        fs.mkdirSync(extracted, { recursive: true });
        fs.copyFileSync(process.execPath, path.join(extracted, "node.exe"));
        fs.writeFileSync(path.join(extracted, "LICENSE"), "Node.js license\n");
        return { status: 0 };
      }
    });
    assert.equal(result.nodeVersion, "v24.18.0");
    assert.equal(fs.lstatSync(path.join(output, "node.exe")).isFile(), true);
    assert.equal(fs.readFileSync(path.join(output, "LICENSE"), "utf8"), "Node.js license\n");
    assert.equal(JSON.parse(fs.readFileSync(path.join(output, "runtime-tools-manifest.json"), "utf8")).nodeVersion, "v24.18.0");
    assert.equal(fs.existsSync(output + ".staging"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("rejects a downloaded archive whose checksum differs from the manifest", async function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autopublish-runtime-tools-checksum-"));
  const manifestPath = path.join(root, "manifest.json");
  const manifest = makeManifest("node-v24.18.0-win-x64", "expected archive");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  try {
    await assert.rejects(
      prepareRuntimeTools({
        manifest: manifestPath,
        cache: path.join(root, "cache"),
        output: path.join(root, "output"),
        download: async function(_url, filename) { fs.writeFileSync(filename, "tampered archive"); }
      }),
      function(error) { return error.code === "RUNTIME_TOOL_CHECKSUM_MISMATCH"; }
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

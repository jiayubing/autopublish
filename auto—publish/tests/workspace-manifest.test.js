const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { buildWorkspaceManifest } = require("../scripts/workspace-manifest");

function writeFixture(root, relativePath, content) {
  const filename = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, content, "utf8");
}

test("workspace manifest reports only migration inputs as relative hashes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-manifest-"));
  const publication =
    '{"status":"published","body":"SYNTHETIC_BODY_MUST_NOT_APPEAR"}\n';
  try {
    writeFixture(
      root,
      ".autopublish/submission-records/publications/publication-1.json",
      publication,
    );
    writeFixture(
      root,
      ".autopublish/submission-batches/batch-1.json",
      '{"status":"stopped"}\n',
    );
    writeFixture(
      root,
      ".autopublish/data/submission-orders.jsonl",
      '{"orderNid":"synthetic-order"}\n',
    );
    writeFixture(
      root,
      "input/hepan/article.md.submission.json",
      '{"publicationId":"synthetic-publication"}\n',
    );
    writeFixture(root, "input/hepan/article.md", "SYNTHETIC_ARTICLE_BODY\n");
    writeFixture(
      root,
      "clients/synthetic/private-material.txt",
      "SYNTHETIC_PRIVATE_MATERIAL\n",
    );

    const manifest = buildWorkspaceManifest(root);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(manifest.categories).map(([key, value]) => [
          key,
          value.count,
        ]),
      ),
      {
        publication: 1,
        batch: 1,
        sidecar: 1,
        order: 1,
      },
    );
    assert.equal(manifest.entries.length, 4);
    assert.equal(
      manifest.entries.find(
        (entry) =>
          entry.relativePath === ".autopublish/submission-batches/batch-1.json",
      ).category,
      "batch",
    );
    assert.ok(
      manifest.entries.every((entry) => !path.isAbsolute(entry.relativePath)),
    );
    assert.ok(
      manifest.entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)),
    );
    assert.equal(
      manifest.entries.find((entry) => entry.category === "publication").sha256,
      crypto.createHash("sha256").update(publication).digest("hex"),
    );
    const serialized = JSON.stringify(manifest);
    assert.doesNotMatch(
      serialized,
      /SYNTHETIC_BODY_MUST_NOT_APPEAR|SYNTHETIC_ARTICLE_BODY|SYNTHETIC_PRIVATE_MATERIAL/,
    );
    assert.doesNotMatch(
      serialized,
      new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("workspace manifest CLI is read-only and emits no absolute workspace path", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "workspace-manifest-cli-"),
  );
  try {
    writeFixture(
      root,
      ".autopublish/submission-records/publications/publication.json",
      "{}\n",
    );
    const script = path.resolve(
      __dirname,
      "..",
      "scripts",
      "workspace-manifest.js",
    );
    const result = childProcess.spawnSync(process.execPath, [script, root], {
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(
      result.stdout,
      new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.deepEqual(JSON.parse(result.stdout).categories.publication, {
      count: 1,
      bytes: 3,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createHepanAdapter } = require("../src/platforms/hepan/adapter");

function tempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-hepan-contract-"));
}

function configuredRuntime(root) {
  const cookiePath = path.join(root, "cookie.txt");
  fs.writeFileSync(cookiePath, "fixture-cookie", "utf8");
  return { pythonPath: "fixture-python", cookiePath, categoryId: 121, vendorDir: "" };
}

describe("Hepan publish payload contract", () => {
  it("passes Markdown/TXT through a random temporary JSON payload and always removes it", async () => {
    const root = tempDirectory();
    const calls = [];
    try {
      const inputDir = path.join(root, "input");
      const tempDir = path.join(root, "tmp");
      fs.mkdirSync(inputDir, { recursive: true });
      const sourceFile = path.join(inputDir, "river.md");
      fs.writeFileSync(sourceFile, "# 河畔标题\n\n正文", "utf8");
      const bundledVendorDir = path.resolve(__dirname, "..", "resources", "hepan", "vendor-pure");
      const adapter = createHepanAdapter({
        inputDir,
        imageDir: path.join(root, "images"),
        tempDir,
        runtime: configuredRuntime(root),
        runCommand: (command, args, options) => {
          calls.push({ command, args: args.slice() });
          assert.equal(options.env.PYTHONPATH, bundledVendorDir);
          assert.equal(args[args.indexOf("--vendor-dir") + 1], bundledVendorDir);
          const payloadPath = args[args.indexOf("--payload-path") + 1];
          assert.equal(path.dirname(payloadPath), tempDir);
          assert.equal(fs.lstatSync(payloadPath).isFile(), true);
          const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
          assert.deepEqual(payload, { title: "河畔标题", contentHtml: "<p>正文</p>", sourceStem: "river" });
          return { status: 0, stdout: JSON.stringify({ ok: true, title: payload.title, url: "https://example.test/article/1" }) + "\n", stderr: "" };
        }
      });

      const article = (await adapter.parseArticleFiles([{ file: sourceFile, filename: "river.md", fileBaseName: "river" }]))[0];
      const result = await adapter.publishArticle(article);

      assert.equal(result.status, "published");
      assert.equal(calls.length, 1);
      assert.equal(calls[0].args.includes("--article"), false);
      assert.equal(fs.existsSync(tempDir) ? fs.readdirSync(tempDir).length : 0, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps DOCX on the --article path and does not create a JSON payload", async () => {
    const root = tempDirectory();
    try {
      const inputDir = path.join(root, "input");
      const tempDir = path.join(root, "tmp");
      fs.mkdirSync(inputDir, { recursive: true });
      const sourceFile = path.join(inputDir, "legacy.docx");
      fs.writeFileSync(sourceFile, "fixture docx", "utf8");
      const calls = [];
      const adapter = createHepanAdapter({
        inputDir,
        imageDir: path.join(root, "images"),
        tempDir,
        runtime: configuredRuntime(root),
        runCommand: (command, args) => {
          calls.push(args.slice());
          assert.equal(args[args.indexOf("--article") + 1], sourceFile);
          assert.equal(args.includes("--payload-path"), false);
          return { status: 0, stdout: '{"ok":true,"title":"Legacy","url":"https://example.test/article/2"}\n', stderr: "" };
        }
      });
      const article = { title: "Legacy", sourceFile, filename: "legacy.docx", sourceFormat: "docx", sourceStem: "legacy" };

      const result = await adapter.publishArticle(article);

      assert.equal(result.status, "published");
      assert.equal(calls.length, 1);
      assert.equal(fs.existsSync(tempDir), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("maps payload validation failures to stable safe outcomes and cleans after runner errors", async () => {
    const root = tempDirectory();
    try {
      const inputDir = path.join(root, "input");
      fs.mkdirSync(inputDir, { recursive: true });
      const sourceFile = path.join(inputDir, "bad.md");
      fs.writeFileSync(sourceFile, "# title\n\nbody", "utf8");
      const adapter = createHepanAdapter({
        inputDir,
        tempDir: path.join(root, "tmp"),
        runtime: configuredRuntime(root),
        runCommand: () => ({ status: 1, stdout: JSON.stringify({ ok: false, errorCode: "HEPAN_PAYLOAD_JSON_INVALID", error: "Hepan payload JSON is invalid" }), stderr: "secret body should not be logged" })
      });
      const article = (await adapter.parseArticleFiles([{ file: sourceFile, filename: "bad.md", fileBaseName: "bad" }]))[0];

      const result = await adapter.publishArticle(article);

      assert.deepEqual(result, { status: "failed", errorCode: "HEPAN_PAYLOAD_JSON_INVALID" });
      assert.equal(fs.existsSync(path.join(root, "tmp")), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps local payload runtime, remote rejection, and uncertain outcomes distinct", async () => {
    const scenarios = [
      {
        response: { status: 1, stdout: JSON.stringify({ ok: false, errorCode: "HEPAN_PAYLOAD_RUNTIME_FAILED", error: "Hepan payload runtime failed" }) },
        expected: { status: "failed", errorCode: "HEPAN_PAYLOAD_RUNTIME_FAILED" }
      },
      {
        response: { status: 1, stdout: JSON.stringify({ ok: false, errorCode: "HEPAN_REMOTE_REQUEST_FAILED", error: "Hepan remote request failed" }) },
        expected: { status: "failed", errorCode: "HEPAN_REMOTE_REQUEST_FAILED" }
      },
      {
        response: new Error("transport did not return a result"),
        expected: { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" }
      }
    ];

    for (const scenario of scenarios) {
      const root = tempDirectory();
      try {
        const inputDir = path.join(root, "input");
        const sourceFile = path.join(inputDir, "river.md");
        const cookiePath = path.join(root, "cookie.txt");
        fs.mkdirSync(inputDir, { recursive: true });
        fs.writeFileSync(sourceFile, "# 标题\n\n正文", "utf8");
        fs.writeFileSync(cookiePath, "fixture-cookie", "utf8");
        const adapter = createHepanAdapter({
          inputDir,
          tempDir: path.join(root, "tmp"),
          runtime: { pythonPath: "fixture-python", cookiePath, categoryId: 121, vendorDir: "" },
          runCommand: () => {
            if (scenario.response instanceof Error) throw scenario.response;
            return scenario.response;
          }
        });
        const article = (await adapter.parseArticleFiles([{ file: sourceFile, filename: "river.md", fileBaseName: "river" }]))[0];

        assert.deepEqual(await adapter.publishArticle(article), scenario.expected);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });
});

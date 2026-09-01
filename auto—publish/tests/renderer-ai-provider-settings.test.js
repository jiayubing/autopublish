const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const tsxLoader = pathToFileURL(
  path.join(
    root,
    "media-workbench",
    "node_modules",
    "tsx",
    "dist",
    "loader.mjs",
  ),
).href;

function validate(values) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        tsxLoader,
        "--input-type=module",
        "-e",
        `import { validateAiProviderBaseUrl } from './media-workbench/src/components/AiProviderSettings.tsx'; console.log(JSON.stringify(${JSON.stringify(values)}.map(validateAiProviderBaseUrl)));`,
      ],
      { cwd: root, encoding: "utf8" },
    ),
  );
}

describe("renderer AI provider settings", function () {
  it("accepts only the supported public provider URL forms", function () {
    assert.deepEqual(
      validate([
        "https://provider.example/v1",
        "https://ark.cn-beijing.volces.com/api/v3",
        "http://localhost:8080/v1",
        "http://provider.example/v1",
        "https://provider.example/v1/chat/completions",
        "https://user:pass@provider.example/v1",
      ]),
      [
        null,
        null,
        null,
        "Base URL 只允许 HTTPS，或 localhost 的 HTTP。",
        "请填写 Base URL，不要包含 /chat/completions。",
        "Base URL 不应包含账号、密码、查询参数或片段。",
      ],
    );
  });
});

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
        "http://192.168.1.20:8000",
        "http://[2001:db8::1]:8080/custom/api",
        "https://provider.example/",
        "ftp://provider.example/v1",
        "https://provider.example/v1?api_key=secret",
        "https://provider.example/v1#fragment",
      ]),
      [
        null,
        null,
        null,
        null,
        null,
        "Base URL 不应包含账号、密码、查询参数或片段。",
        null,
        null,
        null,
        "接口地址只支持 HTTP 或 HTTPS。",
        "Base URL 不应包含账号、密码、查询参数或片段。",
        "Base URL 不应包含账号、密码、查询参数或片段。",
      ],
    );
  });
});

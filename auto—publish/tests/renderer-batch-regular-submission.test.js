const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("batch generation terminal state exposes article selection submission", () => {
  const detail = source(
    "media-workbench/src/components/content/GenerationBatchDetail.tsx",
  );
  const batchView = source(
    "media-workbench/src/components/content/BatchGenerationView.tsx",
  );
  const dialog = source(
    "media-workbench/src/components/content/BatchRegularSubmissionDialog.tsx",
  );

  assert.match(detail, /批量投稿/);
  assert.match(batchView, /BatchRegularSubmissionDialog/);
  assert.match(dialog, /成功文章默认全选/);
  assert.match(dialog, /全选/);
  assert.match(dialog, /全不选/);
  assert.match(dialog, /AccountProfileSelector/);
  assert.match(dialog, /设置 → 平台账号/);
  assert.match(dialog, /按客户自动拆分/);
});

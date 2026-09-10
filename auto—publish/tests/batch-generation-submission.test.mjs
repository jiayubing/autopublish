import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));

test("completed generation batch keeps direct bulk submission through the shared intake session", () => {
  const detailSource = fs.readFileSync(
    path.join(
      testDir,
      "../media-workbench/src/components/content/GenerationBatchDetail.tsx",
    ),
    "utf8",
  );
  const dialogSource = fs.readFileSync(
    path.join(
      testDir,
      "../media-workbench/src/components/content/BatchRegularSubmissionDialog.tsx",
    ),
    "utf8",
  );
  const viewSource = fs.readFileSync(
    path.join(
      testDir,
      "../media-workbench/src/components/content/BatchGenerationView.tsx",
    ),
    "utf8",
  );
  const retiredCoordinatorPath = path.join(
    testDir,
    "../media-workbench/src/features/submission/batch-regular-submission-coordinator.js",
  );

  assert.match(detailSource, /onBulkSubmit/);
  assert.match(detailSource, />批量投稿</);
  assert.doesNotMatch(detailSource, /auto-publish:batch-admitted:/);
  assert.doesNotMatch(dialogSource, /auto-publish:batch-admitted:/);
  assert.doesNotMatch(detailSource, /查看本批次文章/);
  assert.doesNotMatch(detailSource, /投稿请先进入文章库/);

  assert.match(viewSource, /BatchRegularSubmissionDialog/);
  assert.match(viewSource, /onBulkSubmit=/);
  assert.match(viewSource, /setBatchSubmissionOpen\(true\)/);
  assert.match(dialogSource, /useSubmissionIntakeSession/);
  assert.match(dialogSource, /SubmissionIntakeDialog/);
  assert.equal(fs.existsSync(retiredCoordinatorPath), false);
});

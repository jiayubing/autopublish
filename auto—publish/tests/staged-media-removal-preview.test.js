const { it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createContentSubmissionService } = require("../desktop/services/content-submission-service");
const { createSubmissionBatchStore } = require("../src/content/submission-batch-store");
const { createPublicationLedger } = require("../src/publication/publication-ledger");

function stagedFixture(change) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "staged-media-removal-"));
  const filePath = path.join(root, ".autopublish", "input", "media", "article.md");
  const sidecarPath = filePath + ".submission.json";
  const markdown = "# staged\n";
  const contentHash = crypto.createHash("sha256").update(markdown).digest("hex");
  const article = {
    id: "article-1", clientId: "client-1", title: "staged", content: "staged", status: "saved", platform: "media", scenario: "fixture", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
    source: { client_material: true, doubao_answer: true, references: false, template: true },
    materialSnapshots: [{ id: "material-1", name: "fixture", extension: ".md", content: "fixture", contentHash: "fixture", source: "text" }],
    researchSnapshots: [{ questionId: "question-1", answerText: "fixture", references: [], collectionMethod: "manual" }],
    templateSnapshot: { platform: "media", id: "fixture", name: "fixture", scenario: "fixture", body: "fixture", bodyHash: "fixture" }
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, markdown);
  fs.writeFileSync(sidecarPath, JSON.stringify({ version: 2, submissionBatchId: "batch-1", clientId: "client-1", generatedArticleId: article.id, targetPlatformId: "media", contentHash }));
  createSubmissionBatchStore({ workspaceRoot: root }).save({ id: "batch-1", clientId: "client-1", status: "queued", items: [{ articleId: article.id, targetPlatformId: "media", status: "queued", contentHash, filePath, sidecarPath }] });
  if (change) change({ filePath, sidecarPath, markdown, contentHash });
  const service = createContentSubmissionService({ workspaceRoot: root, articleStore: { getArticle() { return article; } }, platforms: [{ id: "media", scanDir: "media", contentQueueImport: true }] });
  return { root, service, article, filePath, sidecarPath };
}

function preview(current) { return current.service.previewArticleRemovalImpact({ selections: [{ clientId: "client-1", articleId: "article-1" }] }); }

it("allows removal preview to cancel a complete staged media pair without remote ids", function() {
  const current = stagedFixture();
  try {
    const result = preview(current);
    assert.equal(result.canCommit, true);
    assert.equal(result.queuedToCancel.length, 1);
    assert.equal(result.queuedToCancel[0].publicationId, null);
    assert.equal(result.queuedToCancel[0].attemptId, null);
  } finally { fs.rmSync(current.root, { recursive: true, force: true }); }
});

it("blocks staged media removal on changed content, identity/target mismatch, or either missing file", function() {
  const cases = [
    ["content", function(value) { fs.writeFileSync(value.filePath, "changed"); }, "SUBMISSION_CONTENT_CHANGED"],
    ["identity", function(value) { const sidecar = JSON.parse(fs.readFileSync(value.sidecarPath)); sidecar.generatedArticleId = "other"; fs.writeFileSync(value.sidecarPath, JSON.stringify(sidecar)); }, "SUBMISSION_IDENTITY_CONFLICT"],
    ["target", function(value) { const sidecar = JSON.parse(fs.readFileSync(value.sidecarPath)); sidecar.targetPlatformId = "other"; fs.writeFileSync(value.sidecarPath, JSON.stringify(sidecar)); }, "SUBMISSION_IDENTITY_CONFLICT"],
    ["main missing", function(value) { fs.unlinkSync(value.filePath); }, "SUBMISSION_QUEUE_CHANGED"],
    ["sidecar missing", function(value) { fs.unlinkSync(value.sidecarPath); }, "SUBMISSION_IDENTITY_CONFLICT"]
  ];
  cases.forEach(function(entry) {
    const current = stagedFixture(entry[1]);
    try {
      const result = preview(current);
      assert.equal(result.canCommit, false, entry[0]);
      assert.equal(result.queuedToCancel.length, 0, entry[0]);
      assert.equal(result.blockedItems[0].reasonCode, entry[2], entry[0]);
    } finally { fs.rmSync(current.root, { recursive: true, force: true }); }
  });
});

it("blocks removal when the remote submission has started", function() {
  const current = stagedFixture();
  try {
    const ledger = createPublicationLedger({ workspaceRoot: current.root });
    const reservation = ledger.reserve({ articleKey: "generated:client-1:article-1", clientId: "client-1", articleId: "article-1", contentHash: null }, { platformId: "hepan" });
    ledger.markSubmitting(reservation.publicationId, reservation.attemptId);
    const sidecar = JSON.parse(fs.readFileSync(current.sidecarPath));
    sidecar.targetPlatformId = "hepan";
    sidecar.publicationId = reservation.publicationId;
    sidecar.attemptId = reservation.attemptId;
    fs.writeFileSync(current.sidecarPath, JSON.stringify(sidecar));
    createSubmissionBatchStore({ workspaceRoot: current.root }).save({ id: "batch-1", clientId: "client-1", status: "queued", items: [{ articleId: "article-1", targetPlatformId: "hepan", status: "queued", contentHash: sidecar.contentHash, filePath: current.filePath, sidecarPath: current.sidecarPath, publicationId: reservation.publicationId, attemptId: reservation.attemptId }] });
    const result = preview(current);
    assert.equal(result.canCommit, false);
    assert.equal(result.blockedItems.some(function(item) { return item.reasonCode === "ARTICLE_SUBMISSION_ACTIVE"; }), true);
  } finally { fs.rmSync(current.root, { recursive: true, force: true }); }
});

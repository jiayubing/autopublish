const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');

const { createPlatformWorkbenchService } = require('../desktop/services/platform-workbench-service');

const ARTICLE_COUNTS = [1, 10, 100];
const TARGET_COUNTS = [1, 3];

function createFixture(articleCount) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-invocation-baseline-'));
  const input = path.join(root, 'input');
  const sourcePlatformId = 'fixture-source';
  const sourceDirectory = path.join(input, sourcePlatformId);
  const targetPlatforms = TARGET_COUNTS.length === 0 ? [] : Array.from({ length: 3 }, (_, index) => ({
    id: `fixture-target-${index + 1}`,
    scanDir: `fixture-target-${index + 1}`,
  }));

  fs.mkdirSync(sourceDirectory, { recursive: true });
  for (let index = 0; index < articleCount; index += 1) {
    fs.writeFileSync(path.join(sourceDirectory, `article-${index + 1}.txt`), `Article ${index + 1}\n`, 'utf8');
  }

  const service = createPlatformWorkbenchService({
    rootDir: root,
    paths: { input, submissionRecords: path.join(root, 'submission-records') },
    platforms: [
      { id: sourcePlatformId, scanDir: sourcePlatformId },
      ...targetPlatforms,
    ],
  });

  return {
    root,
    service,
    sourcePlatformId,
    articles: Array.from({ length: articleCount }, (_, index) => ({
      sourcePlatformId,
      filename: `article-${index + 1}.txt`,
    })),
    targetPlatforms,
  };
}

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function measureCurrentFlow(articleCount, targetCount) {
  const fixture = createFixture(articleCount);
  const counters = {
    preparationIpc: 0,
    submissionIpc: 0,
    totalIpc: 0,
    planBuilds: 0,
    serializedBytes: 0,
    remoteCalls: 0,
  };
  const targetPlatformIds = fixture.targetPlatforms.slice(0, targetCount).map((platform) => platform.id);

  // This harness mirrors the current bridge call graph. The service remains the
  // production plan builder; the counters are explicit fixture telemetry for
  // values not exposed by the current Electron interface.
  function buildPlan(input) {
    counters.planBuilds += 1;
    return fixture.service.buildSelectedPlan(input);
  }

  function serialize(value) {
    counters.serializedBytes += byteLength(value);
    return JSON.parse(JSON.stringify(value));
  }

  function invokePreparation(article) {
    counters.preparationIpc += 1;
    counters.totalIpc += 1;
    const request = serialize({
      sourcePlatformId: article.sourcePlatformId,
      filename: article.filename,
      targetPlatformIds,
    });
    const plan = buildPlan({
      selectedArticles: [{ sourcePlatformId: request.sourcePlatformId, filename: request.filename }],
      targetPlatformIds: request.targetPlatformIds,
    });
    return serialize(plan);
  }

  function invokeSubmission(plans) {
    counters.submissionIpc += 1;
    counters.totalIpc += 1;
    const submissions = new Map();
    plans.forEach((plan) => plan.tasks.forEach((task) => {
      const key = `${task.sourcePlatformId}\u0000${task.filename}`;
      const submission = submissions.get(key) || {
        sourcePlatformId: task.sourcePlatformId,
        filename: task.filename,
        targetPlatformIds: [],
      };
      if (!submission.targetPlatformIds.includes(task.targetPlatformId)) {
        submission.targetPlatformIds.push(task.targetPlatformId);
      }
      submissions.set(key, submission);
    }));

    const request = serialize({ submissions: [...submissions.values()], autoTrash: false });
    const rebuiltTasks = request.submissions.flatMap((submission) => buildPlan({
      selectedArticles: [{
        sourcePlatformId: submission.sourcePlatformId,
        filename: submission.filename,
      }],
      targetPlatformIds: submission.targetPlatformIds,
    }).tasks);
    const response = serialize({ ok: 0, fail: 0, skipped: 0, results: [] });
    return { response, taskCount: rebuiltTasks.length };
  }

  try {
    const plans = fixture.articles.map(invokePreparation);
    const submission = invokeSubmission(plans);
    return {
      articleCount,
      targetCount,
      preparationIpc: counters.preparationIpc,
      submissionIpc: counters.submissionIpc,
      totalIpc: counters.totalIpc,
      planBuilds: counters.planBuilds,
      serializedBytes: counters.serializedBytes,
      taskCount: submission.taskCount,
      remoteCalls: counters.remoteCalls,
      responseBytes: byteLength(submission.response),
    };
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

function measureMainOwnedFlow(articleCount, targetCount) {
  const fixture = createFixture(articleCount);
  const counters = {
    preparationIpc: 0,
    submissionIpc: 0,
    totalIpc: 0,
    planBuilds: 0,
    serializedBytes: 0,
    remoteCalls: 0,
  };
  const targetPlatformIds = fixture.targetPlatforms.slice(0, targetCount).map((platform) => platform.id);

  function serialize(value) {
    counters.serializedBytes += byteLength(value);
    return JSON.parse(JSON.stringify(value));
  }

  try {
    counters.submissionIpc += 1;
    counters.totalIpc += 1;
    const request = serialize({
      submissions: fixture.articles.map((article) => ({
        sourcePlatformId: article.sourcePlatformId,
        filename: article.filename,
        targetPlatformIds,
      })),
      autoTrash: false,
    });
    counters.planBuilds += 1;
    const plan = fixture.service.buildSelectedSubmissionsPlan(request.submissions);
    const response = serialize({ ok: 0, fail: 0, skipped: 0, results: [] });
    return {
      articleCount,
      targetCount,
      preparationIpc: counters.preparationIpc,
      submissionIpc: counters.submissionIpc,
      totalIpc: counters.totalIpc,
      planBuilds: counters.planBuilds,
      serializedBytes: counters.serializedBytes,
      taskCount: plan.taskCount,
      taskOrder: plan.tasks.map((task) => `${task.filename}:${task.targetPlatformId}`),
      remoteCalls: counters.remoteCalls,
      responseBytes: byteLength(response),
    };
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

describe('platform submission invocation baseline', () => {
  it('records the current N-preparation-plus-one-submission flow without remote adapters', () => {
    const records = [];

    for (const articleCount of ARTICLE_COUNTS) {
      for (const targetCount of TARGET_COUNTS) {
        const result = measureCurrentFlow(articleCount, targetCount);
        records.push(result);

        assert.equal(result.preparationIpc, articleCount);
        assert.equal(result.submissionIpc, 1);
        assert.equal(result.totalIpc, articleCount + 1);
        assert.equal(result.planBuilds, articleCount * 2);
        assert.equal(result.taskCount, articleCount * targetCount);
        assert.equal(result.remoteCalls, 0);
        assert.ok(result.serializedBytes > result.responseBytes);
      }
    }

    console.log(`platform-submission-baseline ${JSON.stringify(records)}`);
  });

  it('records one main-owned submission IPC and one batch plan build', () => {
    const records = [];

    for (const articleCount of ARTICLE_COUNTS) {
      for (const targetCount of TARGET_COUNTS) {
        const result = measureMainOwnedFlow(articleCount, targetCount);
        records.push(result);

        assert.equal(result.preparationIpc, 0);
        assert.equal(result.submissionIpc, 1);
        assert.equal(result.totalIpc, 1);
        assert.equal(result.planBuilds, 1);
        assert.equal(result.taskCount, articleCount * targetCount);
        assert.equal(result.remoteCalls, 0);
        assert.deepEqual(result.taskOrder, Array.from({ length: articleCount }, (_, articleIndex) =>
          Array.from({ length: targetCount }, (_, targetIndex) =>
            `article-${articleIndex + 1}.txt:fixture-target-${targetIndex + 1}`
          )
        ).flat());
      }
    }

    console.log(`platform-submission-main-owned ${JSON.stringify(records)}`);
  });
});

module.exports = { measureCurrentFlow, measureMainOwnedFlow };

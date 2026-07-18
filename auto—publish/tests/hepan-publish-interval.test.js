const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createPlatformWorkbenchService } = require("../desktop/services/platform-workbench-service");

function createFixture(targets, outcomes) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hepan-publish-interval-"));
  const inputRoot = path.join(root, "input");
  const input = path.join(inputRoot, "source");
  fs.mkdirSync(input, { recursive: true });
  ["article-1.txt", "article-2.txt", "article-3.txt"].forEach((filename) => {
    fs.writeFileSync(path.join(input, filename), "Title\nBody", "utf8");
  });
  const calls = [];
  const adapters = {};
  targets.forEach((id) => {
    adapters[id] = {
      id,
      parseArticleFiles: (items) => items.map((item) => ({ title: item.filename, filename: item.filename, sourceFile: item.filePath })),
      ensureSession: () => {},
      ensureLoggedIn: async () => {},
      publishArticle: async (article) => {
        const callNumber = calls.filter((call) => call.target === id).length;
        calls.push({ target: id, at: clock });
        return outcomes && outcomes[id] && outcomes[id][callNumber] !== undefined ? outcomes[id][callNumber] : true;
      },
      closeSession: () => {}
    };
  });
  const service = createPlatformWorkbenchService({
    rootDir: root,
    paths: { input: inputRoot },
    platforms: [{ id: "source", scanDir: "source" }],
    adapters
  });
  return { root, service, calls };
}

let clock = 0;

function planFor(targets) {
  return {
    tasks: targets.map((targetPlatformId, index) => ({ sourcePlatformId: "source", filename: `article-${index + 1}.txt`, targetPlatformId }))
  };
}

describe("Hepan publish interval", () => {
  it("waits from remote completion, emits waiting state, and counts failed remote calls", async () => {
    clock = 1000;
    const fixture = createFixture(["hepan"], { hepan: [{ status: "failed", errorCode: "FIXTURE_FAILED" }, true] });
    const waits = [];
    const states = [];
    try {
      const result = await fixture.service.submitSelectedPlanSerially(planFor(["hepan", "hepan"]), {
        intervalByTargetMs: { hepan: 1000 },
        now: () => clock,
        wait: async (ms) => { waits.push(ms); clock += ms; },
        onTaskState: (state) => states.push(state),
        interactive: false
      });
      assert.equal(result.ok, 1);
      assert.equal(result.fail, 1);
      assert.deepEqual(fixture.calls.map((call) => call.at), [1000, 2000]);
      assert.deepEqual(waits, [250, 250, 250, 250]);
      assert.equal(states.some((state) => state.phase === "waiting-interval" && state.waitRemainingMs === 1000), true);
      assert.equal(states.some((state) => state.phase === "remote-finished"), true);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("only throttles consecutive work for the same target and uses elapsed time", async () => {
    clock = 0;
    const fixture = createFixture(["hepan", "toutiao"]);
    const waits = [];
    try {
      await fixture.service.submitSelectedPlanSerially(planFor(["hepan", "toutiao", "hepan"]), {
        intervalByTargetMs: { hepan: 1000 },
        now: () => clock,
        wait: async (ms) => { waits.push(ms); clock += ms; },
        interactive: false
      });
      assert.deepEqual(fixture.calls.map((call) => call.target), ["hepan", "toutiao", "hepan"]);
      assert.deepEqual(waits, [250, 250, 250, 250]);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("does not start the next remote call when stopped during an interval", async () => {
    clock = 0;
    const fixture = createFixture(["hepan"]);
    let stopped = false;
    try {
      const result = await fixture.service.submitSelectedPlanSerially(planFor(["hepan", "hepan"]), {
        intervalByTargetMs: { hepan: 1000 },
        now: () => clock,
        wait: async (ms) => { clock += ms; stopped = true; },
        shouldStop: () => stopped,
        interactive: false
      });
      assert.equal(fixture.calls.length, 1);
      assert.equal(result.skipped, 1);
      assert.equal(result.results[1].error, "STOP_REQUESTED");
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});

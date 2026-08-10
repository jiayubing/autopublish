const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

async function loadGenerationUiLogic() {
  return import(
    pathToFileURL(
      path.join(root, "media-workbench/src/content-generation-ui-logic.js"),
    )
  );
}

describe("renderer batch generation behavior", function () {
  it("preserves explicit selections across asynchronous source refreshes", async function () {
    const { preserveSelection } = await loadGenerationUiLogic();
    assert.deepEqual(
      preserveSelection([], ["client-1", "client-2"], false),
      [],
    );
    assert.deepEqual(preserveSelection([], ["client-1", "client-2"], true), []);
    assert.deepEqual(
      preserveSelection(
        ["client-1", "removed"],
        ["client-1", "client-2"],
        true,
      ),
      ["client-1"],
    );
  });

  it("uses one custom-first template projection", async function () {
    const { visibleGenerationTemplates } = await loadGenerationUiLogic();
    const catalog = {
      templates: [
        { id: "custom", platform: "xhs", source: "custom", enabled: true },
        { id: "builtin", platform: "xhs", source: "builtin", enabled: true },
      ],
    };
    assert.deepEqual(
      visibleGenerationTemplates(catalog).map((item) => item.id),
      ["custom"],
    );
    assert.deepEqual(
      visibleGenerationTemplates(catalog, true).map((item) => item.id),
      ["custom", "builtin"],
    );
  });

  it("counts the four-step Cartesian batch without accepting failed sources", async function () {
    const {
      BATCH_GENERATION_STEPS,
      countGenerationTasks,
      isExecutableSource,
      reconcileSourceSelection,
    } = await loadGenerationUiLogic();
    assert.deepEqual(BATCH_GENERATION_STEPS, [
      "clients",
      "templates",
      "sources",
      "confirm",
    ]);
    assert.equal(countGenerationTasks(10, 3), 30);

    const materials = [
      { id: "brand.md", status: "ready", content: "brand facts" },
      { id: "broken.docx", status: "error", content: "" },
    ];
    const research = [{ id: "q1", answerText: "valid answer" }];
    const source = {
      materialIds: ["brand.md", "broken.docx"],
      researchQueryIds: ["q1"],
    };
    assert.equal(isExecutableSource(materials, research, source), false);
    assert.deepEqual(reconcileSourceSelection(materials, research, source), {
      materialIds: ["brand.md"],
      researchQueryIds: ["q1"],
    });
  });

  it("keeps incomplete GEO answers out of the executable source selection", async function () {
    const { isUsableResearch, reconcileSourceSelection } =
      await loadGenerationUiLogic();
    const research = [
      { id: "valid", answerText: "有效回答" },
      { id: "incomplete", answerText: "仍在编辑", isAnswerComplete: false },
      { id: "empty", answerText: "" },
    ];
    assert.equal(isUsableResearch(research[0]), true);
    assert.equal(isUsableResearch(research[1]), false);
    assert.deepEqual(
      reconcileSourceSelection([], research, {
        materialIds: [],
        researchQueryIds: ["valid", "incomplete", "empty"],
      }).researchQueryIds,
      ["valid"],
    );
  });

  it("groups every returned template platform through the public catalog projection", async function () {
    const { groupTemplatesByPlatform, templatePlatformDisplayName } =
      await loadGenerationUiLogic();
    const catalog = {
      platforms: [{ id: "new-platform", displayName: "新平台" }],
      templates: [
        { id: "one", platform: "new-platform", enabled: true },
        { id: "two", platform: "another-platform", enabled: true },
      ],
    };
    const groups = groupTemplatesByPlatform(catalog.templates);
    assert.deepEqual(Object.keys(groups), ["new-platform", "another-platform"]);
    assert.equal(
      templatePlatformDisplayName(catalog, "new-platform"),
      "新平台",
    );
    assert.equal(
      templatePlatformDisplayName(catalog, "another-platform"),
      "another-platform",
    );
  });
});

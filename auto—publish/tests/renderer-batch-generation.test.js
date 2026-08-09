const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
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

  it("keeps invalid GEO answers unchecked and disabled at the source boundary", function () {
    const batch = fs.readFileSync(
      path.join(
        root,
        "media-workbench/src/components/content/BatchGenerationView.tsx",
      ),
      "utf8",
    );
    assert.match(
      batch,
      /selected=\{isUsableResearch\(item\) && source\.researchQueryIds\.includes\(item\.id\)\}/,
    );
    assert.match(batch, /disabled=\{!isUsableResearch\(item\)\}/);
    assert.match(
      batch,
      /onSelectedChange=\{\(selected\) => isUsableResearch\(item\) && updateSource/,
    );
  });

  it("discovers every returned template platform and counts all selected templates", function () {
    const batch = fs.readFileSync(
      path.join(
        root,
        "media-workbench/src/components/content/BatchGenerationView.tsx",
      ),
      "utf8",
    );
    assert.doesNotMatch(batch, /const PLATFORMS =/);
    assert.doesNotMatch(
      batch,
      /listContentTemplateCatalog|listContentResearch/,
    );
    assert.match(batch, /templateCatalog \|\|/);
    assert.match(batch, /catalog\.templates/);
    assert.match(batch, /Object\.entries\(templateGroups\)/);
    assert.match(batch, /selectedTemplates\.length/);
  });
});

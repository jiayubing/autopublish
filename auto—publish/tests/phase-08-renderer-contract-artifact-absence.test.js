"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const asar = require("@electron/asar");

const {
  parseArguments,
  verifyRendererContractAbsence,
} = require("../scripts/verify-renderer-contract-absence");

function write(root, relative, value) {
  const filename = path.join(root, relative);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, value, "utf8");
  return filename;
}

async function createFixture(
  archiveRendererSource = "window.desktopConsole = {};\n",
) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "renderer-contract-absence-"),
  );
  const appRoot = path.join(root, "app");
  const resourcesPath = path.join(root, "resources");
  fs.mkdirSync(resourcesPath, { recursive: true });
  write(root, "desktop/preload.js", "const api = {};\n");
  write(root, "media-workbench/src/bridge/media.ts", "export {};\n");
  write(root, "build/preload/preload.cjs", "const api = {};\n");
  write(root, "media-workbench/dist/index.js", "window.desktopConsole = {};\n");
  write(appRoot, "build/preload/preload.cjs", "const api = {};\n");
  write(appRoot, "media-workbench/dist/index.js", archiveRendererSource);
  await asar.createPackage(appRoot, path.join(resourcesPath, "app.asar"));
  return {
    root,
    resourcesPath,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

test("renderer contract absence gate scans source and generated artifacts", async () => {
  const fixture = await createFixture();
  try {
    const result = verifyRendererContractAbsence(fixture);
    assert.equal(result.status, "PASSED");
    assert.equal(result.sourceMatches, 0);
    assert.equal(result.generatedMatches, 0);
    assert.equal(result.archiveMatches, 0);

    fs.writeFileSync(
      path.join(fixture.root, "build", "preload", "preload.cjs"),
      "const api = { trashArticles: function() {} };\n",
      "utf8",
    );
    assert.throws(
      () => verifyRendererContractAbsence(fixture),
      (error) =>
        error.code === "RENDERER_CONTRACT_LEGACY_PRESENT" &&
        error.report?.status === "FAILED" &&
        error.report.generatedMatches > 0,
    );

    fs.writeFileSync(
      path.join(fixture.root, "build", "preload", "preload.cjs"),
      "const legacy = requireBridgeApi;\n",
      "utf8",
    );
    assert.throws(
      () => verifyRendererContractAbsence(fixture),
      (error) =>
        error.code === "RENDERER_CONTRACT_LEGACY_PRESENT" &&
        error.report?.generatedMatches > 0,
    );
  } finally {
    fixture.cleanup();
  }
});

test("renderer contract absence CLI requires the packaged resources path", () => {
  assert.throws(
    () => parseArguments([]),
    (error) => error.code === "RENDERER_CONTRACT_ARGUMENT_INVALID",
  );
  assert.deepEqual(
    parseArguments(["--resources", "resources", "--output", "report.json"]),
    {
      resourcesPath: path.resolve("resources"),
      output: path.resolve("report.json"),
    },
  );
});

test("renderer contract absence inventory rejects each retired surface without broad field matches", async () => {
  const sourceCases = [
    [
      "media-workbench/src/bridge/content.ts",
      'export { generateContentArticle } from "./generation";\n',
    ],
    [
      "media-workbench/src/bridge/content.ts",
      'export * as generation from "./generation";\n',
    ],
    [
      "media-workbench/src/bridge/content.ts",
      'export { generateContentArticle } from "./generation.js";\n',
    ],
    [
      "media-workbench/src/bridge/content.ts",
      'import { generateContentArticle } from "./generation"; export { generateContentArticle };\n',
    ],
    [
      "media-workbench/src/bridge/content.ts",
      'import { generateContentArticle as legacyGeneration } from "../generation"; export { legacyGeneration };\n',
    ],
    [
      "media-workbench/src/bridge/content.ts",
      'import * as generation from "../generation"; export { generation };\n',
    ],
    [
      "media-workbench/src/bridge/content.ts",
      'import * as generation from "../generation"; export const generateContentArticle = generation.generateContentArticle;\n',
    ],
    [
      "media-workbench/src/bridge/content.ts",
      'import { generateContentArticle as generate } from "../generation"; export const generateContentArticle = (...args) => generate(...args);\n',
    ],
    [
      "media-workbench/src/bridge/content/index.ts",
      'export { generateContentArticle } from "../generation";\n',
    ],
    [
      "media-workbench/src/bridge/content.ts",
      'export { trashContentArticles } from "./content-removal";\n',
    ],
    [
      "media-workbench/src/bridge/platform.ts",
      'export { previewTrashedArticleQueueResidue } from "./content";\n',
    ],
    [
      "media-workbench/src/bridge/workspace.ts",
      'export { getPlatformQueue } from "./platform";\n',
    ],
    [
      "media-workbench/src/bridge/content.ts",
      "export const getDoubaoLoginState = getDoubaoLoginStatus;\n",
    ],
    [
      "media-workbench/src/bridge/content.ts",
      "export function getDoubaoLoginState() { return getDoubaoLoginStatus(); }\n",
    ],
    [
      "media-workbench/src/bridge/content.ts",
      "export const getDoubaoLoginState = () => getDoubaoLoginStatus();\n",
    ],
    [
      "media-workbench/src/bridge/content.ts",
      "const getDoubaoLoginState = () => getDoubaoLoginStatus(); export { getDoubaoLoginState };\n",
    ],
    [
      "media-workbench/src/bridge/content-removal.ts",
      "function remove(input) { return input.legacy ? input.articles : []; }\n",
    ],
    [
      "media-workbench/src/bridge/content-removal.ts",
      "function remove(payload) { const { legacy, articles } = payload; return legacy ? articles : []; }\n",
    ],
    [
      "media-workbench/src/bridge/content-removal.ts",
      "function remove({ legacy, articles }) { return legacy ? articles : []; }\n",
    ],
    [
      "media-workbench/src/bridge/content-removal.ts",
      "function remove(payload) { return payload.legacy; }\n",
    ],
    [
      "media-workbench/src/bridge/content-removal.ts",
      "function remove({ legacy }) { return legacy; }\n",
    ],
    [
      "media-workbench/src/types/publication.ts",
      "interface ArticleTrashCommitInput { articles?: ArticleSelection[]; legacy?: boolean; }\n",
    ],
    [
      "media-workbench/src/types/publication.ts",
      "type ArticleTrashCommitInput = { articles?: Article[]; legacy?: boolean; };\n",
    ],
    [
      "media-workbench/src/types/publication.ts",
      "type LegacyRemovalFields = { articles?: Article[]; legacy?: boolean }; type ArticleTrashCommitInput = LegacyRemovalFields;\n",
    ],
  ];
  const sourceFixtures = [];
  const artifactFixture = await createFixture(
    'export * as generation from "./generation";\n',
  );
  const bundleFixture = await createFixture(
    "const local = () => {}; export { local as generateContentArticle };\n",
  );
  const crossFileFixture = await createFixture();
  const cleanFixture = await createFixture();
  try {
    for (const [relative, source] of sourceCases) {
      const fixture = await createFixture();
      sourceFixtures.push(fixture);
      write(fixture.root, relative, source);
      assert.throws(
        () => verifyRendererContractAbsence(fixture),
        (error) => error.code === "RENDERER_CONTRACT_LEGACY_PRESENT",
        relative,
      );
    }

    write(
      artifactFixture.root,
      "build/preload/preload.cjs",
      'export { generateContentArticle } from "./generation.js";\n',
    );
    assert.throws(
      () => verifyRendererContractAbsence(artifactFixture),
      (error) => error.code === "RENDERER_CONTRACT_LEGACY_PRESENT",
    );

    assert.throws(
      () => verifyRendererContractAbsence(bundleFixture),
      (error) => error.code === "RENDERER_CONTRACT_LEGACY_PRESENT",
    );

    write(
      cleanFixture.root,
      "media-workbench/src/components/ordinary-fields.ts",
      [
        "export const snapshot = { articles: [], legacy: false };",
        "function readPayload(payload) { const { articles } = payload; return articles; }",
        'export { unrelated } from "./generation";',
        'export { unrelated } from "./content-removal";',
        'export { unrelated } from "./content";',
        'export { unrelated } from "./platform";',
      ].join("\n"),
    );
    write(
      cleanFixture.root,
      "media-workbench/src/types/publication.ts",
      "type ArticleTrashCommitInput = { selections?: unknown[]; confirmed: true }; interface OtherDto { articles?: unknown[]; }",
    );
    write(
      crossFileFixture.root,
      "media-workbench/src/types/legacy-removal.ts",
      "export interface LegacyRemovalFields { legacy?: boolean; articles?: unknown[]; }",
    );
    write(
      crossFileFixture.root,
      "media-workbench/src/types/publication.ts",
      'import type { LegacyRemovalFields } from "./legacy-removal"; type ArticleTrashPreview = LegacyRemovalFields;',
    );
    assert.throws(
      () => verifyRendererContractAbsence(crossFileFixture),
      (error) => error.code === "RENDERER_CONTRACT_LEGACY_PRESENT",
    );
    write(
      cleanFixture.root,
      "media-workbench/dist/ordinary.js",
      'export { unrelated } from "./platform";\n',
    );
    const cleanResult = verifyRendererContractAbsence(cleanFixture);
    assert.equal(cleanResult.status, "PASSED");
  } finally {
    for (const fixture of sourceFixtures) fixture.cleanup();
    artifactFixture.cleanup();
    bundleFixture.cleanup();
    crossFileFixture.cleanup();
    cleanFixture.cleanup();
  }
});

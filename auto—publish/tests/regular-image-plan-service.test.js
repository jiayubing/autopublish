"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { afterEach, describe, it } = require("node:test");

const {
  createClientImageLibrary,
} = require("../src/content/client-image-library");
const {
  CLIENT_IMAGE_DIRECTORY_NAME,
  createPortableContentPaths,
} = require("../src/infrastructure/workspace/storage-paths");
const {
  createRegularImagePlanService,
} = require("../desktop/services/regular-image-plan-service");
const {
  createWorkspaceRuntimeComposition,
} = require("../desktop/composition/workspace-runtime-composition");
const {
  createWorkspaceDataInvalidation,
} = require("../desktop/workspace-data-invalidation");

const temporaryDirectories = [];

function temporaryDirectory(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(function () {
  while (temporaryDirectories.length)
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
});

function png(width, height) {
  const value = Buffer.alloc(45);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(value, 0);
  value.writeUInt32BE(13, 8);
  value.write("IHDR", 12, "ascii");
  value.writeUInt32BE(width, 16);
  value.writeUInt32BE(height, 20);
  value.writeUInt32BE(0, 33);
  value.write("IEND", 37, "ascii");
  return value;
}

function addClient(root, clientId) {
  const directory = path.join(root, "clients", clientId);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, "client.json"),
    JSON.stringify({ id: clientId, name: clientId }),
  );
  return directory;
}

function makeService(root, random) {
  const paths = createPortableContentPaths(root);
  return createRegularImagePlanService({
    imageLibrary: createClientImageLibrary({
      workspaceRoot: root,
      imageDirectoryName: paths.clientImageDirectoryName,
    }),
    random,
  });
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("regular image plan service", function () {
  it("uses the configured client image subdirectory without leaking paths", function () {
    const root = temporaryDirectory("regular-image-plan-library-");
    const firstClient = addClient(root, "client-a");
    const secondClient = addClient(root, "client-b");
    const imageDirectory = path.join(firstClient, CLIENT_IMAGE_DIRECTORY_NAME);
    fs.mkdirSync(imageDirectory);
    fs.writeFileSync(path.join(firstClient, "not-a-candidate.png"), png(1, 1));
    fs.writeFileSync(path.join(imageDirectory, "one.png"), png(2, 3));
    fs.writeFileSync(path.join(imageDirectory, "two.png"), png(4, 5));
    fs.mkdirSync(path.join(secondClient, CLIENT_IMAGE_DIRECTORY_NAME));
    fs.writeFileSync(
      path.join(secondClient, CLIENT_IMAGE_DIRECTORY_NAME, "other.png"),
      png(6, 7),
    );

    const service = makeService(root, () => 0);
    const firstPlan = service.createPlan({
      clientId: "client-a",
      imageCount: 5,
    });
    const secondPlan = service.createPlan({
      clientId: "client-a",
      imageCount: 1,
    });

    assert.equal(firstPlan.requestedCount, 5);
    assert.equal(firstPlan.selectedCount, 2);
    assert.equal(firstPlan.textOnly, false);
    assert.deepEqual(
      firstPlan.images.map((image) => image.name),
      ["one.png", "two.png"],
    );
    assert.equal(
      new Set(firstPlan.images.map((image) => image.imageId)).size,
      2,
    );
    assert.equal(secondPlan.images[0].imageId, firstPlan.images[0].imageId);
    const serialized = JSON.stringify(firstPlan);
    assert.doesNotMatch(serialized, /not-a-candidate|other\.png/);
    assert.doesNotMatch(serialized, new RegExp(escaped(root)));
    ["relativePath", "filePath", "realPath", "bytes"].forEach(function (key) {
      assert.equal(serialized.includes(key), false);
    });
  });

  it("returns text-only plans for zero images, missing directories, and damaged assets", function () {
    const root = temporaryDirectory("regular-image-plan-empty-");
    const client = addClient(root, "client-a");
    let selections = 0;
    const zeroService = createRegularImagePlanService({
      imageLibrary: {
        selectImages() {
          selections += 1;
          throw new Error("zero image plans must not scan");
        },
      },
    });
    assert.deepEqual(
      zeroService.createPlan({ clientId: "client-a", imageCount: 0 }),
      {
        requestedCount: 0,
        selectedCount: 0,
        textOnly: true,
        images: [],
        warnings: [],
      },
    );
    assert.equal(selections, 0);

    const missingPlan = makeService(root).createPlan({
      clientId: "client-a",
      imageCount: 1,
    });
    assert.deepEqual(missingPlan.images, []);
    assert.deepEqual(missingPlan.warnings, [
      { code: "REGULAR_IMAGE_PLAN_EMPTY", stage: "selection" },
    ]);

    const imageDirectory = path.join(client, CLIENT_IMAGE_DIRECTORY_NAME);
    fs.mkdirSync(imageDirectory);
    fs.writeFileSync(path.join(imageDirectory, "broken.png"), "not a png");
    const damagedPlan = makeService(root).createPlan({
      clientId: "client-a",
      imageCount: 1,
    });
    assert.deepEqual(damagedPlan.images, []);
    assert.deepEqual(damagedPlan.warnings, [
      { code: "REGULAR_IMAGE_PLAN_SCAN_DEGRADED", stage: "scan" },
      { code: "REGULAR_IMAGE_PLAN_EMPTY", stage: "selection" },
    ]);
  });

  it("degrades recoverable scans without exposing their details, but rejects invalid contracts", function () {
    const root = temporaryDirectory("regular-image-plan-failure-");
    const unsafeDetail = path.join(root, "secret-client-path");
    const service = createRegularImagePlanService({
      imageLibrary: {
        selectImages() {
          const error = new Error("failed at " + unsafeDetail + " with token");
          error.code = "EIO";
          throw error;
        },
      },
    });
    const plan = service.createPlan({ clientId: "client-a", imageCount: 1 });
    assert.deepEqual(plan, {
      requestedCount: 1,
      selectedCount: 0,
      textOnly: true,
      images: [],
      warnings: [
        { code: "REGULAR_IMAGE_PLAN_UNAVAILABLE", stage: "selection" },
      ],
    });
    assert.doesNotMatch(
      JSON.stringify(plan),
      new RegExp(escaped(unsafeDetail)),
    );
    assert.throws(
      () => service.createPlan({ clientId: "../client-a", imageCount: 1 }),
      { code: "CLIENT_IMAGE_CLIENT_INVALID" },
    );
    assert.throws(
      () => service.createPlan({ clientId: "client-a", imageCount: 6 }),
      { code: "CLIENT_IMAGE_COUNT_INVALID" },
    );
    const programmingFailure = createRegularImagePlanService({
      imageLibrary: {
        selectImages() {
          throw new Error("unexpected programming failure");
        },
      },
    });
    assert.throws(
      () =>
        programmingFailure.createPlan({ clientId: "client-a", imageCount: 1 }),
      /unexpected programming failure/,
    );
    const unsafeReference = createRegularImagePlanService({
      imageLibrary: {
        selectImages() {
          return {
            images: [
              {
                id: "client-image:QzpcXHNlY3JldC5wbmc",
                name: "secret.png",
                extension: ".png",
                mimeType: "image/png",
                width: 1,
                height: 1,
                size: 1,
              },
            ],
          };
        },
      },
    });
    assert.throws(
      () => unsafeReference.createPlan({ clientId: "client-a", imageCount: 1 }),
      { code: "REGULAR_IMAGE_PLAN_LIBRARY_RESULT_INVALID" },
    );
  });

  it("composes the unique image library with the workspace path policy directory", async function () {
    const root = temporaryDirectory("regular-image-plan-composition-");
    const workspacePath = path.join(root, "workspace");
    const imageLibraryPath =
      require.resolve("../src/content/client-image-library");
    const originalModule = require.cache[imageLibraryPath];
    const capturedOptions = [];
    require.cache[imageLibraryPath] = {
      id: imageLibraryPath,
      filename: imageLibraryPath,
      loaded: true,
      exports: {
        createClientImageLibrary(options) {
          capturedOptions.push(options);
          return {
            selectImages() {
              return { images: [], diagnostics: [] };
            },
          };
        },
      },
    };
    let composition;
    try {
      composition = await createWorkspaceRuntimeComposition({
        options: {
          appRoot: path.resolve(__dirname, ".."),
          userDataPath: path.join(root, "user-data"),
          sessionDataPath: path.join(root, "session-data"),
          safeStorage: {
            isEncryptionAvailable() {
              return false;
            },
          },
        },
        sendToRenderer() {},
        bootstrapState: { workspacePath },
        invalidation: createWorkspaceDataInvalidation({}),
      });
      assert.equal(capturedOptions.length, 1);
      assert.equal(
        capturedOptions[0].imageDirectoryName,
        CLIENT_IMAGE_DIRECTORY_NAME,
      );
      assert.equal(capturedOptions[0].workspaceRoot, workspacePath);
      assert.equal(
        typeof composition.modules.regularImagePlanService.createPlan,
        "function",
      );
    } finally {
      if (composition) await composition.dispose();
      if (originalModule) require.cache[imageLibraryPath] = originalModule;
      else delete require.cache[imageLibraryPath];
    }
  });
});

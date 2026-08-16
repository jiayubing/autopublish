"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { parseImagePlanV1 } = require("../src/content/image-plan-v1");

function image(overrides) {
  return {
    imageId: "client-image:cGhvdG8ucG5n",
    name: "photo.png",
    extension: ".png",
    mimeType: "image/png",
    width: 8,
    height: 9,
    size: 45,
    ...(overrides || {}),
  };
}

function plan(overrides) {
  return {
    version: 1,
    requestedCount: 1,
    selectedCount: 1,
    textOnly: false,
    images: [image()],
    warnings: [],
    ...(overrides || {}),
  };
}

test("ImagePlanV1 parses one exact immutable plan", () => {
  const original = plan();
  const parsed = parseImagePlanV1(original);
  assert.deepEqual(parsed, plan());
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.images), true);
  assert.equal(Object.isFrozen(parsed.images[0]), true);
  assert.notStrictEqual(parsed.images[0], original.images[0]);
});

test("ImagePlanV1 rejects unknown fields, inconsistent counts, unsafe assets, and warnings", () => {
  const invalid = [
    plan({ version: 2 }),
    plan({ extra: true }),
    plan({ selectedCount: 0 }),
    plan({ textOnly: true }),
    plan({ requestedCount: 6 }),
    plan({ images: [image(), image()] }),
    plan({
      requestedCount: 2,
      selectedCount: 2,
      images: [image(), image()],
    }),
    plan({ images: [image({ imageId: "C:\\secret.png" })] }),
    plan({ images: [image({ name: "../photo.png" })] }),
    plan({ images: [image({ mimeType: "image/jpeg" })] }),
    plan({ warnings: [{ code: "UNKNOWN", stage: "scan" }] }),
    plan({
      warnings: [
        {
          code: "REGULAR_IMAGE_PLAN_SCAN_DEGRADED",
          stage: "selection",
        },
      ],
    }),
  ];
  invalid.forEach((value) => {
    assert.throws(() => parseImagePlanV1(value), {
      code: "IMAGE_PLAN_V1_INVALID",
    });
  });
});

test("ImagePlanV1 accepts the closed text-only and safe-warning variants", () => {
  assert.deepEqual(
    parseImagePlanV1({
      version: 1,
      requestedCount: 0,
      selectedCount: 0,
      textOnly: true,
      images: [],
      warnings: [],
    }),
    {
      version: 1,
      requestedCount: 0,
      selectedCount: 0,
      textOnly: true,
      images: [],
      warnings: [],
    },
  );
  assert.deepEqual(
    parseImagePlanV1({
      version: 1,
      requestedCount: 1,
      selectedCount: 0,
      textOnly: true,
      images: [],
      warnings: [
        { code: "REGULAR_IMAGE_PLAN_SCAN_DEGRADED", stage: "scan" },
        { code: "REGULAR_IMAGE_PLAN_EMPTY", stage: "selection" },
      ],
    }).warnings,
    [
      { code: "REGULAR_IMAGE_PLAN_SCAN_DEGRADED", stage: "scan" },
      { code: "REGULAR_IMAGE_PLAN_EMPTY", stage: "selection" },
    ],
  );
});

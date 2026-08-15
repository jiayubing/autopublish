"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const util = require("node:util");

const domain = require("../src/domain");
const {
  prepareLiejuImageMultipart,
} = require("../src/platforms/lieju/image-multipart-preparation");

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

function imageId(filename) {
  return "client-image:" + Buffer.from(filename, "utf8").toString("base64url");
}

function plan(names, requestedCount) {
  const images = names.map((name, index) =>
    Object.freeze({
      imageId: imageId(name),
      name,
      extension: ".png",
      mimeType: "image/png",
      width: index + 1,
      height: index + 1,
      size: 45,
    }),
  );
  return Object.freeze({
    requestedCount:
      requestedCount === undefined ? images.length : requestedCount,
    selectedCount: images.length,
    textOnly: images.length === 0,
    images: Object.freeze(images),
    warnings: Object.freeze([]),
  });
}

function evidence() {
  return domain.createTextOnlyPreparedSubmissionEvidenceV1({
    regularPublicationAttemptId: "attempt-lieju-image-multipart",
    articleIdentityV1: {
      version: 1,
      clientId: "client-lieju-image",
      articleId: "article-lieju-image",
    },
    targetIdentityV1: {
      version: 1,
      kind: "platform",
      platformId: "lieju",
      accountProfileId: "account-lieju-image",
    },
    publicationSnapshot: { title: "合成标题", body: "合成正文" },
  });
}

function form(slotCount) {
  const controls = [
    { name: "fid", type: "hidden", value: "opaque-server-value" },
    { name: "postdb[title]", type: "text", value: "旧标题" },
    { name: "postdb[content]", type: "textarea", value: "旧正文" },
    { name: "photodb[1]", type: "hidden", value: "" },
    { name: "piddb[1]", type: "hidden", value: "" },
    { name: "ftype[1]", type: "hidden", value: "" },
  ];
  for (let index = 1; index <= slotCount; index += 1)
    controls.push({ name: `local_file${index}`, type: "file", value: "" });
  return Object.freeze({
    controls: Object.freeze(controls.map(Object.freeze)),
  });
}

function resolver(root, failures) {
  const value = failures || new Map();
  return Object.freeze({
    resolveImage(_clientId, id) {
      const error = value.get(id);
      if (error) throw error;
      const relative = Buffer.from(
        id.slice("client-image:".length),
        "base64url",
      ).toString("utf8");
      return { filePath: path.join(root, relative) };
    },
  });
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

test("Lieju multipart preparation freezes the first four deliverable images in continuous real slots", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lieju-multipart-"));
  const names = ["one.png", "two.png", "three.png", "four.png", "five.png"];
  try {
    const bytes = names.map((name, index) => {
      const content = png(index + 1, index + 2);
      fs.writeFileSync(path.join(root, name), content);
      return content;
    });
    const prepared = prepareLiejuImageMultipart({
      clientId: "client-lieju-image",
      imagePlan: plan(names),
      form: form(4),
      preparedSubmissionEvidenceV1: evidence(),
      imageResolver: resolver(root),
      formValueOverrides: {
        "postdb[title]": "合成标题",
        "postdb[content]": "合成正文",
      },
    });

    assert.deepEqual(prepared.preparedSubmissionEvidenceV1.images, [
      { assetFingerprint: sha256(bytes[0]), layoutSlot: 0 },
      { assetFingerprint: sha256(bytes[1]), layoutSlot: 1 },
      { assetFingerprint: sha256(bytes[2]), layoutSlot: 2 },
      { assetFingerprint: sha256(bytes[3]), layoutSlot: 3 },
    ]);
    assert.equal(
      prepared.preparedSubmissionEvidenceV1.deliveryMode,
      "with_images",
    );
    assert.equal(prepared.preparedSubmissionEvidenceV1.decisionKind, "initial");
    assert.deepEqual(prepared.warnings, [
      { code: "LIEJU_IMAGE_SLOT_CAPACITY_REACHED", stage: "delivery" },
    ]);
    assert.equal(
      JSON.stringify(prepared.preparedSubmissionEvidenceV1).includes(root),
      false,
    );
    assert.equal(JSON.stringify(prepared.warnings).includes(root), false);
    assert.equal(util.inspect(prepared.multipart), "[LiejuMultipartPlan]");
    assert.throws(() => JSON.stringify(prepared.multipart), {
      code: "LIEJU_MULTIPART_SERIALIZATION_FORBIDDEN",
    });

    const consumed = prepared.multipart.consume();
    const bodyBytes = consumed.body.getBuffer();
    const body = bodyBytes.toString("latin1");
    assert.match(body, /name="fid"\r\n\r\nopaque-server-value/);
    assert.equal(
      bodyBytes.includes(Buffer.from('name="postdb[title]"\r\n\r\n合成标题')),
      true,
    );
    assert.equal(
      bodyBytes.includes(Buffer.from('name="postdb[content]"\r\n\r\n合成正文')),
      true,
    );
    for (let index = 1; index <= 4; index += 1) {
      assert.match(body, new RegExp(`name="local_file${index}"`));
      assert.match(body, new RegExp(`filename="${names[index - 1]}"`));
    }
    assert.doesNotMatch(body, /local_file5|five\.png/);
    assert.match(
      consumed.headers["content-type"],
      /^multipart\/form-data; boundary=/,
    );
    assert.throws(() => prepared.multipart.consume(), {
      code: "LIEJU_MULTIPART_PLAN_CONSUMED",
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Lieju multipart image failures are best-effort and can safely degrade to text only", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "lieju-multipart-failure-"),
  );
  const names = ["missing.png", "outside.png", "directory.png", "large.png"];
  try {
    fs.mkdirSync(path.join(root, "directory.png"));
    fs.writeFileSync(
      path.join(root, "large.png"),
      Buffer.concat([png(1, 1), Buffer.alloc(1024 * 1024)]),
    );
    const failures = new Map();
    const outside = new Error("unsafe path must not escape");
    outside.code = "CLIENT_IMAGE_PATH_OUT_OF_BOUNDS";
    failures.set(imageId("outside.png"), outside);
    const prepared = prepareLiejuImageMultipart({
      clientId: "client-lieju-image",
      imagePlan: plan(names),
      form: form(4),
      preparedSubmissionEvidenceV1: evidence(),
      imageResolver: resolver(root, failures),
    });

    assert.deepEqual(
      {
        deliveryMode: prepared.preparedSubmissionEvidenceV1.deliveryMode,
        images: prepared.preparedSubmissionEvidenceV1.images,
        decisionKind: prepared.preparedSubmissionEvidenceV1.decisionKind,
      },
      { deliveryMode: "text_only", images: [], decisionKind: "initial" },
    );
    assert.deepEqual(prepared.warnings, [
      { code: "LIEJU_IMAGE_DELIVERY_FAILED", stage: "delivery" },
      { code: "LIEJU_IMAGE_DELIVERY_FAILED", stage: "delivery" },
      { code: "LIEJU_IMAGE_DELIVERY_FAILED", stage: "delivery" },
      { code: "LIEJU_IMAGE_DELIVERY_FAILED", stage: "delivery" },
    ]);
    assert.doesNotMatch(
      JSON.stringify({
        evidence: prepared.preparedSubmissionEvidenceV1,
        warnings: prepared.warnings,
      }),
      new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Lieju multipart preparation handles zero images, partial delivery, and freezes image bytes before consumption", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "lieju-multipart-freeze-"),
  );
  try {
    const original = png(7, 8);
    const replacement = png(9, 10);
    fs.writeFileSync(path.join(root, "good.png"), original);
    const partialPlan = plan(["bad.png", "good.png"]);
    const prepared = prepareLiejuImageMultipart({
      clientId: "client-lieju-image",
      imagePlan: partialPlan,
      form: form(4),
      preparedSubmissionEvidenceV1: evidence(),
      imageResolver: resolver(root),
    });
    assert.deepEqual(prepared.preparedSubmissionEvidenceV1.images, [
      { assetFingerprint: sha256(original), layoutSlot: 0 },
    ]);
    assert.deepEqual(prepared.warnings, [
      { code: "LIEJU_IMAGE_DELIVERY_FAILED", stage: "delivery" },
    ]);

    fs.writeFileSync(path.join(root, "good.png"), replacement);
    const body = prepared.multipart.consume().body.getBuffer();
    assert.equal(body.includes(original), true);
    assert.equal(body.includes(replacement), false);

    const textOnly = prepareLiejuImageMultipart({
      clientId: "client-lieju-image",
      imagePlan: plan([]),
      form: form(4),
      preparedSubmissionEvidenceV1: evidence(),
      imageResolver: resolver(root),
    });
    assert.deepEqual(
      {
        deliveryMode: textOnly.preparedSubmissionEvidenceV1.deliveryMode,
        images: textOnly.preparedSubmissionEvidenceV1.images,
        decisionKind: textOnly.preparedSubmissionEvidenceV1.decisionKind,
      },
      { deliveryMode: "text_only", images: [], decisionKind: "initial" },
    );
    assert.deepEqual(textOnly.warnings, []);

    const insufficient = prepareLiejuImageMultipart({
      clientId: "client-lieju-image",
      imagePlan: plan(["good.png"], 4),
      form: form(4),
      preparedSubmissionEvidenceV1: evidence(),
      imageResolver: resolver(root),
    });
    assert.deepEqual(
      {
        deliveryMode: insufficient.preparedSubmissionEvidenceV1.deliveryMode,
        images: insufficient.preparedSubmissionEvidenceV1.images,
        decisionKind: insufficient.preparedSubmissionEvidenceV1.decisionKind,
      },
      {
        deliveryMode: "with_images",
        images: [{ assetFingerprint: sha256(replacement), layoutSlot: 0 }],
        decisionKind: "initial",
      },
    );

    const controls = Object.freeze([
      ...form(0).controls,
      Object.freeze({
        name: "postdb[title]",
        type: "hidden",
        value: "opaque-title-state",
      }),
    ]);
    const hiddenPreserved = prepareLiejuImageMultipart({
      clientId: "client-lieju-image",
      imagePlan: plan([]),
      form: Object.freeze({ controls }),
      preparedSubmissionEvidenceV1: evidence(),
      imageResolver: resolver(root),
      formValueOverrides: { "postdb[title]": "替换标题" },
    });
    const hiddenBody = hiddenPreserved.multipart.consume().body.getBuffer();
    assert.equal(hiddenBody.includes(Buffer.from("opaque-title-state")), true);
    assert.equal(hiddenBody.includes(Buffer.from("替换标题")), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

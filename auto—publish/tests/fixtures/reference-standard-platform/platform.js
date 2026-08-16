"use strict";

const domain = require("../../../src/domain");
const { parseImagePlanV1 } = require("../../../src/content/image-plan-v1");
const { createReferenceStandardPlatformDefinition } = require("./definition");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createReferenceStandardPlatformModule(options) {
  const definition = createReferenceStandardPlatformDefinition(options);
  return Object.freeze({
    definition,
    createPlatform(runtimeContext) {
      const runtime = runtimeContext || {};
      const state = runtime.referenceStandardPlatformState;
      if (!state || typeof state !== "object")
        throw fail("REFERENCE_STANDARD_PLATFORM_STATE_REQUIRED");

      return {
        regularSubmission: {
          async preparePlatformSubmission(claim, rawImagePlan) {
            const imagePlan = parseImagePlanV1(rawImagePlan);
            const articleId = claim.articleIdentityV1.articleId;
            state.preparations.push({ articleId, imagePlan });
            const baseEvidence =
              domain.createTextOnlyPreparedSubmissionEvidenceV1(claim);
            const deliveredImages = [];
            for (const image of imagePlan.images) {
              if (
                !runtime.imageAssetReader ||
                typeof runtime.imageAssetReader.read !== "function"
              )
                throw fail("REFERENCE_STANDARD_IMAGE_READER_REQUIRED");
              const asset = await runtime.imageAssetReader.read({
                clientId: claim.articleIdentityV1.clientId,
                imageId: image.imageId,
              });
              deliveredImages.push({
                assetFingerprint: asset.assetFingerprint,
                layoutSlot: deliveredImages.length,
              });
            }
            const evidence = domain.parsePreparedSubmissionEvidenceV1({
              ...baseEvidence,
              deliveryMode: deliveredImages.length
                ? "with_images"
                : "text_only",
              images: deliveredImages,
            });
            state.preparedEvidence.push(evidence);
            return domain.createPreparedSubmission({
              preparedSubmissionEvidenceV1: evidence,
              async submitPreparedPublication() {
                state.submissions.push(articleId);
                const configured = state.outcomes.get(articleId);
                if (configured === "uncertain")
                  throw fail("REFERENCE_STANDARD_SYNTHETIC_UNCERTAIN");
                return (
                  configured || {
                    status: "accepted",
                    remoteId: `reference-${articleId}`,
                  }
                );
              },
            });
          },
        },
        loginSession: {
          async open() {
            state.sessionCalls.push("open");
          },
          async check() {
            state.sessionCalls.push("check");
            return true;
          },
          async save() {
            state.sessionCalls.push("save");
          },
          async close() {
            state.sessionCalls.push("close");
          },
        },
        accountInspection: {
          async prepare(task) {
            state.accountPreparationCalls.push(task);
          },
          async inspect() {
            state.accountInspectionCalls += 1;
            return {
              verified: true,
              displayName: "合成远端账号",
              remoteAccountId: "reference-account-1",
            };
          },
        },
      };
    },
  });
}

module.exports = Object.freeze({ createReferenceStandardPlatformModule });

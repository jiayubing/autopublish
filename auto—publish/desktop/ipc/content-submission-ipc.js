const { wrap } = require("../services/ipc-response");
const { projectSubmissionResult } = require("./contracts/submission-contracts");

function bind(service, name) {
  if (!service || typeof service[name] !== "function") {
    const error = new Error("Submission operation is unavailable: " + name);
    error.code = "CONTENT_SUBMISSION_OPERATION_UNAVAILABLE";
    return function () {
      throw error;
    };
  }
  return service[name].bind(service);
}

function createSubmissionInterface(service, regularQueueService) {
  const regular = regularQueueService || service;
  return Object.freeze({
    preparation: {
      previewBatch: bind(service, "previewBatch"),
      createBatch: bind(service, "createBatch"),
      listPlatforms: bind(service, "listPlatforms"),
    },
    batch: {
      buildActionPlan: bind(service, "buildSubmissionActionPlan"),
      previewCancel: bind(service, "previewCancelBatch"),
      cancel: bind(service, "cancelBatch"),
      get: bind(service, "getBatch"),
      list: bind(service, "listBatches"),
      reconcile: bind(service, "reconcileBatch"),
    },
    cleanup: {
      previewFailed: bind(service, "previewCleanupFailedItems"),
      cleanupFailed: bind(service, "cleanupFailedItems"),
      previewResidue: bind(service, "previewTrashedArticleQueueResidue"),
      cleanupResidue: bind(service, "cleanupTrashedArticleQueueResidue"),
    },
    retry: {
      previewFailedPublication: bind(service, "previewRetryFailedPublication"),
      failedPublication: bind(service, "retryFailedPublication"),
    },
    regularQueue: {
      previewAdmission: bind(regular, "previewRegularQueueAdmission"),
      admit: bind(regular, "admitRegularQueueItems"),
      removePending: bind(regular, "removePendingQueueItems"),
    },
  });
}

function paidMediaPreflightInput(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some(function (key) {
      return ["articleRefs", "mediaResourceId"].indexOf(key) === -1;
    }) ||
    !Array.isArray(input.articleRefs) ||
    !input.articleRefs.length ||
    typeof input.mediaResourceId !== "string" ||
    !input.mediaResourceId.trim()
  ) {
    const error = new Error("Invalid paid-media preflight input");
    error.code = "PAID_MEDIA_RESOURCE_REQUIRED";
    throw error;
  }
  return input;
}

function paidMediaConfirmationInput(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some(function (key) {
      return ["confirmationToken", "confirmed"].indexOf(key) === -1;
    }) ||
    input.confirmed !== true ||
    typeof input.confirmationToken !== "string" ||
    !input.confirmationToken.trim()
  ) {
    const error = new Error("Paid-media confirmation is required");
    error.code =
      input && input.confirmed !== true
        ? "PAID_MEDIA_CONFIRMATION_REQUIRED"
        : "PAID_MEDIA_CONFIRMATION_STALE";
    throw error;
  }
  return input;
}

function paidMediaBatchInput(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some(function (key) {
      return key !== "batchId";
    }) ||
    typeof input.batchId !== "string" ||
    !input.batchId.trim()
  ) {
    const error = new Error("Invalid paid-media batch input");
    error.code = "PAID_EXECUTION_BATCH_INVALID";
    throw error;
  }
  return input;
}

function regularAdmissionInput(input, confirmed) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some(function (key) {
      return (
        [
          "articleRefs",
          "platformId",
          "accountProfileId",
          "queueConfig",
          "confirmed",
        ].indexOf(key) === -1
      );
    })
  ) {
    const error = new Error("Invalid regular queue admission input");
    error.code = "REGULAR_QUEUE_INPUT_INVALID";
    throw error;
  }
  if (confirmed && input.confirmed !== true) {
    const error = new Error("Regular queue confirmation is required");
    error.code = "REGULAR_QUEUE_CONFIRMATION_REQUIRED";
    throw error;
  }
  return input;
}

function regularRemovalInput(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some(function (key) {
      return ["items", "confirmed", "operationId"].indexOf(key) === -1;
    }) ||
    input.confirmed !== true
  ) {
    const error = new Error("Regular queue removal confirmation is required");
    error.code =
      input && input.confirmed !== true
        ? "REGULAR_QUEUE_CONFIRMATION_REQUIRED"
        : "REGULAR_QUEUE_INPUT_INVALID";
    throw error;
  }
  return input;
}

function registerContentSubmissionIpc(deps) {
  const service = deps.contentSubmissionService;
  if (!service) {
    const error = new Error("Content submission service is required");
    error.code = "CONTENT_SUBMISSION_SERVICE_REQUIRED";
    throw error;
  }
  const workflow =
    deps.submissionWorkflow ||
    createSubmissionInterface(service, deps.regularQueueApplication);
  const paidMedia = deps.paidMediaPreflightService || deps.paidMediaPreflight;
  const paidExecution = deps.paidMediaExecutionService;
  function batchInput(input, confirmed) {
    if (
      !input ||
      typeof input !== "object" ||
      Object.keys(input).some(function (key) {
        return (
          [
            "clientId",
            "articleIds",
            "targetPlatformIds",
            "accountProfiles",
            "confirmed",
            "batchId",
            "planId",
          ].indexOf(key) === -1
        );
      })
    ) {
      const e = new Error("Invalid content submission batch input");
      e.code = "CONTENT_SUBMISSION_BATCH_INPUT_INVALID";
      throw e;
    }
    if (confirmed && input.confirmed !== true) {
      const e = new Error("Batch confirmation is required");
      e.code = "CONTENT_SUBMISSION_CONFIRMATION_REQUIRED";
      throw e;
    }
    if (
      Array.isArray(input.targetPlatformIds) &&
      input.targetPlatformIds.length
    ) {
      if (
        !input.accountProfiles ||
        typeof input.accountProfiles !== "object" ||
        Array.isArray(input.accountProfiles) ||
        Object.keys(input.accountProfiles).length !==
          input.targetPlatformIds.length ||
        input.targetPlatformIds.some(function (platformId) {
          return (
            typeof input.accountProfiles[platformId] !== "string" ||
            !input.accountProfiles[platformId].trim()
          );
        })
      ) {
        const e = new Error("A platform account profile is required");
        e.code = "ACCOUNT_PROFILE_REQUIRED";
        throw e;
      }
    }
    return input;
  }
  deps.ipcMain.handle(
    "content:preview-submission-batch",
    function (event, input) {
      return wrap(function () {
        return projectSubmissionResult(
          "content:preview-submission-batch",
          workflow.preparation.previewBatch(batchInput(input, false)),
        );
      });
    },
  );
  deps.ipcMain.handle("content:list-submission-platforms", function () {
    return wrap(function () {
      return projectSubmissionResult(
        "content:list-submission-platforms",
        workflow.preparation.listPlatforms(),
      );
    });
  });
  deps.ipcMain.handle(
    "content:create-submission-batch",
    function (event, input) {
      return wrap(function () {
        return projectSubmissionResult(
          "content:create-submission-batch",
          workflow.preparation.createBatch(batchInput(input, true)),
        );
      });
    },
  );
  deps.ipcMain.handle(
    "content:cancel-submission-batch",
    function (event, input) {
      return wrap(function () {
        return projectSubmissionResult(
          "content:cancel-submission-batch",
          workflow.batch.cancel(batchInput(input, true)),
        );
      });
    },
  );
  deps.ipcMain.handle(
    "content:preview-cleanup-failed-submission-items",
    function (event, input) {
      return wrap(function () {
        return projectSubmissionResult(
          "content:preview-cleanup-failed-submission-items",
          workflow.cleanup.previewFailed(batchInput(input, false)),
        );
      });
    },
  );
  deps.ipcMain.handle(
    "content:cleanup-failed-submission-items",
    function (event, input) {
      return wrap(function () {
        return projectSubmissionResult(
          "content:cleanup-failed-submission-items",
          workflow.cleanup.cleanupFailed(batchInput(input, true)),
        );
      });
    },
  );
  deps.ipcMain.handle(
    "content:preview-trashed-article-queue-residue",
    function () {
      return wrap(function () {
        return projectSubmissionResult(
          "content:preview-trashed-article-queue-residue",
          workflow.cleanup.previewResidue(),
        );
      });
    },
  );
  deps.ipcMain.handle(
    "content:cleanup-trashed-article-queue-residue",
    function (event, input) {
      return wrap(function () {
        return projectSubmissionResult(
          "content:cleanup-trashed-article-queue-residue",
          workflow.cleanup.cleanupResidue(input),
        );
      });
    },
  );
  deps.ipcMain.handle(
    "content:preview-regular-queue-admission",
    function (event, input) {
      return wrap(function () {
        return projectSubmissionResult(
          "content:preview-regular-queue-admission",
          workflow.regularQueue.previewAdmission(
            regularAdmissionInput(input, false),
          ),
        );
      });
    },
  );
  deps.ipcMain.handle(
    "content:admit-regular-queue-items",
    function (event, input) {
      return wrap(function () {
        return projectSubmissionResult(
          "content:admit-regular-queue-items",
          workflow.regularQueue.admit(regularAdmissionInput(input, true)),
        );
      });
    },
  );
  deps.ipcMain.handle(
    "content:remove-pending-queue-items",
    function (event, input) {
      return wrap(function () {
        return projectSubmissionResult(
          "content:remove-pending-queue-items",
          workflow.regularQueue.removePending(regularRemovalInput(input)),
        );
      });
    },
  );
  if (paidMedia) {
    deps.ipcMain.handle(
      "content:preview-paid-media-preflight",
      function (event, input) {
        return wrap(async function () {
          if (typeof paidMedia.preflight !== "function") {
            const error = new Error("Paid-media preflight is unavailable");
            error.code = "PAID_MEDIA_PREFLIGHT_UNAVAILABLE";
            throw error;
          }
          const result = await paidMedia.preflight(
            paidMediaPreflightInput(input),
          );
          return projectSubmissionResult(
            "content:preview-paid-media-preflight",
            result,
          );
        });
      },
    );
    deps.ipcMain.handle(
      "content:confirm-paid-media-batch",
      function (event, input) {
        return wrap(async function () {
          if (typeof paidMedia.confirm !== "function") {
            const error = new Error("Paid-media confirmation is unavailable");
            error.code = "PAID_MEDIA_PREFLIGHT_UNAVAILABLE";
            throw error;
          }
          const result = await paidMedia.confirm(
            paidMediaConfirmationInput(input),
          );
          return projectSubmissionResult(
            "content:confirm-paid-media-batch",
            result,
          );
        });
      },
    );
  }
  if (paidExecution) {
    deps.ipcMain.handle("content:list-paid-media-batches", function () {
      return wrap(async function () {
        if (typeof paidExecution.list !== "function") {
          const error = new Error("Paid-media execution query is unavailable");
          error.code = "PAID_MEDIA_EXECUTION_UNAVAILABLE";
          throw error;
        }
        const result = await paidExecution.list();
        return projectSubmissionResult(
          "content:list-paid-media-batches",
          result,
        );
      });
    });
    deps.ipcMain.handle(
      "content:start-paid-media-batch",
      function (event, input) {
        return wrap(async function () {
          if (typeof paidExecution.start !== "function") {
            const error = new Error("Paid-media execution is unavailable");
            error.code = "PAID_MEDIA_EXECUTION_UNAVAILABLE";
            throw error;
          }
          const result = await paidExecution.start(paidMediaBatchInput(input));
          return projectSubmissionResult(
            "content:start-paid-media-batch",
            result,
          );
        });
      },
    );
    deps.ipcMain.handle(
      "content:pause-paid-media-batch",
      function (event, input) {
        return wrap(async function () {
          if (typeof paidExecution.pause !== "function") {
            const error = new Error("Paid-media execution is unavailable");
            error.code = "PAID_MEDIA_EXECUTION_UNAVAILABLE";
            throw error;
          }
          const result = await paidExecution.pause(paidMediaBatchInput(input));
          return projectSubmissionResult(
            "content:pause-paid-media-batch",
            result,
          );
        });
      },
    );
  }
}
module.exports = { registerContentSubmissionIpc };

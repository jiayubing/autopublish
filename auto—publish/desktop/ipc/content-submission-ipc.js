const { wrap } = require("../services/ipc-response");
const { projectSubmissionBatchResult } = require("./contracts/submission-batch-contracts");
const {
  projectSubmissionResiduePreview,
  projectSubmissionResidueResult,
} = require("./contracts/submission-maintenance-contracts");
const {
  projectRegularAdmission,
  projectRegularRemovalResult,
} = require("./contracts/submission-regular-contracts");
const {
  projectPaidPreflight,
  projectPaidAdmission,
  projectPaidMediaBatchList,
  projectPaidExecutionResult,
} = require("./contracts/submission-paid-media-contracts");

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

function createSubmissionInterface(service, regularQueueService, regularQueueGroups) {
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
    regularQueueGroups: {
      list: bind(regular, "listRegularQueueGroups"),
      start: bind(regularQueueGroups, "startGroup"),
      pause: bind(regularQueueGroups, "pauseGroup"),
      startAll: bind(regularQueueGroups, "startAll"),
      pauseAll: bind(regularQueueGroups, "pauseAll"),
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
    createSubmissionInterface(
      service,
      deps.regularQueueApplication,
      deps.regularQueueGroupOrchestrator,
    );
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
    return input;
  }
  deps.ipcMain.handle(
    "content:cancel-submission-batch",
    function (event, input) {
      return wrap(function () {
        return projectSubmissionBatchResult(
          workflow.batch.cancel(batchInput(input, true)),
        );
      });
    },
  );
  deps.ipcMain.handle(
    "content:preview-trashed-article-queue-residue",
    function () {
      return wrap(function () {
        return projectSubmissionResiduePreview(workflow.cleanup.previewResidue());
      });
    },
  );
  deps.ipcMain.handle(
    "content:cleanup-trashed-article-queue-residue",
    function (event, input) {
      return wrap(function () {
        return projectSubmissionResidueResult(
          workflow.cleanup.cleanupResidue(input),
        );
      });
    },
  );
  deps.ipcMain.handle(
    "content:preview-regular-queue-admission",
    function (event, input) {
      return wrap(function () {
        return projectRegularAdmission(
          workflow.regularQueue.previewAdmission(
            regularAdmissionInput(input, false),
          ),
          "preview",
        );
      });
    },
  );
  deps.ipcMain.handle(
    "content:admit-regular-queue-items",
    function (event, input) {
      return wrap(function () {
        return projectRegularAdmission(
          workflow.regularQueue.admit(regularAdmissionInput(input, true)),
          "admit",
        );
      });
    },
  );
  deps.ipcMain.handle(
    "content:remove-pending-queue-items",
    function (event, input) {
      return wrap(function () {
        return projectRegularRemovalResult(
          workflow.regularQueue.removePending(regularRemovalInput(input)),
        );
      });
    },
  );
  deps.ipcMain.handle("content:list-regular-queue-groups", function () {
    return wrap(function () {
      return { items: workflow.regularQueueGroups.list() };
    });
  });
  deps.ipcMain.handle("content:start-regular-queue-group", function (event, input) {
    return wrap(async function () {
      await workflow.regularQueueGroups.start(input);
      return {
        items: workflow.regularQueueGroups.list(),
      };
    });
  });
  deps.ipcMain.handle("content:pause-regular-queue-group", function (event, input) {
    return wrap(function () {
      workflow.regularQueueGroups.pause(input);
      return { items: workflow.regularQueueGroups.list() };
    });
  });
  deps.ipcMain.handle("content:start-all-regular-queue-groups", function () {
    return wrap(async function () {
      await workflow.regularQueueGroups.startAll();
      return {
        items: workflow.regularQueueGroups.list(),
      };
    });
  });
  deps.ipcMain.handle("content:pause-all-regular-queue-groups", function () {
    return wrap(function () {
      return { items: workflow.regularQueueGroups.pauseAll().groups };
    });
  });
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
          return projectPaidPreflight(result);
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
          return projectPaidAdmission(result);
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
        return projectPaidMediaBatchList(result);
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
          return projectPaidExecutionResult(result);
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
          return projectPaidExecutionResult(result);
        });
      },
    );
    deps.ipcMain.handle(
      "content:cancel-remaining-paid-media-batch-items",
      function (event, input) {
        return wrap(async function () {
          if (typeof paidExecution.cancelRemaining !== "function") {
            const error = new Error("Paid-media execution is unavailable");
            error.code = "PAID_MEDIA_EXECUTION_UNAVAILABLE";
            throw error;
          }
          const result = await paidExecution.cancelRemaining(
            paidMediaBatchInput(input),
          );
          return projectPaidExecutionResult(result);
        });
      },
    );
  }
}
module.exports = { registerContentSubmissionIpc };

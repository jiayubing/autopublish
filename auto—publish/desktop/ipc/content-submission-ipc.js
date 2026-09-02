const { wrap } = require("../services/ipc-response");
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
  projectPaidExecutionBatchStartAllResult,
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

function createSubmissionInterface(maintenance, regularQueueService, regularQueueGroups) {
  const regular = regularQueueService;
  return Object.freeze({
    cleanup: {
      previewResidue: bind(maintenance, "previewTrashedArticleQueueResidue"),
      cleanupResidue: bind(maintenance, "cleanupTrashedArticleQueueResidue"),
    },
    regularQueue: {
      previewAdmission: bind(regular, "previewRegularQueueAdmission"),
      admit: bind(regular, "admitRegularQueueItems"),
      removePending: bind(regular, "removePendingQueueItems"),
    },
    regularQueueGroups: {
      list: bind(regular, "listRegularQueueGroups"),
      updateImageCount: bind(regular, "updateRegularQueueGroupImageCount"),
      updateSubmissionInterval: bind(
        regular,
        "updateRegularQueueGroupSubmissionInterval",
      ),
      start: bind(regularQueueGroups, "startGroup"),
      kick: bind(regularQueueGroups, "kickGroup"),
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

function paidMediaClientInput(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some(function (key) {
      return key !== "clientId";
    }) ||
    typeof input.clientId !== "string" ||
    !input.clientId.trim()
  ) {
    const error = new Error("Invalid paid-media client input");
    error.code = "PAID_EXECUTION_CLIENT_INVALID";
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
          "autoStart",
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
  if (input.autoStart !== undefined && typeof input.autoStart !== "boolean") {
    const error = new Error("Invalid regular queue auto-start intent");
    error.code = "REGULAR_QUEUE_INPUT_INVALID";
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

function regularQueueGroupImageCountInput(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some(function (key) {
      return (
        key !== "queueGroupId" &&
        key !== "imageCount" &&
        key !== "expectedRevision"
      );
    }) ||
    typeof input.queueGroupId !== "string" ||
    !input.queueGroupId.trim() ||
    !Number.isInteger(input.imageCount) ||
    input.imageCount < 0 ||
    input.imageCount > 5 ||
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  ) {
    const error = new Error("Invalid regular queue image-count request");
    error.code = "REGULAR_QUEUE_CONFIG_INVALID";
    throw error;
  }
  return input;
}

function regularQueueGroupSubmissionIntervalInput(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some(function (key) {
      return (
        key !== "queueGroupId" &&
        key !== "submissionIntervalSeconds" &&
        key !== "expectedRevision"
      );
    }) ||
    typeof input.queueGroupId !== "string" ||
    !input.queueGroupId.trim() ||
    !Number.isInteger(input.submissionIntervalSeconds) ||
    input.submissionIntervalSeconds < 0 ||
    input.submissionIntervalSeconds > 3600 ||
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  ) {
    const error = new Error("Invalid regular queue submission-interval request");
    error.code = "REGULAR_QUEUE_CONFIG_INVALID";
    throw error;
  }
  return input;
}

function registerContentSubmissionIpc(deps) {
  const maintenance = deps.submissionMaintenance;
  if (!maintenance) {
    const error = new Error("Submission maintenance service is required");
    error.code = "SUBMISSION_MAINTENANCE_REQUIRED";
    throw error;
  }
  const workflow =
    deps.submissionWorkflow ||
    createSubmissionInterface(
      maintenance,
      deps.regularQueueApplication,
      deps.regularQueueGroupOrchestrator,
    );
  const paidMedia = deps.paidMediaPreflightService || deps.paidMediaPreflight;
  const paidExecution = deps.paidMediaExecutionService;
  const submissionCenter = deps.submissionCenterSnapshot;
  if (submissionCenter && typeof submissionCenter.get === "function")
    deps.ipcMain.handle(
      "content:get-submission-center-snapshot",
      function (event, input) {
        return wrap(function () {
          return submissionCenter.get(input);
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
        const request = regularAdmissionInput(input, true);
        const result = workflow.regularQueue.admit(request);
        if (
          request.autoStart === true &&
          workflow.regularQueueGroups &&
          typeof workflow.regularQueueGroups.kick === "function"
        ) {
          const queueGroupIds = [
            ...new Set(
              (result.items || [])
                .filter(function (item) {
                  return (
                    item &&
                    (item.status === "queued" || item.status === "idempotent") &&
                    typeof item.queueGroupId === "string" &&
                    item.queueGroupId
                  );
                })
                .map(function (item) {
                  return item.queueGroupId;
                }),
            ),
          ];
          queueGroupIds.forEach(function (queueGroupId) {
            try {
              workflow.regularQueueGroups.kick({ queueGroupId });
            } catch (_) {
              // Admission has already committed. Auto-start is best-effort;
              // the queue remains visible and can still be started manually.
            }
          });
        }
        return projectRegularAdmission(result, "admit");
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
  deps.ipcMain.handle(
    "content:update-regular-queue-group-image-count",
    function (event, input) {
      return wrap(function () {
        return {
          items: workflow.regularQueueGroups.updateImageCount(
            regularQueueGroupImageCountInput(input),
          ),
        };
      });
    },
  );
  deps.ipcMain.handle(
    "content:update-regular-queue-group-submission-interval",
    function (event, input) {
      return wrap(function () {
        return {
          items: workflow.regularQueueGroups.updateSubmissionInterval(
            regularQueueGroupSubmissionIntervalInput(input),
          ),
        };
      });
    },
  );
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
      "content:start-all-paid-media-batches",
      function (event, input) {
        return wrap(async function () {
          if (typeof paidExecution.startAll !== "function") {
            const error = new Error("Paid-media execution is unavailable");
            error.code = "PAID_MEDIA_EXECUTION_UNAVAILABLE";
            throw error;
          }
          const result = await paidExecution.startAll(
            paidMediaClientInput(input),
          );
          return projectPaidExecutionBatchStartAllResult(result);
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

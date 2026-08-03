"use strict";

const {
  createPublicationSubmissionOrchestrator,
} = require("./publication-submission-orchestrator");

function createPublicationSubmissionService(options) {
  const value = options || {};
  if (!value.workbench || (!value.orchestrator && !value.workflow))
    throw new Error("Publication submission dependencies are required");
  const orchestrator =
    value.orchestrator ||
    createPublicationSubmissionOrchestrator({
      workflow: value.workflow,
      operationalStore: value.operationalStore,
      workerPublisher: value.workerPublisher,
    });
  return Object.freeze({
    submit: async function (plan, options) {
      const tasks = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
      const commands = [];
      for (const task of tasks)
        commands.push(await value.workbench.preparePublicationCommand(task));
      return orchestrator.submit(commands, options);
    },
  });
}

module.exports = { createPublicationSubmissionService };

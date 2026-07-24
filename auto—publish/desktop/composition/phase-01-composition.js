const {
  createPublicationWorkflow,
} = require("../../src/application/publication-workflow");
function createPhaseOneComposition(dependencies) {
  const deps = dependencies || {};
  return Object.freeze({
    publicationWorkflow: createPublicationWorkflow({
      operationalStore: deps.operationalStore,
      publisher: deps.publisher,
      clock: deps.clock,
    }),
  });
}
module.exports = { createPhaseOneComposition };

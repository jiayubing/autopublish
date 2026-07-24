function createPublicationWorkflow(dependencies) {
  const deps = dependencies || {};
  if (!deps.operationalStore || !deps.publisher || !deps.clock)
    throw new Error("PublicationWorkflow dependencies are required");
  return Object.freeze({
    publish: async function () {
      throw new Error("PublicationWorkflow is not active until Phase 3");
    },
    recover: async function () {
      throw new Error("PublicationWorkflow is not active until Phase 3");
    },
    reconcile: async function () {
      throw new Error("PublicationWorkflow is not active until Phase 3");
    },
  });
}
module.exports = { createPublicationWorkflow };

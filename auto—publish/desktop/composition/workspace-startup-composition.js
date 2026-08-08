"use strict";

function blockedError(result) {
  const error = new Error("Workspace migration blocks normal composition");
  error.code = result.code || "WORKSPACE_MIGRATION_BLOCKED";
  error.migration = result;
  return error;
}

async function createWorkspaceStartupComposition(deps) {
  const values = deps || {};
  const options = values.options || {};
  const bootstrapState = values.bootstrapState || {};
  const workspaceRoot = bootstrapState.workspacePath;
  const runMigrationGate =
    options.runWorkspaceMigrationGate ||
    require("./workspace-migration-composition").runWorkspaceMigrationGate;
  const gateOptions = {
    workspaceRoot,
    workspaceIdentity: bootstrapState.workspaceIdentity,
    confirmationFingerprint: null,
    clock: options.clock,
    fault: options.workspaceMigrationFault,
    internalMigrationImportFault: options.internalMigrationImportFault,
  };
  let gateResult = await runMigrationGate(gateOptions);
  if (
    gateResult &&
    gateResult.allowed !== true &&
    gateResult.repair &&
    gateResult.repair.kind === "confirm_migration" &&
    typeof options.confirmWorkspaceMigration === "function"
  ) {
    const confirmationFingerprint =
      await options.confirmWorkspaceMigration(gateResult);
    if (
      typeof confirmationFingerprint === "string" &&
      confirmationFingerprint === gateResult.repair.confirmationFingerprint
    ) {
      gateResult = await runMigrationGate({
        ...gateOptions,
        confirmationFingerprint,
      });
    }
  }
  if (!gateResult || gateResult.allowed !== true)
    throw blockedError(gateResult || {});

  const createNormalComposition =
    options.createNormalWorkspaceRuntimeComposition ||
    require("./workspace-runtime-composition")
      .createWorkspaceRuntimeComposition;
  return createNormalComposition(values);
}

module.exports = { createWorkspaceStartupComposition };

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
  const gateResult = await runMigrationGate({
    workspaceRoot,
    workspaceIdentity: bootstrapState.workspaceIdentity,
    confirmationFingerprint: bootstrapState.migrationConfirmationFingerprint,
    clock: options.clock,
    fault: options.workspaceMigrationFault,
    internalMigrationImportFault: options.internalMigrationImportFault,
  });
  if (!gateResult || gateResult.allowed !== true)
    throw blockedError(gateResult || {});

  const createNormalComposition =
    options.createNormalWorkspaceRuntimeComposition ||
    require("./workspace-runtime-composition")
      .createWorkspaceRuntimeComposition;
  return createNormalComposition(values);
}

module.exports = { createWorkspaceStartupComposition };

"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  verifyTicket24EAbsence,
} = require("../scripts/verify-ticket-24-e-absence");

test("Ticket 24-E absence gate verifies each legacy boundary layer", () => {
  const report = verifyTicket24EAbsence();
  assert.equal(report.status, "PASSED");
  assert.deepEqual(Object.keys(report.layers), [
    "productionCapability",
    "publicDto",
    "publicResidueVocabulary",
    "legacyRuntimeBoundary",
    "ipcChannel",
    "extensionSeam",
    "rendererActionUi",
    "migrationOnlyAllowlist",
  ]);
  assert.equal(report.layers.rendererActionUi.sourceMatches, 0);
  assert.equal(report.layers.publicResidueVocabulary.sourceMatches, 0);
  assert.equal(report.layers.legacyRuntimeBoundary.forbiddenRuntimeStatuses, 0);
  assert.equal(report.layers.migrationOnlyAllowlist.forbiddenImports, 0);
});

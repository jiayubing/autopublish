"use strict";

const { createContractRegistry } = require("./registry");
const {
  workspaceContracts,
  workspaceRuntimeContracts,
  workspaceEventContracts,
} = require("./workspace-contracts");
const { settingsContracts } = require("./settings-contracts");
const { mediaContracts, mediaLifecycleContracts } = require("./media-contracts");
const { platformContracts } = require("./platform-contracts");
const { contentLibraryContracts } = require("./content-library-contracts");
const { articleEditorContracts } = require("./article-editor-contracts");
const {
  articleRemovalContracts,
  articleRemovalEventContracts,
} = require("./article-removal-contracts");
const { articleManagementContracts } = require("./article-management-contracts");
const { articleAttentionContracts } = require("./article-attention-contracts");
const { generationContracts, generationEventContracts } = require("./generation-contracts");
const { contentOperationsContracts } = require("./content-operations-contracts");
const { publicationContracts } = require("./publication-contracts");

// This module is deliberately an assembly-only registry. Wire schemas and
// projections live beside the domain namespace that owns their capability.
const contracts = [
  ...workspaceContracts,
  ...settingsContracts,
  ...mediaContracts,
  ...platformContracts,
  ...contentLibraryContracts,
  ...articleEditorContracts,
  ...articleRemovalContracts,
  ...articleManagementContracts,
  ...articleAttentionContracts,
  ...articleRemovalEventContracts,
  ...generationContracts,
  ...contentOperationsContracts,
  ...publicationContracts,
  ...workspaceRuntimeContracts,
  ...mediaLifecycleContracts,
  ...generationEventContracts,
  ...workspaceEventContracts,
];

const productionIpcRegistry = createContractRegistry(contracts);

module.exports = { productionIpcRegistry };

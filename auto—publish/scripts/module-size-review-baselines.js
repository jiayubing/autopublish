"use strict";

// These are reviewed deep modules whose size is worth watching. The recorded
// value is a review baseline, not a waiver or an architectural pass/fail rule.
// The Phase 8 report surfaces noteworthy growth and unreviewed large modules;
// module quality is judged by responsibility, interface depth, locality, and
// testability rather than a mechanical line threshold.
const MODULE_SIZE_REVIEW_BASELINES = Object.freeze([
  [
    "desktop/ipc/contracts/content-core-contracts.js",
    1328,
    "domain wire declarations and validators",
  ],
  [
    "media-workbench/src/features/media/media-feature.js",
    793,
    "media feature owner for request identity and command state",
  ],
  [
    "src/content/article-removal-service.js",
    764,
    "content lifecycle state machine and recovery owner",
  ],
  [
    "desktop/ipc/contracts/media-contracts.js",
    697,
    "media wire declarations and bounded projections",
  ],
  [
    "src/infrastructure/operational-store/internal/operational-store-submission-aggregate.js",
    695,
    "single SQLite aggregate for batch claims and cleanup",
  ],
  [
    "src/content/article-file-transaction.js",
    644,
    "multi-file article transaction and recovery protocol",
  ],
  [
    "desktop/ipc/contracts/registry.js",
    608,
    "single typed IPC registry primitive",
  ],
  [
    "desktop/preload.js",
    607,
    "single sandbox namespace and transport boundary",
  ],
  [
    "media-workbench/src/features/content/content-sources-feature.js",
    606,
    "content source feature owner",
  ],
  [
    "desktop/services/content-generation-batch-service.js",
    602,
    "batch planning, runner, and article handoff owner",
  ],
  [
    "desktop/ipc/contracts/platform-contracts.js",
    602,
    "platform task, account, run, and attention declarations",
  ],
  [
    "desktop/composition/workspace-runtime-composition.js",
    622,
    "composition root dependency graph",
  ],
  [
    "desktop/workspace-bootstrap-service.js",
    579,
    "workspace selection and recovery owner",
  ],
  ["media-workbench/src/bridge/content.ts", 562, "typed content bridge facade"],
  [
    "media-workbench/src/features/platform/platform-feature.js",
    551,
    "platform run, queue, and account feature owner",
  ],
  [
    "media-workbench/src/components/content/GeneratedArticlesView.tsx",
    541,
    "article management and trash presentation boundary",
  ],
  ["src/platforms/toutiao/adapter.js", 502, "vendor browser protocol adapter"],
  [
    "src/infrastructure/operational-store/internal/operational-store-publication-aggregate.js",
    599,
    "single SQLite publication aggregate",
  ],
  [
    "src/infrastructure/operational-store/internal/operational-store-queue-aggregate.js",
    473,
    "single SQLite queue and paid-batch fact aggregate",
  ],
  [
    "src/infrastructure/operational-store/internal/operational-store-schema.js",
    483,
    "SQLite schema versioning and migration coordinator",
  ],
  [
    "src/content/content-path-policy.js",
    481,
    "shared workspace and link safety policy",
  ],
  ["auth-server/src/auth-domain.js", 492, "Auth mutation ordering facade"],
  [
    "src/content/article-serialization.js",
    446,
    "article DTO and Markdown/sidecar serialization boundary",
  ],
  ["desktop/main.js", 441, "Electron security and application root"],
  [
    "media-workbench/src/App.tsx",
    438,
    "single renderer shell and feature composition root",
  ],
  [
    "media-workbench/src/components/settings/HepanProviderSettings.tsx",
    431,
    "provider settings interaction boundary",
  ],
  [
    "media-workbench/src/features/content/article-management-feature.js",
    429,
    "article management command and snapshot owner",
  ],
  [
    "src/platforms/hepan/adapter.js",
    429,
    "vendor payload, runtime, and uncertain outcome owner",
  ],
  [
    "desktop/ipc/contracts/doubao-contracts.js",
    425,
    "Doubao question, queue, and research declarations",
  ],
  [
    "desktop/ipc/contracts/generation-contracts.js",
    505,
    "generation batch pagination metadata and submission handoff declarations",
  ],
  [
    "src/content/doubao-collection-queue.js",
    422,
    "bounded collection queue state machine",
  ],
  [
    "src/content/doubao-browser-adapter.js",
    422,
    "Doubao browser lifecycle and diagnostic owner",
  ],
  ["media-workbench/src/bridge/media.ts", 409, "typed media bridge facade"],
  [
    "media-workbench/src/types/publication.ts",
    434,
    "publication wire type declarations",
  ],
  [
    "desktop/services/platform-workbench/command-preparer.js",
    404,
    "platform command normalization and document extraction",
  ],
  [
    "media-workbench/src/features/settings/settings-feature.js",
    404,
    "settings command and capability owner",
  ],
  [
    "media-workbench/src/components/ArticleEditor.tsx",
    401,
    "article editing presentation boundary",
  ],
]);

module.exports = { MODULE_SIZE_REVIEW_BASELINES };

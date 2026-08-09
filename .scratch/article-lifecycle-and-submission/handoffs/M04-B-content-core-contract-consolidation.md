# M04-B — Content-core Contract Consolidation

状态：`COMPLETE`

## Scope / provenance

- Base integration HEAD：`7ccbaa2c18f5122d5edcd9728d4bdae8a9d544cf`
- Source integration branch：`codex/article-lifecycle-submission`
- Execution worktree：`C:\Users\violet\.codex\worktrees\13ad\官媒投稿-refactor`
- Execution state：detached at the base integration HEAD；integration branch 由主任务 worktree 持有
- Source owner at start：`auto—publish/desktop/ipc/contracts/content-core-contracts.js`
- Before manifest captured before implementation changes：2026-08-09

## Content-core capability before manifest

Machine snapshot source：`contentCoreContracts` loaded from the source owner at base HEAD. The normalized snapshot includes public metadata, schemaVersion, recursively closed request/success/event DTO schemas, argument mappings, error codes and safe error descriptors.

| Capability | Channel | Kind | Request DTO top-level fields | Success/event DTO top-level fields | Schema owner / validator owner | Direct production consumer mapping |
| --- | --- | --- | --- | --- | --- | --- |
| `content.listClients` | `content:list-clients` | query | — | `clients` | `content-core-contracts.js` → `contentClient` → `contentMaterial` | `ai-content-ipc.js` → `projectClient` |
| `content.listResearch` | `content:list-research` | query | `clientId` | `research` | `content-core-contracts.js` → `research` → `reference` | `ai-content-ipc.js` → `projectResearch` |
| `content.listTemplateCatalog` | `content:list-template-catalog` | query | — | `revision`, `platforms`, `templates`, `diagnostics` | `content-core-contracts.js` → `templateCatalog` → `templatePlatform`/`template`/`templateDiagnostic` | `ai-content-ipc.js` → `projectTemplateCatalog` |
| `content.retryMaterial` | `content:retry-material` | command | `clientId`, `materialId` | `material` | `content-core-contracts.js` → `contentMaterial` | `ai-content-ipc.js` → `projectMaterial` |
| `content.generateArticle` | `content:generate-article` | command | `clientId`, `materialIds`, `researchQueryIds`, `platform`, `templateId`, `templateCatalogRevision` | `article` | `content-core-contracts.js` → `generationRequest`/`generatedArticle` and nested snapshots | `ai-content-ipc.js` → `projectArticle` |
| `content.saveArticle` | `content:save-article` | command | `article`, `expectedFingerprint` | `saved`/`conflict`/`result-uncertain` union | `content-core-contracts.js` → `generatedArticle`/closed outcome union | `ai-content-ipc.js` → `projectArticle` for `saved`, typed outcomes unchanged |
| `content.getArticleEditor` | `content:get-article-editor` | query | `clientId`, `articleId` | `article`, `editFingerprint` | `content-core-contracts.js` → `articleEditor`/`generatedArticle` | `ai-content-ipc.js` → `projectArticle` |
| `content.previewArticleRemovalImpact` | `content:preview-article-removal-impact` | query | `selections` | `token`, `articleCount`, `queuedToCancel`, `blockedItems`, `canCommit`, `selections`, `expiresAt`, `transactionId`, `openTransactionId` | `content-core-contracts.js` → `removalPreviewRequest`/`impactPreview`/`impactItem` | `ai-content-ipc.js` → `projectImpactPreview` |
| `content.trashArticles` | `content:trash-articles` | command | `selections`, `token`, `confirmed` | `moved`, `skipped`, `rejected`, `transactionId`, `status`, `articleCount`, `queueActions`, `errorCode`, `reasonCode`, `phase`, `transaction` | `content-core-contracts.js` → `removalCommitRequest`/`trashCommitResult`/`trashRecord` | `ai-content-ipc.js` → `projectTrashCommitResult` |
| `content.restoreArticle` | `content:restore-article` | command | `clientId`, `articleId` | `article`, `restored`, `queueRestored`, `message` | `content-core-contracts.js` → `selection`/`generatedArticle` | `ai-content-ipc.js` → `projectArticle` |
| `content.preparePermanentDeleteArticle` | `content:prepare-permanent-delete-article` | command | `clientId`, `articleId` | `token`, `clientId`, `articleId`, `deletedAt`, `status`, `version`, `fingerprint`, `issuedAt`, `expiresAt`, `permanentlyDeleted` | `content-core-contracts.js` → `selection`/`permanentDeleteConfirmation` | `ai-content-ipc.js` → `projectPermanentDeleteConfirmation` |
| `content.permanentlyDeleteArticle` | `content:permanently-delete-article` | command | `clientId`, `articleId`, `token` | `clientId`, `articleId`, `deleted`, `deletedAt`, `tombstoneIdentityV1` | `content-core-contracts.js` → `permanentDeleteResult`/`tombstoneIdentityV1` | `ai-content-ipc.js` → `projectPermanentDeleteResult` |
| `content.getArticleRemovalTransaction` | `content:get-article-removal-transaction` | query | `transactionId` | `transaction` | `content-core-contracts.js` → `articleRemovalTransaction` | `ai-content-ipc.js` → `projectArticleRemovalTransaction` |
| `content.retryArticleRemovalTransaction` | `content:retry-article-removal-transaction` | command | `transactionId`, `confirmed` | `transaction` | `content-core-contracts.js` → `articleRemovalTransaction` | `ai-content-ipc.js` → `projectArticleRemovalTransaction` |
| `content.getArticleManagementSnapshot` | `content:get-article-management-snapshot` | query | `clientId` | `clientId`, `revision`, `articles`, `trash`, `submissionBatches`, `cancellationPlans`, `publicationRecords`, `publishedArchives`, `attention`, `submissionPlatforms`, `workflowItems`, `publicationSummaryItems`, `lifecycleVersion`, `lifecycleCounts` | `content-core-contracts.js` → `managementSnapshot` and all nested lifecycle DTOs | `article-management-ipc.js` → `projectManagementSnapshot` |
| `attention.listArticleAttention` | `content:list-article-attention` | query | `clientId` | `revision`, `items`, `counts` | `content-core-contracts.js` / `content-core-projections.js` → attention DTOs | `article-attention-ipc.js` → `projectArticleAttentionList` |
| `attention.previewArticleAttention` | `content:preview-article-attention` | query | `attentionId`, `action`, `clientId` | `attentionId`, `revision`, `action`, `requiresConfirmation`, `message`, `changedScopes` | `content-core-contracts.js` / `content-core-projections.js` → preview DTO | `article-attention-ipc.js` → `projectArticleAttentionPreview` |
| `attention.resolveArticleAttention` | `content:resolve-article-attention` | command | `attentionId`, `action`, `expectedRevision`, `confirmed`, `clientId` | `outcome`, `attentionId`, `changedScopes` | `content-core-contracts.js` / `content-core-projections.js` → resolution DTO | `article-attention-ipc.js` → `projectArticleAttentionResolution` |
| `content.articleRemovalTransactionChanged` | `content:article-removal-transaction` | event | — | `id`, `transactionId`, `status`, `phase`, `errorCode`, `reasonCode`, `createdAt`, `updatedAt`, `articleCount`, `queueCursor`, `articleCursor`, `revision`, `changedScopes`, `deletionTransactionIdentityV1` | `content-core-contracts.js` / `content-core-projections.js` → `articleRemovalTransaction` | `workspace-runtime-composition.js` emits projected transaction; preload/bridge consume registry event |

Before capability order is exactly:

```text
content:list-clients
content:list-research
content:list-template-catalog
content:retry-material
content:generate-article
content:save-article
content:get-article-editor
content:preview-article-removal-impact
content:trash-articles
content:restore-article
content:prepare-permanent-delete-article
content:permanently-delete-article
content:get-article-removal-transaction
content:retry-article-removal-transaction
content:get-article-management-snapshot
content:list-article-attention
content:preview-article-attention
content:resolve-article-attention
content:article-removal-transaction
```

| Before manifest property | Value |
| --- | --- |
| Contract count | 19 |
| Schema version | 1 for every capability/event |
| Error-code count | 17 for each invoke contract; 0 for the event |
| Before source-owner snapshot SHA-256 | `6148330a3aa122e07512526a6e75479b732ad6636c89098416d8918865c90951` |
| Public behavior comparison SHA-256 | `9314491bc3052dbb660317c8067589a513e1e02585e2f16ec6c4b7ca609163bd` (recorded again after the final implementation; equal to after) |
| Closed-validation owner | `content-core-contracts.js` (with its direct `content-core-projections.js` projector dependency) |

## Before dependency direction

```text
production-registry.js
  → content-core-contracts.js
      → registry.js
      → publication-evidence-contract.js
      → article-lifecycle-terminal-contract.js
      → content-core-projections.js
ai-content-ipc.js
article-management-ipc.js
article-attention-ipc.js
workspace-runtime-composition.js
direct content-core tests
  → content-core-contracts.js
```

The before source owner combines library DTOs, article editor DTOs, removal/recovery DTOs, lifecycle snapshot DTOs, attention contracts, all 17 safe error descriptors, closed validators, contract assembly, and most projectors. The change rationale is to assign each capability to a stable domain module while retaining one shared primitive/error owner and direct composition of the unchanged public registry order.

## Implementation / after manifest

### After capability manifest

The public capability manifest is unchanged. Every row remains `schemaVersion: 1`; the DTO field lists below are top-level fields, with nested DTO ownership recorded in the owner column.

| Capability | Channel | Kind / version | Request DTO top-level fields | Success/event DTO top-level fields | DTO / validator owner | Direct production consumer mapping |
| --- | --- | --- | --- | --- | --- | --- |
| `content.listClients` | `content:list-clients` | query / 1 | — | `clients` | `content-library-contracts.js` → `contentClient` → `contentMaterial`; shared primitives/errors from `content-core-contract-shared.js` | `ai-content-ipc.js` → `projectClient` |
| `content.listResearch` | `content:list-research` | query / 1 | `clientId` | `research` | `content-library-contracts.js` → `research` → shared `reference` | `ai-content-ipc.js` → `projectResearch` |
| `content.listTemplateCatalog` | `content:list-template-catalog` | query / 1 | — | `revision`, `platforms`, `templates`, `diagnostics` | `content-library-contracts.js` → `templateCatalog` → `templatePlatform`/`template`/`templateDiagnostic` | `ai-content-ipc.js` → `projectTemplateCatalog` |
| `content.retryMaterial` | `content:retry-material` | command / 1 | `clientId`, `materialId` | `material` | `content-library-contracts.js` → `contentMaterial` | `ai-content-ipc.js` → `projectMaterial` |
| `content.generateArticle` | `content:generate-article` | command / 1 | `clientId`, `materialIds`, `researchQueryIds`, `platform`, `templateId`, `templateCatalogRevision` | `article` | `article-editor-contracts.js` → `generationRequest`/`generatedArticle` and nested snapshots | `ai-content-ipc.js` → `projectArticle` |
| `content.saveArticle` | `content:save-article` | command / 1 | `article`, `expectedFingerprint` | `saved`/`conflict`/`result-uncertain` union | `article-editor-contracts.js` → `generatedArticle`/closed outcome union | `ai-content-ipc.js` → `projectArticle` for `saved`; typed outcomes unchanged |
| `content.getArticleEditor` | `content:get-article-editor` | query / 1 | `clientId`, `articleId` | `article`, `editFingerprint` | `article-editor-contracts.js` → `articleEditor`/`generatedArticle` | `ai-content-ipc.js` → `projectArticle` |
| `content.previewArticleRemovalImpact` | `content:preview-article-removal-impact` | query / 1 | `selections` | `token`, `articleCount`, `queuedToCancel`, `blockedItems`, `canCommit`, `selections`, `expiresAt`, `transactionId`, `openTransactionId` | `article-removal-contracts.js` → `removalPreviewRequest`/`impactPreview`/`impactItem` | `ai-content-ipc.js` → `projectImpactPreview` |
| `content.trashArticles` | `content:trash-articles` | command / 1 | `selections`, `token`, `confirmed` | `moved`, `skipped`, `rejected`, `transactionId`, `status`, `articleCount`, `queueActions`, `errorCode`, `reasonCode`, `phase`, `transaction` | `article-removal-contracts.js` → `removalCommitRequest`/`trashCommitResult`/`trashRecord` | `ai-content-ipc.js` → `projectTrashCommitResult` |
| `content.restoreArticle` | `content:restore-article` | command / 1 | `clientId`, `articleId` | `article`, `restored`, `queueRestored`, `message` | `article-removal-contracts.js` → `selection`/`generatedArticle` | `ai-content-ipc.js` → `projectArticle` |
| `content.preparePermanentDeleteArticle` | `content:prepare-permanent-delete-article` | command / 1 | `clientId`, `articleId` | `token`, `clientId`, `articleId`, `deletedAt`, `status`, `version`, `fingerprint`, `issuedAt`, `expiresAt`, `permanentlyDeleted` | `article-removal-contracts.js` → `selection`/`permanentDeleteConfirmation` | `ai-content-ipc.js` → `projectPermanentDeleteConfirmation` |
| `content.permanentlyDeleteArticle` | `content:permanently-delete-article` | command / 1 | `clientId`, `articleId`, `token` | `clientId`, `articleId`, `deleted`, `deletedAt`, `tombstoneIdentityV1` | `article-removal-contracts.js` → `permanentDeleteResult`/`tombstoneIdentityV1` | `ai-content-ipc.js` → `projectPermanentDeleteResult` |
| `content.getArticleRemovalTransaction` | `content:get-article-removal-transaction` | query / 1 | `transactionId` | `transaction` | `article-removal-contracts.js` → `articleRemovalTransaction` | `ai-content-ipc.js` → `projectArticleRemovalTransaction` |
| `content.retryArticleRemovalTransaction` | `content:retry-article-removal-transaction` | command / 1 | `transactionId`, `confirmed` | `transaction` | `article-removal-contracts.js` → `articleRemovalTransaction` | `ai-content-ipc.js` → `projectArticleRemovalTransaction` |
| `content.getArticleManagementSnapshot` | `content:get-article-management-snapshot` | query / 1 | `clientId` | `clientId`, `revision`, `articles`, `trash`, `submissionBatches`, `cancellationPlans`, `publicationRecords`, `publishedArchives`, `attention`, `submissionPlatforms`, `workflowItems`, `publicationSummaryItems`, `lifecycleVersion`, `lifecycleCounts` | `article-management-contracts.js` → `managementSnapshot`; reuses the owning `generatedArticle`, `trashRecord`, and `articleAttentionList` schemas/projectors | `article-management-ipc.js` → `projectManagementSnapshot` |
| `attention.listArticleAttention` | `content:list-article-attention` | query / 1 | `clientId` | `revision`, `items`, `counts` | `article-attention-contracts.js` → attention item/list DTOs | `article-attention-ipc.js` → `projectArticleAttentionList` |
| `attention.previewArticleAttention` | `content:preview-article-attention` | query / 1 | `attentionId`, `action`, `clientId` | `attentionId`, `revision`, `action`, `requiresConfirmation`, `message`, `changedScopes` | `article-attention-contracts.js` → preview DTO | `article-attention-ipc.js` → `projectArticleAttentionPreview` |
| `attention.resolveArticleAttention` | `content:resolve-article-attention` | command / 1 | `attentionId`, `action`, `expectedRevision`, `confirmed`, `clientId` | `outcome`, `attentionId`, `changedScopes` | `article-attention-contracts.js` → resolution DTO | `article-attention-ipc.js` → `projectArticleAttentionResolution` |
| `content.articleRemovalTransactionChanged` | `content:article-removal-transaction` | event / 1 | — | `id`, `transactionId`, `status`, `phase`, `errorCode`, `reasonCode`, `createdAt`, `updatedAt`, `articleCount`, `queueCursor`, `articleCursor`, `revision`, `changedScopes`, `deletionTransactionIdentityV1` | `article-removal-contracts.js` → `articleRemovalTransaction`; shared `contentContract` supplies event closed error metadata (`[]`/`{}`) | `workspace-runtime-composition.js` → `projectArticleRemovalTransaction`; registry/preload/bridge event path unchanged |

The order is unchanged internally and externally. `production-registry.js` now spreads library → editor → removal invokes → management → attention → removal event, which is the exact former 19-row order; no consumer depended on a module-array ordering beyond this preserved registry order.

### After owner and dependency map

| Module | Stable domain responsibility | Direct dependencies / consumers | Change reason |
| --- | --- | --- | --- |
| `content-core-contract-shared.js` | One owner for content-core safe error descriptors/codes, primitive/closed-validation helpers, shared `reference` DTO and argument adapters; declares no capability | `content-library-contracts.js`, `article-editor-contracts.js`, `article-removal-contracts.js`, `article-attention-contracts.js`, `article-management-contracts.js` → `registry.js` and this module | Remove repeated primitives/errors without creating a second capability owner |
| `content-library-contracts.js` | Client/material/research/template-catalog DTOs, four library contracts and their projectors | `production-registry.js`, `ai-content-ipc.js`, focused content-core test | Move library wire facts to the library owner |
| `article-editor-contracts.js` | Generated article/editor DTOs, generation/save/editor contracts, closed save union and article projector | `production-registry.js`, `ai-content-ipc.js`, editor/coordinator/submission tests | Keep article editing/generation facts together and reusable by removal/management |
| `article-removal-contracts.js` | Removal selection/impact/trash/delete/repair DTOs, seven invoke contracts, removal event and all removal projectors | `production-registry.js`, `ai-content-ipc.js`, `workspace-runtime-composition.js`, focused removal test | Make removal transaction/event ownership explicit and delete the mixed projection module |
| `article-attention-contracts.js` | Attention item/list/preview/resolution DTOs, three attention contracts and projectors | `production-registry.js`, `article-attention-ipc.js`, focused attention/management tests | Separate attention read/resolve surface from general content contracts |
| `article-management-contracts.js` | Management snapshot DTO, lifecycle/publication nested schemas, management contract and bounded snapshot projector | `production-registry.js`, `article-management-ipc.js`, lifecycle/Ticket 22/content-core tests; imports only owning editor/removal/attention projectors | Keep snapshot composition as one owner while reusing nested domain DTO owners |
| `production-registry.js` | Assembly-only registry; no DTO, validator, projector or lifecycle fact | Imports the five domain arrays and removal event; unchanged preload/bridge consume the resulting registry | Preserve the existing public registry and channel order |

Dependency direction is one-way: `production-registry → domain contract modules → shared/registry/domain parsers`; direct IPC/composition consumers import the projector from the module that owns that DTO. No bridge/preload or renderer source changed, and no contract module writes lifecycle, submission, removal, order, or persistence state.

### After comparison evidence

- Final old-vs-new machine comparison loaded the base source with `git show`, normalized recursively closed schemas (custom validators represented as a stable closed-validator marker), metadata, error descriptors/codes and argument-mapping functions: `count: 19`, exact channel order, `differenceCount: 0`, old/current public comparison SHA-256 both `9314491bc3052dbb660317c8067589a513e1e02585e2f16ec6c4b7ca609163bd`.
- A direct projector comparison against the base owner checked 17 projector entry points with representative nested DTOs and extra/sensitive fields: `mismatchCount: 0`.
- `content-core-contracts.js` and `content-core-projections.js` are deleted; no production import or compatibility re-export remains. The focused absence test asserts both paths are absent.

## Audit / verification / closure

### Verification actually run on the final source

- `node --test tests/phase-06-content-core-typed-ipc.test.js` — PASS, 17/17.
- `node --test tests/phase-03-six-stage-article-lifecycle.test.js tests/article-mutation-coordinator.test.js tests/article-lifecycle-ticket-22.test.js tests/submission-preparation-lifecycle.test.js tests/ai-content-ipc.test.js tests/article-management-snapshot.test.js` — PASS, 65/65.
- `npm run lint` — PASS.
- `npm run typecheck:main`, `npm run typecheck:bridge`, `npm run typecheck:renderer` — PASS.
- `npm run format:check` — PASS; targeted Prettier check for all six new contract modules — PASS; `git diff --check` — PASS (only normal LF→CRLF working-copy warnings).
- `npm run test:production-ipc-matrix` — PASS, 35/35; all 129 production capabilities close by TypeChecker symbol identity; duration 212.972 seconds.
- `npm run test:ticket-24-e` — PASS, no forbidden source/runtime/import residue.
- `npm run test:legacy-absence` — PASS, source/archive matches 0.
- `npm run test:phase-08:gates` — PASS, 5/5; the new management module has a reviewed size baseline entry.
- Local setup only: `npm ci --ignore-scripts` in `auto—publish/` and `auto—publish/media-workbench/`; no real login, publish, payment, remote upload, production database or external write was performed.

Important acceptance not run: the full unscoped `npm test` and packaging/release builds were not run because this work package is contract ownership/file organization only and its direct behavior, production registry, absence, typecheck/lint and Phase 8 gates were run; packaging and real external operations are outside the authorized M04-B scope.

### Primary Audit

Audit method: `code-review` skill, limited to the M04-B diff and minimum direct closure chain: six new contract modules, deletion of the two legacy modules, production registry assembly, four direct production/composition consumers, direct contract/lifecycle tests, and the module-size baseline.

Invariants audited:

1. Capability/channel/kind/schemaVersion, top-level DTO fields, recursively closed extra-field/version/null/union validation, argument mapping, safe error code/category/retryability/userMessage and projector output are unchanged; the normalized old-vs-new comparison and projector comparison above are the evidence.
2. The registry has one 19-row content-core surface in the former order; production matrix and the absence test close the producer/consumer and legacy-path boundaries.
3. Shared validator/error ownership is singular; domain modules own their DTOs/projectors; the registry is assembly-only; no compatibility alias, re-export, second writer or lifecycle state-machine change was introduced.
4. Direct imports point from each consumer to the owning domain module; preload/bridge/renderer paths and public channel strings are unchanged.

Findings:

| Severity | Source / classification | Evidence | Owner / disposition |
| --- | --- | --- | --- |
| None | No `INTRODUCED_BY_CHANGE`, `CROSS_COMPONENT_INTERACTION`, or blocking `PROCESS_EVIDENCE_GAP` finding | Final manifest equality, projector equality, 17/17 + 65/65 focused tests, 35/35 production matrix, all required gates PASS | No remediation required |

No P0/P1 or acceptance-/persistence-/idempotency-/security-/public-contract-blocking P2 finding exists. The module-size signal is advisory and has a reviewed baseline; it is not a blocking finding.

### Bounded re-audit

Scope was limited to the known Primary Audit invariants, the final import/assembly diff, the deleted-path absence assertion, the final manifest/projector comparison and all direct regression/gate results. It did not reopen M04-A submission ownership or inspect unrelated services. Result: `PASS`; no escalation and no additional finding.

### Closure / handoff

- Implementation/audit/handoff commit: the final single commit with message `refactor: consolidate content-core contract owners`; its immutable hash is recorded by the final Git evidence and final response.
- Final worktree must remain clean; no merge or push performed.

## Integration record

- Main task verified the implementation worktree clean at `b53cb722d17e286c262498a0d12be321926b9751`.
- Main integration branch `codex/article-lifecycle-submission` merged this commit with `--no-ff`; integration merge commit: `505cfbe0f90bffd47d925a112a9c65fdc8c2cc93`.
- The production tree on the integration HEAD matches the M04-B implementation commit; no push or real external operation was performed.
- M04-B is closed. The next permitted work package is M04-C only, after the main task re-verifies the clean integration HEAD.

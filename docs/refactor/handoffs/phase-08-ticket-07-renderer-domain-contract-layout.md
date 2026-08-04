# Ticket 07: Renderer Domain Contract Layout

Status: implementation complete; independent read-only audit and four focused subagent re-verification passes complete with no remaining actionable findings.

Scope: expand the Renderer contract layout without changing preload namespaces, IPC channels, DTO fields, capabilities, feature behavior, or runtime error projection.

## Verification

- `npm test`: 234 test files, 1559 tests, 133 suites; 1559 passed, 0 failed.
- Renderer typecheck, strict bridge typecheck, root lint, Renderer build (2159 modules), focused Ticket 07 tests, and `git diff --check` pass.
- `tests/phase-08-renderer-contract-layout.test.js` now checks the exact 10 non-barrel owner files, all 113 declarations, owner identity, declaration kind, duplicate/unknown declarations, and Renderer bridge boundaries.
- `tests/phase-06-production-caller-inventory.test.js` scans the actual `types/*.ts` owner files instead of the definition-free aggregate.
- The first independent `gpt-5.6-sol` audit found no actionable issue. Four subsequent same-model/medium-reasoning专项复验 identified three test-only P3 coverage defects; the main thread fixed each minimally, and the fourth专项复验 found no actionable issue.
- Repository `format:check` still reports seven unrelated existing files outside this Ticket's production/type/bridge scope; they were not reformatted. Ticket-specific type/bridge and phase-08/phase-06 gate files are Prettier-clean.

No commit or push was performed.

## Layout

The legacy `media-workbench/src/types.ts` is now a one-line type-only barrel. Authoritative declarations live under `media-workbench/src/types/`:

| Domain | Module | Ownership |
|---|---|---|
| IPC | `ipc.ts` | shared wire error and response envelopes |
| Auth | `auth.ts` | Auth state projection |
| Settings | `settings.ts` | AI/platform provider settings and migration status |
| Workspace | `workspace.ts` | bootstrap, runtime diagnostics, invalidation and runtime identity |
| Media | `media.ts` | article, draft, resource and order view data |
| Content | `content.ts` | client, material, question, research and template data |
| Generation | `generation.ts` | batch, task, runtime and generated-article data |
| Platform | `platform.ts` | account, queue, run and task data |
| Publication | `publication.ts` | publication history, submission, attention, removal and management snapshots |
| View | `view.ts` | navigation and legacy mock view aliases |

`types/index.ts` is the internal domain aggregate. It has no definitions and exists only to keep the old barrel removable in Ticket 10.

## Bridge entries

Existing named bridge modules remain the preload namespace adapters. The expand phase adds:

- `bridge/generation.ts`: explicit generation entry, delegating to the existing `content` namespace implementation.
- `bridge/content-removal.ts`: explicit content removal and transaction entry, delegating to the existing `content` namespace implementation.

The delegation is temporary compatibility structure, not a new runtime fallback or dynamic method dispatcher. Ticket 08 owns moving generation/removal implementation behind these entries; Ticket 09 owns remaining platform/media/settings/workspace caller migration; Ticket 10 owns deleting the compatibility re-exports after caller count reaches zero.

## Symbol migration map

| Symbol group | Current owner | Next caller migration | Contract deletion edge |
|---|---|---|---|
| `ContentClient`, `ContentMaterial`, `ContentQuestion`, `ContentResearch`, `ContentTemplate*`, `Doubao*` | `types/content.ts`; `bridge/content.ts` | Ticket 08 | Ticket 10 |
| `GenerationBatch*`, `GeneratedContentArticle`, `GenerationSubmissionHandoff*` | `types/generation.ts`; `bridge/generation.ts` | Ticket 08 | Ticket 10 |
| `ArticleManagementSnapshot`, `ArticleAttention*`, `ArticleRemoval*`, `ContentSubmission*`, `PublicationHistory*` | `types/publication.ts`; `bridge/publication.ts` / `bridge/content-removal.ts` | Tickets 08/09 | Ticket 10 |
| `Platform*`, `AccountProfile` | `types/platform.ts`; `bridge/platform.ts` / `bridge/account-profile.ts` | Ticket 09 | Ticket 10 |
| `MediaType`, `Article`, `Draft`, `MediaResource`, `RealOrder` | `types/media.ts`; `bridge/media.ts` | Ticket 09 | Ticket 10 |
| `AiProvider*`, `PlatformProvider*`, `LegacyProviderSettings*` | `types/settings.ts`; `bridge/settings.ts` | Ticket 09 | Ticket 10 |
| `Workspace*`, `Runtime*` | `types/workspace.ts`; `bridge/workspace.ts` | Ticket 09 | Ticket 10 |
| `AuthState` | `types/auth.ts`; `bridge/auth.ts` | Ticket 09/11 boundary | Ticket 10 only after Auth compatibility decision |
| `IpcError`, `IpcResponse` | `types/ipc.ts`; bridge transport | All domains | Ticket 10 after all bridge callers migrate |

## Remaining legacy callers

The following production files still import the compatibility `types.ts` barrel and are intentionally mapped to the next migration tickets:

- `src/App.tsx`, `src/auth-store.tsx`, `src/article-workflow.ts`, `src/mockData.ts`, `src/navigation-summary.ts`, `src/publication-status.ts`
- `src/components/ArticleEditor.tsx`, `ArticleList.tsx`, `AiProviderSettings.tsx`, `ContentWorkbench.tsx`, `OrdersView.tsx`, `PlatformTaskIndicator.tsx`, `PlatformWorkbench.tsx`, `PreflightModal.tsx`, `ResourceLibrary.tsx`, `Sidebar.tsx`, `MediaThirdPartyIdControl.tsx`
- `src/components/content/AccountProfileSelector.tsx`, `ArticleAttentionDetailDrawer.tsx`, `ArticleAttentionPanel.tsx`, `ArticleGenerationView.tsx`, `BatchGenerationView.tsx`, `CollectionTaskBar.tsx`, `GeneratedArticleEditorPanel.tsx`, `GeneratedArticlesView.tsx`, `GenerationBatchDetail.tsx`, `GenerationSubmissionHandoffDrawer.tsx`, `PublicationHistoryDrawer.tsx`, `QuestionCollectionView.tsx`
- `src/components/settings/HepanProviderSettings.tsx`, `MediaProviderSettings.tsx`, `SettingsOverview.tsx`

The low-conflict generation feature imports now use `bridge/generation.ts` and `types/generation.ts`; platform residue cleanup now uses `bridge/content-removal.ts`. Remaining old imports are intentionally assigned to Ticket 08 or 09. No caller is assigned directly to deletion: all paths point to Ticket 10 only after both migration tickets report zero remaining callers.

## Boundary checks

`tests/phase-08-renderer-contract-layout.test.js` verifies unique symbol ownership, pure barrel content, named bridge entry files, no dynamic method dispatch, and no Renderer bridge dependency on desktop/infrastructure/`ipcRenderer`. `package.json` format coverage includes `media-workbench/src/types/*.ts`.

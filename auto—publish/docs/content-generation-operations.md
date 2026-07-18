# Content Generation Operations

This guide covers single-article and cross-client batch generation. Use
synthetic questions and fixture material for smoke checks. Do not put API keys,
cookies, prompts, or customer-identifying text in source files, logs, docs, or
screenshots.

## Inputs and compatibility

Every generation task must pass two gates: at least one valid first-level client
material and at least one complete GEO research answer. The existing
`clients/`, `research/`, `generated/`, workspace-selection, article, media
submission, platform submission, and export flows remain valid. New stores do
not relocate legacy files.

Client materials are read only from the first level of a client directory:
`.txt`, `.md`, `.markdown`, `.json`, and `.docx`. `questions.json`,
`search_query.txt`, generated articles, and all subdirectories are excluded.
DOCX files are converted by the bundled Mammoth parser without changing the
source file. Users do not need to install Python or MarkItDown. Successful
conversions are cached under the local-state client-material cache using the source hash;
changed files invalidate the cache, and a failed file remains visible with a
safe error and can be retried independently.

## Single article

1. Choose the current client, material files, research answers, platform, and
   template. Expansion is only a preview concern; checkboxes control AI input.
2. Confirm that both input gates pass. Invalid materials or missing research
   prevent the request before any provider call.
3. Generate, edit, and save the article. The saved record contains the actual
   material/research/template snapshots and is readable even if live sources
   later change.

## Batch generation

The batch wizard selects batch customers and cross-platform writing templates.
Each customer is configured with one shared source set, then produces one task
per customer/template pair:

```text
task count = executable customer count × selected template count
```

Customers missing either input gate are shown as excluded with a reason and do
not block other customers. Batch state is persisted under
`data/content-generation-batches/`; the first implementation runs with
`concurrency = 1` and never depends on the renderer staying mounted.

Successful tasks are saved immediately as `generated` (待审核). Failed tasks
can be retried, while successful tasks are never called again. Stop marks the
active task interrupted and leaves not-yet-started work pending. After restart,
the operator explicitly continues pending/failed/interrupted tasks; succeeded
tasks are skipped. Provider configuration changes are surfaced before a
stopped batch continues.

## Review, history, and export

Single save or explicit batch review changes an eligible generated article to
`saved` (已审核). Batch review accepts only checked generated articles with a
non-empty title/body and complete provenance; legacy articles without the
required snapshots remain readable in the legacy ungrouped history but are not
batch-reviewable. Review never submits or exports automatically.

History is scoped to the current client and grouped by `platform + templateId`.
Groups and articles sort by `createdAt` descending; editing or reviewing does
not reorder them. A template rename or deletion does not rewrite the template
snapshot used to explain an older article. Only reviewed/saved articles can be
exported into the existing media or platform submission queues.

## AI provider configuration

Provider settings are application-level and shared across workspaces. The
configuration center stores the API key with Electron `safeStorage` in
application `userData`; the renderer receives only `hasApiKey` and a mask. The
workspace `.env` does not supply provider settings, and the alpha package must
not contain the application configuration or any API key. Explicit operating
system or launch-environment values may override the saved application
configuration and are read-only in the UI.

Paid media API keys and Hepan Cookies are application-level secrets stored in
separate encrypted provider files under Electron `userData`. They must not be
put in a workspace `.env`, content library, Git repository, logs, or package.
Legacy `runtime-config.json` and workspace `.env` values are only reported as
available for import. Import requires an explicit confirmation in Settings;
the old Hepan Cookie file is not deleted automatically. Environment overrides
remain read-only and are never persisted by the application.

Saving, testing, or clearing configuration is local or uses the explicit test
operation; a batch in `running` or `stopping` state blocks those changes.
Provider errors returned through IPC contain only a stable code and safe
message, never credentials, prompts, customer material, absolute cache paths,
or response bodies.

## Acceptance boundary

Automated compatibility, packaging, verifier, lint, and build checks cover the
contract. Real AI calls, online Doubao collection, and real customer data are
outside automated verification and must be performed only in an isolated
manual environment with disposable credentials and fixture content.

## Template discovery and empty-client behavior

The template catalog and the client research list are separate inputs. If
`clients/` is empty, the application still loads and displays valid template
platforms, templates, source labels, revision, and safe diagnostics. It shows
that the workspace has no clients and disables generation; it must not hide the
catalog or pretend that an article can be generated without client material and
research.

After adding or changing a client or template, use the explicit “刷新客户与模板”
action. It rereads clients, catalog, and the selected client's material without
calling AI or the network. The same catalog revision is used by single and batch
generation. A selected template deleted before refresh is cleared with a
message, not silently replaced. A正文-only template derives its name from the
filename stem; optional metadata uses `---` and a half-width colon, for example:

```markdown
---
displayName: 体验笔记
---

正文-only模板的写作指令。
```

`displayName：体验笔记` with a full-width colon is正文, not metadata. Custom
templates and bundled read-only templates are labelled separately. Generation
template platforms are not the same thing as later submission target platforms.

## Review and publication lifecycle

The following stages describe different business boundaries and must not be
collapsed into one global `published` flag:

| Stage | Meaning | Remote call? |
| --- | --- | --- |
| 审核 | An operator accepts the local article; the article becomes `saved`. | No |
| 入队 | A reviewed article is snapshotted for a selected article—target and reserved for execution. | No |
| 提交 | A remote adapter call has evidence that the destination received or accepted the submission; it is `submitted`, not automatically `published`. | Yes |
| 发布 | Remote evidence confirms the selected ordinary platform or media resource published the article; it is recorded per target. | Yes |
| 待确认 | The remote result may exist but cannot be proven locally (`uncertain`), for example after timeout or browser crash. | May have happened |

`queued`, `submitting`, `submitted`, `published`, and `uncertain` block another
attempt for the same article and target. Only a clearly failed remote call may
be retried with another attempt. A remote success followed by a local queue or
archive write failure is not a safe retry: preserve the successful publication
result or require reconciliation before any further action.

Ordinary platform targets are article × platform. Paid media targets are
article × media resource, so one article can proceed for resource A while
resource B remains available. History and duplicate protection use the
target-level publication record; queue files, order JSONL, and `published`
archives are supporting runtime evidence.

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

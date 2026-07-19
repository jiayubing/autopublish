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

### Template selection

Both single and batch selectors consume the same `listCatalog()` result and
`revision`; neither may call a legacy template reader. A selection is resolved
only with `getTemplate({ platformId, templateId })`, so正文-only, v2 optional
metadata, and legacy front matter remain compatible at preflight and execution.

If at least one valid custom template exists, only custom templates are shown
by default. The selector then exposes the default-off `显示内置模板` switch;
when enabled, builtin templates are added with `内置只读` labels. With no valid
custom template, builtin templates are the fallback. This rule and visibility
function are shared by single and batch generation. Platform IDs are stable
technical keys (for example `xiaohongshu`); `platform.json` supplies the
human-facing `displayName` (for example `小红书`). Do not use display names as
lookup keys or silently merge directories with different IDs.

## Batch generation

The batch wizard selects batch customers and cross-platform writing templates.
Each customer is configured with one shared source set, then produces one task
per customer/template pair:

```text
task count = executable customer count × selected template count
```

The initial batch selection is conservative: select only the current executable
customer when one exists; otherwise select no customer. Templates start empty
and must be explicitly selected. “全选客户” and “全选模板” are explicit
actions, not implicit defaults. Each customer shows ready / missing-material /
missing-research status before template confirmation, and excluded customers
include a reason.

Keep the live calculation visible from the customer/template steps:
`executable customer count × selected template count = potential AI calls`.
Before preflight, show the same count and require explicit confirmation. A
configurable threshold (建议 10) triggers a clear cost-risk warning; the
warning does not authorize the run. No template selection means no continuation
to source inspection or provider calls. Preflight and execution must resolve
every selected ID through the catalog interface and reject stale revisions
before any AI request. Error messages should identify the platform/template
IDs without exposing paths, prompts, credentials, or customer content.

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

### History editing and submission recovery

History editing opens an in-place editor beside the list. The list remains
mounted, so filters, expanded groups, selection, scroll position, and the
source-row focus are preserved. Closing, changing articles, changing clients,
switching tabs, and closing the window guard unsaved title/body edits. A
published article is read-only; use `复制为新版本` to create a new generated
article while keeping the original article and publication ledger unchanged.

Submission batches are reconciled against the publication ledger by
`publicationId + attemptId`. `queued` means the remote call has not started and
can be cancelled only when the Markdown and sidecar still match their hashes.
`failed` means the remote call has a definite failure and is not an undo; use
`清理失败队列项` only after the same unchanged-file check. Cleanup removes the
queue copy but keeps the `failed` publication record. `submitting`, `submitted`,
`published`, and `uncertain` are protected; `uncertain` requires existing manual
remote-result reconciliation. Old batches are reconciled lazily and
idempotently. Missing identities, changed files, and sidecar/hash conflicts are
reported for manual handling and are never guessed or deleted automatically.

Platform settings use a patch contract. An omitted field preserves the stored
value; a non-empty replacement changes only that field; an empty optional text
field does not clear an existing value. `clearVendorDir: true` is the explicit
operation that restores the system Python environment. Safe status never
returns Python paths, Cookie values, vendor paths, or temporary Cookie files.
Environment-variable configuration is read-only and is never copied into the
application configuration.

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

### Refresh feedback lifecycle

The explicit “刷新客户与模板” action refreshes workspace sources only. Saving,
reviewing, and completing a batch use separate article or batch-state refreshes
and must not rescan the catalog or show a catalog-refresh success message.
Automatic initial loading does not show a success banner. A manual success
message is transient (2–3 seconds), accessible as status text, and returns to
idle; a new refresh cancels the old timer and unmount cleanup cancels it too.
Failures remain visible and actionable until retry, close, or a later success.

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

### Moving an article to the trash

The history action is **移入回收站**, not permanent deletion. It performs one
impact preview and one confirmation for all selected articles and all ordinary
platform and paid-media targets. The confirmation summarizes queued attempts
that will be cancelled, unchanged failed queue pairs that will be cleaned, and
the fact that publication records remain as audit history.

The operation is all-or-nothing. A `submitting`, `submitted`, `uncertain`,
modified-pair, or identity/hash conflict blocks the whole selection; the
history view does not offer a force-delete escape hatch. A queued attempt may
be cancelled while a batch is running only when its remote call has not begun.
The worker checks the ledger and source article again immediately before the
remote call, so a concurrently trashed article is skipped safely.

The confirmed operation is recorded in a durable removal transaction. Queue
actions are applied first, then all articles are moved, and only then is the
transaction committed. If the application stops midway, startup resumes the
transaction forward and never recreates an attempt already marked `cancelled`.
Transient I/O or lock failures use `pending_auto_recovery` and are retried with
bounded backoff. Identity, hash, active-state, or evaluator conflicts use
`needs_repair`; they are not promised as automatic progress and require the
visible retry/repair action. Legacy `pending_recovery` records are normalized
on startup. Repeated confirmation of the same selection and queue action
fingerprint reuses one open transaction rather than creating another journal.

Status-specific behavior is: `queued` is cancelled when the pair is unchanged;
`failed` is cleaned when the pair is unchanged while its failed ledger record
is retained; `cancelled` and `failed-cleaned` need no queue action; `published`
keeps its evidence; and `submitting`, `submitted`, and `uncertain` are blocked.
Restoring an article never restores a cancelled queue item. The trash has no
automatic expiry. Permanent deletion removes article body/recoverable copies
only; immutable title snapshots, identities, target records, remote links, and
all attempts remain available as read-only publication history.

Queue scanning also marks old pairs whose sidecar source article is already in
the trash as `sourceArticleState: trashed` with a stable reason code. They are
not selectable and the worker refuses them before any adapter call. The
explicit repair flow can cancel unchanged `queued` pairs or clean clearly
`failed` pairs; it does not guess about `submitting`, `submitted`, `uncertain`,
or modified pairs.

The residue repair action has its own busy state and returns `cleanedCount`,
`failedCount`, `remainingCount`, and per-item stable reason codes. A zero-item
or failed cleanup is shown as a diagnostic result, not as a false success.
The dry-run command `node scripts/repair-article-removal-regressions.js
--workspace <workspace> --dry-run` reports only safe identifiers, fingerprints,
states, reason codes, and counts; it never deletes queue files or writes
transactions.

### Hepan article formats and pacing

The Hepan adapter accepts `.md`, `.markdown`, `.txt`, and `.docx`. Node parses
Markdown and text into a title and safe HTML before invoking the Python POST
script. The first H1 (or first non-empty line) is the Markdown title; text uses
the first non-empty line. Raw HTML is disabled and links are restricted to safe
HTTP(S), mailto, or fragment targets. DOCX keeps the existing Python-compatible
path. Markdown/text content is passed through a short-lived, unpredictable
local JSON payload and the payload is removed on success, failure, stop, and
exception; it is never written to the content library or logs. The configured
Python runtime must be 3.10–3.13. Hepan settings first run the no-network
`--validate-payload` self-test before dependency and login checks. Local
payload failures use `HEPAN_PAYLOAD_*` or `HEPAN_PAYLOAD_RUNTIME_FAILED`;
remote request failures use `HEPAN_REMOTE_REQUEST_FAILED`/`REMOTE_REJECTED`,
and uncertain results remain `REMOTE_RESULT_UNKNOWN`.

Hepan `publishIntervalSeconds` is an application setting from 0 through 3600,
defaulting to 30. `HEPAN_PUBLISH_INTERVAL_SECONDS` may provide a read-only
environment override. The interval starts when one Hepan remote call finishes
and ends when the next Hepan call starts; the first and last item do not wait.
Failed and uncertain calls still count. Waiting is cancellable and emits a
countdown heartbeat, and mixed-platform batches throttle only adjacent Hepan
calls. A zero-second setting is allowed but displays a frequency-risk warning.

## 文章管理与需处理中心

内容工作台的“文章管理”只保留六个互斥的派生阶段：`待审核`、`待投稿`、
`已入队`、`已发布`、`失败`和`回收站`。阶段不是新的持久化发布状态，不会覆盖
文章审核状态、批次项或逐目标发布记录。同一篇文章只进入一个阶段；失败阶段可
包含待确认或部分发布，但详情中仍显示每个目标的真实状态。

已发布文章可以确认移入回收站：远端已发布内容不会撤回，发布记录、标题快照和
attempts 保留，本地正文与队列副本清理后恢复也不会自动恢复旧队列。发布结果默认
提供“可移入回收站”入口；自动回收默认关闭，只有用户明确勾选且所有目标 published、
本地归档成功、删除预检通过时才由主进程的 ArticleRemovalService 执行。

“需处理中心”从残留队列、删除事务、结果待确认、明确失败和本地归档失败实时
派生。每项显示稳定业务身份、中文原因、建议动作和允许动作；页面不要求用户
查找或编辑工作区文件。队列主文件和 sidecar 均不存在、且失败记录身份仍匹配
时属于 `both_absent`，可安全完成元数据收尾并保留账本及全部尝试；内容变化、
身份冲突、单文件缺失和不安全路径仍必须停下核对。

“其他平台投稿”只负责执行监控。投稿任务终止后，主进程发布最小化的工作区
失效事件，文章管理、侧栏徽标和投稿列表从同一只读快照重新读取。远端成功但
本地归档失败的项目保留在队列中，显示“远端已发布，本地归档待处理”，只能
重试本地归档，禁止再次发起远端投稿。副本预检命令保持只读：

```powershell
node scripts/repair-article-removal-regressions.js --workspace <副本目录> --dry-run
```

需处理动作由当前事实和领域能力共同计算，不再按 `failed_submission` 类型固定
显示按钮：有合法 batch/pair 的失败项才显示“清理旧队列”；仍存在且已审核的
文章才显示“重新投稿”；已删除且没有残留或开放删除事务的失败记录只保留在发布
历史中。生成态文章只能打开文章或发布详情。点击重新投稿先执行预检，确认后由
ContentSubmissionService 创建新的 batch 和 attempt，不直接拼写队列文件。

需处理快照与工作区使用同一 authoritative revision。投稿、审核、删除事务、队列
清理和发布核对完成后广播失效事件；Renderer 按 scope 合并刷新请求，旧 revision
响应不得覆盖新快照。初始 `idle` 不是投稿任务完成事件，进入“其他平台投稿”也
不会额外启动队列刷新；只有显式手动刷新或带新 `queueRevision` 的 terminal 事件
才刷新一次。

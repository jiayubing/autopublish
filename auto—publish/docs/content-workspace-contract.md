# Content Workspace Contract

This document defines the local contract for GEO research and AI-generated
content. The Electron application owns the workspace. The GEO collector may
write research data into it, but content modules must not depend on a fixed
drive or on the `F:\\携程` project.

## Workspace

For a configured root directory, the content API `getContentWorkspace(root)`
returns only these content paths:

```text
root/
  clients/
  research/
  templates/
  generated/
  published/
  logs/
```

The root may be a temporary directory in tests or the writable runtime
workspace returned by `desktop/runtime-paths.js`.

Client questions and research records are descendants of the content paths:

```text
clients/<client-id>/questions.json
research/<client-id>/<question-id>.json
```

The desktop runtime has additional paths that are not returned by
`getContentWorkspace(root)`. `desktop/workspace-paths.js` derives
`browser/doubao/` as a reserved browser path and
`logs/doubao-diagnostics/` as the diagnostics path. The Playwright runtime
derives its active profile separately as
`work/playwright-cli/profiles/doubao/` through `pwSessionConfig("doubao")`.

The directories under the workspace are runtime data, not application
resources. `clients`, `research`, `generated`, `browser`, `work`, and `logs`
must not be copied into an alpha package. The browser profile and diagnostics
remain outside the packaged application so that an installed app can be
replaced without moving private data.

Content generation adds two private runtime locations:

```text
data/content-generation-batches/
work/client-material-cache/
```

The first stores resumable batch/task state and the second stores versioned
DOCX conversion results. Both are workspace data, never application resources;
they must not be committed, copied into an installer, or included in an article
source snapshot.

The active Doubao login profile is
`work/playwright-cli/profiles/doubao/`. `src/content/doubao-browser-adapter.js`
creates `pwSessionConfig("doubao")`, and `src/core/playwright.js` resolves that
profile below the workspace `work/` directory. `desktop/workspace-paths.js`
also exposes `browser/doubao/` as a workspace path, but the current adapter
does not write the active login profile there; treat it as a reserved path, not
as the location to inspect for a login. Both paths are private and excluded
from alpha packages.

## Questions

Each client owns one `clients/<client-id>/questions.json` file. Its top-level
shape is fixed:

```json
{
  "version": 1,
  "questions": [
    {
      "id": "question-id",
      "text": "A question entered by the operator",
      "enabled": true,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

Question IDs are stable within a client. Text is trimmed and duplicate
questions are compared after collapsing whitespace. A non-empty legacy
`search_query.txt` is imported only when `questions.json` does not exist; the
import is then written atomically to `questions.json` and the legacy file is
not used for later edits. Deleting a question requires confirmation when it
has research attached; existing article source snapshots are not rewritten.

## Client

`Client` identifies a customer and its local knowledge directory.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Stable application identifier. It is not required to equal the directory name. |
| `name` | string | yes | Display name for the customer. |
| `directory` | string | yes | Absolute path under `workspace.clients`. |
| `createdAt` | string | no | ISO 8601 creation time. |
| `updatedAt` | string | no | ISO 8601 last update time. |

Client directory names are intentionally unrestricted apart from filesystem
and security rules. Names such as `xxx`, `xxx餐厅`, and `xxx住宿` are valid.
Empty names, absolute paths, path separators, `.` and `..`, and names that
escape `workspace.clients` are invalid.

## ResearchQuery

`ResearchQuery` stores one search question and the corresponding Doubao
answer collected for a client.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Stable identifier for this research record. |
| `clientId` | string | yes | The owning `Client.id`. |
| `question` | string | yes | The search query sent to Doubao. |
| `answerText` | string | yes | The complete answer text returned by Doubao. Empty answers are not successful research results. |
| `references` | array | yes | Reference records used by the answer. Each item has `title`, `url`, and optional `snippet`. |
| `createdAt` | string | yes | ISO 8601 collection time. |
| `collectionMethod` | string | yes | `automatic`, `manual`, or `legacy`. |
| `collectedAt` | string | yes | ISO 8601 time at which the answer was collected or entered. |
| `updatedAt` | string | no | ISO 8601 last update time. |
| `isAnswerComplete` | boolean | yes | `true` only for a non-empty, complete answer saved to the store. |
| `source` | string | no | Collector/source identifier, such as `doubao`. |

Research is stored as `research/<client-id>/<question-id>.json`. The record
keeps the question text, answer, references, collection method, and timestamps
together so an article can show where each input came from. Automatic and
manual saves use the same research store. A successful re-collection atomically
replaces the current record; a failed re-collection leaves the previous
successful record untouched and must not create an empty answer.

## Browser profile and diagnostics

Doubao uses the dedicated `work/playwright-cli/profiles/doubao/` profile. It is
separate from all publishing sessions and may persist across application
restarts. Treat it as private workspace data: never commit, export, or package
it. If a future adapter is wired to the reserved `browser/doubao/` path, that
path remains private under the same contract.

Collection failures may write a redacted screenshot and structural JSON
summary under `logs/doubao-diagnostics/`. Keep at most the newest 20 diagnostic
attempts, grouped by attempt; do not store cookies, local storage, complete
HTML, or other browser secrets. Diagnostics are also excluded from alpha
packages.

## Template

`Template` describes one platform and one writing scenario. A platform may
have any number of templates.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Stable template identifier. |
| `platform` | string | yes | Target publishing platform, such as `ctrip`. |
| `scenario` | string | yes | Writing scenario selected by the user. |
| `name` | string | yes | Human-readable template name. |
| `body` | string | yes | Template instructions and constraints. |
| `createdAt` | string | no | ISO 8601 creation time. |
| `updatedAt` | string | no | ISO 8601 last update time. |

Templates are selected by `platform` and `id`. Industry names must not be
hard-coded as the template taxonomy.

## GeneratedArticle

`GeneratedArticle` records an AI generation result and its provenance.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Stable article identifier. |
| `clientId` | string | yes | The owning `Client.id`. |
| `researchQueryId` | string | yes for legacy records | The single `ResearchQuery.id` used for generation. |
| `researchQueryIds` | array | yes for new records | One or more `ResearchQuery.id` values selected for generation. |
| `researchSnapshots` | array | yes for new multi-answer records | One source snapshot for each ID, in the same order. |
| `platform` | string | yes | Target publishing platform. |
| `scenario` | string | yes | Selected writing scenario. |
| `templateId` | string | yes | The `Template.id` used for generation. |
| `title` | string | yes | Generated article title. |
| `content` | string | yes | Generated article body. Empty content is invalid. |
| `status` | string | yes | Generation state, such as `generated`, `draft`, or `published`. |
| `source` | object | yes | Participation flags for generation inputs. |
| `createdAt` | string | yes | ISO 8601 generation time. |
| `updatedAt` | string | no | ISO 8601 last update time. |

`GeneratedArticle.source` must contain these boolean fields:

```json
{
  "client_material": true,
  "doubao_answer": true,
  "references": true,
  "template": true
}
```

The flags state whether each input was actually provided to the generation
prompt. They are provenance metadata, not a claim that the input was factual
or authoritative. Missing input must be represented as `false`; it must not be
silently invented by a later module.

For a multi-answer article, `researchQueryIds` preserves the selected order and
`researchSnapshots` preserves the source used at generation time. Each snapshot
contains `questionId`, `question`, `answerText`, `references`, `collectedAt`,
and `collectionMethod`. This keeps the article auditable even if the live
research record is later refreshed or deleted. Older articles may retain the
single `researchQueryId` field and remain readable.

New articles also store the selected client-material snapshots, the complete
template snapshot, and their generation batch/task IDs. A generated article is
initially `generated` (待审核); it becomes `saved` (已审核) only after an
explicit single-article save or batch review. Review does not submit or export
the article automatically. The review status is part of the article contract.
Legacy articles without these new snapshots remain
readable in an ungrouped legacy history group, but they cannot pass batch review
until their required provenance is present.

The existing `research/`, legacy article, workspace-selection, media
submission, platform submission, and export paths remain the compatibility
boundary. New stores add data beside those paths and do not move old files.

## Boundary Rules

- Content modules receive a workspace root or workspace object through their
  public API; they do not assemble paths from a hard-coded project directory.
- Client directory traversal is rejected before any file operation.
- Research answers and references remain separate from generated article text
  so that provenance can be displayed and audited.
- The existing publishing workflow consumes generated article content; it does
  not own research or template storage.
# Generated article export lifecycle

Saved generated articles may be exported only to the `media`, `lieju`, `toutiao`, or `hepan` input queue after explicit manual confirmation. Export is queue creation only: it never publishes or opens a browser. Operators must still confirm the queued article in the submission workbench.

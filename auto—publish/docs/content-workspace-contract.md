# Content Workspace Contract

This document defines the local contract for GEO research and AI-generated
content. The Electron application owns the workspace. The GEO collector may
write research data into it, but content modules must not depend on a fixed
drive or on the `F:\\携程` project.

## Workspace

For a configured root directory, the content workspace exposes these paths:

```text
root/
  clients/
  research/
  templates/
  generated/
  published/
  logs/
```

All paths are derived from the configured root by `getContentWorkspace(root)`.
The root may be a temporary directory in tests or the writable runtime
workspace returned by `desktop/runtime-paths.js`.

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
| `source` | string | no | Collector/source identifier, such as `doubao`. |

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
| `researchQueryId` | string | yes | The `ResearchQuery.id` used for generation. |
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

## Boundary Rules

- Content modules receive a workspace root or workspace object through their
  public API; they do not assemble paths from a hard-coded project directory.
- Client directory traversal is rejected before any file operation.
- Research answers and references remain separate from generated article text
  so that provenance can be displayed and audited.
- The existing publishing workflow consumes generated article content; it does
  not own research or template storage.

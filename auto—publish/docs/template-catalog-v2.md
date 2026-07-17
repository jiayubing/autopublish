# Template catalog v2

The content generator discovers templates from the current content library and
bundled read-only resources. The generator's writing platform is separate from
the platform used later to submit an approved article.

## Smallest template

Create a directory and a Markdown file. The file may contain only non-empty
plain-text instructions:

```text
templates/
  new-platform/
    first-template.md
```

The catalog derives `platformId = new-platform` and
`templateId = first-template` from the path. No front matter is required.
Refresh templates in the single or batch generation view after adding or
editing a file.

## Optional metadata

Front matter is optional. When present, it may contain only approved scalar
fields such as `displayName`, `description`, `scenario`, `name`, `order`, and
`enabled`, with strict types. A sibling `platform.json` may provide platform
`displayName`, `description`, and integer `order`; without it the directory
name is used as the display name.

Template bodies are plain-text instructions. They cannot execute JavaScript or
shell commands, include arbitrary files, or access paths outside the template
root. A malformed or duplicate template is reported in catalog diagnostics;
valid templates on other platforms remain usable.

## Compatibility and history

Legacy `platform/scenario/name` files are normalized into the same catalog DTO.
Scenario and display name are optional generation metadata; the body, one valid
client material, and one valid research answer remain required. The catalog
returns a revision derived from template identity, body hashes, and platform
metadata.

Generated articles save the complete template snapshot and body hash. Updating
or deleting a live template therefore never rewrites a historical article. If
the selected template was deleted, history displays it as a read-only
“历史模板（已删除）” entry and continues to use the saved snapshot.

## Generation versus submission

“生成模板平台” describes the writing instructions selected for AI generation.
“投稿目标平台” describes an adapter that can accept an approved article from
the submission queue. The latter is discovered from
`listContentSubmissionPlatforms()` and is not a fixed `EXPORT_TARGETS` list.
Adding a template does not make a submission adapter available, and adding an
adapter does not require a generation template.

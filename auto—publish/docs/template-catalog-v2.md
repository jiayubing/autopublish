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

## 正文-only 模板与显示名称

下面是合法的正文-only 模板：整个文件都是写作指令，名称由 Markdown
文件名 stem 派生；例如 `templates/xiaohongshu/custom.md` 显示为
`custom`。正文-only 模板无需 front matter，但正文必须非空。

需要覆盖派生名称时，使用 `---` 包裹的 front matter，并在 `displayName`
后使用半角冒号：

```markdown
---
displayName: 体验笔记
---

请将以下素材整理为一篇体验笔记。
```

`displayName：体验笔记` 中的冒号是全角字符，不是元数据语法，会被当作
正文；此时显示名仍来自文件名。只有语法和值都有效时，`displayName` 才
覆盖派生名称。

## 空客户与显式刷新

模板目录发现与客户资料加载相互独立。即使 `clients/` 为空，仍显示有效的
内置和自定义模板、平台、来源标记、revision 及安全 diagnostics；但由于
生成仍需要客户、第一层有效资料和研究答案，生成按钮必须禁用，不能因空客
户而隐藏模板目录。

界面应提示操作员在 `clients/<客户名称>/` 第一层添加资料，然后点击“刷新
客户与模板”。刷新会在不重启应用的情况下重新读取客户、模板和当前客户资
料，不调用 AI 或外网；单篇和批量生成使用同一 catalog revision。删除当前
模板后清空选择并提示，不静默换选。第一版使用显式刷新，不使用文件 watcher。

界面标签中，“写作模板平台”和“写作模板”表示生成指令；“投稿目标平台”
表示后续投稿 adapter。自定义模板标记“自定义”，内置模板标记“内置只读”。

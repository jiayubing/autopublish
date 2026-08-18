# AutoPublish

AutoPublish is an Electron application for local content research, generation,
publication preparation, platform workflows, and paid-media workbench tasks.
The portable content workspace is selected explicitly and remains separate
from application configuration, browser state, logs, caches, credentials, and
the installed package.

> **阅读边界：** 本文是应用入口和命令索引。局部任务只读取文件头及与任务直接相关的命令/章节；详细阅读边界以本目录 `AGENTS.md` 和根 `docs/AI-ENTRY.md` 为准。

局部 Agent 规则见本目录的 `AGENTS.md`；独立鉴权服务的规则见
`auth-server/AGENTS.md`。局部任务不需要读取整个仓库的生命周期历史。

## Engineering Commands

Run commands from this directory.

```powershell
npm test
npm run test:phase-08:gates
npm run lint
npm run typecheck:main
npm run typecheck:renderer
npm run typecheck:bridge
npm run format:check
npm run build:renderer
npm run build:preload
```

The authoritative business glossary is `../CONTEXT.md`, and the current article
lifecycle and submission workflow are specified in
`../ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md`. Historical pre-refactor material
under this subproject is not an implementation source.

Migration, recovery, release, signing, installer rollback, real account/TLS
checks, external E2E, and real Auth recovery remain owner-controlled actions
that require dry-run or explicit execution confirmation. Completed refactor
branch plans and handoffs are historical Git evidence, not current operating
instructions.

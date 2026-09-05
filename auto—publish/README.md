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

### 日常测试与完整验收

`npm test` 运行核心 GEO 行为；提交前再运行 `npm run test:integration`。
`npm run test:maintenance` 单独运行迁移、容量、诊断及静态分析器测试。
`npm run test:release` 是发布测试组，不包含 build 或真实外部验收。
`npm run test:all` 保留全量执行；`npm run test:discover` 始终列出全量文件。

测试选择的唯一配置是 `scripts/test-suites.json`：明确列出 core、maintenance、release，
其余自动归入 integration，新增测试不会因遗漏分类而消失。任何 profile 都可附加
`-- --list` 查看实际集合。缺失文件或重复分类会报错。

release/all 需要 Windows、Playwright Chromium、可用 renderer 构建以及已构建的
unpacked 应用；Electron 焦点测试需 `RUN_ELECTRON_FOCUS_TESTS=1`，打包导航测试需
`RUN_UNPACKED_NAVIGATION_SMOKE=1` 和 `AUTO_PUBLISH_UNPACKED_EXECUTABLE` 指向测试产物。
这些测试使用合成 fixture；不以跳过代替发布验收。未满足前置条件时，跳过会使执行器返回失败。

分组计时写入 `build/test-results/<suite>-timings.json`，不会覆盖全量
`build/evidence/root-test-timings.json`。无参数执行 `node scripts/run-tests.js` 仍是全量，
原 CI 的 `test:desktop-core` 及证据脚本保留原语义；它不等于日常 core 组。

Run commands from this directory.

```powershell
npm test
npm run test:integration
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

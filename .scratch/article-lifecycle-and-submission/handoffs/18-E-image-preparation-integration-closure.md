# 18-E — 图片准备 Integration / Audit / Closure Handoff

## 状态与 provenance

- 工作包：`18-E-image-preparation-integration-closure`。
- 开始 integration HEAD：`900a6ff09d7b31a06b529a54db9f622ed744e011`（18-D closure，`codex/article-lifecycle-submission`）。
- 本 handoff 和修复进入当前 closure commit；最终 object id 以 `git rev-parse HEAD` 为准。
- 18-E 的 combined Primary Audit、blocking remediation、bounded closure re-audit 和最终 clean-HEAD gate 均已完成；18-E=`COMPLETE`，Wave 12=`COMPLETE`。
- 未执行真实登录、图片上传、发布、付费、取消、订单核对或生产迁移。Wave 13 平台探索仍须逐平台获得明确授权。

## Wave 12 集成结论

- `imageCount` 的唯一持久事实仍在 OperationalStore 的 queue-group projection：旧组迁移为 `0`，新组默认 `1`，UI/IPC/preload/bridge 只映射这个 owner 的配置和更新结果。
- 图片候选仅来自客户专用 `images` 目录；客户隔离、路径安全、缺失/损坏/扫描故障的 best-effort 降级均保留。claim/prepare 时每篇独立随机，同篇不重复、跨篇允许复用，未新增“已使用图片”事实、第二图片库或缓存。
- prepare seam 仅接收进程内窄 `imagePlan`。可恢复的图片问题只减少图片至纯文本，不能把文章或组转为失败/暂停；边界前合同错误不开始远端正文投稿，边界后故障仍如实为 `uncertain`，不重投正文。
- 当前三个 adapter 继续只产生 `text_only` V1 evidence，`decisionKind=initial`；没有图片 decision flow、retry/replace UI、通用布局 owner、平台 DOM/Python 或真实上传实现。19–21 仍是独立平台 gate。

## Combined Primary Audit

**Scope：** 18-A–D 的 queue `imageCount` / 旧组迁移、application 与 Renderer 配置、客户专用目录与随机计划、prepare seam、adapter 二参兼容、V1 evidence 及 08/09 submission boundary。

**Checked invariants：**

- 队列配置、迁移、重启与唯一 writer；0/1/5、`N>M` 与跨客户隔离。
- claim-time 随机而非入队随机；同篇无重复、跨篇可复用；目录缺失、损坏文件和扫描异常均保持文字主链。
- prepare 只在账号核验后、remote submission 开始前调用一次；account/正文/平台错误与图片可恢复错误分类不混淆。
- V1 公开 evidence、`decisionKind`、unknown/retry 安全和既有 08/09/25-C 纯文本调用链没有扩张或回归。
- IPC、preload、bridge、Renderer 只做类型/配置映射，不拥有图片计划或发布状态机。

初始 combined audit 结论为 `PASS`，没有 P0/P1 或直接阻塞 acceptance 的 P2。

## Final-gate finding remediation 与 bounded re-audit

1. `P1 / INTRODUCED_BY_CHANGE`：18-C 新增的 `clientImageDirectoryName: "images"` 是目录名元数据，但 workspace bootstrap 将 paths object 的所有字符串当成绝对工作区目录，导致新 workspace 初始化把该名称解析为工作区外路径并返回 `WORKSPACE_PATH_FORBIDDEN`。
   - 修复：`desktop/workspace-bootstrap-service.js` 在收集和创建工作区目录时排除该明确元数据字段；其余真实路径仍执行 workspace-contained、非链接、目录类型检查。
   - 回归：空工作区成功创建而不在进程工作目录创建 `images`；existing/nonempty、link/non-directory 拒绝、初始化 rollback、保存失败、重启失败和并发选择全部通过。
2. `P2 / PROCESS_EVIDENCE_GAP`：workspace bootstrap 的两处异步并发测试循环只 `await Promise.resolve()`，持续占用 microtask queue，完整 runner 无法进入 async relaunch 或 timeout。
   - 修复：测试轮询改为 `await new Promise(setImmediate)`，让事件循环推进；不改变生产语义或超时/并发断言。
3. `P2 / EXPOSED_PREEXISTING`：默认 `npm test` 会把显式 opt-in 的 Windows Electron 焦点 suite 记为 skipped，而 runner 按合同将 skip 视为失败。`RUN_ELECTRON_FOCUS_TESTS=1` 已单独通过并用于最终全量 gate，得到零 skip 的真实 Electron 验证；未降低 runner 的 fail-closed 规则。

**Bounded re-audit scope：** 仅复核上述 workspace 路径过滤和测试调度 diff、其直接安全/rollback/并发调用链，以及 Wave 12 组合矩阵和 final gates。`clientImageDirectoryName` 仍是固定相对名称而非可写路径；没有改变公共 schema、生命周期 owner、事务边界或远端副作用边界。无新 finding，结论 `PASS`。

## 验证 evidence

在 `auto—publish/`，Node `v24.16.0`、npm `11.13.0`，实际执行：

```text
node --test --test-force-exit --test-concurrency=1 tests/workspace-bootstrap-service.test.js
# 34 passed, 0 failed, 0 skipped

RUN_ELECTRON_FOCUS_TESTS=1 npm test
# 258 files; 1885 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo
# lifecycle=CLOSED; allFilesReported=true; 555898 ms

npm run lint
npm run typecheck:renderer
npm run typecheck:bridge
npm run typecheck:main
npm run build:renderer
npm run build:preload
# all PASS

git diff --check
# PASS
```

此前 18-E 定向矩阵也已通过：图片库/随机/迁移/queue owner（75）、18-B 与 IPC/bridge/preload/production fixture（72）、prepare/uncertain/25-B/25-C（84）、Renderer 图片配置交互（9），以及 Phase-08 static gate（5/5）。

`npm run format:check` 仍报告 12 个既有未格式化文件。唯一与 Wave 12 相邻的 `desktop/composition/workspace-runtime-composition.js` 在 18-D 前的 `900a6ff^` 已失败；其余均在本 Ticket 之外。因此它是 `P3 / EXPOSED_PREEXISTING` 的 format maintenance debt，不阻塞本 closure，也没有进行无关整文件格式化。

## Owner / file map

- queue image-count fact / migration：`src/infrastructure/operational-store/internal/operational-store-*`。
- customer image path policy and candidate scan：`src/infrastructure/workspace/storage-paths.js`、`src/content/client-image-*`。
- plan composition / best-effort prepare：`desktop/composition/workspace-runtime-composition.js`、`desktop/services/regular-image-plan-service.js`、`desktop/services/regular-platform-preparation-port.js`。
- platform protocol mapping：三个 normal adapter 与禾畔 wrapper；它们仍不实现图片传输。
- workspace initialization boundary remediation：`desktop/workspace-bootstrap-service.js`；回归在 `tests/workspace-bootstrap-service.test.js`。
- evidence / schedule：本 handoff 与 `ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md`。

## 收口与后续

- 本 Wave 所有 `18-0 → 18-E`、combined audit、remediation、bounded re-audit 与 final clean-HEAD gate 已闭合，Wave 12 可标记 `COMPLETE`。
- 停止于 Wave 12；不得自动进入 19–21。平台图片上传能力、真实带图投稿和任何真实账号/付费操作都尚未验证或授权。

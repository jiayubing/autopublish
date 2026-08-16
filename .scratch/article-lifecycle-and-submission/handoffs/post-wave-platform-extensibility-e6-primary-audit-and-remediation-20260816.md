# Post-Wave E6 Primary Audit and Remediation Handoff

**工作包：**`E6 — Combined audit 与 closure`

**当前结论：**`COMPLETE`。E1～E5 combined Primary Audit 及 bounded re-audit 已完成；final full gate 暴露的三个 process-evidence gap 也已按现行 owner/contract 收敛。E6 implementation 已提交为 `e0a7c8078d9152792a2db52d130de6b26243128d`，provenance 与 final clean-gate HEAD 为 `e49b9b2f547a3775e1c88c77d6093168fe28ab0a`。clean-HEAD full test 与 production package smoke 均 `PASS`，无 remaining blocking/deferred finding。

## Source state and scope

- Base HEAD：`89c02ae18ab5f15c836738d003346c74ba518228`（E5 provenance docs commit）。
- 审计范围：`7747e64743ad3441097df1294874bc120772a1ad...89c02ae` 的 E1～E5 production/contracts/tests/package/docs，以及 E6 remediation dirty diff。
- 审计边界：`PlatformDefinitionV1` / loader、窄 consumer ports、特殊 contribution、图片 selection/read/delivery、reference fixture、Renderer projection、external-host policy、worker/session cleanup、package contracts 与直接普通投稿/uncertain 回归；不重审已完成历史 Wave。
- 未修改 schema、生命周期/订单/attention/publication writer、事务边界、远端副作用语义或公开产品路线。

## Primary Audit findings

### F1 — P2 / `INTRODUCED_BY_CHANGE` / blocking

`src/core/platforms.js` 的内置 module discovery 在逐平台 normalization/quarantine 之前一次性执行 `require`。任一启用模块缺失或模块顶层抛错会中断整个 loader，使其他合法启用平台也不可用，违反 E1 的 per-platform fail-closed 与安全诊断合同。

Remediation：内置 module load 改为逐 ID 隔离；失败模块只产生 allowlisted `PLATFORM_MODULE_LOAD_FAILED` 诊断并被 quarantine，其他合法平台继续进入 exact definition/port validation。新增缺失 `missing-module` 与合法 `toutiao` 并存的公开 loader 回归。

### F2 — P2 / `CROSS_COMPONENT_INTERACTION` / blocking

`settingsContribution.createSettingsAdapter()` 的返回 adapter 未绑定 definition identity。错误 special contribution 可返回另一平台 ID，并在 settings service 的 Map projection 中覆盖其 adapter，而不是在 composition 前 fail-closed。

Remediation：normalized settings contribution 在工厂返回边界验证 adapter 为对象且 `adapter.id === definition.id`，否则抛稳定 `PLATFORM_PORT_INVALID`。新增 contribution 冒充 `media` 的回归测试。

除 F1/F2 外无 P0/P1、无直接影响当前 acceptance/owner/host/path/uncertain/public contract/package 的 P2，无 deferred P2/P3。

## Final-gate findings and remediation

### F3 — P2 / `PROCESS_EVIDENCE_GAP` / blocking

Phase 8 `src-to-desktop` 依赖方向门禁没有表达 E3 已冻结的具名 optional settings contribution 边界，因而拒绝 Hepan/Media platform module 对原 settings application-service owner 的两个注册入口。这不是新的业务依赖路线，而是 final architecture evidence 未与 E3 合同同步。

Remediation：`src-to-desktop` 继续默认 fail-closed，仅为 `src/platforms/hepan/platform.js` 和 `src/platforms/media/platform.js` 各保留 1 条 bounded allowlist；回归测试冻结文件与数量，并验证其他 `src → desktop` 依赖仍被拒绝。未移动 settings owner，未建立新 registry/facade。

### F4 — P2 / `PROCESS_EVIDENCE_GAP` / blocking

Renderer queue lifecycle fixture 在 E2 删除 Renderer 平行 display-name map 后仍提供空 `queue.platforms`，却继续期待“头条”标签；因此图片控件已正常显示，但无障碍名称是 fallback `toutiao`，导致 stale locator 超时。

Remediation：fixture 通过现行 queue/platform definition projection 提供 `{ id: "toutiao", displayName: "头条" }`，继续以公开数据流验证 capability-driven image UI；未修改 production Renderer。

### F5 — P2 / `PROCESS_EVIDENCE_GAP` / blocking

Workspace bootstrap junction test 仍把 E2 已退役的 `.autopublish/input/lieju` 和 `.autopublish/input/toutiao` 当作当前 workspace owner 会创建的路径。现行 `createWorkspacePaths` 已不返回这两个字段，初始化器也不读写这两条路径，故该断言与当前 owner 不一致。

Remediation：用例改为对所有当前 **owned** AutoPublish directories 执行 junction fail-closed 矩阵，嵌套 input 仅保留现役 `.autopublish/input/media`。生产 workspace path/safety 代码未改变。

F3～F5 都未修改 schema、事实 writer、事务、不确定结果或远端副作用边界，未触发 audit escalation。定向回归与最终 full gate 均通过，无 remaining blocking/deferred finding。

## Bounded re-audit

只复审 F1/F2 修复 diff、definition/loader、settings contribution 直接调用方及其组合回归：

- 缺失内置模块只产生一个安全诊断，未包含供应商错误、绝对路径、secret 或正文；合法平台仍正常装载。
- duplicate definition、missing/extra/undeclared port、disabled module、runtime isolation 原不变量继续通过。
- settings contribution 无法改变 definition identity；现有 Hepan/media adapters 仍以各自 definition ID 装配。
- 未新增 compatibility facade、第二 registry、平台 ID 分支、事实 writer、retry 或远端 transport。
- 修复没有修改公开 schema、业务状态机、事务或副作用边界，不触发扩大审计。

结论：两个 blocking findings 均关闭，bounded re-audit `PASS`。

## Validation on the final dirty implementation source state

在 `auto—publish/`、HEAD `89c02ae` 加 E6 remediation dirty diff 上实际运行：

1. E1～E5 combined exact matrix（28 个测试文件，覆盖 definition/loader/reference、account/session/settings/workbench、worker、普通 outcome/uncertain、图片、workspace、host policy、package verifier、article/submission center 与 production IPC）：`204 passed / 0 failed / 0 skipped`。
2. `npm run test:packaging`：`49 passed / 0 failed / 0 skipped`。
3. `npm run typecheck:main`、`npm run typecheck:bridge`：PASS。
4. `npm run build:renderer`：Renderer TypeScript lint 与 Vite production build PASS；仅有既有 chunk-size warning。
5. `npx eslint src/core/platforms.js tests/platform-definition-loader.test.js`：PASS。
6. `git diff --check`：PASS。

发现并撤除无关整文件格式化后，已在恢复既有排版的最小 production/test diff 上重新运行 owner test 与上述 204-test combined matrix；本节不复用任何较早 source state 的结果证明当前实现。

## Final full gate and closure

- `RUN_ELECTRON_FOCUS_TESTS=1 npm test`：收集 267 个测试文件，`1935 passed / 0 failed / 0 skipped`；runner lifecycle `CLOSED`、`allFilesReported=true`、`noSkippedTodo=true`。
- `npm run pack:production:smoke:dirty`：PASS；production directory package、Renderer build/typecheck、preload build/sandbox、artifact manifest、Playwright runtime、migration CLI、workspace schema/storage boundary、package/contract absence 均通过。Hepan Python 为 `SKIPPED_OPTIONAL (optional-python-not-supplied)`，符合本地合成 smoke 合同，不代表真实河畔验收。
- final-gate remediation 定向验证：`renderer-platform-queue-refresh-lifecycle` `3/3`；`workspace-bootstrap-service` `34/34`；`phase-08-cleanup-gates` `5/5`；dependency direction report `PASSED`。
- 在 clean HEAD `e49b9b2f547a3775e1c88c77d6093168fe28ab0a` 上再次运行 `$env:RUN_ELECTRON_FOCUS_TESTS='1'; npm test`：收集 267 个测试文件，`1935 passed / 0 failed / 0 skipped`；runner lifecycle `CLOSED`、`allFilesReported=true`、`noSkippedTodo=true`。
- 同一 clean HEAD 上运行 `npm run pack:production:smoke`：PASS；clean-build/manifest 均绑定 `e49b9b2`，production directory package、Renderer build/typecheck、preload build/sandbox、artifact manifest、Playwright runtime、migration CLI、workspace schema/storage boundary、package/contract absence 均通过。Hepan Python 为 `SKIPPED_OPTIONAL (optional-python-not-supplied)`。
- 最终 `git diff --check` PASS，构建后 `git status --short --branch` 仍为 clean `codex/jiagou`。
- 未执行真实登录、投稿、图片上传、付费、取消、订单核对、生产数据库或迁移；这些操作未授权且不属于本计划自动 gate。
- E6 已满足计划完成定义并停止；未 merge 或 push。

## Git state

- Implementation commit：`e0a7c8078d9152792a2db52d130de6b26243128d`（base `89c02ae18ab5f15c836738d003346c74ba518228`）。
- Provenance/final clean-gate HEAD：`e49b9b2f547a3775e1c88c77d6093168fe28ab0a`。
- 本 closure record 与计划的 `COMPLETE` 状态由独立 docs-only commit 固化；该提交不修改 production、schema、tests 或 gate，不使 `e49b9b2` 的 clean-gate evidence 失效。
- 无已知无关用户改动；未 merge/push。

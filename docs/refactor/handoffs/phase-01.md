# 阶段01交接：领域契约与目标module骨架

## 1. 状态

- 状态：COMPLETE
- 开始分支与commit：`codex/refactor-program` / `926723f076cd1d8c88beb35695567bfb74df6639`
- 当前分支与commit：`codex/refactor-program` / `027e9f88e00cb206669c2490cec9fcad7e6a47ad`（`refactor(phase-1): establish domain contracts`）；本交接的SHA回填将由紧随其后的docs收口commit固化。
- 工作区状态：Phase 01代码、测试、配置、ADR与初始交接已由里程碑commit固化；仅本次docs收口回填待提交，无用户无关改动。
- 执行日期与环境：2026-07-24 Asia/Shanghai；Windows 11 build 26200；Node 24.16.0；Electron 43.1.1。

## 2. 已完成结果

- `src/domain/index.js` 是 Phase 1 identity、target、publisher outcome、safe error 和 DTO validator 的唯一入口。
- 普通平台 target key 现在固定为 `platform:<platformId>:account:<accountProfileId>`；媒体为 `media-resource:<mediaResourceId>`；例如 `platform:toutiao:account:account-1` 与 `media-resource:resource-1`。
- 缺失账号的旧普通平台记录固定为 `legacy-unknown-account`，target key 为 `platform:<platformId>:legacy-unknown-account`，且 `autoExecutable:false`。
- `published` 和 `submitted` 必须具有与当前 article、target、attempt及普通平台账号绑定的最小远端证据；`failed`/`uncertain`只能携带安全错误；unknown fields、Cookie、stack、路径和未知状态均被拒绝。
- `desktop/composition/phase-01-composition.js` 仅供测试组装注入的 workflow skeleton，`desktop/main.js` 和 `desktop/workspace-runtime.js` 不引用它，因此没有第二生产runtime或writer。

## 3. 权威interface与schema

| 名称 | 文件 | Caller | 不变量/错误模式 |
|---|---|---|---|
| Domain public contract | `auto—publish/src/domain/index.js` | Phase 1测试、worker smoke；Phase 2应从此入口消费 | 不混用nominal identity；无路径/Node/Electron对象 |
| Publication target | `auto—publish/src/domain/publication-target.js` | future OperationalStore/Workflow | 普通target账号感知；legacy未知账号不可自动执行 |
| Publisher contract | `auto—publish/src/domain/publisher-contract.js` | fake与未来platform adapter | outcome闭集；published/submitted证据绑定；uncertain阻断自动重试 |
| Safe error/DTO | `auto—publish/src/domain/safe-operational-error.js`、`dto.js` | IPC/worker future adapter | 版本1、闭集字段、无敏感信息 |
| Renderer DTO types | `auto—publish/media-workbench/src/contracts/phase-01-domain.ts` | renderer bridge type-only export | 不含Node implementation |
| Composition ports | `auto—publish/desktop/composition/phase-01-composition.types.ts` | strict main typecheck | 后续OperationalStore port仅在Phase 2实现 |

Schema版本：无。没有创建 workspace SQLite、表、migration或持久writer。

## 4. Production调用图

```text
desktop/main.js -> desktop/workspace-runtime.js -> existing production services/writer

Phase 1 test-only:
desktop/composition/phase-01-composition.js
  -> src/application/publication-workflow.js (throws until Phase 3)
  -> injected future OperationalStore + Publisher + clock
```

唯一生产runtime仍是 `desktop/workspace-runtime.js`；唯一现有writer未改动。没有外部平台、扣费系统或真实workspace调用。

## 5. 修改文件

- 本阶段新增：`auto—publish/src/domain/`、`src/application/publication-workflow.js`、`desktop/composition/phase-01-*`、`desktop/worker/phase-01-contract-smoke.js`、`media-workbench/src/contracts/phase-01-domain.ts`、`tests/phase-01-*.test.js`、`tsconfig.phase-01-main.json`、`docs/adr/0005-phase-01-main-process-type-strategy.md`、本交接。
- 本阶段修改：`auto—publish/CONTEXT.md`、`media-workbench/src/bridge/publication.ts`、`package.json`、`docs/refactor/13-progress-ledger.md`。
- 本阶段删除：无。
- 用户已有但未触碰：原工作区历史文档删除、无关未跟踪文件、真实内容库、Cookie、API key和生产账号。

## 6. 已删除旧路径

无。Phase 1不切换production caller、writer或platform adapter；旧target的迁移由Phase 2一次性导入处理。

## 7. 数据与迁移

- Schema版本：无。
- Dry-run fixture：不适用；本阶段禁止SQLite和用户数据迁移。
- 正式迁移演练：不适用；未选择、复制、打开或覆盖真实内容库。
- Backup/restore：不适用；没有创建或恢复任何备份。
- 冲突/人工项：Phase 2须将无账号的旧平台记录导入`legacy-unknown-account`，不允许自动执行。
- 回滚结果：不适用；没有持久化变更。回滚策略由Phase 2按整库快照验证，不让旧writer解释部分新schema。

## 8. 测试证据

| 命令 | 结果 | 测试数量 | Skip | 环境/fixture |
|---|---|---:|---:|---|
| `node --test tests/phase-01-domain-contracts.test.js tests/phase-01-architecture.test.js` | 通过 | 7/7 | 0 | Node，本地fake publisher与只读adapter加载，无远端调用 |
| `npm test` | 通过 | 178测试文件 | 0 | 默认临时/合成fixture；新增Phase 01 tests被默认发现 |
| `npm run test:auth` | 通过 | 16/16 | 0 | auth隔离测试 |
| `npm run lint`、三个typecheck、`npm run build:renderer`、`npm run format:check` | 通过 | — | — | strict renderer/main contracts及Vite build |
| `npm run test:links` | 通过 | 172/172 | 0 | 本机链接安全fixture |
| `npm run test:packaging` | 通过 | 33/33 | 0 | source/desktop package contract |
| `npm run pack:smoke` | 通过 | — | — | 非签名 `electron-builder --dir`；已检查制品含`src/domain/index.js`与worker smoke |

故障注入：identity非法/跨kind、target缺账号或额外字段、旧unknown账号、outcome证据缺失、error敏感字段、未知DTO版本均稳定fail-closed；production reference static check确认新composition没有进入main/runtime。

## 9. 偏差与决定

- 相对阶段计划的偏差：未改变旧platform adapter；仅加载头条、列举adapter的导出面进行runtime compatibility fixture验证，未调用其发布、登录或网络方法。
- 更新的CONTEXT/ADR：`auto—publish/CONTEXT.md`明确账号感知target与legacy语义；ADR-0005记录“runtime validators + strict renderer/main contracts”的渐进类型策略。
- 为什么没有扩大interface：OperationalStore、PublicationWorkflow真实协调、IPC production adapter和platform implementation均是后续阶段的唯一owner；Phase 1骨架不可透传旧runtime。

## 10. 未完成与阻塞

- 代码未完成：无，Phase 1完成条件均满足。
- 自动验证未完成：无；full package smoke已运行。生产签名/发布不在本阶段范围。
- PENDING_HUMAN：无；真实内容库迁移授权属于Phase 2开始条件，未在本阶段执行。
- 触发的停止条件：否。

## 11. 下一任务入口

- 必读文件：总纲、目标架构、执行协议、账本、本交接和`05-phase-02-operational-store.md`。
- 首个production symbol：`auto—publish/desktop/main.js#createWorkspaceRuntime`；不得在Phase 2前另建runtime。
- 首个失败测试：Phase 2应先为OperationalStore空库/schema/dry-run/rollback写红测；不得复用或修改Phase 1 contract语义。
- 允许修改范围：仅Phase 2文档允许的SQLite store、migration/backup/restore及其隔离fixture。
- 禁止修改范围：不得改变 identity、target key、outcome/evidence、安全error或legacy未知账号的fail-closed语义；不得执行真实投稿、扣费或未经授权的真实workspace迁移。
- 下一阶段是否READY：是；Phase 2账本状态为`READY`，但本任务按范围在Phase 1收口后停止。

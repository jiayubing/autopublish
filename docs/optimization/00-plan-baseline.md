# 优化规划基线

> 规划日期：2026-07-24（Asia/Shanghai）  
> 阶段：第三阶段——独立复核审查结果并生成分阶段优化方案  
> 本文只记录规划基线；本阶段未修改业务代码、配置、测试、依赖或 `docs/review/`。

## 1. 当前 Git 基线

| 项目 | 当前值 | 与审查基线比较 |
|---|---|---|
| Git 根目录 | `F:/官媒投稿` | 一致 |
| 分支 | `master` | 一致 |
| commit | `e8d817847bab3a9e6020006cab35340f645e527f` | 一致 |
| commit 摘要 | `merge: complete runtime publication refactor` | 一致 |
| 已跟踪业务代码/配置/测试/依赖改动 | 无 | 无基线漂移 |
| 工作区状态 | `?? docs/review/`；本阶段另新增 `docs/optimization/` | 仅规划/审查文档，不使代码基线失效 |
| 子模块 | 无 | 一致 |

核验命令包括 `git branch --show-current`、`git rev-parse HEAD`、`git status --short`、`git diff --name-only`、`git diff --cached --name-only` 和 `git ls-files`。当前 commit 与 `docs/review/00-scope-and-baseline.md` 记录的 commit 完全相同，因此没有发现需要按“基线变化后失效”处置的 finding，也无需停止正式优化规划。

## 2. 与审查基线的差异

- 第一、第二阶段生成的 `docs/review/` 当前整体未被 Git 跟踪；这不影响其引用的 commit，但意味着这些审查记录尚未成为仓库历史的一部分。
- 当前没有已跟踪的业务代码、配置、测试、依赖或工程脚本差异。37 条现有最终 finding 均在同一代码快照上复核。
- 本阶段创建的文件仅位于 `docs/optimization/`。最终状态检查必须继续确认除此之外没有新改动。
- `.gitignore` 排除的本地内容库、配置、浏览器 profile、日志、构建产物和备份不属于固定 commit，未把其现场内容当作代码证据，也未读写其中的敏感业务数据。

## 3. 输入资料

### 已完整读取

- 根 `CONTEXT.md` 与 `auto—publish/CONTEXT.md`。
- `docs/review/00-scope-and-baseline.md`。
- `docs/review/01-project-map.md`。
- `docs/review/02-architecture-review.md`。
- `docs/review/03-module-review-plan.md`。
- `docs/review/04-cross-cutting-review.md`。
- `docs/review/05-final-findings.md`。
- `docs/review/coverage-matrix.md`。
- `docs/review/modules/M01-*.md` 至 `M31-*.md` 的 31 份模块报告。
- 上述材料直接引用的生产代码、测试、配置、领域契约、打包配置和 auth 运维脚本；复核重点集中在 37 条最终 finding 的可达调用链及上下游保护。

### 预期但缺失

| 预期文件 | 实际情况 | 处置 |
|---|---|---|
| 项目及子目录 `AGENTS.md` | 全仓未发现 | 无额外目录级指令可读取；按用户阶段约束继续 |
| `docs/review/findings.md` | 缺失 | 使用现有 `docs/review/05-final-findings.md`，保留其 `F-Hxx/F-Mxx/F-Lxx` ID |
| `docs/review/validation-results.md` | 缺失 | 结合各模块“测试情况”、最终汇总第 6 节及本阶段定向验证，不虚构独立报告 |
| `docs/review/executive-summary.md` | 缺失 | 使用 `05-final-findings.md` 的最终结论，不虚构摘要 |
| `REVIEW-XXX` 编号 | 所有现有审查文档中均不存在 | 不擅自重命名为 `REVIEW-XXX`；本计划用原稳定 `F-*` ID 双向追踪 |

上述缺失是追踪格式缺口，不是代码基线失效。若后续补入真正的 `REVIEW-XXX` 清单，应先建立 `REVIEW-XXX ↔ F-* ↔ OPT-*` 映射，再进入实施。

## 4. 本阶段独立验证

### 代码级方法

- 以每条 `F-*` 为线索读取实际符号、当前行号、生产调用方和下游状态处理。
- 明确区分“代码机制成立”“仓库内生产可达”“需要真实外部系统/业务语义才能确认”。
- 核对已有保护：publication attempt、`uncertain`、fingerprint、renderer request identity、IPC 白名单、safeStorage、文件原子替换和恢复 cursor。
- 不把测试存在或通过等同于 finding 被驳回；检查测试是否覆盖具体故障交错和最终可观察结果。

### 本阶段定向验证结果

| 验证 | 结果 | 解释 |
|---|---:|---|
| 12 个 publication/worker/media/content 定向文件 | 89 项：87 通过、0 失败、2 个 Windows symlink 跳过 | 正常路径稳定；不覆盖遗锁、强杀、跨进程 lost update 等故障窗口 |
| `tests/platform-submission-controller.test.mjs` | 6/6 通过 | 当前 controller 行为测试有效，但默认 `npm test` 不收集该扩展名 |
| `tests/renderer-workbench-controller-seams.test.js` | 0/2，通过预期失败复现 | 旧 hook 断言与生产 controller seam 漂移 |
| `npm run test:auth` | 16/16 通过 | 认证状态机与 repository 正常路径通过；未覆盖坏备份目标、缺失 restore 路径、限速 Map 容量 |

没有连接或调用真实 AI、豆包、头条、列举、河畔、媒体 API、Cloudflare 或签名基础设施；没有投稿、扣费、账号切换、备份恢复或破坏性演练。

## 5. 规划范围

本计划覆盖：

- 可自动化发布门禁与 production package smoke。
- publication 锁、worker lifecycle、远端 outcome、submission batch、media order 的崩溃一致性。
- 默认传输、诊断截图、临时 Cookie/payload 的安全边界。
- 文章/客户/媒体目标身份和破坏性操作版本绑定。
- renderer 请求身份、草稿回读、异步命令收敛、确认宿主和容量边界。
- auth 备份/恢复验证与登录限速状态容量。
- 真实外部平台、账号模型、TLS、RPO/RTO 和 UI 语义所需的人工决策。

## 6. 限制

- 本阶段只允许编辑 `docs/optimization/`；没有实施任何修复。
- “预计涉及文件”是规划判断；实施线程必须在开始时重新核对基线和调用链。
- 真实平台页面和生产网络未验证的 finding 不安排为无条件自动上线任务，而标为“需要验证”或“需要决策”。
- 数据迁移目前主要涉及文件 schema/状态兼容和 auth SQLite 备份验证；本阶段不创建迁移。
- 使用深模块设计原则组织工作项：publication recovery、task-run lifecycle、目标身份等复杂性应收敛到小 interface 的 module/seam 内，测试通过同一 interface 观察结果，避免把恢复规则散布给多个 caller。

## 7. 基线结论

当前代码与审查基线一致，审查结果整体仍可作为复核线索，具备生成正式优化方案的条件。当前不具备直接进入全部代码实施或正式发布的条件：应先完成 `OPT-001` 的可信门禁，并对待决策项取得明确输入。

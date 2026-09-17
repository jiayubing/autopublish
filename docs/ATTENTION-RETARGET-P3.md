# 需处理批量改投 P3

状态：COMPLETE（实现、主审查、有界复查及最终 clean HEAD 门禁完成；独立 PR，不自动合并）。

基线：P2 `2971278be2d9d271f21f6bab8ad5e3f5a4122430`；PR #70 启动时 OPEN，故独立分支 `codex/attention-retarget-p3` 基于 P2，PR 以 P2 分支为 base。不自动合并，不修改 P2，不执行真实投稿。

## 范围与 owner

- 单篇及批量改投都在需处理页选择一个其他普通平台和已绑定账号，确认只加入正常队列，不启动远端投稿，不生成新文章。
- 复用平台目录、配置与账号绑定服务、typed admission IPC、跨客户入队应用服务、文章锁内 lifecycle/admission policy 和 OperationalStore 原子入队。不新增 schema、发布器、状态机或账号 owner。
- 入队请求可携带 `retargetFrom`（文章身份与来源 attention ID）；主进程重新读取来源，拒绝 stale、非明确失败、同平台和非匹配身份；原入队 owner 再核实已发布、活动目标、uncertain、回收/缺失和重复项。
- 可用目标取现有目录、当前本地配置和已绑定账号的交集，排除所选原平台；不发起远端账号测试。远端权限和登录身份仍由现有执行链最终核实。
- 没有通用 attention resolve writer。既有待办查询由新发布尝试派生结案，原失败 publication/attempt 保留。修复历史平台往返时错误使用 publication 创建顺序的问题，改为比较 attempt 创建顺序。
- 预检有不可执行项时本轮不入队；正式入队仍逐项返回真实结果，跨客户维持原事务边界。响应无法确认时提示核对并禁用当前会话重提，无自动重试。

## 验证矩阵

- 单篇/多篇/跨客户，一批一个目标；同平台、多个目标、账号不匹配、未配置和 stale 拒绝。
- 原文与原历史保留、原待办关闭；重复调用不重复入队，重启后事实保留。
- 现有队列 claim → prepared evidence → accepted 链路保持可用，成功后禁止再入队。
- A 失败 → B 失败 → A 入队/失败，待办追随最新尝试。
- 部分成功、uncertain 来源、事务提交失败：未成功项不假结案，结果不确定不自动重试。
- 浏览器覆盖混合选择、加载/空态/失败重试、取消、单目标选项、配置/绑定过滤、执行中禁用、部分结果、stale 预检、响应丢失；保留 P2 生成与文章/详情入口。

## 当前证据

- 持久化/跨客户/普通结果定向回归 75 项通过；新增两项 partial/rollback 回归后，P3 定向 5 项通过。
- 浏览器 `renderer-article-attention-actions.test.js` 通过，使用合成 IPC fixture 和临时构建。
- production IPC fixture matrix 6 项通过；main/renderer/bridge typecheck 与 ESLint 初步通过，最终代码仍须完整门禁。
- 主审查遵循 Primary → 修复阻塞 → Bounded re-review；不并行委托，不重复 fresh full review。
- 已确认 `EXPOSED_PREEXISTING` P2 阻塞：往返改投后旧待办未关闭；owner 为 OperationalStore recovery 查询，已有复现与修复回归。
- Primary review：核对直接入队/跨客户/IPC/配置/账号/UI 链路及持久事务。新增来源仅为请求约束，不拥有发布状态；实际失败待办查询无独立 resolve 写入。无新增 blocking finding。
- Bounded re-review：仅检查上述往返改投 finding、query 修复、直接 admission 调用方和回归，PASS；原子入队、first success、uncertain 保真不变量未变。
- 最终提交前 main/renderer/bridge typecheck、ESLint、renderer/preload build 通过；新增 typed retarget/目录配置合同测试 2 项通过。构建仅有既有 bundle-size 提示。

仅使用合成数据、临时 SQLite/文件和假 transport。真实登录、发布、付费、AI、图片上传及生产数据库不在授权范围。

## 最终验证与交接

最终 clean implementation HEAD：`db278ff51ec05b92a46e139544c193f95ab66272`。环境：Windows / Node v24.16.0。其后仅更新本报告和工作索引，生产代码、测试与门禁无变化。

- `npm test`：596/596，0 failed/skipped/todo，约 21 秒。
- `npm run test:integration`：1244/1244，0 failed/skipped/todo，约 171 秒；包含新 P3 持久化/IPC/目录合同和完整需处理浏览器回归。
- `node --test tests/phase-06-production-ipc-fixture-matrix.test.js`：6/6。
- `npm run typecheck:main`、`npm run typecheck:renderer`、`npm run typecheck:bridge`、`npm run lint`、`npm run build:renderer`、`npm run build:preload` 均通过。renderer 保留既有 bundle-size 提示。
- `npm run format:check`：仅三个未改动的基线文件报错：`src/domain/identities.js`、`tests/authenticated-runtime.test.js`、`tests/phase-08-content-lifecycle.test.js`。与 P2 记录相同，已用相对基线 diff 核实没有本次变更；延期到各原文件 owner 的格式维护任务，不扩大本阶段范围。本次受格式 gate 管理的文件及新增 hook/dialog 的定向 Prettier 检查通过。
- `git diff --check` 通过。未跟踪构建/测试 evidence 位于 `auto—publish/build/test-results/p3-*.log` 及 runner timings，不提交产物。
- Playwright 技能指导使用既有测试脚本执行 UI 行为验证；只操作临时浏览器 fixture，测试结束关闭浏览器和预览服务。
- 未运行 release/安装包或真实外部验收：本阶段非发布任务，且没有真实账号、投稿、AI、付费授权。

已知阻塞 finding 全部关闭。没有下一阶段实施任务。P2 PR #70 仍 OPEN，P3 必须按 stacked 依赖审阅；不自动合并任何 PR。
